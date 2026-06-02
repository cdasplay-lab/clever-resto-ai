ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_for ON public.orders (scheduled_for) WHERE scheduled_for IS NOT NULL;