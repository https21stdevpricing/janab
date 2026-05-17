
-- Fix GST summary view: actual account names are 'Output CGST/SGST/IGST' and 'Input CGST/SGST/IGST'
CREATE OR REPLACE VIEW public.gst_summary_view
WITH (security_invoker=on) AS
SELECT
  user_id,
  date_trunc('month', date::timestamptz)::date AS month,
  SUM(CASE WHEN account = 'Output CGST' THEN credit - debit ELSE 0 END) AS output_cgst,
  SUM(CASE WHEN account = 'Output SGST' THEN credit - debit ELSE 0 END) AS output_sgst,
  SUM(CASE WHEN account = 'Output IGST' THEN credit - debit ELSE 0 END) AS output_igst,
  0::numeric AS output_total_legacy,
  SUM(CASE WHEN account = 'Input CGST' THEN debit - credit ELSE 0 END) AS input_cgst,
  SUM(CASE WHEN account = 'Input SGST' THEN debit - credit ELSE 0 END) AS input_sgst,
  SUM(CASE WHEN account = 'Input IGST' THEN debit - credit ELSE 0 END) AS input_igst,
  0::numeric AS input_total_legacy
FROM public.journal_lines
WHERE account IN ('Output CGST','Output SGST','Output IGST','Input CGST','Input SGST','Input IGST')
GROUP BY user_id, date_trunc('month', date::timestamptz);

-- Party aging buckets (receivables + payables in one view)
CREATE OR REPLACE VIEW public.party_aging_view
WITH (security_invoker=on) AS
SELECT
  user_id,
  party_id,
  party_name,
  CASE WHEN doc_kind IN ('sale','tp') THEN 'receivable' ELSE 'payable' END AS side,
  SUM(CASE WHEN (CURRENT_DATE - date) <= 30 THEN balance ELSE 0 END) AS b_0_30,
  SUM(CASE WHEN (CURRENT_DATE - date) BETWEEN 31 AND 60 THEN balance ELSE 0 END) AS b_31_60,
  SUM(CASE WHEN (CURRENT_DATE - date) BETWEEN 61 AND 90 THEN balance ELSE 0 END) AS b_61_90,
  SUM(CASE WHEN (CURRENT_DATE - date) > 90 THEN balance ELSE 0 END) AS b_90p,
  SUM(balance) AS total_balance,
  COUNT(*) FILTER (WHERE balance > 0) AS open_docs,
  MAX(date) AS last_doc_date
FROM public.outstanding_view
WHERE balance > 0 AND party_id IS NOT NULL
GROUP BY user_id, party_id, party_name,
  CASE WHEN doc_kind IN ('sale','tp') THEN 'receivable' ELSE 'payable' END;

-- Monthly sales/purchases per party
CREATE OR REPLACE VIEW public.monthly_party_view
WITH (security_invoker=on) AS
WITH s AS (
  SELECT s.user_id, date_trunc('month', s.date::timestamptz)::date AS month,
    s.buyer_id AS party_id, s.buyer_name AS party_name, 'buyer'::text AS role,
    COALESCE(SUM(si.qty*si.rate*(1+COALESCE(si.gst_pct,0)/100)),0) AS amount,
    COUNT(DISTINCT s.id) AS docs
  FROM public.sales s LEFT JOIN public.sale_items si ON si.sale_id = s.id
  WHERE s.buyer_id IS NOT NULL
  GROUP BY s.user_id, date_trunc('month', s.date::timestamptz), s.buyer_id, s.buyer_name
), p AS (
  SELECT p.user_id, date_trunc('month', p.date::timestamptz)::date AS month,
    p.supplier_id AS party_id, p.supplier_name AS party_name, 'supplier'::text AS role,
    COALESCE(SUM(pi.qty*pi.rate*(1+COALESCE(pi.gst_pct,0)/100)),0) AS amount,
    COUNT(DISTINCT p.id) AS docs
  FROM public.purchases p LEFT JOIN public.purchase_items pi ON pi.purchase_id = p.id
  WHERE p.supplier_id IS NOT NULL
  GROUP BY p.user_id, date_trunc('month', p.date::timestamptz), p.supplier_id, p.supplier_name
)
SELECT * FROM s UNION ALL SELECT * FROM p;

-- Monthly product performance
CREATE OR REPLACE VIEW public.monthly_product_view
WITH (security_invoker=on) AS
WITH all_items AS (
  SELECT s.user_id, date_trunc('month', s.date::timestamptz)::date AS month,
    si.product_id, si.product_name, si.qty, si.qty*si.rate AS revenue
  FROM public.sales s JOIN public.sale_items si ON si.sale_id = s.id
  WHERE si.product_id IS NOT NULL
  UNION ALL
  SELECT t.user_id, date_trunc('month', t.date::timestamptz)::date AS month,
    ti.product_id, ti.product_name, ti.qty, ti.qty*ti.sale_rate AS revenue
  FROM public.third_party t JOIN public.tp_items ti ON ti.tp_id = t.id
  WHERE ti.product_id IS NOT NULL
)
SELECT user_id, month, product_id, MAX(product_name) AS product_name,
  SUM(qty) AS qty_sold, SUM(revenue) AS revenue
FROM all_items
GROUP BY user_id, month, product_id;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_buyer ON public.sales(buyer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(date);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases(date);
CREATE INDEX IF NOT EXISTS idx_tp_buyer ON public.third_party(buyer_id);
CREATE INDEX IF NOT EXISTS idx_tp_supplier ON public.third_party(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payments_contact ON public.payments(contact_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(date);
CREATE INDEX IF NOT EXISTS idx_jl_account_date ON public.journal_lines(account, date);
CREATE INDEX IF NOT EXISTS idx_jl_party ON public.journal_lines(party);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON public.purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_tp_items_tp ON public.tp_items(tp_id);
CREATE INDEX IF NOT EXISTS idx_alloc_doc ON public.payment_allocations(doc_kind, doc_id);
