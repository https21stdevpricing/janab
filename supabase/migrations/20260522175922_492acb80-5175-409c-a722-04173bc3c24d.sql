-- Make bank transfer clearance state respect both status and the legacy cleared checkbox
CREATE OR REPLACE FUNCTION public.bt_sync_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'bounced' THEN
      NEW.cleared := false;
      NEW.cleared_at := null;
    ELSIF COALESCE(NEW.cleared, true) = false THEN
      NEW.status := 'pending';
      NEW.cleared_at := null;
    ELSE
      NEW.status := 'cleared';
      NEW.cleared := true;
      IF NEW.cleared_at IS NULL THEN NEW.cleared_at := NEW.date; END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cleared' THEN
      NEW.cleared := true;
      IF NEW.cleared_at IS NULL THEN NEW.cleared_at := NEW.date; END IF;
    ELSE
      NEW.cleared := false;
      NEW.cleared_at := null;
    END IF;
  ELSIF NEW.cleared IS DISTINCT FROM OLD.cleared THEN
    IF NEW.cleared THEN
      NEW.status := 'cleared';
      IF NEW.cleared_at IS NULL THEN NEW.cleared_at := NEW.date; END IF;
    ELSE
      NEW.status := 'pending';
      NEW.cleared_at := null;
    END IF;
  ELSIF NEW.status <> 'cleared' THEN
    NEW.cleared := false;
    NEW.cleared_at := null;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bt_sync_status_tr ON public.bank_transfers;
CREATE TRIGGER bt_sync_status_tr
  BEFORE INSERT OR UPDATE ON public.bank_transfers
  FOR EACH ROW EXECUTE FUNCTION public.bt_sync_status();

-- Only cleared bank transfers are posted to accounting. Pending/bounced entries stay operational only.
CREATE OR REPLACE FUNCTION public.post_journal_bank_transfer(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t record; je_id uuid; dr_acct text; cr_acct text; narr text;
BEGIN
  SELECT * INTO t FROM public.bank_transfers WHERE id = _id;
  DELETE FROM public.journal_entries WHERE source_kind = 'bank_transfer' AND source_id = _id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF COALESCE(t.status, CASE WHEN t.cleared THEN 'cleared' ELSE 'pending' END) <> 'cleared' OR t.cleared = false THEN
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
$$;

-- Only cleared payments are posted to accounting. Uncleared cheque payments stay visible but do not affect ledgers.
CREATE OR REPLACE FUNCTION public.post_journal_payment(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE p record; cash_acct text; party_acct text; je_id uuid; _docs text; _narr text; post_date date;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _id;
  DELETE FROM public.journal_entries WHERE source_kind = 'payment' AND source_id = _id;

  IF NOT FOUND THEN RETURN; END IF;
  IF p.amount = 0 THEN RETURN; END IF;
  IF COALESCE(p.cleared, true) = false THEN RETURN; END IF;

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
$$;

-- Outstanding bills must count only allocations from cleared payments.
CREATE OR REPLACE VIEW public.outstanding_view
WITH (security_invoker=on) AS
WITH docs AS (
  SELECT s.user_id, 'sale'::text AS doc_kind, s.id AS doc_id, s.invoice_no AS doc_no, s.date,
    s.buyer_id AS party_id, s.buyer_name AS party_name,
    (SELECT COALESCE(sum(qty * rate * (1 + COALESCE(gst_pct, 0) / 100)), 0) FROM public.sale_items WHERE sale_id = s.id) AS total
  FROM public.sales s
  UNION ALL
  SELECT p.user_id, 'purchase', p.id, p.po_no, p.date, p.supplier_id, p.supplier_name,
    (SELECT COALESCE(sum(qty * rate * (1 + COALESCE(gst_pct, 0) / 100)), 0) FROM public.purchase_items WHERE purchase_id = p.id)
  FROM public.purchases p
  UNION ALL
  SELECT t.user_id, 'tp', t.id, t.tp_no, t.date, t.buyer_id, t.buyer_name,
    (SELECT COALESCE(sum(qty * sale_rate * (1 + COALESCE(gst_pct, 0) / 100)), 0) FROM public.tp_items WHERE tp_id = t.id)
  FROM public.third_party t
  UNION ALL
  SELECT t.user_id, 'tp_purchase', t.id, t.tp_no, t.date, t.supplier_id, t.supplier_name,
    (SELECT COALESCE(sum(qty * purchase_rate * (1 + COALESCE(gst_pct, 0) / 100)), 0) FROM public.tp_items WHERE tp_id = t.id)
  FROM public.third_party t
),
paid AS (
  SELECT pa.doc_kind, pa.doc_id, COALESCE(sum(pa.amount), 0) AS paid
  FROM public.payment_allocations pa
  JOIN public.payments pm ON pm.id = pa.payment_id
  WHERE COALESCE(pm.cleared, true) = true
  GROUP BY pa.doc_kind, pa.doc_id
)
SELECT d.user_id, d.doc_kind, d.doc_id, d.doc_no, d.date, d.party_id, d.party_name, d.total,
  COALESCE(p.paid, 0) AS paid, d.total - COALESCE(p.paid, 0) AS balance,
  CASE WHEN d.total = 0 THEN 'empty'
       WHEN COALESCE(p.paid, 0) >= d.total THEN 'paid'
       WHEN COALESCE(p.paid, 0) > 0 THEN 'partial'
       ELSE 'unpaid' END AS status
FROM docs d LEFT JOIN paid p ON p.doc_kind = d.doc_kind AND p.doc_id = d.doc_id;

-- Repost existing payment and bank-transfer accounting after the corrected clearance rules.
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