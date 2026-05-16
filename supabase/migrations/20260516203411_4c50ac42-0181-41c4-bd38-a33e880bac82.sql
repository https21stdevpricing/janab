
-- =========================================================================
-- 1. AUTO CODES
-- =========================================================================

-- Add code column to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_code_uq ON public.contacts(user_id, code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_user_code_uq ON public.products(user_id, code) WHERE code IS NOT NULL;

-- Generic helper: next sequential code for a (user, table, column, prefix)
CREATE OR REPLACE FUNCTION public._next_code(_user uuid, _prefix text, _table text, _col text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _max int; _sql text;
BEGIN
  _sql := format('select coalesce(max(nullif(regexp_replace(%I, ''^%s-'', ''''), '''')::int), 0) from public.%I where user_id = $1 and %I like %L',
                 _col, _prefix, _table, _col, _prefix || '-%');
  EXECUTE _sql INTO _max USING _user;
  RETURN _prefix || '-' || lpad((_max+1)::text, 4, '0');
END;$$;

-- products.code auto
CREATE OR REPLACE FUNCTION public.tg_products_autocode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.code IS NULL OR NEW.code = '' THEN NEW.code := public._next_code(NEW.user_id,'P','products','code'); END IF; RETURN NEW; END;$$;
DROP TRIGGER IF EXISTS products_autocode ON public.products;
CREATE TRIGGER products_autocode BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.tg_products_autocode();

-- contacts.code auto
CREATE OR REPLACE FUNCTION public.tg_contacts_autocode() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _pfx text;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    _pfx := CASE NEW.type::text WHEN 'buyer' THEN 'B' WHEN 'supplier' THEN 'S' ELSE 'BS' END;
    NEW.code := public._next_code(NEW.user_id, _pfx, 'contacts', 'code');
  END IF; RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS contacts_autocode ON public.contacts;
CREATE TRIGGER contacts_autocode BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.tg_contacts_autocode();

-- Doc-number auto on header tables
CREATE OR REPLACE FUNCTION public.tg_autonum() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _col text; _pfx text; _val text;
BEGIN
  _col := TG_ARGV[0]; _pfx := TG_ARGV[1];
  EXECUTE format('SELECT ($1).%I', _col) INTO _val USING NEW;
  IF _val IS NULL OR _val = '' THEN
    _val := public.next_doc_no(NEW.user_id, _pfx, TG_TABLE_NAME, _col);
    NEW := NEW #= hstore(_col, _val);
  END IF;
  RETURN NEW;
END;$$;
-- We need hstore; fall back to per-table specific triggers instead
DROP FUNCTION IF EXISTS public.tg_autonum() CASCADE;

CREATE OR REPLACE FUNCTION public.tg_sales_autonum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.invoice_no IS NULL OR NEW.invoice_no='' THEN NEW.invoice_no:=public.next_doc_no(NEW.user_id,'INV','sales','invoice_no'); END IF; RETURN NEW; END;$$;
CREATE OR REPLACE FUNCTION public.tg_purchases_autonum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.po_no IS NULL OR NEW.po_no='' THEN NEW.po_no:=public.next_doc_no(NEW.user_id,'PO','purchases','po_no'); END IF; RETURN NEW; END;$$;
CREATE OR REPLACE FUNCTION public.tg_tp_autonum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.tp_no IS NULL OR NEW.tp_no='' THEN NEW.tp_no:=public.next_doc_no(NEW.user_id,'TP','third_party','tp_no'); END IF; RETURN NEW; END;$$;
CREATE OR REPLACE FUNCTION public.tg_quote_autonum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.quote_no IS NULL OR NEW.quote_no='' THEN NEW.quote_no:=public.next_doc_no(NEW.user_id,'QUO','quotations','quote_no'); END IF; RETURN NEW; END;$$;
CREATE OR REPLACE FUNCTION public.tg_payments_autonum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.payment_no IS NULL OR NEW.payment_no='' THEN NEW.payment_no:=public.next_doc_no(NEW.user_id, CASE NEW.direction WHEN 'in' THEN 'RI' ELSE 'PY' END,'payments','payment_no'); END IF; RETURN NEW; END;$$;

DROP TRIGGER IF EXISTS sales_autonum ON public.sales;
CREATE TRIGGER sales_autonum BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.tg_sales_autonum();
DROP TRIGGER IF EXISTS purchases_autonum ON public.purchases;
CREATE TRIGGER purchases_autonum BEFORE INSERT ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.tg_purchases_autonum();
DROP TRIGGER IF EXISTS tp_autonum ON public.third_party;
CREATE TRIGGER tp_autonum BEFORE INSERT ON public.third_party FOR EACH ROW EXECUTE FUNCTION public.tg_tp_autonum();
DROP TRIGGER IF EXISTS quote_autonum ON public.quotations;
CREATE TRIGGER quote_autonum BEFORE INSERT ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.tg_quote_autonum();
DROP TRIGGER IF EXISTS payments_autonum ON public.payments;
CREATE TRIGGER payments_autonum BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_payments_autonum();

-- =========================================================================
-- 2. PAYMENT ALLOCATIONS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  doc_kind text NOT NULL CHECK (doc_kind IN ('sale','purchase','tp')),
  doc_id uuid NOT NULL,
  doc_no text,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own allocs all" ON public.payment_allocations;
CREATE POLICY "own allocs all" ON public.payment_allocations FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE INDEX IF NOT EXISTS allocs_doc_idx ON public.payment_allocations(doc_kind, doc_id);
CREATE INDEX IF NOT EXISTS allocs_payment_idx ON public.payment_allocations(payment_id);

-- =========================================================================
-- 3. JOURNAL TABLES
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  source_no text,
  narration text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_kind, source_id)
);
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  date date NOT NULL,
  account text NOT NULL,
  party text,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  ref_no text,
  narration text
);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own je all" ON public.journal_entries;
CREATE POLICY "own je all" ON public.journal_entries FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
DROP POLICY IF EXISTS "own jl all" ON public.journal_lines;
CREATE POLICY "own jl all" ON public.journal_lines FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE INDEX IF NOT EXISTS jl_entry_idx ON public.journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS jl_account_idx ON public.journal_lines(user_id, account);
CREATE INDEX IF NOT EXISTS jl_date_idx ON public.journal_lines(user_id, date);

