
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'stocked'
    CHECK (kind IN ('stocked','order_basis'));

-- Best-guess backfill: items with no opening stock and no history → order_basis
UPDATE public.products p
SET kind = 'order_basis'
WHERE COALESCE(p.opening_stock,0) = 0
  AND NOT EXISTS (SELECT 1 FROM public.sale_items     si WHERE si.product_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.purchase_items pi WHERE pi.product_id = p.id);

CREATE INDEX IF NOT EXISTS idx_products_user_kind ON public.products(user_id, kind);
