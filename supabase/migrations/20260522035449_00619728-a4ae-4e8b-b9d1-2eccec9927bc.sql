
REVOKE EXECUTE ON FUNCTION public._bt_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_bt_autonum() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_bt_post() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_journal_bank_transfer(uuid) FROM PUBLIC, anon, authenticated;
