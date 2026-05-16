
-- =========================================================
-- AUDIT LOG
-- =========================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,           -- insert | update | delete
  entity text NOT NULL,           -- table name
  entity_id uuid,
  ref_no text,                    -- doc no when available
  summary text,                   -- human label
  diff jsonb                      -- changed columns
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own audit read" ON public.audit_log;
CREATE POLICY "own audit read" ON public.audit_log FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own audit insert" ON public.audit_log;
CREATE POLICY "own audit insert" ON public.audit_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_at ON public.audit_log(user_id, at DESC);

CREATE OR REPLACE FUNCTION public.tg_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid; v_ref text; v_sum text; v_id uuid; v_diff jsonb;
BEGIN
  IF TG_OP='DELETE' THEN
    v_user := OLD.user_id; v_id := OLD.id;
  ELSE
    v_user := NEW.user_id; v_id := NEW.id;
  END IF;
  v_ref := COALESCE(
    (CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'invoice_no',
    (CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'po_no',
    (CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'tp_no',
    (CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'quote_no',
    (CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'payment_no',
    (CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'code',
    (CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'delivery_no'
  );
  v_sum := TG_TABLE_NAME || ' ' || lower(TG_OP) || COALESCE(' '||v_ref,'');
  IF TG_OP='UPDATE' THEN
    SELECT jsonb_object_agg(k, jsonb_build_object('old', to_jsonb(OLD)->k, 'new', to_jsonb(NEW)->k))
    INTO v_diff FROM jsonb_object_keys(to_jsonb(NEW)) k
    WHERE to_jsonb(OLD)->k IS DISTINCT FROM to_jsonb(NEW)->k AND k NOT IN ('updated_at','created_at');
  END IF;
  INSERT INTO public.audit_log(user_id, action, entity, entity_id, ref_no, summary, diff)
    VALUES (v_user, lower(TG_OP), TG_TABLE_NAME, v_id, v_ref, v_sum, v_diff);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['products','contacts','sales','purchases','third_party','quotations','payments','expenses']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER tg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_audit()', t, t);
  END LOOP;
END $$;

-- =========================================================
-- NOTIFICATIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,                 -- payment_in | payment_out | sale | purchase | tp | overdue | low_stock | info
  severity text NOT NULL DEFAULT 'info', -- info | success | warning | error
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own notif all" ON public.notifications;
CREATE POLICY "own notif all" ON public.notifications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_at ON public.notifications(user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON public.notifications(user_id, read) WHERE read=false;

CREATE OR REPLACE FUNCTION public.notify(_user uuid, _kind text, _severity text, _title text, _body text, _link text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO public.notifications(user_id,kind,severity,title,body,link) VALUES (_user,_kind,_severity,_title,_body,_link);
$$;

-- Sale insert notif
CREATE OR REPLACE FUNCTION public.tg_notify_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.notify(NEW.user_id,'sale','success','New sale '||NEW.invoice_no, COALESCE(NEW.buyer_name,''), '/app/lookup?q='||NEW.invoice_no); RETURN NEW; END;$$;
DROP TRIGGER IF EXISTS tg_notify_sale ON public.sales;
CREATE TRIGGER tg_notify_sale AFTER INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.tg_notify_sale();

CREATE OR REPLACE FUNCTION public.tg_notify_purchase() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.notify(NEW.user_id,'purchase','info','New purchase '||NEW.po_no, COALESCE(NEW.supplier_name,''), '/app/lookup?q='||NEW.po_no); RETURN NEW; END;$$;
DROP TRIGGER IF EXISTS tg_notify_purchase ON public.purchases;
CREATE TRIGGER tg_notify_purchase AFTER INSERT ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.tg_notify_purchase();

CREATE OR REPLACE FUNCTION public.tg_notify_tp() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.notify(NEW.user_id,'tp','info','New third-party '||NEW.tp_no, COALESCE(NEW.supplier_name,'')||' → '||COALESCE(NEW.buyer_name,''), '/app/lookup?q='||NEW.tp_no); RETURN NEW; END;$$;
DROP TRIGGER IF EXISTS tg_notify_tp ON public.third_party;
CREATE TRIGGER tg_notify_tp AFTER INSERT ON public.third_party FOR EACH ROW EXECUTE FUNCTION public.tg_notify_tp();

CREATE OR REPLACE FUNCTION public.tg_notify_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.notify(
    NEW.user_id,
    CASE NEW.direction WHEN 'in' THEN 'payment_in' ELSE 'payment_out' END,
    'success',
    CASE NEW.direction WHEN 'in' THEN 'Receipt ' ELSE 'Payment ' END || NEW.payment_no || ' · ₹' || to_char(NEW.amount,'FM99,99,99,990.00'),
    COALESCE(NEW.contact_name,'') || COALESCE(' · '||NEW.ref_doc,''),
    '/app/payments'
  ); RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS tg_notify_payment ON public.payments;
CREATE TRIGGER tg_notify_payment AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_notify_payment();

-- =========================================================
-- DELIVERIES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delivery_no text NOT NULL,
  sale_id uuid,
  invoice_no text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  buyer_id uuid,
  buyer_name text,
  ship_address text,
  vehicle_no text,
  driver_name text,
  driver_phone text,
  transporter text,
  lr_no text,
  status text NOT NULL DEFAULT 'pending',  -- pending | packed | dispatched | delivered | cancelled
  dispatched_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own deliveries all" ON public.deliveries;
CREATE POLICY "own deliveries all" ON public.deliveries FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_user_date ON public.deliveries(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_sale ON public.deliveries(sale_id);

CREATE TABLE IF NOT EXISTS public.delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text,
  unit text,
  qty_ordered numeric NOT NULL DEFAULT 0,
  qty_delivered numeric NOT NULL DEFAULT 0,
  position int DEFAULT 0
);
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own di all" ON public.delivery_items;
CREATE POLICY "own di all" ON public.delivery_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_items.delivery_id AND d.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_items.delivery_id AND d.user_id=auth.uid()));

-- Auto-number deliveries (DN-)
CREATE OR REPLACE FUNCTION public.tg_deliveries_autonum() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.delivery_no IS NULL OR NEW.delivery_no='' THEN NEW.delivery_no := public.next_doc_no(NEW.user_id,'DN','deliveries','delivery_no'); END IF; RETURN NEW; END;$$;
DROP TRIGGER IF EXISTS tg_deliveries_autonum ON public.deliveries;
CREATE TRIGGER tg_deliveries_autonum BEFORE INSERT ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.tg_deliveries_autonum();

-- Auto-create a delivery whenever a sale is inserted (with items copied after sale_items exist).
-- Two-step: header on sales insert, items on sale_items insert if missing.
CREATE OR REPLACE FUNCTION public.tg_sale_make_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _addr text;
BEGIN
  SELECT address INTO _addr FROM public.contacts WHERE id=NEW.buyer_id;
  INSERT INTO public.deliveries(user_id, sale_id, invoice_no, date, buyer_id, buyer_name, ship_address, status)
  VALUES (NEW.user_id, NEW.id, NEW.invoice_no, NEW.date, NEW.buyer_id, NEW.buyer_name, _addr, 'pending')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS tg_sale_make_delivery ON public.sales;
CREATE TRIGGER tg_sale_make_delivery AFTER INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.tg_sale_make_delivery();

-- After each sale_item insert, mirror into delivery_items
CREATE OR REPLACE FUNCTION public.tg_sale_item_to_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _did uuid;
BEGIN
  SELECT id INTO _did FROM public.deliveries WHERE sale_id = NEW.sale_id LIMIT 1;
  IF _did IS NULL THEN RETURN NEW; END IF;
  -- avoid duplicates by checking position
  IF NOT EXISTS (SELECT 1 FROM public.delivery_items WHERE delivery_id=_did AND position=NEW.position AND product_name IS NOT DISTINCT FROM NEW.product_name) THEN
    INSERT INTO public.delivery_items(delivery_id, product_id, product_name, unit, qty_ordered, qty_delivered, position)
    VALUES (_did, NEW.product_id, NEW.product_name, NEW.unit, NEW.qty, 0, COALESCE(NEW.position,0));
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS tg_sale_item_to_delivery ON public.sale_items;
CREATE TRIGGER tg_sale_item_to_delivery AFTER INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.tg_sale_item_to_delivery();

-- Notify on delivery status change
CREATE OR REPLACE FUNCTION public.tg_notify_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.notify(NEW.user_id,'info','info','Delivery '||NEW.delivery_no||' created', COALESCE(NEW.buyer_name,''), '/app/deliveries');
  ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify(NEW.user_id,'info','success','Delivery '||NEW.delivery_no||' → '||NEW.status, COALESCE(NEW.buyer_name,''), '/app/deliveries');
    IF NEW.status='dispatched' AND NEW.dispatched_at IS NULL THEN NEW.dispatched_at := now(); END IF;
    IF NEW.status='delivered' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS tg_notify_delivery_ins ON public.deliveries;
CREATE TRIGGER tg_notify_delivery_ins AFTER INSERT ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.tg_notify_delivery();
DROP TRIGGER IF EXISTS tg_notify_delivery_upd ON public.deliveries;
CREATE TRIGGER tg_notify_delivery_upd BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.tg_notify_delivery();

-- Audit on deliveries
DROP TRIGGER IF EXISTS tg_audit_deliveries ON public.deliveries;
CREATE TRIGGER tg_audit_deliveries AFTER INSERT OR UPDATE OR DELETE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

-- =========================================================
-- Grants & Realtime
-- =========================================================
GRANT EXECUTE ON FUNCTION public.notify(uuid,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_audit() TO authenticated;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;
ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_items REPLICA IDENTITY FULL;
ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.purchases REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;

DO $$ BEGIN
  PERFORM 1; ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_items; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sales; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.purchases; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payments; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
