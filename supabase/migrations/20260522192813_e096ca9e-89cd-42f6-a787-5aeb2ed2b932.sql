ALTER TABLE public.payment_allocations REPLICA IDENTITY FULL;
ALTER TABLE public.bank_transfers REPLICA IDENTITY FULL;
ALTER TABLE public.journal_entries REPLICA IDENTITY FULL;
ALTER TABLE public.journal_lines REPLICA IDENTITY FULL;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_allocations; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_transfers; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_lines; EXCEPTION WHEN duplicate_object THEN NULL; END $$;