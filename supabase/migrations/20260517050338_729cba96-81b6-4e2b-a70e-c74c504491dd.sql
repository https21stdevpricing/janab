
-- Extend outstanding_view to track the supplier side of third-party as 'tp_purchase'
CREATE OR REPLACE VIEW public.outstanding_view
WITH (security_invoker=on) AS
WITH docs AS (
  SELECT s.user_id, 'sale'::text AS doc_kind, s.id AS doc_id, s.invoice_no AS doc_no, s.date,
    s.buyer_id AS party_id, s.buyer_name AS party_name,
    (SELECT COALESCE(sum(qty*rate*(1+COALESCE(gst_pct,0)/100)),0) FROM sale_items WHERE sale_id=s.id) AS total
  FROM sales s
  UNION ALL
  SELECT p.user_id, 'purchase', p.id, p.po_no, p.date, p.supplier_id, p.supplier_name,
    (SELECT COALESCE(sum(qty*rate*(1+COALESCE(gst_pct,0)/100)),0) FROM purchase_items WHERE purchase_id=p.id)
  FROM purchases p
  UNION ALL
  SELECT t.user_id, 'tp', t.id, t.tp_no, t.date, t.buyer_id, t.buyer_name,
    (SELECT COALESCE(sum(qty*sale_rate*(1+COALESCE(gst_pct,0)/100)),0) FROM tp_items WHERE tp_id=t.id)
  FROM third_party t
  UNION ALL
  SELECT t.user_id, 'tp_purchase', t.id, t.tp_no, t.date, t.supplier_id, t.supplier_name,
    (SELECT COALESCE(sum(qty*purchase_rate*(1+COALESCE(gst_pct,0)/100)),0) FROM tp_items WHERE tp_id=t.id)
  FROM third_party t
),
paid AS (
  SELECT doc_kind, doc_id, COALESCE(sum(amount),0) AS paid
  FROM payment_allocations GROUP BY doc_kind, doc_id
)
SELECT d.user_id, d.doc_kind, d.doc_id, d.doc_no, d.date, d.party_id, d.party_name, d.total,
  COALESCE(p.paid,0) AS paid, d.total - COALESCE(p.paid,0) AS balance,
  CASE WHEN d.total=0 THEN 'empty'
       WHEN COALESCE(p.paid,0) >= d.total THEN 'paid'
       WHEN COALESCE(p.paid,0) > 0 THEN 'partial'
       ELSE 'unpaid' END AS status
FROM docs d LEFT JOIN paid p ON p.doc_kind=d.doc_kind AND p.doc_id=d.doc_id;

-- Auto-allocator: include tp_purchase for outgoing payments
CREATE OR REPLACE FUNCTION public.auto_allocate_payment(_pid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p record; kinds text[]; remaining numeric; already numeric; d record; take numeric;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _pid;
  IF NOT FOUND OR p.contact_id IS NULL OR p.amount <= 0 THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount),0) INTO already FROM public.payment_allocations WHERE payment_id = _pid;
  remaining := p.amount - already;
  IF remaining <= 0.005 THEN RETURN; END IF;
  IF p.direction = 'in' THEN kinds := ARRAY['sale','tp']; ELSE kinds := ARRAY['purchase','tp_purchase']; END IF;
  FOR d IN
    SELECT doc_kind, doc_id, doc_no, balance, date FROM public.outstanding_view
    WHERE party_id = p.contact_id AND user_id = p.user_id
      AND doc_kind = ANY(kinds) AND balance > 0
    ORDER BY date ASC
  LOOP
    EXIT WHEN remaining <= 0.005;
    take := LEAST(d.balance, remaining);
    INSERT INTO public.payment_allocations(user_id, payment_id, doc_kind, doc_id, doc_no, amount)
    VALUES (p.user_id, _pid, d.doc_kind, d.doc_id, d.doc_no, round(take::numeric, 2));
    remaining := remaining - take;
  END LOOP;
END;
$$;
