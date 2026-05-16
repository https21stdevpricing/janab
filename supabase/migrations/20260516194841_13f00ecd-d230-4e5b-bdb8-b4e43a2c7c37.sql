
-- =====================================================
-- PROFILES
-- =====================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- =====================================================
-- SETTINGS (company info)
-- =====================================================
create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default 'My Company',
  gstin text,
  state text default 'Rajasthan',
  address text,
  phone text,
  email text,
  fy_start date default date_trunc('year', now())::date,
  low_stock_threshold numeric default 10,
  currency text default 'INR',
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
create policy "own settings all" on public.settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create profile + settings on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.settings (user_id) values (new.id);
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================
-- PRODUCTS
-- =====================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  unit text default 'sqft',
  hsn text,
  purchase_rate numeric default 0,
  sale_rate numeric default 0,
  opening_stock numeric default 0,
  reorder_level numeric default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, code)
);
alter table public.products enable row level security;
create policy "own products all" on public.products for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.products(user_id);

-- =====================================================
-- CONTACTS (buyers + suppliers)
-- =====================================================
create type public.contact_type as enum ('buyer', 'supplier', 'both');
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.contact_type not null default 'buyer',
  name text not null,
  gstin text,
  state text,
  address text,
  phone text,
  email text,
  credit_limit numeric default 0,
  opening_balance numeric default 0,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.contacts enable row level security;
create policy "own contacts all" on public.contacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.contacts(user_id);

-- =====================================================
-- AUTO-NUMBERING HELPER
-- =====================================================
create or replace function public.next_doc_no(_user uuid, _prefix text, _table text, _col text)
returns text language plpgsql security definer set search_path = public as $$
declare
  _max int;
  _sql text;
begin
  _sql := format('select coalesce(max(nullif(regexp_replace(%I, ''^%s-'', ''''), '''')::int), 0) from public.%I where user_id = $1 and %I like %L',
                 _col, _prefix, _table, _col, _prefix || '-%');
  execute _sql into _max using _user;
  return _prefix || '-' || lpad((_max + 1)::text, 4, '0');
end; $$;

-- =====================================================
-- SALES
-- =====================================================
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_no text not null,
  date date not null default current_date,
  buyer_id uuid references public.contacts(id) on delete set null,
  buyer_name text,
  notes text,
  status text default 'open',
  created_at timestamptz not null default now(),
  unique (user_id, invoice_no)
);
create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  unit text,
  length numeric,
  width numeric,
  qty numeric not null default 0,
  rate numeric not null default 0,
  gst_pct numeric default 18,
  position int default 0
);
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
create policy "own sales all" on public.sales for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sale_items all" on public.sale_items for all using (exists(select 1 from public.sales s where s.id = sale_id and s.user_id = auth.uid())) with check (exists(select 1 from public.sales s where s.id = sale_id and s.user_id = auth.uid()));
create index on public.sales(user_id, date);
create index on public.sale_items(sale_id);

-- =====================================================
-- PURCHASES
-- =====================================================
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  po_no text not null,
  date date not null default current_date,
  supplier_id uuid references public.contacts(id) on delete set null,
  supplier_name text,
  notes text,
  status text default 'open',
  created_at timestamptz not null default now(),
  unique (user_id, po_no)
);
create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  unit text,
  length numeric,
  width numeric,
  qty numeric not null default 0,
  rate numeric not null default 0,
  gst_pct numeric default 18,
  position int default 0
);
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
create policy "own purchases all" on public.purchases for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own purchase_items all" on public.purchase_items for all using (exists(select 1 from public.purchases p where p.id = purchase_id and p.user_id = auth.uid())) with check (exists(select 1 from public.purchases p where p.id = purchase_id and p.user_id = auth.uid()));
create index on public.purchases(user_id, date);
create index on public.purchase_items(purchase_id);

