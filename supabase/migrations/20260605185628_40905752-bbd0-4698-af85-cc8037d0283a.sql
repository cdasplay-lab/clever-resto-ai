SELECT cron.schedule(
  'check-complaints-every-5min',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url:='https://project--69d6f4f9-fc25-4aef-bc41-e7320569fc12.lovable.app/api/public/check-complaints',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;$$
);