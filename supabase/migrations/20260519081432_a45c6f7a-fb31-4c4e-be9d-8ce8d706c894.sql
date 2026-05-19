
REVOKE EXECUTE ON FUNCTION public.tg_fa_autonum() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_fa_post() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_journal_fixed_asset(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.book_depreciation(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_depreciation(date) TO authenticated;
