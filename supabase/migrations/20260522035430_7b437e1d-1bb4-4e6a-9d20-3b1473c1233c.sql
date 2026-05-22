
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS cheque_no text,
  ADD COLUMN IF NOT EXISTS cheque_date date,
  ADD COLUMN IF NOT EXISTS txn_id text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS cleared boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cleared_at date;

CREATE OR REPLACE FUNCTION public._bt_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.bank_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  transfer_no text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  kind text NOT NULL CHECK (kind IN ('cash_deposit','cash_withdrawal','cheque_deposit')),
  amount numeric NOT NULL CHECK (amount > 0),
  bank_name text,
  cheque_no text,
  cheque_date date,
  txn_id text,
  notes text,
  cleared boolean NOT NULL DEFAULT true,
  cleared_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own bank transfers" ON public.bank_transfers;
DROP POLICY IF EXISTS "Users insert own bank transfers" ON public.bank_transfers;
DROP POLICY IF EXISTS "Users update own bank transfers" ON public.bank_transfers;
DROP POLICY IF EXISTS "Users delete own bank transfers" ON public.bank_transfers;
CREATE POLICY "Users select own bank transfers" ON public.bank_transfers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own bank transfers" ON public.bank_transfers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own bank transfers" ON public.bank_transfers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own bank transfers" ON public.bank_transfers FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS bt_updated_at ON public.bank_transfers;
CREATE TRIGGER bt_updated_at BEFORE UPDATE ON public.bank_transfers
  FOR EACH ROW EXECUTE FUNCTION public._bt_touch_updated_at();

CREATE OR REPLACE FUNCTION public.tg_bt_autonum() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.transfer_no IS NULL OR NEW.transfer_no='' THEN
    NEW.transfer_no := public.next_doc_no(NEW.user_id, 'BT', 'bank_transfers', 'transfer_no');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS bt_autonum ON public.bank_transfers;
CREATE TRIGGER bt_autonum BEFORE INSERT ON public.bank_transfers
  FOR EACH ROW EXECUTE FUNCTION public.tg_bt_autonum();

CREATE OR REPLACE FUNCTION public.post_journal_bank_transfer(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  t record; je_id uuid; dr_acct text; cr_acct text; narr text;
BEGIN
  SELECT * INTO t FROM public.bank_transfers WHERE id=_id;
  IF NOT FOUND THEN
    DELETE FROM public.journal_entries WHERE source_kind='bank_transfer' AND source_id=_id;
    RETURN;
  END IF;
  IF t.kind = 'cash_deposit' THEN
    dr_acct := 'Bank'; cr_acct := 'Cash';
    narr := 'Cash deposit to bank' || COALESCE(' · '||t.bank_name,'') || COALESCE(' · txn '||t.txn_id,'');
  ELSIF t.kind = 'cash_withdrawal' THEN
    dr_acct := 'Cash'; cr_acct := 'Bank';
    narr := 'Cash withdrawal from bank' || COALESCE(' · '||t.bank_name,'') || COALESCE(' · txn '||t.txn_id,'');
  ELSE
    dr_acct := 'Bank'; cr_acct := 'Cash';
    narr := 'Cheque deposit ' || COALESCE(t.cheque_no,'') || COALESCE(' · '||t.bank_name,'');
  END IF;

  DELETE FROM public.journal_entries WHERE source_kind='bank_transfer' AND source_id=_id;
  INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
    VALUES (t.user_id, t.date, 'bank_transfer', t.id, t.transfer_no, narr)
    RETURNING id INTO je_id;
  INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no,narration) VALUES
    (je_id, t.user_id, t.date, dr_acct, t.amount, 0, t.transfer_no, narr),
    (je_id, t.user_id, t.date, cr_acct, 0, t.amount, t.transfer_no, narr);
END; $$;

CREATE OR REPLACE FUNCTION public.tg_bt_post() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM public.post_journal_bank_transfer(OLD.id); RETURN OLD; END IF;
  PERFORM public.post_journal_bank_transfer(NEW.id); RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS bt_post ON public.bank_transfers;
CREATE TRIGGER bt_post AFTER INSERT OR UPDATE OR DELETE ON public.bank_transfers
  FOR EACH ROW EXECUTE FUNCTION public.tg_bt_post();
