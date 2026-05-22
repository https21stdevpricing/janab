-- Prevent duplicate cheque payment entries for the same party and cheque number.
CREATE UNIQUE INDEX IF NOT EXISTS payments_unique_cheque_entry_idx
ON public.payments (
  user_id,
  direction,
  contact_id,
  lower(coalesce(bank_name, '')),
  lower(coalesce(cheque_no, ''))
)
WHERE lower(coalesce(mode, '')) = 'cheque' AND cheque_no IS NOT NULL AND btrim(cheque_no) <> '';

-- One bill cannot receive another payment allocation while an uncleared cheque is already pending for it.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_pending_cheque_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing record;
BEGIN
  SELECT pm.payment_no, pm.cheque_no
    INTO existing
  FROM public.payment_allocations pa
  JOIN public.payments pm ON pm.id = pa.payment_id
  WHERE pa.user_id = NEW.user_id
    AND pa.doc_kind = NEW.doc_kind
    AND pa.doc_id = NEW.doc_id
    AND pa.id IS DISTINCT FROM NEW.id
    AND lower(coalesce(pm.mode, '')) = 'cheque'
    AND coalesce(pm.cleared, true) = false
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'This bill already has pending cheque % (%). Open that cheque and mark it cleared or bounced instead of creating another entry.', existing.payment_no, coalesce(existing.cheque_no, 'no cheque number')
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_pending_cheque_allocation_tr ON public.payment_allocations;
CREATE TRIGGER prevent_duplicate_pending_cheque_allocation_tr
BEFORE INSERT OR UPDATE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_pending_cheque_allocation();

-- App-facing pending cheque locks for outstanding bills.
CREATE OR REPLACE VIEW public.pending_cheque_allocations_view
WITH (security_invoker=on) AS
SELECT
  pa.user_id,
  pa.doc_kind,
  pa.doc_id,
  pa.doc_no,
  pa.amount,
  pm.id AS payment_id,
  pm.payment_no,
  pm.date,
  pm.contact_id,
  pm.contact_name,
  pm.cheque_no,
  pm.cheque_date,
  pm.bank_name,
  pm.cleared,
  pm.cleared_at
FROM public.payment_allocations pa
JOIN public.payments pm ON pm.id = pa.payment_id
WHERE lower(coalesce(pm.mode, '')) = 'cheque'
  AND coalesce(pm.cleared, true) = false;