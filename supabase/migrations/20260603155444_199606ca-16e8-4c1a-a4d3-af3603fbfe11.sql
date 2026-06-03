
-- Owner Telegram chat id for direct owner alerts
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS owner_telegram_chat_id TEXT;

-- Bad responses feedback table
CREATE TABLE IF NOT EXISTS public.bad_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  conversation_id UUID,
  message_id UUID,
  reason TEXT NOT NULL,
  note TEXT,
  context_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bad_responses TO authenticated;
GRANT ALL ON public.bad_responses TO service_role;

ALTER TABLE public.bad_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own bad_responses"
ON public.bad_responses
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = bad_responses.restaurant_id AND r.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = bad_responses.restaurant_id AND r.owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_bad_responses_restaurant_created
  ON public.bad_responses (restaurant_id, created_at DESC);

-- Weekly summary: top reasons in last 7 days per restaurant
CREATE OR REPLACE VIEW public.weekly_bad_response_summary
WITH (security_invoker = true) AS
SELECT
  restaurant_id,
  reason,
  COUNT(*)::int AS count,
  MAX(created_at) AS last_at
FROM public.bad_responses
WHERE created_at > now() - interval '7 days'
GROUP BY restaurant_id, reason
ORDER BY restaurant_id, count DESC;

GRANT SELECT ON public.weekly_bad_response_summary TO authenticated;