-- =========================================================================
-- 4. JOURNAL POSTING ENGINE
-- =========================================================================
-- Helper: company state for GST split
CREATE OR REPLACE FUNCTION public._co_state(_user uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT state FROM public.settings WHERE user_id = _user;
$$;

-- Post journal for a SALE
CREATE OR REPLACE FUNCTION public.post_journal_sale(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s record; co_state text; party_state text; intra bool;
  taxable numeric:=0; cgst numeric:=0; sgst numeric:=0; igst numeric:=0; total numeric:=0;
  je_id uuid;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id=_id;
  IF NOT FOUND THEN
    DELETE FROM public.journal_entries WHERE source_kind='sale' AND source_id=_id; RETURN;
  END IF;

  co_state := _co_state(s.user_id);
  SELECT c.state INTO party_state FROM public.contacts c WHERE c.id = s.buyer_id;
  intra := COALESCE(lower(trim(co_state))=lower(trim(party_state)), true);

  SELECT
    COALESCE(SUM(qty*rate),0),
    COALESCE(SUM(qty*rate*COALESCE(gst_pct,0)/100),0)
  INTO taxable, total
  FROM public.sale_items WHERE sale_id=_id;
  total := taxable + total;

  IF intra THEN
    cgst := (total - taxable)/2; sgst := cgst; igst:=0;
  ELSE
    igst := total - taxable; cgst:=0; sgst:=0;
  END IF;

  DELETE FROM public.journal_entries WHERE source_kind='sale' AND source_id=_id;
  IF taxable = 0 AND total = 0 THEN RETURN; END IF;

  INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
    VALUES (s.user_id, s.date, 'sale', s.id, s.invoice_no, 'Sale '||s.invoice_no) RETURNING id INTO je_id;

  INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no)
    VALUES (je_id,s.user_id,s.date,'Accounts Receivable',s.buyer_name,total,0,s.invoice_no),
           (je_id,s.user_id,s.date,'Sales Revenue',s.buyer_name,0,taxable,s.invoice_no);
  IF cgst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,s.user_id,s.date,'Output CGST',0,cgst,s.invoice_no),
    (je_id,s.user_id,s.date,'Output SGST',0,sgst,s.invoice_no); END IF;
  IF igst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,s.user_id,s.date,'Output IGST',0,igst,s.invoice_no); END IF;
END;$$;

