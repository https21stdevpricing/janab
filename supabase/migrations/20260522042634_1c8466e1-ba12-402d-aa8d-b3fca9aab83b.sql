
-- 1. Bank transfer status (pending | cleared | bounced)
alter table public.bank_transfers
  add column if not exists status text not null default 'cleared';

update public.bank_transfers
  set status = case when cleared then 'cleared' else 'pending' end
  where status = 'cleared' and cleared = false;

alter table public.bank_transfers
  add constraint bank_transfers_status_chk
  check (status in ('pending','cleared','bounced'));

-- Keep legacy `cleared` boolean in sync with new status
create or replace function public.bt_sync_status()
returns trigger language plpgsql as $$
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

drop trigger if exists bt_sync_status_tr on public.bank_transfers;
create trigger bt_sync_status_tr
  before insert or update on public.bank_transfers
  for each row execute function public.bt_sync_status();

-- 2. Onboarding flag on settings
alter table public.settings
  add column if not exists onboarding_done boolean not null default false;

-- 3. Mark journal entries that are opening balances
alter table public.journal_entries
  add column if not exists is_opening boolean not null default false;
