
-- 1) Create branches table
CREATE TABLE public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  delivery_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_order numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  telegram_chat_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_branches_restaurant ON public.branches(restaurant_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;

-- RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own branches"
ON public.branches
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = branches.restaurant_id AND r.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = branches.restaurant_id AND r.owner_id = auth.uid()));

-- Updated_at trigger
CREATE TRIGGER branches_set_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Add branch_id to orders
ALTER TABLE public.orders ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_branch ON public.orders(branch_id);

-- 3) Migrate existing restaurants -> create a default "الفرع الرئيسي" for each
INSERT INTO public.branches (restaurant_id, name, delivery_areas, open_hours, min_order, is_active)
SELECT id, 'الفرع الرئيسي', COALESCE(delivery_areas, '[]'::jsonb), COALESCE(open_hours, '{}'::jsonb), COALESCE(min_order, 0), true
FROM public.restaurants;
