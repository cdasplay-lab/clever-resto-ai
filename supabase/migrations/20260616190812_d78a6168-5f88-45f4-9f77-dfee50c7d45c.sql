-- 1) Branch coverage columns
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS coverage_type text NOT NULL DEFAULT 'governorate',
  ADD COLUMN IF NOT EXISTS coverage_governorate text,
  ADD COLUMN IF NOT EXISTS coverage_polygon jsonb,
  ADD COLUMN IF NOT EXISTS coverage_radius_km numeric,
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT ARRAY['ar']::text[];

-- Validation trigger (CHECK can't reference enum-like text lists cleanly + future-proof)
CREATE OR REPLACE FUNCTION public.validate_branch_coverage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.coverage_type NOT IN ('governorate','polygon','radius','none') THEN
    RAISE EXCEPTION 'invalid coverage_type: %', NEW.coverage_type;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_branch_coverage ON public.branches;
CREATE TRIGGER trg_validate_branch_coverage
  BEFORE INSERT OR UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.validate_branch_coverage();

-- 2) uncovered_requests
CREATE TABLE IF NOT EXISTS public.uncovered_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  conversation_id uuid,
  customer_phone text,
  customer_handle text,
  address_text text,
  latitude numeric,
  longitude numeric,
  count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'new',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uncovered_requests TO authenticated;
GRANT ALL ON public.uncovered_requests TO service_role;

ALTER TABLE public.uncovered_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read uncovered" ON public.uncovered_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = uncovered_requests.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "owners update uncovered" ON public.uncovered_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = uncovered_requests.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "owners delete uncovered" ON public.uncovered_requests
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = uncovered_requests.restaurant_id AND r.owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_uncovered_restaurant ON public.uncovered_requests(restaurant_id, last_seen_at DESC);

CREATE TRIGGER trg_uncovered_updated_at
  BEFORE UPDATE ON public.uncovered_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();