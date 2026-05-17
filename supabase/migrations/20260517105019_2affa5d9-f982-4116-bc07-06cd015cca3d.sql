ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(user_id, category);

CREATE TABLE IF NOT EXISTS public.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  currency text NOT NULL DEFAULT 'INR',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own price_lists all" ON public.price_lists FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  product_id uuid,
  product_code text,
  product_name text NOT NULL,
  category text,
  hsn text,
  unit text,
  cost_rate numeric NOT NULL DEFAULT 0,
  mrp numeric NOT NULL DEFAULT 0,
  list_rate numeric NOT NULL DEFAULT 0,
  discount_pct numeric NOT NULL DEFAULT 0,
  margin_pct numeric NOT NULL DEFAULT 0,
  gst_pct numeric NOT NULL DEFAULT 18,
  min_qty numeric NOT NULL DEFAULT 1,
  position int NOT NULL DEFAULT 0
);
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own price_list_items all" ON public.price_list_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.price_lists p WHERE p.id = price_list_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.price_lists p WHERE p.id = price_list_id AND p.user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_pli_list ON public.price_list_items(price_list_id);