-- =====================================================
-- THIRD PARTY (TP) — supplier sells direct to buyer through us
-- =====================================================
create table public.third_party (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tp_no text not null,
  date date not null default current_date,
  supplier_id uuid references public.contacts(id) on delete set null,
  buyer_id uuid references public.contacts(id) on delete set null,
  supplier_name text,
  buyer_name text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, tp_no)
);
create table public.tp_items (
  id uuid primary key default gen_random_uuid(),
  tp_id uuid not null references public.third_party(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  unit text,
  length numeric,
  width numeric,
  qty numeric not null default 0,
  purchase_rate numeric not null default 0,
  sale_rate numeric not null default 0,
  gst_pct numeric default 18,
  position int default 0
);
alter table public.third_party enable row level security;
alter table public.tp_items enable row level security;
create policy "own tp all" on public.third_party for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tp_items all" on public.tp_items for all using (exists(select 1 from public.third_party t where t.id = tp_id and t.user_id = auth.uid())) with check (exists(select 1 from public.third_party t where t.id = tp_id and t.user_id = auth.uid()));
create index on public.third_party(user_id, date);
create index on public.tp_items(tp_id);

-- =====================================================
-- QUOTATIONS
-- =====================================================
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_no text not null,
  date date not null default current_date,
  buyer_id uuid references public.contacts(id) on delete set null,
  buyer_name text,
  notes text,
  valid_until date,
  created_at timestamptz not null default now(),
  unique (user_id, quote_no)
);
create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  unit text,
  length numeric,
  width numeric,
  qty numeric not null default 0,
  rate numeric not null default 0,
  gst_pct numeric default 18,
  position int default 0
);
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
create policy "own quotations all" on public.quotations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own quotation_items all" on public.quotation_items for all using (exists(select 1 from public.quotations q where q.id = quotation_id and q.user_id = auth.uid())) with check (exists(select 1 from public.quotations q where q.id = quotation_id and q.user_id = auth.uid()));

-- =====================================================
-- PAYMENTS (in & out)
-- =====================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_no text not null,
  date date not null default current_date,
  direction text not null check (direction in ('in', 'out')),
  contact_id uuid references public.contacts(id) on delete set null,
  contact_name text,
  amount numeric not null default 0,
  mode text default 'Bank',
  ref_doc text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, payment_no)
);
alter table public.payments enable row level security;
create policy "own payments all" on public.payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.payments(user_id, date);

-- =====================================================
-- EXPENSES
-- =====================================================
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  category text not null default 'General',
  amount numeric not null default 0,
  mode text default 'Cash',
  notes text,
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
create policy "own expenses all" on public.expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.expenses(user_id, date);

-- =====================================================
-- STOCK VIEW — live on-hand per product
-- =====================================================
create or replace view public.stock_view
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
  p.opening_stock
    + coalesce((select sum(pi.qty) from public.purchase_items pi join public.purchases ph on ph.id = pi.purchase_id where pi.product_id = p.id and ph.user_id = p.user_id), 0)
    - coalesce((select sum(si.qty) from public.sale_items si join public.sales s on s.id = si.sale_id where si.product_id = p.id and s.user_id = p.user_id), 0)
    as on_hand,
  p.reorder_level
from public.products p;

-- =====================================================
-- LEDGER VIEW — single accounting stream
-- Accounts: Sales, Purchases, AR (contact), AP (contact), Cash/Bank, Expenses, GST
-- =====================================================
create or replace view public.ledger_view
with (security_invoker = true) as
-- SALES: Dr AR / Cr Sales
select s.user_id, s.date, 'Sales' as source_type, s.invoice_no as source_id,
       coalesce(s.buyer_name, c.name, '—') as party,
       'Accounts Receivable' as account,
       round(sum(si.qty * si.rate * (1 + si.gst_pct/100.0))::numeric, 2) as debit,
       0::numeric as credit,
       'Invoice ' || s.invoice_no as narration
