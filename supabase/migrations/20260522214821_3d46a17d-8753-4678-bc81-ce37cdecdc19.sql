
-- ====================================================================
-- 1) ROUND OFF on transactional documents
-- ====================================================================
ALTER TABLE public.sales        ADD COLUMN IF NOT EXISTS round_off numeric NOT NULL DEFAULT 0;
ALTER TABLE public.purchases    ADD COLUMN IF NOT EXISTS round_off numeric NOT NULL DEFAULT 0;
ALTER TABLE public.third_party  ADD COLUMN IF NOT EXISTS round_off numeric NOT NULL DEFAULT 0;

-- Global toggle for automatic rounding to nearest rupee when invoices are saved
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_round_off boolean NOT NULL DEFAULT true;

-- ====================================================================
-- 2) PAYMENT KIND (against_invoice / advance / on_account)
-- ====================================================================
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'against_invoice';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_kind_check' AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments DROP CONSTRAINT payments_kind_check;
  END IF;
END $$;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_kind_check
  CHECK (kind IN ('against_invoice','advance','on_account'));

-- ====================================================================
-- 3) OUTSTANDING VIEW — include round_off in invoice totals
-- ====================================================================
CREATE OR REPLACE VIEW public.outstanding_view
WITH (security_invoker=on) AS
WITH docs AS (
  SELECT s.user_id, 'sale'::text AS doc_kind, s.id AS doc_id, s.invoice_no AS doc_no, s.date,
    s.buyer_id AS party_id, s.buyer_name AS party_name,
    (SELECT COALESCE(sum(qty * rate * (1 + COALESCE(gst_pct,0) / 100)),0)
       FROM public.sale_items WHERE sale_id = s.id) + COALESCE(s.round_off,0) AS total
  FROM public.sales s
  UNION ALL
  SELECT p.user_id, 'purchase', p.id, p.po_no, p.date, p.supplier_id, p.supplier_name,
    (SELECT COALESCE(sum(qty * rate * (1 + COALESCE(gst_pct,0) / 100)),0)
       FROM public.purchase_items WHERE purchase_id = p.id) + COALESCE(p.round_off,0)
  FROM public.purchases p
  UNION ALL
  SELECT t.user_id, 'tp', t.id, t.tp_no, t.date, t.buyer_id, t.buyer_name,
    (SELECT COALESCE(sum(qty * sale_rate * (1 + COALESCE(gst_pct,0) / 100)),0)
       FROM public.tp_items WHERE tp_id = t.id) + COALESCE(t.round_off,0)
  FROM public.third_party t
  UNION ALL
  SELECT t.user_id, 'tp_purchase', t.id, t.tp_no, t.date, t.supplier_id, t.supplier_name,
    (SELECT COALESCE(sum(qty * purchase_rate * (1 + COALESCE(gst_pct,0) / 100)),0)
       FROM public.tp_items WHERE tp_id = t.id)
  FROM public.third_party t
),
paid AS (
  SELECT pa.doc_kind, pa.doc_id, COALESCE(sum(pa.amount),0) AS paid
  FROM public.payment_allocations pa
  JOIN public.payments pm ON pm.id = pa.payment_id
  WHERE COALESCE(pm.cleared, true) = true
  GROUP BY pa.doc_kind, pa.doc_id
)
SELECT d.user_id, d.doc_kind, d.doc_id, d.doc_no, d.date, d.party_id, d.party_name, d.total,
  COALESCE(p.paid,0) AS paid, d.total - COALESCE(p.paid,0) AS balance,
  CASE WHEN d.total = 0 THEN 'empty'
       WHEN COALESCE(p.paid,0) >= d.total THEN 'paid'
       WHEN COALESCE(p.paid,0) > 0 THEN 'partial'
       ELSE 'unpaid' END AS status
FROM docs d LEFT JOIN paid p ON p.doc_kind = d.doc_kind AND p.doc_id = d.doc_id;

