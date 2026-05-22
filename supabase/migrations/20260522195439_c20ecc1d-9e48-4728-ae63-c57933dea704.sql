DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.sales LOOP
    PERFORM public.post_journal_sale(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.purchases LOOP
    PERFORM public.post_journal_purchase(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.third_party LOOP
    PERFORM public.post_journal_tp(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.expenses LOOP
    PERFORM public.post_journal_expense(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.payments LOOP
    PERFORM public.post_journal_payment(r.id);
  END LOOP;
  IF to_regclass('public.bank_transfers') IS NOT NULL THEN
    FOR r IN SELECT id FROM public.bank_transfers LOOP
      PERFORM public.post_journal_bank_transfer(r.id);
    END LOOP;
  END IF;
  IF to_regclass('public.fixed_assets') IS NOT NULL THEN
    FOR r IN SELECT id FROM public.fixed_assets LOOP
      PERFORM public.post_journal_fixed_asset(r.id);
    END LOOP;
  END IF;
END $$;