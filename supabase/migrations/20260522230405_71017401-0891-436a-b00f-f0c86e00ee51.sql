CREATE OR REPLACE FUNCTION public.post_journal_payment(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p record;
  cash_acct text;
  party_acct text;
  je_id uuid;
  _docs text;
  _narr text;
  post_date date;
  alloc_count int := 0;
  effective_kind text;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _id;

  IF NOT FOUND THEN
    DELETE FROM public.journal_entries WHERE source_kind = 'payment' AND source_id = _id;
    RETURN;
  END IF;

  DELETE FROM public.journal_entries WHERE source_kind = 'payment' AND source_id = _id;

  IF COALESCE(p.amount, 0) = 0 THEN RETURN; END IF;
  IF COALESCE(p.cleared, true) = false THEN RETURN; END IF;

  post_date := COALESCE(p.cleared_at, p.date);
  cash_acct := CASE upper(coalesce(p.mode, 'Bank')) WHEN 'CASH' THEN 'Cash' ELSE 'Bank' END;

  SELECT COUNT(*), string_agg(doc_no, ', ' ORDER BY doc_no)
    INTO alloc_count, _docs
  FROM public.payment_allocations
  WHERE payment_id = _id
    AND doc_no IS NOT NULL
    AND doc_no <> '';

  effective_kind := COALESCE(p.kind, 'against_invoice');
  IF effective_kind = 'advance' AND alloc_count > 0 THEN
    effective_kind := 'against_invoice';
  END IF;

  _narr := (CASE WHEN p.direction = 'in' THEN 'Receipt ' ELSE 'Payment ' END) || COALESCE(p.payment_no, '')
         || COALESCE(' · ' || NULLIF(p.contact_name, ''), '')
         || CASE effective_kind
              WHEN 'advance' THEN ' · advance'
              WHEN 'on_account' THEN ' · on account'
              ELSE ''
            END
         || CASE WHEN _docs IS NOT NULL THEN ' · settled against ' || _docs ELSE '' END;

  INSERT INTO public.journal_entries(user_id, date, source_kind, source_id, source_no, narration)
    VALUES (p.user_id, post_date, 'payment', p.id, p.payment_no, _narr)
    RETURNING id INTO je_id;

  IF p.direction = 'in' THEN
    party_acct := CASE effective_kind WHEN 'advance' THEN 'Advance from Customers' ELSE 'Accounts Receivable' END;
    INSERT INTO public.journal_lines(entry_id, user_id, date, account, party, debit, credit, ref_no, narration) VALUES
      (je_id, p.user_id, post_date, cash_acct, p.contact_name, p.amount, 0, p.payment_no, _narr),
      (je_id, p.user_id, post_date, party_acct, p.contact_name, 0, p.amount, p.payment_no, _narr);
  ELSE
    party_acct := CASE effective_kind WHEN 'advance' THEN 'Advances to Suppliers' ELSE 'Accounts Payable' END;
    INSERT INTO public.journal_lines(entry_id, user_id, date, account, party, debit, credit, ref_no, narration) VALUES
      (je_id, p.user_id, post_date, party_acct, p.contact_name, p.amount, 0, p.payment_no, _narr),
      (je_id, p.user_id, post_date, cash_acct, p.contact_name, 0, p.amount, p.payment_no, _narr);
  END IF;
END;
$$;