from public.sales s
join public.sale_items si on si.sale_id = s.id
left join public.contacts c on c.id = s.buyer_id
group by s.user_id, s.id, s.date, s.invoice_no, s.buyer_name, c.name
union all
select s.user_id, s.date, 'Sales', s.invoice_no,
       coalesce(s.buyer_name, c.name, '—'),
       'Sales Revenue',
       0::numeric,
       round(sum(si.qty * si.rate)::numeric, 2),
       'Invoice ' || s.invoice_no
from public.sales s
join public.sale_items si on si.sale_id = s.id
left join public.contacts c on c.id = s.buyer_id
group by s.user_id, s.id, s.date, s.invoice_no, s.buyer_name, c.name
union all
select s.user_id, s.date, 'Sales', s.invoice_no,
       coalesce(s.buyer_name, c.name, '—'),
       'GST Output',
       0::numeric,
       round(sum(si.qty * si.rate * si.gst_pct/100.0)::numeric, 2),
       'GST on ' || s.invoice_no
from public.sales s
join public.sale_items si on si.sale_id = s.id
left join public.contacts c on c.id = s.buyer_id
group by s.user_id, s.id, s.date, s.invoice_no, s.buyer_name, c.name
having sum(si.qty * si.rate * si.gst_pct/100.0) > 0

-- PURCHASES: Dr Purchases + GST / Cr AP
union all
select p.user_id, p.date, 'Purchase', p.po_no,
       coalesce(p.supplier_name, c.name, '—'),
       'Purchases',
       round(sum(pi.qty * pi.rate)::numeric, 2),
       0::numeric,
       'PO ' || p.po_no
from public.purchases p
join public.purchase_items pi on pi.purchase_id = p.id
left join public.contacts c on c.id = p.supplier_id
group by p.user_id, p.id, p.date, p.po_no, p.supplier_name, c.name
union all
select p.user_id, p.date, 'Purchase', p.po_no,
       coalesce(p.supplier_name, c.name, '—'),
       'GST Input',
       round(sum(pi.qty * pi.rate * pi.gst_pct/100.0)::numeric, 2),
       0::numeric,
       'GST on ' || p.po_no
from public.purchases p
join public.purchase_items pi on pi.purchase_id = p.id
left join public.contacts c on c.id = p.supplier_id
group by p.user_id, p.id, p.date, p.po_no, p.supplier_name, c.name
having sum(pi.qty * pi.rate * pi.gst_pct/100.0) > 0
union all
select p.user_id, p.date, 'Purchase', p.po_no,
       coalesce(p.supplier_name, c.name, '—'),
       'Accounts Payable',
       0::numeric,
       round(sum(pi.qty * pi.rate * (1 + pi.gst_pct/100.0))::numeric, 2),
       'PO ' || p.po_no
from public.purchases p
join public.purchase_items pi on pi.purchase_id = p.id
left join public.contacts c on c.id = p.supplier_id
group by p.user_id, p.id, p.date, p.po_no, p.supplier_name, c.name

-- THIRD PARTY: Dual entry, no stock movement
-- Sale leg: Dr AR(buyer)/Cr TP Sales
union all
select t.user_id, t.date, 'TP-Sale', t.tp_no,
       coalesce(t.buyer_name, cb.name, '—'),
       'Accounts Receivable',
       round(sum(ti.qty * ti.sale_rate * (1 + ti.gst_pct/100.0))::numeric, 2),
       0::numeric,
       'TP-Sale ' || t.tp_no
from public.third_party t
join public.tp_items ti on ti.tp_id = t.id
left join public.contacts cb on cb.id = t.buyer_id
group by t.user_id, t.id, t.date, t.tp_no, t.buyer_name, cb.name
union all
select t.user_id, t.date, 'TP-Sale', t.tp_no,
       coalesce(t.buyer_name, cb.name, '—'),
       'TP Sales Revenue',
       0::numeric,
       round(sum(ti.qty * ti.sale_rate)::numeric, 2),
       'TP-Sale ' || t.tp_no
