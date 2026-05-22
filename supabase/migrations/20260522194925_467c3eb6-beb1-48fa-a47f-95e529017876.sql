DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['sale_items','purchase_items','tp_items','expenses','products','third_party','contacts','settings','fixed_assets'] LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;