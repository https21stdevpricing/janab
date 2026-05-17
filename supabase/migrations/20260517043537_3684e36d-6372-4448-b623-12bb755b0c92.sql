
-- FIFO auto-allocator for a payment
CREATE OR REPLACE FUNCTION public.auto_allocate_payment(_pid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  SELECT COALESCE(SUM(amount),0) INTO already FROM public.payment_allocations WHERE payment_id = _pid;
  remaining := p.amount - already;
  IF remaining <= 0.005 THEN RETURN; END IF;

  IF p.direction = 'in' THEN kinds := ARRAY['sale','tp']; ELSE kinds := ARRAY['purchase']; END IF;

  FOR d IN
    SELECT doc_kind, doc_id, doc_no, balance, date
    FROM public.outstanding_view
    WHERE party_id = p.contact_id
      AND user_id = p.user_id
      AND doc_kind = ANY(kinds)
      AND balance > 0
    ORDER BY date ASC
  LOOP
    EXIT WHEN remaining <= 0.005;
    take := LEAST(d.balance, remaining);
    INSERT INTO public.payment_allocations(user_id, payment_id, doc_kind, doc_id, doc_no, amount)
    VALUES (p.user_id, _pid, d.doc_kind, d.doc_id, d.doc_no, round(take::numeric, 2));
    remaining := remaining - take;
  END LOOP;
END;
$$;

-- Trigger: defer-fire after the form's allocation inserts settle.
-- We use a statement-level AFTER trigger with a short pg_sleep wait? No — instead just run immediately;
-- the client inserts the payment first, then allocations. So we run on a slight pattern: only auto-allocate
-- if AFTER 1s nothing was inserted. Simpler: run from client. We still keep the function for retro fixes
-- and expose it for ad-hoc calls. (Trigger omitted to avoid racing with manual allocations.)