from public.third_party t
join public.tp_items ti on ti.tp_id = t.id
left join public.contacts cb on cb.id = t.buyer_id
group by t.user_id, t.id, t.date, t.tp_no, t.buyer_name, cb.name
union all
-- Purchase leg: Dr TP Purchases/Cr AP(supplier)
select t.user_id, t.date, 'TP-Purchase', t.tp_no,
       coalesce(t.supplier_name, cs.name, '—'),
       'TP Purchases',
       round(sum(ti.qty * ti.purchase_rate)::numeric, 2),
       0::numeric,
       'TP-Purchase ' || t.tp_no
from public.third_party t
join public.tp_items ti on ti.tp_id = t.id
left join public.contacts cs on cs.id = t.supplier_id
group by t.user_id, t.id, t.date, t.tp_no, t.supplier_name, cs.name
union all
select t.user_id, t.date, 'TP-Purchase', t.tp_no,
       coalesce(t.supplier_name, cs.name, '—'),
       'Accounts Payable',
       0::numeric,
       round(sum(ti.qty * ti.purchase_rate * (1 + ti.gst_pct/100.0))::numeric, 2),
       'TP-Purchase ' || t.tp_no
from public.third_party t
join public.tp_items ti on ti.tp_id = t.id
left join public.contacts cs on cs.id = t.supplier_id
group by t.user_id, t.id, t.date, t.tp_no, t.supplier_name, cs.name

-- PAYMENT IN: Dr Cash/Cr AR
union all
select pm.user_id, pm.date, 'Payment-In', pm.payment_no,
       coalesce(pm.contact_name, c.name, '—'),
       case when pm.mode = 'Cash' then 'Cash' else 'Bank' end,
       pm.amount, 0::numeric,
       'Received from ' || coalesce(pm.contact_name, c.name, '—')
from public.payments pm
left join public.contacts c on c.id = pm.contact_id
where pm.direction = 'in'
union all
select pm.user_id, pm.date, 'Payment-In', pm.payment_no,
       coalesce(pm.contact_name, c.name, '—'),
       'Accounts Receivable',
       0::numeric, pm.amount,
       'Received from ' || coalesce(pm.contact_name, c.name, '—')
from public.payments pm
left join public.contacts c on c.id = pm.contact_id
where pm.direction = 'in'

-- PAYMENT OUT: Dr AP/Cr Cash
union all
select pm.user_id, pm.date, 'Payment-Out', pm.payment_no,
       coalesce(pm.contact_name, c.name, '—'),
       'Accounts Payable',
       pm.amount, 0::numeric,
       'Paid to ' || coalesce(pm.contact_name, c.name, '—')
from public.payments pm
left join public.contacts c on c.id = pm.contact_id
where pm.direction = 'out'
union all
select pm.user_id, pm.date, 'Payment-Out', pm.payment_no,
       coalesce(pm.contact_name, c.name, '—'),
       case when pm.mode = 'Cash' then 'Cash' else 'Bank' end,
       0::numeric, pm.amount,
       'Paid to ' || coalesce(pm.contact_name, c.name, '—')
from public.payments pm
left join public.contacts c on c.id = pm.contact_id
where pm.direction = 'out'

-- EXPENSES: Dr Expenses/Cr Cash
union all
select e.user_id, e.date, 'Expense', 'EXP-' || substring(e.id::text, 1, 8),
       e.category, 'Expenses: ' || e.category,
       e.amount, 0::numeric, coalesce(e.notes, e.category)
from public.expenses e
union all
select e.user_id, e.date, 'Expense', 'EXP-' || substring(e.id::text, 1, 8),
       e.category,
       case when e.mode = 'Cash' then 'Cash' else 'Bank' end,
       0::numeric, e.amount, coalesce(e.notes, e.category)
from public.expenses e;
