
-- ============ Settings additions ============
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS cogs_method text NOT NULL DEFAULT 'weighted_average'
    CHECK (cogs_method IN ('weighted_average','fifo')),
  ADD COLUMN IF NOT EXISTS depreciation_auto boolean NOT NULL DEFAULT false;

-- ============ Fixed Assets register ============
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_no text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Machinery'
    CHECK (category IN ('Land','Building','Machinery','Vehicle','Furniture','Equipment','Computer','Other')),
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  salvage_value numeric NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  useful_life_years numeric NOT NULL DEFAULT 10 CHECK (useful_life_years > 0),
  depreciation_method text NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line','wdv','none')),
  wdv_rate_pct numeric NOT NULL DEFAULT 15,
  accumulated_depreciation numeric NOT NULL DEFAULT 0,
  paid_via text NOT NULL DEFAULT 'Bank' CHECK (paid_via IN ('Cash','Bank','Credit')),
  supplier_id uuid,
  supplier_name text,
  disposed_at date,
  disposal_value numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fa_user_date ON public.fixed_assets(user_id, purchase_date DESC);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own fa all" ON public.fixed_assets;
CREATE POLICY "own fa all" ON public.fixed_assets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Autonumber FA-####
CREATE OR REPLACE FUNCTION public.tg_fa_autonum()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.asset_no IS NULL OR NEW.asset_no='' THEN
    NEW.asset_no := public.next_doc_no(NEW.user_id,'FA','fixed_assets','asset_no');
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_fa_autonum ON public.fixed_assets;
CREATE TRIGGER trg_fa_autonum BEFORE INSERT ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_fa_autonum();

-- ============ Journal posting for Fixed Assets ============
CREATE OR REPLACE FUNCTION public.post_journal_fixed_asset(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  fa record; je_id uuid; asset_acct text; pay_acct text;
  bookval numeric; gainloss numeric;
BEGIN
  SELECT * INTO fa FROM public.fixed_assets WHERE id=_id;
  IF NOT FOUND THEN
    DELETE FROM public.journal_entries WHERE source_kind='fixed_asset' AND source_id=_id;
    RETURN;
  END IF;

  asset_acct := 'Fixed Assets: ' || fa.category;
  pay_acct := CASE fa.paid_via
                WHEN 'Cash' THEN 'Cash'
                WHEN 'Bank' THEN 'Bank'
                ELSE 'Accounts Payable'
              END;

  DELETE FROM public.journal_entries WHERE source_kind='fixed_asset' AND source_id=_id;

  -- Purchase entry
  IF fa.cost > 0 THEN
    INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
      VALUES (fa.user_id, fa.purchase_date, 'fixed_asset', fa.id, fa.asset_no,
              'Acquired ' || fa.name || ' (' || fa.category || ')')
      RETURNING id INTO je_id;

    INSERT INTO public.journal_lines(entry_id,user_id,date,account,party,debit,credit,ref_no,narration) VALUES
      (je_id, fa.user_id, fa.purchase_date, asset_acct, fa.supplier_name, fa.cost, 0, fa.asset_no,
        'Capitalised: ' || fa.name),
      (je_id, fa.user_id, fa.purchase_date, pay_acct, fa.supplier_name, 0, fa.cost, fa.asset_no,
        'Payment for ' || fa.name);
  END IF;

  -- Disposal entry (if disposed)
  IF fa.disposed_at IS NOT NULL THEN
    bookval := fa.cost - COALESCE(fa.accumulated_depreciation,0);
    gainloss := COALESCE(fa.disposal_value,0) - bookval;

    INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
      VALUES (fa.user_id, fa.disposed_at, 'fixed_asset_disposal', fa.id, fa.asset_no,
              'Disposed ' || fa.name)
      RETURNING id INTO je_id;

    -- Credit asset account at cost, debit accumulated depreciation, debit cash for proceeds
    INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no,narration) VALUES
      (je_id, fa.user_id, fa.disposed_at, asset_acct, 0, fa.cost, fa.asset_no, 'Asset removed at cost'),
      (je_id, fa.user_id, fa.disposed_at, 'Accumulated Depreciation: ' || fa.category, COALESCE(fa.accumulated_depreciation,0), 0, fa.asset_no, 'Reverse accumulated depreciation');
    IF COALESCE(fa.disposal_value,0) > 0 THEN
      INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no) VALUES
        (je_id, fa.user_id, fa.disposed_at, 'Bank', fa.disposal_value, 0, fa.asset_no);
    END IF;
    IF gainloss > 0 THEN
      INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no,narration) VALUES
        (je_id, fa.user_id, fa.disposed_at, 'Gain on Sale of Assets', 0, gainloss, fa.asset_no, 'Profit on disposal');
    ELSIF gainloss < 0 THEN
      INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no,narration) VALUES
        (je_id, fa.user_id, fa.disposed_at, 'Loss on Sale of Assets', -gainloss, 0, fa.asset_no, 'Loss on disposal');
    END IF;
  END IF;