-- ====================================================================
-- 4) JOURNAL POSTERS — emit Rounding Off line and respect round_off
-- ====================================================================
CREATE OR REPLACE FUNCTION public.post_journal_sale(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s record; co_state text; party_state text; intra bool;
  taxable numeric:=0; gst numeric:=0; total numeric:=0; ro numeric:=0;
  cgst numeric:=0; sgst numeric:=0; igst numeric:=0; je_id uuid;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id=_id;
  IF NOT FOUND THEN
    DELETE FROM public.journal_entries WHERE source_kind='sale' AND source_id=_id; RETURN;
  END IF;
  co_state := _co_state(s.user_id);
  SELECT c.state INTO party_state FROM public.contacts c WHERE c.id = s.buyer_id;
  intra := COALESCE(lower(trim(co_state))=lower(trim(party_state)), true);

  SELECT COALESCE(SUM(qty*rate),0), COALESCE(SUM(qty*rate*COALESCE(gst_pct,0)/100),0)
  INTO taxable, gst FROM public.sale_items WHERE sale_id=_id;
  ro := COALESCE(s.round_off, 0);
  total := taxable + gst + ro;
  IF intra THEN cgst := gst/2; sgst := gst/2; ELSE igst := gst; END IF;

  DELETE FROM public.journal_entries WHERE source_kind='sale' AND source_id=_id;
  IF taxable = 0 AND gst = 0 AND ro = 0 THEN RETURN; END IF;

  INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
    VALUES (s.user_id, s.date, 'sale', s.id, s.invoice_no, 'Sale '||s.invoice_no) RETURNING id INTO je_id;

  INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no) VALUES
    (je_id,s.user_id,s.date,'Accounts Receivable',s.buyer_name,total,0,s.invoice_no),
    (je_id,s.user_id,s.date,'Sales Revenue',s.buyer_name,0,taxable,s.invoice_no);
  IF cgst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,s.user_id,s.date,'Output CGST',0,cgst,s.invoice_no),
    (je_id,s.user_id,s.date,'Output SGST',0,sgst,s.invoice_no); END IF;
  IF igst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,s.user_id,s.date,'Output IGST',0,igst,s.invoice_no); END IF;

  -- Rounding Off Account: positive round_off = added to bill = income line credit;
  -- negative round_off = reduced bill = expense line debit.
  IF ro > 0 THEN
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no)
      VALUES (je_id,s.user_id,s.date,'Rounding Off Account',0,ro,s.invoice_no);
  ELSIF ro < 0 THEN
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no)
      VALUES (je_id,s.user_id,s.date,'Rounding Off Account',-ro,0,s.invoice_no);
  END IF;
END;$$;

CREATE OR REPLACE FUNCTION public.post_journal_purchase(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  p record; co_state text; party_state text; intra bool;
  taxable numeric:=0; gst numeric:=0; total numeric:=0; ro numeric:=0;
  cgst numeric:=0; sgst numeric:=0; igst numeric:=0; je_id uuid;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id=_id;
  IF NOT FOUND THEN DELETE FROM public.journal_entries WHERE source_kind='purchase' AND source_id=_id; RETURN; END IF;
  co_state := _co_state(p.user_id);
  SELECT c.state INTO party_state FROM public.contacts c WHERE c.id = p.supplier_id;
  intra := COALESCE(lower(trim(co_state))=lower(trim(party_state)), true);

  SELECT COALESCE(SUM(qty*rate),0), COALESCE(SUM(qty*rate*COALESCE(gst_pct,0)/100),0)
  INTO taxable, gst FROM public.purchase_items WHERE purchase_id=_id;
  ro := COALESCE(p.round_off, 0);
  total := taxable + gst + ro;
  IF intra THEN cgst := gst/2; sgst := gst/2; ELSE igst := gst; END IF;

  DELETE FROM public.journal_entries WHERE source_kind='purchase' AND source_id=_id;
  IF taxable = 0 AND gst = 0 AND ro = 0 THEN RETURN; END IF;
  INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
    VALUES (p.user_id,p.date,'purchase',p.id,p.po_no,'Purchase '||p.po_no) RETURNING id INTO je_id;
  INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no) VALUES
    (je_id,p.user_id,p.date,'Purchases',p.supplier_name,taxable,0,p.po_no),
    (je_id,p.user_id,p.date,'Accounts Payable',p.supplier_name,0,total,p.po_no);
  IF cgst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,p.user_id,p.date,'Input CGST',cgst,0,p.po_no),
    (je_id,p.user_id,p.date,'Input SGST',sgst,0,p.po_no); END IF;
  IF igst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,p.user_id,p.date,'Input IGST',igst,0,p.po_no); END IF;

  -- Rounding adjustment in purchases: positive round_off = we owe a bit more (debit expense)
  IF ro > 0 THEN
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no)
      VALUES (je_id,p.user_id,p.date,'Rounding Off Account',ro,0,p.po_no);
  ELSIF ro < 0 THEN
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no)
      VALUES (je_id,p.user_id,p.date,'Rounding Off Account',0,-ro,p.po_no);
  END IF;
END;$$;

