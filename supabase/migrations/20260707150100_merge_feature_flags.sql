-- Atomic top-level merge of restaurants.feature_flags.
-- Fixes the read-modify-write race where two concurrent toggles (e.g. customer
-- memory + story replies) clobbered each other's keys.
-- SECURITY INVOKER (default): RLS owner-only policies still apply — a non-owner
-- update matches 0 rows and returns null.
CREATE OR REPLACE FUNCTION public.merge_feature_flags(_restaurant_id uuid, _patch jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  UPDATE public.restaurants
  SET feature_flags = COALESCE(feature_flags, '{}'::jsonb) || COALESCE(_patch, '{}'::jsonb)
  WHERE id = _restaurant_id
  RETURNING feature_flags;
$$;
