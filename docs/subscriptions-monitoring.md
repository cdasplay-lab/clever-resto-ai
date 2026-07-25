# Subscriptions and monitoring

Migration `20260721140000_subscription_monitoring_completion.sql` adds paid/trial subscriptions, immutable payment records, idempotent service-only quota charging, database branch limits, service heartbeats, alert deduplication and atomic order cancellation/restocking.

## Runtime configuration

Set `CRON_SECRET` (at least 32 random characters) in the web runtime and store the same value in Supabase Vault. Schedule `POST /api/public/check-health` every five minutes with `x-cron-secret`. Set `PLATFORM_ALERT_CHAT_ID`, `LOVABLE_API_KEY` and `TELEGRAM_API_KEY` for critical Telegram alerts.

## Deployment order

1. Back up the database and apply migrations in a preview project.
2. Deploy Edge Functions and the web app.
3. Configure the cron secret and five-minute health sweep.
4. Verify trial activation, paid activation/payment record, quota deduplication, branch enforcement, alert acknowledgement and scheduled-order dispatch.

Nothing in this branch applies migrations or deploys production automatically.
