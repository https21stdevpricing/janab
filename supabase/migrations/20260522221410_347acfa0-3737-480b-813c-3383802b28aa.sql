CREATE INDEX IF NOT EXISTS idx_journal_lines_user_date_id
ON public.journal_lines (user_id, date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_journal_lines_user_account_date
ON public.journal_lines (user_id, account, date DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_at_id
ON public.audit_log (user_id, at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_user_payment_id
ON public.payment_allocations (user_id, payment_id);

CREATE INDEX IF NOT EXISTS idx_payments_user_created_at
ON public.payments (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_user_name
ON public.products (user_id, name);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_user_purchase_date
ON public.fixed_assets (user_id, purchase_date DESC);