-- Post journal for a PURCHASE
CREATE OR REPLACE FUNCTION public.post_journal_purchase(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  p record; co_state text; party_state text; intra bool;
  taxable numeric:=0; cgst numeric:=0; sgst numeric:=0; igst numeric:=0; total numeric:=0; je_id uuid;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id=_id;
  IF NOT FOUND THEN DELETE FROM public.journal_entries WHERE source_kind='purchase' AND source_id=_id; RETURN; END IF;
  co_state := _co_state(p.user_id);
  SELECT c.state INTO party_state FROM public.contacts c WHERE c.id = p.supplier_id;
  intra := COALESCE(lower(trim(co_state))=lower(trim(party_state)), true);

  SELECT COALESCE(SUM(qty*rate),0), COALESCE(SUM(qty*rate*COALESCE(gst_pct,0)/100),0)
  INTO taxable, total FROM public.purchase_items WHERE purchase_id=_id;
  total := taxable + total;
  IF intra THEN cgst := (total-taxable)/2; sgst:=cgst; ELSE igst := total-taxable; END IF;

  DELETE FROM public.journal_entries WHERE source_kind='purchase' AND source_id=_id;
  IF taxable=0 AND total=0 THEN RETURN; END IF;
  INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
    VALUES (p.user_id,p.date,'purchase',p.id,p.po_no,'Purchase '||p.po_no) RETURNING id INTO je_id;
  INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no) VALUES
    (je_id,p.user_id,p.date,'Purchases',p.supplier_name,taxable,0,p.po_no),
    (je_id,p.user_id,p.date,'Accounts Payable',p.supplier_name,0,total,p.po_no);
  IF cgst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,p.user_id,p.date,'Input CGST',cgst,0,p.po_no),
    (je_id,p.user_id,p.date,'Input SGST',sgst,0,p.po_no); END IF;
  IF igst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,p.user_id,p.date,'Input IGST',igst,0,p.po_no); END IF;
END;$$;

-- Post journal for a THIRD PARTY deal (both sides + margin auto-flows)
CREATE OR REPLACE FUNCTION public.post_journal_tp(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  t record; co_state text; bs text; ss text; bi bool; si bool;
  s_tax numeric:=0; s_gst numeric:=0; s_total numeric:=0;
  p_tax numeric:=0; p_gst numeric:=0; p_total numeric:=0;
  s_cgst numeric:=0; s_sgst numeric:=0; s_igst numeric:=0;
  p_cgst numeric:=0; p_sgst numeric:=0; p_igst numeric:=0;
  je_id uuid;
BEGIN
  SELECT * INTO t FROM public.third_party WHERE id=_id;
  IF NOT FOUND THEN DELETE FROM public.journal_entries WHERE source_kind='tp' AND source_id=_id; RETURN; END IF;
  co_state := _co_state(t.user_id);
  SELECT state INTO bs FROM public.contacts WHERE id=t.buyer_id;
  SELECT state INTO ss FROM public.contacts WHERE id=t.supplier_id;
  bi := COALESCE(lower(trim(co_state))=lower(trim(bs)),true);
  si := COALESCE(lower(trim(co_state))=lower(trim(ss)),true);

  SELECT COALESCE(SUM(qty*sale_rate),0), COALESCE(SUM(qty*sale_rate*COALESCE(gst_pct,0)/100),0),
         COALESCE(SUM(qty*purchase_rate),0), COALESCE(SUM(qty*purchase_rate*COALESCE(gst_pct,0)/100),0)
  INTO s_tax, s_gst, p_tax, p_gst FROM public.tp_items WHERE tp_id=_id;
  s_total:=s_tax+s_gst; p_total:=p_tax+p_gst;

  IF bi THEN s_cgst:=s_gst/2; s_sgst:=s_gst/2; ELSE s_igst:=s_gst; END IF;
  IF si THEN p_cgst:=p_gst/2; p_sgst:=p_gst/2; ELSE p_igst:=p_gst; END IF;

  DELETE FROM public.journal_entries WHERE source_kind='tp' AND source_id=_id;
  IF s_tax=0 AND p_tax=0 THEN RETURN; END IF;
  INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
    VALUES (t.user_id,t.date,'tp',t.id,t.tp_no,'Third-party '||t.tp_no) RETURNING id INTO je_id;

  -- Sale side
  INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no) VALUES
    (je_id,t.user_id,t.date,'Accounts Receivable',t.buyer_name,s_total,0,t.tp_no),
    (je_id,t.user_id,t.date,'TP Sales Revenue',t.buyer_name,0,s_tax,t.tp_no);
  IF s_cgst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,t.user_id,t.date,'Output CGST',0,s_cgst,t.tp_no),
    (je_id,t.user_id,t.date,'Output SGST',0,s_sgst,t.tp_no); END IF;
  IF s_igst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,t.user_id,t.date,'Output IGST',0,s_igst,t.tp_no); END IF;

  -- Purchase side
  INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no) VALUES
    (je_id,t.user_id,t.date,'TP Purchases',t.supplier_name,p_tax,0,t.tp_no),
    (je_id,t.user_id,t.date,'Accounts Payable',t.supplier_name,0,p_total,t.tp_no);
  IF p_cgst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,t.user_id,t.date,'Input CGST',p_cgst,0,t.tp_no),
    (je_id,t.user_id,t.date,'Input SGST',p_sgst,0,t.tp_no); END IF;
  IF p_igst>0 THEN INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
    (je_id,t.user_id,t.date,'Input IGST',p_igst,0,t.tp_no); END IF;
