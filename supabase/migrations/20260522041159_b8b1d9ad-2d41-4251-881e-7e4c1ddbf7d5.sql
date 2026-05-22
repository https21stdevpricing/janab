
revoke execute on function public.restore_audit_entry(uuid) from public, anon;
grant execute on function public.restore_audit_entry(uuid) to authenticated;
