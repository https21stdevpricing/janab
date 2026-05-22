
alter table public.settings
  add column if not exists prefix_sale text not null default 'INV',
  add column if not exists prefix_purchase text not null default 'PO',
  add column if not exists prefix_tp text not null default 'TP',
  add column if not exists prefix_quote text not null default 'QT',
  add column if not exists prefix_delivery text not null default 'DC',
  add column if not exists prefix_payment text not null default 'PAY',
  add column if not exists account_closed_at timestamptz;

create table if not exists public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  date date not null default current_date,
  qty numeric not null,
  reason text not null,
  notes text,
  unit_cost numeric not null default 0,
  created_at timestamptz not null default now()
);
alter table public.stock_adjustments enable row level security;
create policy "own stock_adjustments all" on public.stock_adjustments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists stock_adjustments_user_date_idx on public.stock_adjustments(user_id, date);
create index if not exists stock_adjustments_product_idx on public.stock_adjustments(product_id);

drop view if exists public.stock_view;
create view public.stock_view
with (security_invoker = true) as
select
  p.id as product_id,
  p.user_id,
  p.code,
  p.name,
  p.unit,
  p.opening_stock,
  coalesce((select sum(pi.qty) from public.purchase_items pi join public.purchases ph on ph.id = pi.purchase_id where pi.product_id = p.id and ph.user_id = p.user_id), 0) as purchased,
  coalesce((select sum(si.qty) from public.sale_items si join public.sales s on s.id = si.sale_id where si.product_id = p.id and s.user_id = p.user_id), 0) as sold,
  coalesce((select sum(sa.qty) from public.stock_adjustments sa where sa.product_id = p.id and sa.user_id = p.user_id), 0) as adjusted,
  p.opening_stock
    + coalesce((select sum(pi.qty) from public.purchase_items pi join public.purchases ph on ph.id = pi.purchase_id where pi.product_id = p.id and ph.user_id = p.user_id), 0)
    - coalesce((select sum(si.qty) from public.sale_items si join public.sales s on s.id = si.sale_id where si.product_id = p.id and s.user_id = p.user_id), 0)
    - coalesce((select sum(sa.qty) from public.stock_adjustments sa where sa.product_id = p.id and sa.user_id = p.user_id), 0)
    as on_hand,
  p.reorder_level
from public.products p;

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  role text not null default 'staff',
  status text not null default 'pending',
  invited_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.team_invites enable row level security;
create policy "own team_invites all" on public.team_invites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists team_invites_user_idx on public.team_invites(user_id);

create or replace function public.restore_audit_entry(_audit_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.audit_log;
  _payload jsonb;
  _cols text;
  _vals text;
  _sql text;
begin
  select * into _row from public.audit_log where id = _audit_id;
  if not found then raise exception 'Audit entry not found'; end if;
  if _row.user_id <> auth.uid() then raise exception 'Not your audit entry'; end if;
  if _row.action <> 'delete' then raise exception 'Only deleted records can be restored'; end if;
  if _row.diff is null then raise exception 'This audit entry has no snapshot to restore from'; end if;
  select coalesce(jsonb_object_agg(k, v->'old'), '{}'::jsonb)
    into _payload from jsonb_each(_row.diff) as t(k, v);
  if _payload = '{}'::jsonb then raise exception 'Snapshot empty'; end if;
  select string_agg(quote_ident(k), ','), string_agg(format('%L', v), ',')
    into _cols, _vals from jsonb_each_text(_payload);
  _sql := format('insert into public.%I (%s) values (%s) on conflict do nothing', _row.entity, _cols, _vals);
  execute _sql;
  return _row.entity || ' restored';
end;
$$;

grant execute on function public.restore_audit_entry(uuid) to authenticated;