END;$$;

-- Post journal for a PAYMENT
CREATE OR REPLACE FUNCTION public.post_journal_payment(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; cash_acct text; party_acct text; je_id uuid;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id=_id;
  IF NOT FOUND THEN DELETE FROM public.journal_entries WHERE source_kind='payment' AND source_id=_id; RETURN; END IF;
  cash_acct := CASE upper(coalesce(p.mode,'Bank')) WHEN 'CASH' THEN 'Cash' ELSE 'Bank' END;
  DELETE FROM public.journal_entries WHERE source_kind='payment' AND source_id=_id;
  IF p.amount=0 THEN RETURN; END IF;
  INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
    VALUES (p.user_id,p.date,'payment',p.id,p.payment_no, (CASE WHEN p.direction='in' THEN 'Receipt' ELSE 'Payment' END)||' '||p.payment_no)
    RETURNING id INTO je_id;
  IF p.direction='in' THEN
    party_acct := 'Accounts Receivable';
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no) VALUES
      (je_id,p.user_id,p.date,cash_acct,p.contact_name,p.amount,0,p.payment_no),
      (je_id,p.user_id,p.date,party_acct,p.contact_name,0,p.amount,p.payment_no);
  ELSE
    party_acct := 'Accounts Payable';
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no) VALUES
      (je_id,p.user_id,p.date,party_acct,p.contact_name,p.amount,0,p.payment_no),
      (je_id,p.user_id,p.date,cash_acct,p.contact_name,0,p.amount,p.payment_no);
  END IF;
END;$$;

-- Post journal for an EXPENSE
CREATE OR REPLACE FUNCTION public.post_journal_expense(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; cash_acct text; je_id uuid;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id=_id;
  IF NOT FOUND THEN DELETE FROM public.journal_entries WHERE source_kind='expense' AND source_id=_id; RETURN; END IF;
  cash_acct := CASE upper(coalesce(e.mode,'Cash')) WHEN 'BANK' THEN 'Bank' ELSE 'Cash' END;
  DELETE FROM public.journal_entries WHERE source_kind='expense' AND source_id=_id;
  IF e.amount=0 THEN RETURN; END IF;
  INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
    VALUES (e.user_id,e.date,'expense',e.id,null,'Expense: '||e.category) RETURNING id INTO je_id;
  INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit) VALUES
    (je_id,e.user_id,e.date,'Expenses: '||e.category,e.amount,0),
    (je_id,e.user_id,e.date,cash_acct,0,e.amount);
END;$$;

-- =========================================================================
-- 5. TRIGGERS
-- =========================================================================
-- Header triggers (insert/update/delete)
CREATE OR REPLACE FUNCTION public.tg_sale_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF TG_OP='DELETE' THEN PERFORM public.post_journal_sale(OLD.id); RETURN OLD; END IF;
  PERFORM public.post_journal_sale(NEW.id); RETURN NEW; END;$$;
DROP TRIGGER IF EXISTS sale_post ON public.sales;
CREATE TRIGGER sale_post AFTER INSERT OR UPDATE OR DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.tg_sale_post();

