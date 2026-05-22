CREATE OR REPLACE FUNCTION public.tg_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_ref text;
  v_sum text;
  v_id uuid;
  v_diff jsonb;
  v_row jsonb;
  v_amount numeric;
  v_party text;
  v_date text;
  v_extra text;
  v_field text;
  v_parent_id uuid;
  v_keys text[] := ARRAY[
    'amount','total','qty','qty_ordered','qty_delivered','rate','sale_rate','purchase_rate','gst_pct','opening_stock','reorder_level','unit_cost',
    'category','mode','direction','status','kind','type','unit','hsn','reason','cleared','cleared_at','cogs_method','business_type',
    'name','supplier_name','buyer_name','contact_name','party','party_name','product_name','company_name','owner_name',
    'date','due_date','effective_from','valid_until','cheque_date','dispatched_at','delivered_at','ref_doc','notes','narration','terms',
    'invoice_no','po_no','tp_no','quote_no','payment_no','delivery_no','transfer_no','source_no','code','cheque_no','txn_id','doc_no',
    'state','gstin','pan','phone','email','address','bank_name','bank_ifsc','bank_account_no','opening_balance','credit_limit'
  ];
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_id := NULLIF(v_row->>'id','')::uuid;

  IF v_row ? 'user_id' THEN
    v_user := NULLIF(v_row->>'user_id','')::uuid;
  ELSIF TG_TABLE_NAME = 'sale_items' THEN
    v_parent_id := NULLIF(v_row->>'sale_id','')::uuid;
    SELECT user_id, invoice_no, buyer_name, date INTO v_user, v_ref, v_party, v_date FROM public.sales WHERE id = v_parent_id;
  ELSIF TG_TABLE_NAME = 'purchase_items' THEN
    v_parent_id := NULLIF(v_row->>'purchase_id','')::uuid;
    SELECT user_id, po_no, supplier_name, date INTO v_user, v_ref, v_party, v_date FROM public.purchases WHERE id = v_parent_id;
  ELSIF TG_TABLE_NAME = 'tp_items' THEN
    v_parent_id := NULLIF(v_row->>'tp_id','')::uuid;
    SELECT user_id, tp_no, buyer_name, date INTO v_user, v_ref, v_party, v_date FROM public.third_party WHERE id = v_parent_id;
  ELSIF TG_TABLE_NAME = 'quotation_items' THEN
    v_parent_id := NULLIF(v_row->>'quotation_id','')::uuid;
    SELECT user_id, quote_no, buyer_name, date INTO v_user, v_ref, v_party, v_date FROM public.quotations WHERE id = v_parent_id;
  ELSIF TG_TABLE_NAME = 'delivery_items' THEN
    v_parent_id := NULLIF(v_row->>'delivery_id','')::uuid;
    SELECT user_id, delivery_no, buyer_name, COALESCE(dispatched_at::text, delivered_at::text) INTO v_user, v_ref, v_party, v_date FROM public.deliveries WHERE id = v_parent_id;
  END IF;

  IF v_user IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_ref := COALESCE(
    v_ref,
    v_row->>'invoice_no', v_row->>'po_no', v_row->>'tp_no', v_row->>'quote_no',
    v_row->>'payment_no', v_row->>'delivery_no', v_row->>'transfer_no',
    v_row->>'source_no', v_row->>'doc_no', v_row->>'code'
  );

  v_amount := NULLIF(v_row->>'amount','')::numeric;
  IF v_amount IS NULL THEN v_amount := NULLIF(v_row->>'total','')::numeric; END IF;
  v_party := COALESCE(v_party, v_row->>'contact_name', v_row->>'buyer_name', v_row->>'supplier_name', v_row->>'party_name', v_row->>'party', v_row->>'name', v_row->>'company_name');
  v_date := COALESCE(v_date, v_row->>'date', v_row->>'effective_from');

  v_extra := '';
  IF TG_TABLE_NAME = 'expenses' THEN
    v_extra := COALESCE(v_row->>'category','Expense') || COALESCE(' · ₹'||to_char(v_amount,'FM99,99,99,990.00'),'') || COALESCE(' · '||(v_row->>'mode'),'');
  ELSIF TG_TABLE_NAME = 'payments' THEN
    v_extra := CASE WHEN v_row->>'direction'='in' THEN 'Receipt' ELSE 'Payment' END || COALESCE(' · '||v_party,'') || COALESCE(' · ₹'||to_char(v_amount,'FM99,99,99,990.00'),'') || COALESCE(' · '||(v_row->>'mode'),'');
  ELSIF TG_TABLE_NAME = 'bank_transfers' THEN
    v_extra := COALESCE(v_row->>'kind','Bank entry') || COALESCE(' · '||(v_row->>'bank_name'),'') || COALESCE(' · ₹'||to_char(v_amount,'FM99,99,99,990.00'),'') || COALESCE(' · '||(v_row->>'status'),'');
  ELSIF TG_TABLE_NAME = 'stock_adjustments' THEN
    v_extra := COALESCE(v_row->>'reason','Stock adjustment') || COALESCE(' · qty '||(v_row->>'qty'),'');
  ELSIF TG_TABLE_NAME = 'price_lists' THEN
    v_extra := COALESCE(v_row->>'name','Price list') || COALESCE(' · '||v_party,'');
  ELSIF TG_TABLE_NAME = 'settings' THEN
    v_extra := COALESCE(v_row->>'company_name','Company settings');
  ELSIF TG_TABLE_NAME IN ('sales','purchases','third_party','quotations') THEN
    v_extra := COALESCE(v_party,'') || COALESCE(' · '||v_date,'');
  ELSIF TG_TABLE_NAME = 'deliveries' THEN
    v_extra := COALESCE(v_party,'') || COALESCE(' · '||(v_row->>'status'),'');
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_extra := COALESCE(v_row->>'name','') || COALESCE(' · '||(v_row->>'unit'),'');
  ELSIF TG_TABLE_NAME = 'contacts' THEN
    v_extra := COALESCE(v_row->>'name','') || COALESCE(' · '||(v_row->>'type'),'');
  ELSIF TG_TABLE_NAME IN ('sale_items','purchase_items','tp_items','quotation_items','delivery_items') THEN
    v_extra := COALESCE(v_row->>'product_name','Line item') || COALESCE(' · qty '||COALESCE(v_row->>'qty', v_row->>'qty_ordered', v_row->>'qty_delivered'),'') || COALESCE(' @ ₹'||COALESCE(v_row->>'rate', v_row->>'sale_rate', v_row->>'purchase_rate'),'');
  ELSIF TG_TABLE_NAME = 'payment_allocations' THEN
    v_extra := COALESCE(v_row->>'doc_no','Allocation') || COALESCE(' · ₹'||to_char(v_amount,'FM99,99,99,990.00'),'');
  END IF;

  v_sum := TG_TABLE_NAME || ' ' || lower(TG_OP) || COALESCE(' '||v_ref,'') || COALESCE(' — '||NULLIF(v_extra,''),'');

  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(changed.field_name, jsonb_build_object('old', to_jsonb(OLD)->changed.field_name, 'new', to_jsonb(NEW)->changed.field_name))
      INTO v_diff
      FROM jsonb_object_keys(to_jsonb(NEW)) AS changed(field_name)
     WHERE to_jsonb(OLD)->changed.field_name IS DISTINCT FROM to_jsonb(NEW)->changed.field_name
       AND changed.field_name NOT IN ('updated_at','created_at');
  ELSE
    v_diff := '{}'::jsonb;
    FOREACH v_field IN ARRAY v_keys LOOP
      IF v_row ? v_field AND v_row->v_field IS NOT NULL AND v_row->>v_field <> '' THEN
        IF TG_OP = 'INSERT' THEN
          v_diff := v_diff || jsonb_build_object(v_field, jsonb_build_object('old', null, 'new', v_row->v_field));
        ELSE
          v_diff := v_diff || jsonb_build_object(v_field, jsonb_build_object('old', v_row->v_field, 'new', null));
        END IF;
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN v_diff := NULL; END IF;
  END IF;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, ref_no, summary, diff)
  VALUES (v_user, lower(TG_OP), TG_TABLE_NAME, v_id, v_ref, v_sum, v_diff);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'products','contacts','sales','purchases','third_party','quotations','payments','expenses','deliveries',
    'sale_items','purchase_items','tp_items','quotation_items','delivery_items','payment_allocations',
    'bank_transfers','stock_adjustments','price_lists','settings','fixed_assets'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tg_audit_%I ON public.%I', tbl, tbl);
      EXECUTE format('DROP TRIGGER IF EXISTS trg_fa_audit ON public.%I', tbl);
      EXECUTE format('CREATE TRIGGER tg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_audit()', tbl, tbl);
    END IF;
  END LOOP;
END $$;