ALTER TABLE public.payment_allocations
  DROP CONSTRAINT IF EXISTS payment_allocations_doc_kind_check;

ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_doc_kind_check
  CHECK (doc_kind = ANY (ARRAY['sale'::text, 'purchase'::text, 'tp'::text, 'tp_purchase'::text]));