CREATE OR REPLACE FUNCTION public.tg_sale_items_post() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _sid uuid;
BEGIN _sid := COALESCE(NEW.sale_id, OLD.sale_id); PERFORM public.post_journal_sale(_sid); RETURN NULL; END;$$;
DROP TRIGGER IF EXISTS sale_items_post ON public.sale_items;
CREATE TRIGGER sale_items_post AFTER INSERT OR UPDATE OR DELETE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.tg_sale_items_post();

CREATE OR REPLACE FUNCTION public.tg_purchase_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF TG_OP='DELETE' THEN PERFORM public.post_journal_purchase(OLD.id); RETURN OLD; END IF;
  PERFORM public.post_journal_purchase(NEW.id); RETURN NEW; END;$$;
DROP TRIGGER IF EXISTS purchase_post ON public.purchases;
CREATE TRIGGER purchase_post AFTER INSERT OR UPDATE OR DELETE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.tg_purchase_post();

CREATE OR REPLACE FUNCTION public.tg_purchase_items_post() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _pid uuid;
BEGIN _pid := COALESCE(NEW.purchase_id, OLD.purchase_id); PERFORM public.post_journal_purchase(_pid); RETURN NULL; END;$$;
DROP TRIGGER IF EXISTS purchase_items_post ON public.purchase_items;
CREATE TRIGGER purchase_items_post AFTER INSERT OR UPDATE OR DELETE ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.tg_purchase_items_post();

CREATE OR REPLACE FUNCTION public.tg_tp_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF TG_OP='DELETE' THEN PERFORM public.post_journal_tp(OLD.id); RETURN OLD; END IF;
  PERFORM public.post_journal_tp(NEW.id); RETURN NEW; END;$$;
DROP TRIGGER IF EXISTS tp_post ON public.third_party;
CREATE TRIGGER tp_post AFTER INSERT OR UPDATE OR DELETE ON public.third_party FOR EACH ROW EXECUTE FUNCTION public.tg_tp_post();

CREATE OR REPLACE FUNCTION public.tg_tp_items_post() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _tid uuid;
BEGIN _tid := COALESCE(NEW.tp_id, OLD.tp_id); PERFORM public.post_journal_tp(_tid); RETURN NULL; END;$$;
DROP TRIGGER IF EXISTS tp_items_post ON public.tp_items;
CREATE TRIGGER tp_items_post AFTER INSERT OR UPDATE OR DELETE ON public.tp_items FOR EACH ROW EXECUTE FUNCTION public.tg_tp_items_post();

CREATE OR REPLACE FUNCTION public.tg_payment_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF TG_OP='DELETE' THEN PERFORM public.post_journal_payment(OLD.id); RETURN OLD; END IF;
  PERFORM public.post_journal_payment(NEW.id); RETURN NEW; END;$$;
DROP TRIGGER IF EXISTS payment_post ON public.payments;
CREATE TRIGGER payment_post AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_payment_post();

CREATE OR REPLACE FUNCTION public.tg_expense_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF TG_OP='DELETE' THEN PERFORM public.post_journal_expense(OLD.id); RETURN OLD; END IF;
  PERFORM public.post_journal_expense(NEW.id); RETURN NEW; END;$$;
DROP TRIGGER IF EXISTS expense_post ON public.expenses;
CREATE TRIGGER expense_post AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.tg_expense_post();

-- =========================================================================
-- 6. VIEWS
-- =========================================================================
DROP VIEW IF EXISTS public.ledger_view CASCADE;
CREATE VIEW public.ledger_view AS
SELECT jl.user_id, jl.date, jl.account, jl.party, jl.ref_no, jl.narration, jl.debit, jl.credit,
       (jl.debit - jl.credit) AS net
FROM public.journal_lines jl;