-- ====================================================================
-- 5) PAYMENT POSTER — kind-aware accounts + auto re-route on allocation
-- ====================================================================
CREATE OR REPLACE FUNCTION public.post_journal_payment(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  p record; cash_acct text; party_acct text; je_id uuid; _docs text; _narr text;
  post_date date; alloc_count int := 0; effective_kind text;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _id;
  DELETE FROM public.journal_entries WHERE source_kind = 'payment' AND source_id = _id;

  IF NOT FOUND THEN RETURN; END IF;
  IF p.amount = 0 THEN RETURN; END IF;
  IF COALESCE(p.cleared, true) = false THEN RETURN; END IF;

  post_date := COALESCE(p.cleared_at, p.date);
  cash_acct := CASE upper(coalesce(p.mode, 'Bank')) WHEN 'CASH' THEN 'Cash' ELSE 'Bank' END;

  SELECT COUNT(*) INTO alloc_count FROM public.payment_allocations WHERE payment_id = _id;
  SELECT string_agg(doc_no, ', ' ORDER BY doc_no)
    INTO _docs FROM public.payment_allocations
    WHERE payment_id = _id AND doc_no IS NOT NULL AND doc_no <> '';

  -- Effective kind: an advance becomes against_invoice the moment it is knocked off
  effective_kind := COALESCE(p.kind, 'against_invoice');
  IF effective_kind = 'advance' AND alloc_count > 0 THEN
    effective_kind := 'against_invoice';
  END IF;

  _narr := (CASE WHEN p.direction = 'in' THEN 'Receipt ' ELSE 'Payment ' END) || p.payment_no
         || COALESCE(' · ' || p.contact_name, '')
         || CASE effective_kind
              WHEN 'advance'    THEN ' · advance'
              WHEN 'on_account' THEN ' · on account'
              ELSE ''
            END
         || CASE WHEN _docs IS NOT NULL THEN ' · against ' || _docs ELSE '' END;

  IF p.direction = 'in' THEN
    party_acct := CASE effective_kind WHEN 'advance' THEN 'Advance from Customers' ELSE 'Accounts Receivable' END;
  ELSE
    party_acct := CASE effective_kind WHEN 'advance' THEN 'Advances to Suppliers' ELSE 'Accounts Payable' END;
  END IF;

  INSERT INTO public.journal_entries(user_id, date, source_kind, source_id, source_no, narration)
    VALUES (p.user_id, post_date, 'payment', p.id, p.payment_no, _narr)
    RETURNING id INTO je_id;

  IF p.direction = 'in' THEN
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no,narration) VALUES
      (je_id, p.user_id, post_date, cash_acct,   p.contact_name, p.amount, 0, p.payment_no, _narr),
      (je_id, p.user_id, post_date, party_acct,  p.contact_name, 0, p.amount, p.payment_no, _narr);
  ELSE
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no,narration) VALUES
      (je_id, p.user_id, post_date, party_acct,  p.contact_name, p.amount, 0, p.payment_no, _narr),
      (je_id, p.user_id, post_date, cash_acct,   p.contact_name, 0, p.amount, p.payment_no, _narr);
  END IF;
END;
$$;

-- Re-post payment journal when allocations change so advance ↔ AR/AP routing stays correct.
CREATE OR REPLACE FUNCTION public.repost_payment_on_alloc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _pid uuid;
BEGIN
  _pid := COALESCE(NEW.payment_id, OLD.payment_id);
  IF _pid IS NOT NULL THEN PERFORM public.post_journal_payment(_pid); END IF;
  RETURN NULL;
END;$$;

DROP TRIGGER IF EXISTS trg_repost_payment_on_alloc ON public.payment_allocations;
CREATE TRIGGER trg_repost_payment_on_alloc
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.repost_payment_on_alloc();

-- ====================================================================
-- 6) AUTO-ALLOCATE — skip advance / on_account; treat against_invoice only
-- ====================================================================
CREATE OR REPLACE FUNCTION public.auto_allocate_payment(_pid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  pay record; left_amt numeric; already numeric;
  doc record; take numeric;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = _pid;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(pay.kind, 'against_invoice') <> 'against_invoice' THEN RETURN; END IF;
  IF pay.contact_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO already FROM public.payment_allocations WHERE payment_id = _pid;
  left_amt := pay.amount - already;
  IF left_amt <= 0 THEN RETURN; END IF;

  FOR doc IN
    SELECT doc_kind, doc_id, doc_no, balance, date FROM public.outstanding_view
    WHERE user_id = pay.user_id
      AND party_id = pay.contact_id
      AND balance > 0
      AND ((pay.direction = 'in'  AND doc_kind IN ('sale','tp'))
        OR (pay.direction = 'out' AND doc_kind IN ('purchase','tp_purchase')))
    ORDER BY date ASC
  LOOP
    IF left_amt <= 0 THEN EXIT; END IF;
    take := LEAST(doc.balance, left_amt);
    INSERT INTO public.payment_allocations(user_id, payment_id, doc_kind, doc_id, doc_no, amount)
      VALUES (pay.user_id, _pid, doc.doc_kind, doc.doc_id, doc.doc_no, take);
    left_amt := left_amt - take;
  END LOOP;
END;$$;

-- ====================================================================
-- 7) Repost existing data with corrected logic
-- ====================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.sales LOOP PERFORM public.post_journal_sale(r.id); END LOOP;
  FOR r IN SELECT id FROM public.purchases LOOP PERFORM public.post_journal_purchase(r.id); END LOOP;
  FOR r IN SELECT id FROM public.payments LOOP PERFORM public.post_journal_payment(r.id); END LOOP;
END $$;
