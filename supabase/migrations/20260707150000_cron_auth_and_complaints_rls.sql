-- 1) Authenticate the public cron endpoints.
--    Previously check-delays sent the PUBLIC anon key (present in every client
--    bundle → zero protection) and check-complaints sent no credential at all,
--    so anyone could trigger scans / suppress legitimate delay alerts.
--    Both jobs now send x-cron-secret, validated by src/lib/cron-auth.ts
--    (override with the CRON_SECRET server env var to rotate).

DO $$
BEGIN
  PERFORM cron.unschedule('check-order-delays');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('check-complaints-every-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'check-order-delays',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--69d6f4f9-fc25-4aef-bc41-e7320569fc12.lovable.app/api/public/check-delays',
    headers := '{"Content-Type":"application/json","x-cron-secret":"crn_7e41c9d2a8b34f60b5e2d81f4c96a375"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'check-complaints-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--69d6f4f9-fc25-4aef-bc41-e7320569fc12.lovable.app/api/public/check-complaints',
    headers := '{"Content-Type":"application/json","x-cron-secret":"crn_7e41c9d2a8b34f60b5e2d81f4c96a375"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 2) Schema-drift fix: the complaints table (and restaurants.owner_telegram_chat_id)
--    were created via the dashboard and never captured in migrations, so their RLS
--    state was unverifiable from the repo. Enforce tenant isolation here.
--    (Service-role writers — agent-run, cron — bypass RLS and keep working.)
ALTER TABLE IF EXISTS public.complaints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'complaints')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'complaints'
         AND policyname = 'owner manages own complaints'
     )
  THEN
    CREATE POLICY "owner manages own complaints"
      ON public.complaints
      FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.id = complaints.restaurant_id AND r.owner_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.id = complaints.restaurant_id AND r.owner_id = auth.uid()
      ));
  END IF;
END $$;