DROP VIEW IF EXISTS public.outstanding_view CASCADE;
CREATE VIEW public.outstanding_view AS
WITH docs AS (
  SELECT s.user_id, 'sale'::text AS doc_kind, s.id AS doc_id, s.invoice_no AS doc_no, s.date,
         s.buyer_id AS party_id, s.buyer_name AS party_name,
         (SELECT COALESCE(SUM(qty*rate*(1+COALESCE(gst_pct,0)/100)),0) FROM public.sale_items WHERE sale_id=s.id) AS total
  FROM public.sales s
  UNION ALL
  SELECT p.user_id, 'purchase', p.id, p.po_no, p.date, p.supplier_id, p.supplier_name,
         (SELECT COALESCE(SUM(qty*rate*(1+COALESCE(gst_pct,0)/100)),0) FROM public.purchase_items WHERE purchase_id=p.id)
  FROM public.purchases p
  UNION ALL
  SELECT t.user_id, 'tp', t.id, t.tp_no, t.date, t.buyer_id, t.buyer_name,
         (SELECT COALESCE(SUM(qty*sale_rate*(1+COALESCE(gst_pct,0)/100)),0) FROM public.tp_items WHERE tp_id=t.id)
  FROM public.third_party t
), paid AS (
  SELECT doc_kind, doc_id, COALESCE(SUM(amount),0) AS paid FROM public.payment_allocations GROUP BY doc_kind, doc_id
)
SELECT d.user_id, d.doc_kind, d.doc_id, d.doc_no, d.date, d.party_id, d.party_name,
       d.total, COALESCE(p.paid,0) AS paid, (d.total - COALESCE(p.paid,0)) AS balance,
       CASE WHEN d.total=0 THEN 'empty'
            WHEN COALESCE(p.paid,0) >= d.total THEN 'paid'
            WHEN COALESCE(p.paid,0) > 0 THEN 'partial' ELSE 'unpaid' END AS status
FROM docs d LEFT JOIN paid p ON p.doc_kind=d.doc_kind AND p.doc_id=d.doc_id;

DROP VIEW IF EXISTS public.party_summary_view CASCADE;
CREATE VIEW public.party_summary_view AS
SELECT c.user_id, c.id AS contact_id, c.name, c.type, c.code,
  COALESCE((SELECT SUM(total) FROM public.outstanding_view o WHERE o.party_id=c.id AND o.doc_kind IN ('sale','tp')),0) AS total_sales,
  COALESCE((SELECT SUM(total) FROM public.outstanding_view o WHERE o.party_id=c.id AND o.doc_kind='purchase'),0) AS total_purchases,
  COALESCE((SELECT SUM(balance) FROM public.outstanding_view o WHERE o.party_id=c.id AND o.doc_kind IN ('sale','tp')),0) AS receivable,
  COALESCE((SELECT SUM(balance) FROM public.outstanding_view o WHERE o.party_id=c.id AND o.doc_kind='purchase'),0) AS payable,
  (SELECT MAX(date) FROM public.outstanding_view o WHERE o.party_id=c.id) AS last_txn
FROM public.contacts c;

DROP VIEW IF EXISTS public.monthly_pnl_view CASCADE;
CREATE VIEW public.monthly_pnl_view AS
SELECT user_id, date_trunc('month', date)::date AS month,
  SUM(CASE WHEN account IN ('Sales Revenue','TP Sales Revenue') THEN credit-debit ELSE 0 END) AS revenue,
  SUM(CASE WHEN account IN ('Purchases','TP Purchases') THEN debit-credit ELSE 0 END) AS cogs,
  SUM(CASE WHEN account LIKE 'Expenses:%' THEN debit-credit ELSE 0 END) AS expenses
FROM public.journal_lines GROUP BY user_id, date_trunc('month', date);

DROP VIEW IF EXISTS public.cash_flow_view CASCADE;
CREATE VIEW public.cash_flow_view AS
SELECT user_id, date_trunc('month', date)::date AS month, account,
  SUM(debit) AS inflow, SUM(credit) AS outflow, SUM(debit-credit) AS net
FROM public.journal_lines WHERE account IN ('Cash','Bank')
GROUP BY user_id, date_trunc('month', date), account;

-- =========================================================================
-- 7. BACKFILL
-- =========================================================================
UPDATE public.products SET code = public._next_code(user_id,'P','products','code') WHERE code IS NULL OR code='';
UPDATE public.contacts SET code = public._next_code(user_id,
  CASE type::text WHEN 'buyer' THEN 'B' WHEN 'supplier' THEN 'S' ELSE 'BS' END, 'contacts','code')
  WHERE code IS NULL OR code='';

-- Repost all existing
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.sales LOOP PERFORM public.post_journal_sale(r.id); END LOOP;
  FOR r IN SELECT id FROM public.purchases LOOP PERFORM public.post_journal_purchase(r.id); END LOOP;
  FOR r IN SELECT id FROM public.third_party LOOP PERFORM public.post_journal_tp(r.id); END LOOP;
  FOR r IN SELECT id FROM public.payments LOOP PERFORM public.post_journal_payment(r.id); END LOOP;
  FOR r IN SELECT id FROM public.expenses LOOP PERFORM public.post_journal_expense(r.id); END LOOP;
END $$;
