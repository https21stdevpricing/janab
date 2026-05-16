
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public'
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig||' TO authenticated, anon';
  END LOOP;
END$$;

CREATE OR REPLACE VIEW public.gst_summary_view
WITH (security_invoker=on) AS
SELECT
  user_id,
  date_trunc('month', date)::date AS month,
  SUM(CASE WHEN account='GST Output CGST' THEN credit-debit ELSE 0 END) AS output_cgst,
  SUM(CASE WHEN account='GST Output SGST' THEN credit-debit ELSE 0 END) AS output_sgst,
  SUM(CASE WHEN account='GST Output IGST' THEN credit-debit ELSE 0 END) AS output_igst,
  SUM(CASE WHEN account='GST Output'      THEN credit-debit ELSE 0 END) AS output_total_legacy,
  SUM(CASE WHEN account='GST Input CGST'  THEN debit-credit ELSE 0 END) AS input_cgst,
  SUM(CASE WHEN account='GST Input SGST'  THEN debit-credit ELSE 0 END) AS input_sgst,
  SUM(CASE WHEN account='GST Input IGST'  THEN debit-credit ELSE 0 END) AS input_igst,
  SUM(CASE WHEN account='GST Input'       THEN debit-credit ELSE 0 END) AS input_total_legacy
FROM public.journal_lines
WHERE account LIKE 'GST %'
GROUP BY user_id, date_trunc('month', date);

GRANT SELECT ON public.gst_summary_view TO authenticated;
