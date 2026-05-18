-- 1. TP delivery linkage
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS tp_id uuid;
CREATE INDEX IF NOT EXISTS idx_deliveries_tp ON public.deliveries(tp_id);

-- 2. Cascade cleanup: when a doc is deleted, drop matching allocations and refresh payment narrations
CREATE OR REPLACE FUNCTION public.tg_cleanup_doc_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kinds text[];
  _pids uuid[];
  _pid uuid;
BEGIN
  -- determine which doc_kinds in payment_allocations refer to this table row
  IF TG_TABLE_NAME = 'sales' THEN _kinds := ARRAY['sale'];
  ELSIF TG_TABLE_NAME = 'purchases' THEN _kinds := ARRAY['purchase'];
  ELSIF TG_TABLE_NAME = 'third_party' THEN _kinds := ARRAY['tp','tp_purchase'];
  ELSE RETURN OLD;
  END IF;

  -- collect affected payments before delete
  SELECT array_agg(DISTINCT payment_id) INTO _pids
    FROM public.payment_allocations
   WHERE doc_id = OLD.id AND doc_kind = ANY(_kinds);

  DELETE FROM public.payment_allocations
   WHERE doc_id = OLD.id AND doc_kind = ANY(_kinds);

  -- refresh narrations for any payments that lost an allocation
  IF _pids IS NOT NULL THEN
    FOREACH _pid IN ARRAY _pids LOOP
      PERFORM public._refresh_payment_narration(_pid);
    END LOOP;
  END IF;

  -- also delete the auto-created delivery for sales / tp
  IF TG_TABLE_NAME = 'sales' THEN
    DELETE FROM public.delivery_items
     WHERE delivery_id IN (SELECT id FROM public.deliveries WHERE sale_id = OLD.id);
    DELETE FROM public.deliveries WHERE sale_id = OLD.id;
  ELSIF TG_TABLE_NAME = 'third_party' THEN
    DELETE FROM public.delivery_items
     WHERE delivery_id IN (SELECT id FROM public.deliveries WHERE tp_id = OLD.id);
    DELETE FROM public.deliveries WHERE tp_id = OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_sales_cleanup ON public.sales;
CREATE TRIGGER tg_sales_cleanup BEFORE DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_cleanup_doc_cascade();

DROP TRIGGER IF EXISTS tg_purchases_cleanup ON public.purchases;
CREATE TRIGGER tg_purchases_cleanup BEFORE DELETE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.tg_cleanup_doc_cascade();

DROP TRIGGER IF EXISTS tg_tp_cleanup ON public.third_party;
CREATE TRIGGER tg_tp_cleanup BEFORE DELETE ON public.third_party
  FOR EACH ROW EXECUTE FUNCTION public.tg_cleanup_doc_cascade();

-- 3. Auto-create delivery for TP (sale side)
CREATE OR REPLACE FUNCTION public.tg_tp_make_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _addr text; _no text;
BEGIN
  SELECT address INTO _addr FROM public.contacts WHERE id = NEW.buyer_id;
  _no := public.next_doc_no(NEW.user_id, 'DN', 'deliveries', 'delivery_no');
  INSERT INTO public.deliveries(user_id, tp_id, invoice_no, delivery_no, date, buyer_id, buyer_name, ship_address, status, notes)
  VALUES (NEW.user_id, NEW.id, NEW.tp_no, _no, NEW.date, NEW.buyer_id, NEW.buyer_name, _addr, 'pending', 'Third-party sale')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_tp_create_delivery ON public.third_party;
CREATE TRIGGER tg_tp_create_delivery AFTER INSERT ON public.third_party
  FOR EACH ROW EXECUTE FUNCTION public.tg_tp_make_delivery();

-- 4. Copy tp_items into the matching delivery
CREATE OR REPLACE FUNCTION public.tg_tp_item_to_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _did uuid;
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

DROP TRIGGER IF EXISTS tg_tp_items_to_delivery ON public.tp_items;
CREATE TRIGGER tg_tp_items_to_delivery AFTER INSERT ON public.tp_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_tp_item_to_delivery();

-- 5. Backfill: create deliveries for existing TP rows that don't have one
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.* FROM public.third_party t
    WHERE NOT EXISTS (SELECT 1 FROM public.deliveries d WHERE d.tp_id = t.id)
  LOOP
    INSERT INTO public.deliveries(user_id, tp_id, invoice_no, delivery_no, date, buyer_id, buyer_name, ship_address, status, notes)
    VALUES (
      r.user_id, r.id, r.tp_no,
      public.next_doc_no(r.user_id, 'DN', 'deliveries', 'delivery_no'),
      r.date, r.buyer_id, r.buyer_name,
      (SELECT address FROM public.contacts WHERE id = r.buyer_id),
      'pending', 'Third-party sale'
    );
  END LOOP;

  -- backfill delivery items for those deliveries
  INSERT INTO public.delivery_items(delivery_id, product_id, product_name, unit, qty_ordered, qty_delivered, position)
  SELECT d.id, ti.product_id, ti.product_name, ti.unit, ti.qty, 0, COALESCE(ti.position, 0)
    FROM public.deliveries d
    JOIN public.tp_items ti ON ti.tp_id = d.tp_id
   WHERE d.tp_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.delivery_items di
        WHERE di.delivery_id = d.id
          AND di.position = COALESCE(ti.position, 0)
          AND di.product_name IS NOT DISTINCT FROM ti.product_name
     );
END$$;