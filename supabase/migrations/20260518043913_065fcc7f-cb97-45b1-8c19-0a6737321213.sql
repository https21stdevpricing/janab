-- Restrict internal SECURITY DEFINER helpers from direct app/API execution
REVOKE EXECUTE ON FUNCTION public._refresh_payment_narration(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_journal_payment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_alloc_refresh_narr() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_cleanup_doc_cascade() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_cleanup_payment_cascade() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_tp_make_delivery() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_tp_item_to_delivery() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit() FROM PUBLIC, anon, authenticated;

-- User-called helpers do not need elevated privileges; let RLS protect them
ALTER FUNCTION public.auto_allocate_payment(uuid) SECURITY INVOKER;
ALTER FUNCTION public.clear_my_notifications() SECURITY INVOKER;
ALTER FUNCTION public.clear_my_deliveries() SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.auto_allocate_payment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clear_my_notifications() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clear_my_deliveries() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.auto_allocate_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_my_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_my_deliveries() TO authenticated;