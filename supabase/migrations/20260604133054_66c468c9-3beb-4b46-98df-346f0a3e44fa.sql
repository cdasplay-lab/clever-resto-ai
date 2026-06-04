-- Add meta jsonb column to orders for ETA, confirmed_at, delay tracking
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Helpful index for delay-check cron
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON public.orders (status, created_at DESC);

-- Schedule a cron job every 5 minutes to check delayed orders
-- Calls the public TanStack server route
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if exists to make this migration idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('check-order-delays');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'check-order-delays',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--69d6f4f9-fc25-4aef-bc41-e7320569fc12.lovable.app/api/public/check-delays',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_0phrZH8mdg3H1Djrqboa3Q_DAoU-OUe"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);