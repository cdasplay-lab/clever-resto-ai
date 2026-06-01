
-- Phase 2: Customer Memory

CREATE TABLE public.customer_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  channel text NOT NULL,
  customer_handle text NOT NULL,
  customer_name text,
  last_order_at timestamptz,
  total_orders integer NOT NULL DEFAULT 0,
  lifetime_value numeric NOT NULL DEFAULT 0,
  last_address text,
  last_phone text,
  preferences text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, channel, customer_handle)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_memory TO authenticated;
GRANT ALL ON public.customer_memory TO service_role;

ALTER TABLE public.customer_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read own customer_memory" ON public.customer_memory
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = customer_memory.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "owners update own customer_memory" ON public.customer_memory
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = customer_memory.restaurant_id AND r.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = customer_memory.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "owners delete own customer_memory" ON public.customer_memory
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = customer_memory.restaurant_id AND r.owner_id = auth.uid()));

CREATE INDEX idx_customer_memory_restaurant ON public.customer_memory(restaurant_id, last_order_at DESC);

-- updated_at trigger
CREATE TRIGGER customer_memory_touch
  BEFORE UPDATE ON public.customer_memory
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-update memory after an order becomes confirmed/dispatched
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
  IF NEW.status NOT IN ('confirmed','dispatched') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;

  SELECT c.channel::text, c.customer_handle, COALESCE(c.customer_name, NEW.customer_name)
    INTO v_channel, v_handle, v_name
  FROM public.conversations c WHERE c.id = NEW.conversation_id;

  IF v_handle IS NULL THEN RETURN NEW; END IF;

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
  RETURN NEW;
END $$;

CREATE TRIGGER orders_sync_customer_memory
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_customer_memory_on_order();

-- RPC for the bot: read-only lookup by conversation
CREATE OR REPLACE FUNCTION public.recall_customer(_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_conv record; v_mem record;
BEGIN
  SELECT restaurant_id, channel::text AS channel, customer_handle, customer_name
    INTO v_conv FROM public.conversations WHERE id = _conversation_id;
  IF v_conv.restaurant_id IS NULL OR v_conv.customer_handle IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT * INTO v_mem FROM public.customer_memory
    WHERE restaurant_id = v_conv.restaurant_id
      AND channel = v_conv.channel
      AND customer_handle = v_conv.customer_handle;
  IF v_mem.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object(
    'found', true,
    'name', v_mem.customer_name,
    'total_orders', v_mem.total_orders,
    'lifetime_value', v_mem.lifetime_value,
    'last_order_at', v_mem.last_order_at,
    'last_address', v_mem.last_address,
    'last_phone', v_mem.last_phone,
    'preferences', v_mem.preferences,
    'notes', v_mem.notes
  );
END $$;
