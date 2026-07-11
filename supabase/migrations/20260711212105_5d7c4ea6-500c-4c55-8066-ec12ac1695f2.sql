ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id text,
  ADD COLUMN IF NOT EXISTS whatsapp_business_account_id text;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_whatsapp_phone_number_id_key
  ON public.restaurants(whatsapp_phone_number_id)
  WHERE whatsapp_phone_number_id IS NOT NULL;