END;$$;

CREATE OR REPLACE FUNCTION public.tg_fa_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM public.post_journal_fixed_asset(OLD.id); RETURN OLD; END IF;
  PERFORM public.post_journal_fixed_asset(NEW.id); RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_fa_post ON public.fixed_assets;
CREATE TRIGGER trg_fa_post AFTER INSERT OR UPDATE OR DELETE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_fa_post();

-- Audit + notifications
DROP TRIGGER IF EXISTS trg_fa_audit ON public.fixed_assets;
CREATE TRIGGER trg_fa_audit AFTER INSERT OR UPDATE OR DELETE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

-- ============ Depreciation booking helper ============
-- Books one period of depreciation for all active assets owned by current user.
-- Posts: Dr Depreciation Expense / Cr Accumulated Depreciation (by category).
CREATE OR REPLACE FUNCTION public.book_depreciation(_period_end date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  fa record; je_id uuid; periods_elapsed numeric;
  annual numeric; period_dep numeric; bookval numeric;
  posted int := 0;
BEGIN
  -- Remove any previously-posted depreciation entries for this exact period (idempotent re-run)
  DELETE FROM public.journal_entries
    WHERE source_kind='depreciation'
      AND date = _period_end
      AND user_id = auth.uid();

  FOR fa IN SELECT * FROM public.fixed_assets
             WHERE user_id = auth.uid()
               AND depreciation_method <> 'none'
               AND disposed_at IS NULL
               AND purchase_date <= _period_end
  LOOP
    bookval := fa.cost - COALESCE(fa.accumulated_depreciation,0);
    IF bookval <= fa.salvage_value THEN CONTINUE; END IF;

    IF fa.depreciation_method = 'straight_line' THEN
      annual := GREATEST(0, (fa.cost - fa.salvage_value) / NULLIF(fa.useful_life_years,0));
    ELSE -- wdv
      annual := bookval * (fa.wdv_rate_pct/100.0);
    END IF;

    period_dep := LEAST(annual / 12.0, bookval - fa.salvage_value);
    IF period_dep <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.journal_entries(user_id,date,source_kind,source_id,source_no,narration)
      VALUES (fa.user_id, _period_end, 'depreciation', fa.id, fa.asset_no,
              'Monthly depreciation on ' || fa.name)
      RETURNING id INTO je_id;

    INSERT INTO public.journal_lines(entry_id,user_id,date,account,debit,credit,ref_no,narration) VALUES
      (je_id, fa.user_id, _period_end, 'Expenses: Depreciation', period_dep, 0, fa.asset_no, fa.name),
      (je_id, fa.user_id, _period_end, 'Accumulated Depreciation: ' || fa.category, 0, period_dep, fa.asset_no, fa.name);

    UPDATE public.fixed_assets
       SET accumulated_depreciation = COALESCE(accumulated_depreciation,0) + period_dep
     WHERE id = fa.id;

    posted := posted + 1;
  END LOOP;
  RETURN posted;
END;$$;

GRANT EXECUTE ON FUNCTION public.book_depreciation(date) TO authenticated;

-- ============ Working capital summary view ============
CREATE OR REPLACE VIEW public.working_capital_view
WITH (security_invoker=on) AS
WITH bal AS (
  SELECT
    user_id,
    account,
    SUM(debit) AS d,
    SUM(credit) AS c
  FROM public.journal_lines
  GROUP BY user_id, account
)
SELECT
  user_id,
  COALESCE(SUM(CASE WHEN account='Cash' THEN d-c END),0) AS cash,
  COALESCE(SUM(CASE WHEN account='Bank' THEN d-c END),0) AS bank,
  COALESCE(SUM(CASE WHEN account='Accounts Receivable' THEN d-c END),0) AS receivable,
  COALESCE(SUM(CASE WHEN account='Accounts Payable' THEN c-d END),0) AS payable,
  COALESCE(SUM(CASE WHEN account IN ('Input CGST','Input SGST','Input IGST') THEN d-c END),0) AS gst_input,
  COALESCE(SUM(CASE WHEN account IN ('Output CGST','Output SGST','Output IGST') THEN c-d END),0) AS gst_output,
  COALESCE(SUM(CASE WHEN account LIKE 'Fixed Assets:%' THEN d-c END),0) AS gross_fixed_assets,
  COALESCE(SUM(CASE WHEN account LIKE 'Accumulated Depreciation:%' THEN c-d END),0) AS accumulated_depreciation
FROM bal
GROUP BY user_id;

GRANT SELECT ON public.working_capital_view TO authenticated;
