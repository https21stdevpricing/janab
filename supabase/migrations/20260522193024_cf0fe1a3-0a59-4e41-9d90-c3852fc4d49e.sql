CREATE OR REPLACE FUNCTION public.sync_payment_clearance_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NULL THEN
    NEW.status := CASE WHEN COALESCE(NEW.cleared, true) THEN 'cleared' ELSE 'pending' END;
  END IF;

  IF lower(coalesce(NEW.mode, '')) = 'cheque'
     AND NEW.status = 'cleared'
     AND COALESCE(NEW.cleared, true) = false THEN
    NEW.status := 'pending';
  END IF;

  IF NEW.status = 'cleared' THEN
    NEW.cleared := true;
    NEW.cleared_at := COALESCE(NEW.cleared_at, NEW.date);
  ELSE
    NEW.cleared := false;
    NEW.cleared_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;