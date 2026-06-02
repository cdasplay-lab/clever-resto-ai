CREATE TABLE public.social_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram','facebook')),
  kind text NOT NULL CHECK (kind IN ('story_reply','comment','mention')),
  external_id text NOT NULL,
  parent_id text,
  customer_handle text,
  customer_name text,
  incoming_text text,
  reply_text text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','replied','skipped','failed')),
  error text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX social_interactions_unique_external
  ON public.social_interactions (restaurant_id, platform, external_id);
CREATE INDEX social_interactions_restaurant_created
  ON public.social_interactions (restaurant_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.social_interactions TO authenticated;
GRANT ALL ON public.social_interactions TO service_role;

ALTER TABLE public.social_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read own social_interactions"
  ON public.social_interactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = social_interactions.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "owners update own social_interactions"
  ON public.social_interactions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = social_interactions.restaurant_id AND r.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = social_interactions.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "owners delete own social_interactions"
  ON public.social_interactions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = social_interactions.restaurant_id AND r.owner_id = auth.uid()));

CREATE TRIGGER social_interactions_touch
  BEFORE UPDATE ON public.social_interactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();