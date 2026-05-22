
create or replace function public.bt_sync_status()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.status = 'cleared' then
    new.cleared := true;
    if new.cleared_at is null then new.cleared_at := new.date; end if;
  elsif new.status = 'pending' then
    new.cleared := false;
    new.cleared_at := null;
  elsif new.status = 'bounced' then
    new.cleared := false;
    new.cleared_at := null;
  end if;
  return new;
end$$;
