-- Fix order confirmation failure: remove invalid 'dispatched' status reference and dedupe trigger

DROP TRIGGER IF EXISTS orders_sync_customer_memory ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_sync_customer_memory ON public.orders;

CREATE OR REPLACE FUNCTION public.sync_customer_memory_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel text;
  v_handle text;
  v_name text;
BEGIN
  -- Only count orders that represent a real confirmed sale
  IF NEW.status::text NOT IN ('pending','confirmed','preparing','out_for_delivery','completed') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;

  SELECT c.channel::text, c.customer_handle, COALESCE(c.customer_name, NEW.customer_name)
    INTO v_channel, v_handle, v_name
  FROM public.conversations c WHERE c.id = NEW.conversation_id;

  IF v_handle IS NULL THEN RETURN NEW; END IF;

  -- Only increment counters on INSERT (or first transition into a counted status),
  -- not on every status change, to avoid double counting.
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.customer_memory
      (restaurant_id, channel, customer_handle, customer_name, last_order_at, total_orders, lifetime_value, last_address, last_phone)
    VALUES
      (NEW.restaurant_id, v_channel, v_handle, v_name, now(), 1, COALESCE(NEW.total,0), NEW.delivery_address, NEW.customer_phone)
    ON CONFLICT (restaurant_id, channel, customer_handle) DO UPDATE
      SET customer_name = COALESCE(EXCLUDED.customer_name, public.customer_memory.customer_name),
          last_order_at = now(),
          total_orders = public.customer_memory.total_orders + 1,
          lifetime_value = public.customer_memory.lifetime_value + COALESCE(NEW.total,0),
          last_address = COALESCE(NEW.delivery_address, public.customer_memory.last_address),
          last_phone = COALESCE(NEW.customer_phone, public.customer_memory.last_phone),
          updated_at = now();
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER orders_sync_customer_memory
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_customer_memory_on_order();