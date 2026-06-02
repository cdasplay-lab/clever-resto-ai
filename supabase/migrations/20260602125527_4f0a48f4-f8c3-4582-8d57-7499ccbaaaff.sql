
-- Phase 7: stock tracking + combos + upsell
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS stock_qty integer,
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upsell_category text;

-- Combos table
CREATE TABLE IF NOT EXISTS public.combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  price numeric NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.combos TO authenticated;
GRANT ALL ON public.combos TO service_role;

ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own combos"
ON public.combos
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = combos.restaurant_id AND r.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = combos.restaurant_id AND r.owner_id = auth.uid()));

CREATE TRIGGER combos_touch_updated_at
BEFORE UPDATE ON public.combos
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Atomic stock decrement; returns array of menu_item_ids that failed (insufficient stock)
CREATE OR REPLACE FUNCTION public.decrement_stock(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_qty integer;
  v_updated integer;
  v_failed jsonb := '[]'::jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_id := (v_item->>'menu_item_id')::uuid;
    v_qty := (v_item->>'qty')::integer;
    UPDATE public.menu_items
      SET stock_qty = stock_qty - v_qty
      WHERE id = v_id
        AND track_stock = true
        AND stock_qty IS NOT NULL
        AND stock_qty >= v_qty;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      -- Only fail if the item actually tracks stock and lacked enough
      IF EXISTS (SELECT 1 FROM public.menu_items WHERE id = v_id AND track_stock = true) THEN
        v_failed := v_failed || jsonb_build_object('menu_item_id', v_id, 'requested', v_qty);
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('failed', v_failed);
END $$;
