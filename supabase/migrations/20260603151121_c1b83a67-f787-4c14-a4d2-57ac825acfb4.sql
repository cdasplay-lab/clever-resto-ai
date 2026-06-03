-- Cross-instance idempotency for incoming webhook updates (Telegram, etc).
-- Replaces in-memory Map that didn't survive worker restarts or multiple instances.
CREATE TABLE public.processed_updates (
  channel text NOT NULL,
  update_key text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, update_key)
);

-- Only edge functions (service_role) read/write this; no end-user access.
GRANT ALL ON public.processed_updates TO service_role;

ALTER TABLE public.processed_updates ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon -> table is locked except for service_role.

CREATE INDEX idx_processed_updates_processed_at
  ON public.processed_updates (processed_at);

-- Helper: try to mark an update; returns true if this is the first time we see it,
-- false if it was already processed (duplicate delivery).
CREATE OR REPLACE FUNCTION public.try_mark_update(_channel text, _key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.processed_updates (channel, update_key)
  VALUES (_channel, _key)
  ON CONFLICT (channel, update_key) DO NOTHING;
  -- Best-effort GC: drop entries older than 24h on every insert.
  DELETE FROM public.processed_updates WHERE processed_at < now() - interval '24 hours';
  RETURN FOUND;
END $$;