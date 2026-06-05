CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS search_aliases text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS menu_items_name_trgm_idx
  ON public.menu_items USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS menu_items_aliases_gin_idx
  ON public.menu_items USING gin (search_aliases);

-- Arabic normalizer (immutable, used both in fuzzy func and indexes)
CREATE OR REPLACE FUNCTION public.normalize_ar(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        translate(
          coalesce(t,''),
          'أإآٱىةـًٌٍَُِّْ',
          'اااايه          '
        ),
        '(.)\1{2,}', '\1\1', 'g'
      ),
      '\s+', ' ', 'g'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.search_menu_fuzzy(
  p_restaurant_id uuid,
  p_query text,
  p_threshold real DEFAULT 0.3,
  p_limit integer DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  price numeric,
  category text,
  similarity real
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (SELECT public.normalize_ar(p_query) AS nq)
  SELECT m.id, m.name, m.description, m.price, m.category,
    GREATEST(
      similarity(public.normalize_ar(m.name), (SELECT nq FROM q)),
      COALESCE((
        SELECT MAX(similarity(public.normalize_ar(a), (SELECT nq FROM q)))
        FROM unnest(m.search_aliases) AS a
      ), 0),
      COALESCE(similarity(public.normalize_ar(m.description), (SELECT nq FROM q)) * 0.5, 0)
    ) AS sim
  FROM public.menu_items m
  WHERE m.restaurant_id = p_restaurant_id
    AND m.is_available = true
  AND (
    public.normalize_ar(m.name) % (SELECT nq FROM q)
    OR EXISTS (
      SELECT 1 FROM unnest(m.search_aliases) AS a
      WHERE public.normalize_ar(a) % (SELECT nq FROM q)
    )
    OR public.normalize_ar(m.name) ILIKE '%' || (SELECT nq FROM q) || '%'
  )
  ORDER BY sim DESC
  LIMIT p_limit;
$$;

CREATE TABLE IF NOT EXISTS public.unmatched_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  conversation_id uuid,
  query_text text NOT NULL,
  normalized_text text NOT NULL,
  resolved_to_item_id uuid,
  resolved_at timestamptz,
  count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unmatched_queries_rest_norm_uniq
  ON public.unmatched_queries (restaurant_id, normalized_text);

CREATE INDEX IF NOT EXISTS unmatched_queries_rest_count_idx
  ON public.unmatched_queries (restaurant_id, count DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unmatched_queries TO authenticated;
GRANT ALL ON public.unmatched_queries TO service_role;

ALTER TABLE public.unmatched_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own unmatched_queries"
  ON public.unmatched_queries
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = unmatched_queries.restaurant_id AND r.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = unmatched_queries.restaurant_id AND r.owner_id = auth.uid()));