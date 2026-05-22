
-- Fix: NOT FOUND was checked AFTER the DELETE (which finds 0 rows on new records),
-- causing the function to exit before posting any journal lines.
-- Reorder: check existence after SELECT, then DELETE old entries, then post.

CREATE OR REPLACE FUNCTION public.post_journal_payment(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE p record; cash_acct text; party_acct text; je_id uuid; _docs text; _narr text; post_date date;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _id;
  IF NOT FOUND THEN
    DELETE FROM public.journal_entries WHERE source_kind = 'payment' AND source_id = _id;
    RETURN;
  END IF;

  DELETE FROM public.journal_entries WHERE source_kind = 'payment' AND source_id = _id;

  IF p.amount = 0 THEN RETURN; END IF;
  IF COALESCE(p.status, CASE WHEN COALESCE(p.cleared, true) THEN 'cleared' ELSE 'pending' END) <> 'cleared' THEN RETURN; END IF;

  post_date := COALESCE(p.cleared_at, p.date);
  cash_acct := CASE upper(coalesce(p.mode, 'Bank')) WHEN 'CASH' THEN 'Cash' ELSE 'Bank' END;

  SELECT string_agg(doc_no, ', ' ORDER BY doc_no)
    INTO _docs FROM public.payment_allocations
    WHERE payment_id = _id AND doc_no IS NOT NULL AND doc_no <> '';

  _narr := (CASE WHEN p.direction = 'in' THEN 'Receipt ' ELSE 'Payment ' END) || p.payment_no
         || COALESCE(' · ' || p.contact_name, '')
         || CASE WHEN _docs IS NOT NULL THEN ' · against ' || _docs ELSE '' END;

  INSERT INTO public.journal_entries(user_id, date, source_kind, source_id, source_no, narration)
    VALUES (p.user_id, post_date, 'payment', p.id, p.payment_no, _narr)
    RETURNING id INTO je_id;

  IF p.direction = 'in' THEN
    party_acct := 'Accounts Receivable';
    INSERT INTO public.journal_lines(entry_id, user_id, date, account, party, debit, credit, ref_no, narration) VALUES
      (je_id, p.user_id, post_date, cash_acct, p.contact_name, p.amount, 0, p.payment_no, _narr),
      (je_id, p.user_id, post_date, party_acct, p.contact_name, 0, p.amount, p.payment_no, _narr);
  ELSE
    party_acct := 'Accounts Payable';
    INSERT INTO public.journal_lines(entry_id, user_id, date, account, party, debit, credit, ref_no, narration) VALUES
      (je_id, p.user_id, post_date, party_acct, p.contact_name, p.amount, 0, p.payment_no, _narr),
      (je_id, p.user_id, post_date, cash_acct, p.contact_name, 0, p.amount, p.payment_no, _narr);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_journal_bank_transfer(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t record; je_id uuid; dr_acct text; cr_acct text; narr text;
BEGIN
  SELECT * INTO t FROM public.bank_transfers WHERE id = _id;
  IF NOT FOUND THEN
    DELETE FROM public.journal_entries WHERE source_kind = 'bank_transfer' AND source_id = _id;
    RETURN;
  END IF;

  DELETE FROM public.journal_entries WHERE source_kind = 'bank_transfer' AND source_id = _id;

  IF COALESCE(t.status, CASE WHEN t.cleared THEN 'cleared' ELSE 'pending' END) <> 'cleared' THEN
    RETURN;
  END IF;

  IF t.kind = 'cash_deposit' THEN
    dr_acct := 'Bank'; cr_acct := 'Cash';
    narr := 'Cash deposit to bank' || COALESCE(' · ' || t.bank_name, '') || COALESCE(' · txn ' || t.txn_id, '');
  ELSIF t.kind = 'cash_withdrawal' THEN
    dr_acct := 'Cash'; cr_acct := 'Bank';
    narr := 'Cash withdrawal from bank' || COALESCE(' · ' || t.bank_name, '') || COALESCE(' · txn ' || t.txn_id, '');
  ELSE
    dr_acct := 'Bank'; cr_acct := 'Cash';
    narr := 'Cheque deposit ' || COALESCE(t.cheque_no, '') || COALESCE(' · ' || t.bank_name, '');
  END IF;

  INSERT INTO public.journal_entries(user_id, date, source_kind, source_id, source_no, narration)
    VALUES (t.user_id, COALESCE(t.cleared_at, t.date), 'bank_transfer', t.id, t.transfer_no, narr)
    RETURNING id INTO je_id;

  INSERT INTO public.journal_lines(entry_id, user_id, date, account, debit, credit, ref_no, narration) VALUES
    (je_id, t.user_id, COALESCE(t.cleared_at, t.date), dr_acct, t.amount, 0, t.transfer_no, narr),
    (je_id, t.user_id, COALESCE(t.cleared_at, t.date), cr_acct, 0, t.amount, t.transfer_no, narr);
END;
$function$;

-- Backfill: re-run posting for every payment and bank transfer so missed
-- entries from the broken version of these functions appear in the ledger.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.payments LOOP
    PERFORM public.post_journal_payment(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.bank_transfers LOOP
    PERFORM public.post_journal_bank_transfer(r.id);
  END LOOP;
END $$;
