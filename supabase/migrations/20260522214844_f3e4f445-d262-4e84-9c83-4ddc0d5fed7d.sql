
REVOKE EXECUTE ON FUNCTION public.post_journal_sale(uuid)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_journal_purchase(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_journal_payment(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_allocate_payment(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.auto_allocate_payment(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.repost_payment_on_alloc()   FROM PUBLIC, anon, authenticated;
