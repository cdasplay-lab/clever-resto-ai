ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS telegram_bot_token text,
  ADD COLUMN IF NOT EXISTS telegram_bot_id text;

-- Unique constraint so two restaurants can't link the same bot.
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_telegram_bot_id_uniq
  ON public.restaurants (telegram_bot_id)
  WHERE telegram_bot_id IS NOT NULL;