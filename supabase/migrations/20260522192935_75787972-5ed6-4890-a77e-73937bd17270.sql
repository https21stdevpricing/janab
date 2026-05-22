ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS status text;

UPDATE public.payments
SET status = CASE WHEN COALESCE(cleared, true) THEN 'cleared' ELSE 'pending' END
WHERE status IS NULL;

ALTER TABLE public.payments
  ALTER COLUMN status SET DEFAULT 'cleared';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_status_chk'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_status_chk CHECK (status IN ('pending','cleared','bounced'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_payment_clearance_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NULL THEN
    NEW.status := CASE WHEN COALESCE(NEW.cleared, true) THEN 'cleared' ELSE 'pending' END;
  END IF;

  IF NEW.status = 'cleared' THEN
    NEW.cleared := true;
    NEW.cleared_at := COALESCE(NEW.cleared_at, NEW.date);
  ELSE
    NEW.cleared := false;
    NEW.cleared_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_payment_clearance_status_tr ON public.payments;
CREATE TRIGGER sync_payment_clearance_status_tr
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_payment_clearance_status();

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
$$;

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
  WHERE COALESCE(pm.status, CASE WHEN COALESCE(pm.cleared, true) THEN 'cleared' ELSE 'pending' END) = 'cleared'
  GROUP BY pa.doc_kind, pa.doc_id
)
SELECT d.user_id, d.doc_kind, d.doc_id, d.doc_no, d.date, d.party_id, d.party_name, d.total,
  COALESCE(p.paid, 0) AS paid, d.total - COALESCE(p.paid, 0) AS balance,
  CASE WHEN d.total = 0 THEN 'empty'
       WHEN COALESCE(p.paid, 0) >= d.total THEN 'paid'
       WHEN COALESCE(p.paid, 0) > 0 THEN 'partial'
       ELSE 'unpaid' END AS status
FROM docs d LEFT JOIN paid p ON p.doc_kind = d.doc_kind AND p.doc_id = d.doc_id;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_pending_cheque_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing record;
BEGIN
  SELECT pm.payment_no, pm.cheque_no
    INTO existing
  FROM public.payment_allocations pa
  JOIN public.payments pm ON pm.id = pa.payment_id
  WHERE pa.user_id = NEW.user_id
    AND pa.doc_kind = NEW.doc_kind
    AND pa.doc_id = NEW.doc_id
    AND pa.id IS DISTINCT FROM NEW.id
    AND lower(coalesce(pm.mode, '')) = 'cheque'
    AND COALESCE(pm.status, CASE WHEN COALESCE(pm.cleared, true) THEN 'cleared' ELSE 'pending' END) = 'pending'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'This bill already has pending cheque % (%). Open that cheque and mark it cleared or bounced instead of creating another entry.', existing.payment_no, coalesce(existing.cheque_no, 'no cheque number')
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_pending_cheque_allocation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.pending_cheque_allocations_view
WITH (security_invoker=on) AS
SELECT
  pa.user_id,
  pa.doc_kind,
  pa.doc_id,
  pa.doc_no,
  pa.amount,
  pm.id AS payment_id,
  pm.payment_no,
  pm.date,
  pm.contact_id,
  pm.contact_name,
  pm.cheque_no,
  pm.cheque_date,
  pm.bank_name,
  pm.cleared,
  pm.cleared_at,
  pm.status
FROM public.payment_allocations pa
JOIN public.payments pm ON pm.id = pa.payment_id
WHERE lower(coalesce(pm.mode, '')) = 'cheque'
  AND COALESCE(pm.status, CASE WHEN COALESCE(pm.cleared, true) THEN 'cleared' ELSE 'pending' END) = 'pending';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.payments LOOP
    PERFORM public.post_journal_payment(r.id);
  END LOOP;
END $$;