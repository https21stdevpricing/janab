CREATE OR REPLACE FUNCTION public._refresh_payment_narration(_pid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  _docs text;
  _label text;
  _narr text;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _pid;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT string_agg(doc_no, ', ' ORDER BY doc_no)
    INTO _docs
    FROM public.payment_allocations
    WHERE payment_id = _pid AND doc_no IS NOT NULL AND doc_no <> '';

  _label := CASE WHEN p.direction = 'in' THEN 'Receipt ' ELSE 'Payment ' END || p.payment_no;
  _narr  := _label
         || COALESCE(' · ' || p.contact_name, '')
         || CASE WHEN _docs IS NOT NULL THEN ' · against ' || _docs ELSE '' END;

  UPDATE public.journal_lines jl
     SET narration = _narr
   WHERE jl.entry_id IN (
     SELECT id FROM public.journal_entries
      WHERE source_kind = 'payment' AND source_id = _pid
   );
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_alloc_refresh_narr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public._refresh_payment_narration(OLD.payment_id);
    RETURN OLD;
  END IF;
  PERFORM public._refresh_payment_narration(NEW.payment_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alloc_refresh_narr ON public.payment_allocations;
CREATE TRIGGER alloc_refresh_narr
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.tg_alloc_refresh_narr();

-- Also refresh narration on the payment itself when the payment row is reposted
CREATE OR REPLACE FUNCTION public.post_journal_payment(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p record; cash_acct text; party_acct text; je_id uuid; _docs text; _narr text;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id=_id;
  IF NOT FOUND THEN DELETE FROM public.journal_entries WHERE source_kind='payment' AND source_id=_id; RETURN; END IF;
  cash_acct := CASE upper(coalesce(p.mode,'Bank')) WHEN 'CASH' THEN 'Cash' ELSE 'Bank' END;
  DELETE FROM public.journal_entries WHERE source_kind='payment' AND source_id=_id;
  IF p.amount=0 THEN RETURN; END IF;

  SELECT string_agg(doc_no, ', ' ORDER BY doc_no)
    INTO _docs FROM public.payment_allocations
    WHERE payment_id = _id AND doc_no IS NOT NULL AND doc_no <> '';
  _narr := (CASE WHEN p.direction='in' THEN 'Receipt ' ELSE 'Payment ' END) || p.payment_no
         || COALESCE(' · '||p.contact_name,'')
         || CASE WHEN _docs IS NOT NULL THEN ' · against '||_docs ELSE '' END;

  INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
    VALUES (p.user_id,p.date,'payment',p.id,p.payment_no, _narr)
    RETURNING id INTO je_id;
  IF p.direction='in' THEN
    party_acct := 'Accounts Receivable';
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no,narration) VALUES
      (je_id,p.user_id,p.date,cash_acct,p.contact_name,p.amount,0,p.payment_no,_narr),
      (je_id,p.user_id,p.date,party_acct,p.contact_name,0,p.amount,p.payment_no,_narr);
  ELSE
    party_acct := 'Accounts Payable';
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no,narration) VALUES
      (je_id,p.user_id,p.date,party_acct,p.contact_name,p.amount,0,p.payment_no,_narr),
      (je_id,p.user_id,p.date,cash_acct,p.contact_name,0,p.amount,p.payment_no,_narr);
  END IF;
END;$function$;

-- Backfill existing payments narration
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.payments LOOP
    PERFORM public._refresh_payment_narration(r.id);
  END LOOP;
END $$;