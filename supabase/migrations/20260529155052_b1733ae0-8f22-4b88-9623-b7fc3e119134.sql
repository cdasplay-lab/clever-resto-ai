
-- Phase 1: Monitoring & Safety foundation

-- 1. Feature flags on restaurants (all features OFF by default)
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Enhanced observability on agent_logs
ALTER TABLE public.agent_logs
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS tokens_used integer,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS tool_name text,
  ADD COLUMN IF NOT EXISTS model text;

CREATE INDEX IF NOT EXISTS idx_agent_logs_restaurant_created
  ON public.agent_logs(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_errors
  ON public.agent_logs(restaurant_id, created_at DESC) WHERE error IS NOT NULL;

-- 3. Bot health summary RPC (last 24h aggregates)
CREATE OR REPLACE FUNCTION public.get_bot_health(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_total integer;
  v_errors integer;
  v_avg_latency numeric;
  v_tool_calls integer;
  v_recent jsonb;
BEGIN
  SELECT owner_id INTO v_owner FROM public.restaurants WHERE id = _restaurant_id;
  IF v_owner IS NULL OR (v_owner <> auth.uid() AND NOT public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE kind = 'run'),
    COUNT(*) FILTER (WHERE error IS NOT NULL),
    AVG(latency_ms) FILTER (WHERE kind = 'run' AND latency_ms IS NOT NULL),
    COUNT(*) FILTER (WHERE kind = 'tool')
  INTO v_total, v_errors, v_avg_latency, v_tool_calls
  FROM public.agent_logs
  WHERE restaurant_id = _restaurant_id
    AND created_at > now() - interval '24 hours';

  SELECT jsonb_agg(row_to_json(t)) INTO v_recent
  FROM (
    SELECT id, kind, tool_name, latency_ms, error, created_at, conversation_id, step,
           CASE WHEN payload ? 'message' THEN payload->>'message' ELSE NULL END AS message
    FROM public.agent_logs
    WHERE restaurant_id = _restaurant_id
    ORDER BY created_at DESC
    LIMIT 50
  ) t;

  RETURN jsonb_build_object(
    'total_runs_24h', COALESCE(v_total, 0),
    'errors_24h', COALESCE(v_errors, 0),
    'avg_latency_ms', COALESCE(ROUND(v_avg_latency), 0),
    'tool_calls_24h', COALESCE(v_tool_calls, 0),
    'recent_logs', COALESCE(v_recent, '[]'::jsonb)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_bot_health(uuid) TO authenticated;
