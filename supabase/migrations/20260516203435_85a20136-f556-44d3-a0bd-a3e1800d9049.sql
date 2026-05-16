
ALTER VIEW public.ledger_view SET (security_invoker = on);
ALTER VIEW public.outstanding_view SET (security_invoker = on);
ALTER VIEW public.party_summary_view SET (security_invoker = on);
ALTER VIEW public.monthly_pnl_view SET (security_invoker = on);
ALTER VIEW public.cash_flow_view SET (security_invoker = on);

ALTER FUNCTION public._next_code(uuid,text,text,text) SET search_path=public;
ALTER FUNCTION public._co_state(uuid) SET search_path=public;
ALTER FUNCTION public.tg_products_autocode() SET search_path=public;
ALTER FUNCTION public.tg_contacts_autocode() SET search_path=public;
ALTER FUNCTION public.tg_sales_autonum() SET search_path=public;
ALTER FUNCTION public.tg_purchases_autonum() SET search_path=public;
ALTER FUNCTION public.tg_tp_autonum() SET search_path=public;
ALTER FUNCTION public.tg_quote_autonum() SET search_path=public;
ALTER FUNCTION public.tg_payments_autonum() SET search_path=public;
ALTER FUNCTION public.tg_sale_post() SET search_path=public;
ALTER FUNCTION public.tg_sale_items_post() SET search_path=public;
ALTER FUNCTION public.tg_purchase_post() SET search_path=public;
ALTER FUNCTION public.tg_purchase_items_post() SET search_path=public;
ALTER FUNCTION public.tg_tp_post() SET search_path=public;
ALTER FUNCTION public.tg_tp_items_post() SET search_path=public;
ALTER FUNCTION public.tg_payment_post() SET search_path=public;
ALTER FUNCTION public.tg_expense_post() SET search_path=public;
