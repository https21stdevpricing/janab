-- Fix payment allocation doc kind validation to support TP receivable/payable split
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_allocations_doc_kind_check'
      AND conrelid = 'public.payment_allocations'::regclass
  ) THEN
    ALTER TABLE public.payment_allocations DROP CONSTRAINT payment_allocations_doc_kind_check;
  END IF;
END $$;

ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_doc_kind_check
  CHECK (doc_kind IN ('sale', 'purchase', 'tp', 'tp_purchase'));

-- Ensure TP deliveries can be linked and searched
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS tp_id uuid;

CREATE INDEX IF NOT EXISTS idx_deliveries_tp_id ON public.deliveries(tp_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_sale_id ON public.deliveries(sale_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_doc ON public.payment_allocations(doc_kind, doc_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON public.payment_allocations(payment_id);

-- Enrich payment narration and fully repost payment journals after allocation changes
CREATE OR REPLACE FUNCTION public._refresh_payment_narration(_pid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p record;
  _docs text;
  _label text;
  _narr text;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _pid;
  IF NOT FOUND THEN
    DELETE FROM public.journal_entries WHERE source_kind='payment' AND source_id=_pid;
    RETURN;
  END IF;

  SELECT string_agg(
           CASE doc_kind
             WHEN 'sale' THEN 'Invoice '
             WHEN 'purchase' THEN 'Purchase '
             WHEN 'tp' THEN 'TP sale '
             WHEN 'tp_purchase' THEN 'TP purchase '
             ELSE ''
           END || COALESCE(doc_no, doc_id::text) || ' ₹' || trim(to_char(amount, 'FM99,99,99,990.00')),
           ', ' ORDER BY created_at, doc_no
         )
    INTO _docs
    FROM public.payment_allocations
   WHERE payment_id = _pid;

  _label := CASE WHEN p.direction = 'in' THEN 'Receipt ' ELSE 'Payment ' END || p.payment_no;
  _narr  := _label
         || COALESCE(' · ' || NULLIF(p.contact_name,''), '')
         || CASE WHEN _docs IS NOT NULL THEN ' · settled against ' || _docs ELSE ' · unallocated advance' END;

  UPDATE public.journal_entries
     SET narration = _narr
   WHERE source_kind='payment' AND source_id=_pid;

  UPDATE public.journal_lines jl
     SET narration = _narr
   WHERE jl.entry_id IN (
     SELECT id FROM public.journal_entries
      WHERE source_kind = 'payment' AND source_id = _pid
   );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_payment(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p record;
  cash_acct text;
  party_acct text;
  je_id uuid;
  _docs text;
  _narr text;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id=_id;
  IF NOT FOUND THEN
    DELETE FROM public.journal_entries WHERE source_kind='payment' AND source_id=_id;
    RETURN;
  END IF;

  cash_acct := CASE upper(coalesce(p.mode,'Bank')) WHEN 'CASH' THEN 'Cash' ELSE 'Bank' END;
  DELETE FROM public.journal_entries WHERE source_kind='payment' AND source_id=_id;
  IF p.amount=0 THEN RETURN; END IF;

  SELECT string_agg(
           CASE doc_kind
             WHEN 'sale' THEN 'Invoice '
             WHEN 'purchase' THEN 'Purchase '
             WHEN 'tp' THEN 'TP sale '
             WHEN 'tp_purchase' THEN 'TP purchase '
             ELSE ''
           END || COALESCE(doc_no, doc_id::text) || ' ₹' || trim(to_char(amount, 'FM99,99,99,990.00')),
           ', ' ORDER BY created_at, doc_no
         )
    INTO _docs
    FROM public.payment_allocations
   WHERE payment_id = _id;

  _narr := (CASE WHEN p.direction='in' THEN 'Receipt ' ELSE 'Payment ' END) || p.payment_no
         || COALESCE(' · '||NULLIF(p.contact_name,''),'')
         || CASE WHEN _docs IS NOT NULL THEN ' · settled against '||_docs ELSE ' · unallocated advance' END;

  INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
    VALUES (p.user_id,p.date,'payment',p.id,p.payment_no,_narr)
    RETURNING id INTO je_id;

  IF p.direction='in' THEN
    party_acct := 'Accounts Receivable';
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no,narration) VALUES
      (je_id,p.user_id,p.date,cash_acct,p.contact_name,p.amount,0,p.payment_no,_narr),
      (je_id,p.user_id,p.date,party_acct,p.contact_name,0,p.amount,p.payment_no,_narr);
  ELSE
    party_acct := 'Accounts Payable';
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no,narration) VALUES
      (je_id,p.user_id,p.date,party_acct,p.contact_name,p.amount,0,p.payment_no,_narr),
      (je_id,p.user_id,p.date,cash_acct,p.contact_name,0,p.amount,p.payment_no,_narr);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_alloc_refresh_narr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.post_journal_payment(OLD.payment_id);
    RETURN OLD;
  END IF;
  PERFORM public.post_journal_payment(NEW.payment_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alloc_refresh_narr ON public.payment_allocations;
CREATE TRIGGER trg_alloc_refresh_narr
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.tg_alloc_refresh_narr();

-- Auto allocation supports TP sales and TP purchases with the corrected doc_kind set
CREATE OR REPLACE FUNCTION public.auto_allocate_payment(_pid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p record;
  kinds text[];
  remaining numeric;
  already numeric;
  d record;
  take numeric;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _pid;
  IF NOT FOUND OR p.contact_id IS NULL OR p.amount <= 0 THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO already
    FROM public.payment_allocations
   WHERE payment_id = _pid;

  remaining := p.amount - already;
  IF remaining <= 0.005 THEN RETURN; END IF;

  IF p.direction = 'in' THEN
    kinds := ARRAY['sale','tp'];
  ELSE
    kinds := ARRAY['purchase','tp_purchase'];
  END IF;

  FOR d IN
    SELECT doc_kind, doc_id, doc_no, balance, date
      FROM public.outstanding_view
     WHERE party_id = p.contact_id
       AND user_id = p.user_id
       AND doc_kind = ANY(kinds)
       AND balance > 0
     ORDER BY date ASC, doc_no ASC
  LOOP
    EXIT WHEN remaining <= 0.005;
    take := LEAST(d.balance, remaining);
    INSERT INTO public.payment_allocations(user_id, payment_id, doc_kind, doc_id, doc_no, amount)
    VALUES (p.user_id, _pid, d.doc_kind, d.doc_id, d.doc_no, round(take::numeric, 2));
    remaining := remaining - take;
  END LOOP;

  PERFORM public.post_journal_payment(_pid);
END;
$$;

-- Fix ambiguous audit variable/column reference that caused delivery form saves to fail
CREATE OR REPLACE FUNCTION public.tg_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid; v_ref text; v_sum text; v_id uuid; v_diff jsonb;
  v_row jsonb; v_amount numeric; v_party text; v_date text; v_extra text;
  v_field text;
  v_keys text[] := ARRAY[
    'amount','total','qty','rate','sale_rate','purchase_rate','gst_pct','opening_stock','reorder_level',
    'category','mode','direction','status','kind','type','unit','hsn',
    'name','supplier_name','buyer_name','contact_name','party','party_name','product_name',
    'date','due_date','dispatched_at','delivered_at','ref_doc','notes','narration',
    'invoice_no','po_no','tp_no','quote_no','payment_no','delivery_no','code',
    'state','gstin','phone','email','address','opening_balance','credit_limit'
  ];
BEGIN
  IF TG_OP='DELETE' THEN
    v_user := OLD.user_id; v_id := OLD.id; v_row := to_jsonb(OLD);
  ELSE
    v_user := NEW.user_id; v_id := NEW.id; v_row := to_jsonb(NEW);
  END IF;

  v_ref := COALESCE(v_row->>'invoice_no', v_row->>'po_no', v_row->>'tp_no', v_row->>'quote_no', v_row->>'payment_no', v_row->>'code', v_row->>'delivery_no');
  v_amount := NULLIF(v_row->>'amount','')::numeric;
  IF v_amount IS NULL THEN v_amount := NULLIF(v_row->>'total','')::numeric; END IF;
  v_party := COALESCE(v_row->>'contact_name', v_row->>'buyer_name', v_row->>'supplier_name', v_row->>'party_name', v_row->>'name');
  v_date := v_row->>'date';

  v_extra := '';
  IF TG_TABLE_NAME = 'expenses' THEN
    v_extra := COALESCE(v_row->>'category','Expense') || COALESCE(' · ₹'||to_char(v_amount,'FM99,99,99,990.00'),'') || COALESCE(' · '||(v_row->>'mode'),'');
  ELSIF TG_TABLE_NAME = 'payments' THEN
    v_extra := CASE WHEN v_row->>'direction'='in' THEN 'Receipt' ELSE 'Payment' END || COALESCE(' · '||v_party,'') || COALESCE(' · ₹'||to_char(v_amount,'FM99,99,99,990.00'),'') || COALESCE(' · '||(v_row->>'mode'),'');
  ELSIF TG_TABLE_NAME IN ('sales','purchases','third_party','quotations') THEN
    v_extra := COALESCE(v_party,'') || COALESCE(' · '||v_date,'');
  ELSIF TG_TABLE_NAME = 'deliveries' THEN
    v_extra := COALESCE(v_party,'') || COALESCE(' · '||(v_row->>'status'),'');
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_extra := COALESCE(v_row->>'name','') || COALESCE(' · '||(v_row->>'unit'),'');
  ELSIF TG_TABLE_NAME = 'contacts' THEN
    v_extra := COALESCE(v_row->>'name','') || COALESCE(' · '||(v_row->>'type'),'');
  ELSIF TG_TABLE_NAME IN ('sale_items','purchase_items','tp_items','quotation_items','delivery_items') THEN
    v_extra := COALESCE(v_row->>'product_name','') || COALESCE(' · qty '||COALESCE(v_row->>'qty', v_row->>'qty_ordered'),'') || COALESCE(' @ ₹'||COALESCE(v_row->>'rate', v_row->>'sale_rate', v_row->>'purchase_rate'),'');
  ELSIF TG_TABLE_NAME = 'payment_allocations' THEN
    v_extra := COALESCE(v_row->>'doc_no','') || COALESCE(' · ₹'||to_char(v_amount,'FM99,99,99,990.00'),'');
  END IF;

  v_sum := TG_TABLE_NAME || ' ' || lower(TG_OP) || COALESCE(' '||v_ref,'') || COALESCE(' — '||NULLIF(v_extra,''),'');

  IF TG_OP='UPDATE' THEN
    SELECT jsonb_object_agg(changed.field_name, jsonb_build_object('old', to_jsonb(OLD)->changed.field_name, 'new', to_jsonb(NEW)->changed.field_name))
      INTO v_diff
      FROM jsonb_object_keys(to_jsonb(NEW)) AS changed(field_name)
     WHERE to_jsonb(OLD)->changed.field_name IS DISTINCT FROM to_jsonb(NEW)->changed.field_name
       AND changed.field_name NOT IN ('updated_at','created_at');
  ELSE
    v_diff := '{}'::jsonb;
    FOREACH v_field IN ARRAY v_keys LOOP
      IF v_row ? v_field AND v_row->v_field IS NOT NULL AND v_row->>v_field <> '' THEN
        IF TG_OP='INSERT' THEN
          v_diff := v_diff || jsonb_build_object(v_field, jsonb_build_object('old', null, 'new', v_row->v_field));
        ELSE
          v_diff := v_diff || jsonb_build_object(v_field, jsonb_build_object('old', v_row->v_field, 'new', null));
        END IF;
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN v_diff := NULL; END IF;
  END IF;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, ref_no, summary, diff)
  VALUES (v_user, lower(TG_OP), TG_TABLE_NAME, v_id, v_ref, v_sum, v_diff);

  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Clean downstream records and repost affected payments when source docs are deleted
CREATE OR REPLACE FUNCTION public.tg_cleanup_doc_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _kinds text[];
  _pids uuid[];
  _pid uuid;
BEGIN
  IF TG_TABLE_NAME = 'sales' THEN
    _kinds := ARRAY['sale'];
  ELSIF TG_TABLE_NAME = 'purchases' THEN
    _kinds := ARRAY['purchase'];
  ELSIF TG_TABLE_NAME = 'third_party' THEN
    _kinds := ARRAY['tp','tp_purchase'];
  ELSE
    RETURN OLD;
  END IF;

  SELECT array_agg(DISTINCT payment_id) INTO _pids
    FROM public.payment_allocations
   WHERE doc_id = OLD.id AND doc_kind = ANY(_kinds);

  DELETE FROM public.payment_allocations
   WHERE doc_id = OLD.id AND doc_kind = ANY(_kinds);

  IF _pids IS NOT NULL THEN
    FOREACH _pid IN ARRAY _pids LOOP
      PERFORM public.post_journal_payment(_pid);
    END LOOP;
  END IF;

  IF TG_TABLE_NAME = 'sales' THEN
    DELETE FROM public.delivery_items WHERE delivery_id IN (SELECT id FROM public.deliveries WHERE sale_id = OLD.id);
    DELETE FROM public.deliveries WHERE sale_id = OLD.id;
  ELSIF TG_TABLE_NAME = 'third_party' THEN
    DELETE FROM public.delivery_items WHERE delivery_id IN (SELECT id FROM public.deliveries WHERE tp_id = OLD.id);
    DELETE FROM public.deliveries WHERE tp_id = OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_sale_cascade ON public.sales;
CREATE TRIGGER trg_cleanup_sale_cascade
BEFORE DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.tg_cleanup_doc_cascade();

DROP TRIGGER IF EXISTS trg_cleanup_purchase_cascade ON public.purchases;
CREATE TRIGGER trg_cleanup_purchase_cascade
BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.tg_cleanup_doc_cascade();

DROP TRIGGER IF EXISTS trg_cleanup_tp_cascade ON public.third_party;
CREATE TRIGGER trg_cleanup_tp_cascade
BEFORE DELETE ON public.third_party
FOR EACH ROW EXECUTE FUNCTION public.tg_cleanup_doc_cascade();

-- Payment delete cleanup
CREATE OR REPLACE FUNCTION public.tg_cleanup_payment_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.payment_allocations WHERE payment_id = OLD.id;
  DELETE FROM public.journal_entries WHERE source_kind='payment' AND source_id=OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_payment_cascade ON public.payments;
CREATE TRIGGER trg_cleanup_payment_cascade
BEFORE DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.tg_cleanup_payment_cascade();

-- Third-party delivery creation and item sync
CREATE OR REPLACE FUNCTION public.tg_tp_make_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _addr text;
  _no text;
BEGIN
  SELECT address INTO _addr FROM public.contacts WHERE id = NEW.buyer_id;
  SELECT delivery_no INTO _no FROM public.deliveries WHERE tp_id = NEW.id LIMIT 1;
  IF _no IS NULL THEN
    _no := public.next_doc_no(NEW.user_id, 'DN', 'deliveries', 'delivery_no');
  END IF;

  INSERT INTO public.deliveries(user_id, tp_id, invoice_no, delivery_no, date, buyer_id, buyer_name, ship_address, status, notes)
  VALUES (NEW.user_id, NEW.id, NEW.tp_no, _no, NEW.date, NEW.buyer_id, NEW.buyer_name, _addr, 'pending', 'Third-party delivery')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tp_make_delivery ON public.third_party;
CREATE TRIGGER trg_tp_make_delivery
AFTER INSERT ON public.third_party
FOR EACH ROW EXECUTE FUNCTION public.tg_tp_make_delivery();

CREATE OR REPLACE FUNCTION public.tg_tp_item_to_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _did uuid;
BEGIN
  SELECT id INTO _did FROM public.deliveries WHERE tp_id = NEW.tp_id LIMIT 1;
  IF _did IS NULL THEN RETURN NEW; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_items
     WHERE delivery_id = _did
       AND position = COALESCE(NEW.position, 0)
       AND product_name IS NOT DISTINCT FROM NEW.product_name
  ) THEN
    INSERT INTO public.delivery_items(delivery_id, product_id, product_name, unit, qty_ordered, qty_delivered, position)
    VALUES (_did, NEW.product_id, NEW.product_name, NEW.unit, NEW.qty, 0, COALESCE(NEW.position, 0));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tp_item_to_delivery ON public.tp_items;
CREATE TRIGGER trg_tp_item_to_delivery
AFTER INSERT ON public.tp_items
FOR EACH ROW EXECUTE FUNCTION public.tg_tp_item_to_delivery();

-- Keep status timestamps reliable without mutating NEW in an AFTER trigger
CREATE OR REPLACE FUNCTION public.tg_delivery_status_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status='dispatched' AND NEW.dispatched_at IS NULL THEN NEW.dispatched_at := now(); END IF;
  IF NEW.status='delivered' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_status_timestamps ON public.deliveries;
CREATE TRIGGER trg_delivery_status_timestamps
BEFORE INSERT OR UPDATE OF status ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_status_timestamps();

-- User-scoped cleanup helpers for settings clear data actions
CREATE OR REPLACE FUNCTION public.clear_my_notifications()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.notifications WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.clear_my_deliveries()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.delivery_items
   WHERE delivery_id IN (SELECT id FROM public.deliveries WHERE user_id = auth.uid());
  DELETE FROM public.deliveries WHERE user_id = auth.uid();
$$;

-- Backfill TP deliveries and their items
INSERT INTO public.deliveries(user_id, tp_id, invoice_no, delivery_no, date, buyer_id, buyer_name, ship_address, status, notes)
SELECT t.user_id, t.id, t.tp_no,
       public.next_doc_no(t.user_id, 'DN', 'deliveries', 'delivery_no'),
       t.date, t.buyer_id, t.buyer_name, c.address, 'pending', 'Third-party delivery'
  FROM public.third_party t
  LEFT JOIN public.contacts c ON c.id = t.buyer_id
 WHERE NOT EXISTS (SELECT 1 FROM public.deliveries d WHERE d.tp_id = t.id);

INSERT INTO public.delivery_items(delivery_id, product_id, product_name, unit, qty_ordered, qty_delivered, position)
SELECT d.id, ti.product_id, ti.product_name, ti.unit, ti.qty, 0, COALESCE(ti.position,0)
  FROM public.tp_items ti
  JOIN public.deliveries d ON d.tp_id = ti.tp_id
 WHERE NOT EXISTS (
   SELECT 1 FROM public.delivery_items di
    WHERE di.delivery_id = d.id
      AND di.position = COALESCE(ti.position,0)
      AND di.product_name IS NOT DISTINCT FROM ti.product_name
 );

-- Repost existing payment journals with clearer narration
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.payments LOOP
    PERFORM public.post_journal_payment(r.id);
  END LOOP;
END $$;