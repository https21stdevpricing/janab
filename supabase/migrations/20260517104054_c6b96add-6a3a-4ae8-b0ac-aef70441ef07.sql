
CREATE OR REPLACE FUNCTION public.tg_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid; v_ref text; v_sum text; v_id uuid; v_diff jsonb;
  v_row jsonb; v_amount numeric; v_party text; v_date text; v_extra text;
  v_keys text[] := ARRAY[
    'amount','total','qty','rate','sale_rate','purchase_rate','gst_pct','opening_stock','reorder_level',
    'category','mode','direction','status','kind','type','unit','hsn',
    'name','supplier_name','buyer_name','contact_name','party','party_name','product_name',
    'date','due_date','dispatched_at','delivered_at','ref_doc','notes','narration',
    'invoice_no','po_no','tp_no','quote_no','payment_no','delivery_no','code',
    'state','gstin','phone','email','address','opening_balance','credit_limit'
  ];
  k text;
BEGIN
  IF TG_OP='DELETE' THEN
    v_user := OLD.user_id; v_id := OLD.id; v_row := to_jsonb(OLD);
  ELSE
    v_user := NEW.user_id; v_id := NEW.id; v_row := to_jsonb(NEW);
  END IF;

  v_ref := COALESCE(
    v_row->>'invoice_no', v_row->>'po_no', v_row->>'tp_no', v_row->>'quote_no',
    v_row->>'payment_no', v_row->>'code', v_row->>'delivery_no'
  );

  -- Pull common descriptors for the summary line
  v_amount := NULLIF(v_row->>'amount','')::numeric;
  IF v_amount IS NULL THEN v_amount := NULLIF(v_row->>'total','')::numeric; END IF;
  v_party  := COALESCE(v_row->>'contact_name', v_row->>'buyer_name', v_row->>'supplier_name', v_row->>'party_name', v_row->>'name');
  v_date   := v_row->>'date';

  v_extra := '';
  IF TG_TABLE_NAME = 'expenses' THEN
    v_extra := COALESCE(v_row->>'category','Expense')
            || COALESCE(' · ₹'||to_char(v_amount,'FM99,99,99,990.00'),'')
            || COALESCE(' · '||(v_row->>'mode'),'');
  ELSIF TG_TABLE_NAME = 'payments' THEN
    v_extra := CASE WHEN v_row->>'direction'='in' THEN 'Receipt' ELSE 'Payment' END
            || COALESCE(' · '||v_party,'')
            || COALESCE(' · ₹'||to_char(v_amount,'FM99,99,99,990.00'),'')
            || COALESCE(' · '||(v_row->>'mode'),'');
  ELSIF TG_TABLE_NAME IN ('sales','purchases','third_party','quotations') THEN
    v_extra := COALESCE(v_party,'') || COALESCE(' · '||v_date,'');
  ELSIF TG_TABLE_NAME = 'deliveries' THEN
    v_extra := COALESCE(v_party,'') || COALESCE(' · '||(v_row->>'status'),'');
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_extra := COALESCE(v_row->>'name','') || COALESCE(' · '||(v_row->>'unit'),'');
  ELSIF TG_TABLE_NAME = 'contacts' THEN
    v_extra := COALESCE(v_row->>'name','') || COALESCE(' · '||(v_row->>'type'),'');
  ELSIF TG_TABLE_NAME IN ('sale_items','purchase_items','tp_items','quotation_items','delivery_items') THEN
    v_extra := COALESCE(v_row->>'product_name','')
            || COALESCE(' · qty '||(v_row->>'qty'),'')
            || COALESCE(' @ ₹'||(v_row->>'rate'),'');
  ELSIF TG_TABLE_NAME = 'payment_allocations' THEN
    v_extra := COALESCE(v_row->>'doc_no','')
            || COALESCE(' · ₹'||to_char(v_amount,'FM99,99,99,990.00'),'');
  END IF;

  v_sum := TG_TABLE_NAME
        || ' ' || lower(TG_OP)
        || COALESCE(' '||v_ref,'')
        || COALESCE(' — '||NULLIF(v_extra,''),'');

  IF TG_OP='UPDATE' THEN
    SELECT jsonb_object_agg(k, jsonb_build_object('old', to_jsonb(OLD)->k, 'new', to_jsonb(NEW)->k))
    INTO v_diff FROM jsonb_object_keys(to_jsonb(NEW)) k
    WHERE to_jsonb(OLD)->k IS DISTINCT FROM to_jsonb(NEW)->k AND k NOT IN ('updated_at','created_at');
  ELSE
    -- INSERT / DELETE: snapshot the meaningful fields so the audit log shows actual values
    v_diff := '{}'::jsonb;
    FOREACH k IN ARRAY v_keys LOOP
      IF v_row ? k AND v_row->k IS NOT NULL AND v_row->>k <> '' THEN
        IF TG_OP='INSERT' THEN
          v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('old', null, 'new', v_row->k));
        ELSE
          v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('old', v_row->k, 'new', null));
        END IF;
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN v_diff := NULL; END IF;
  END IF;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, ref_no, summary, diff)
    VALUES (v_user, lower(TG_OP), TG_TABLE_NAME, v_id, v_ref, v_sum, v_diff);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;$function$;
