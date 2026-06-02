-- 1) auto_preferences column
ALTER TABLE public.customer_memory
  ADD COLUMN IF NOT EXISTS auto_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) recall_customer v2: returns recent_orders + favorites + memory_id
CREATE OR REPLACE FUNCTION public.recall_customer(_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv record;
  v_mem record;
  v_recent jsonb;
  v_favs jsonb;
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

  IF v_mem.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Recent orders (last 3 confirmed/dispatched/delivered)
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_recent
  FROM (
    SELECT o.id, o.items, o.total, o.delivery_address, o.created_at, o.status::text AS status
    FROM public.orders o
    JOIN public.conversations c ON c.id = o.conversation_id
    WHERE o.restaurant_id = v_conv.restaurant_id
      AND c.customer_handle = v_conv.customer_handle
      AND c.channel::text = v_conv.channel
      AND o.status::text <> 'cancelled'
    ORDER BY o.created_at DESC
    LIMIT 3
  ) t;

  -- Top favorites: aggregate items across all this customer's orders
  WITH all_items AS (
    SELECT (item->>'menu_item_id')::uuid AS menu_item_id,
           COALESCE((item->>'name')::text, '') AS item_name,
           COALESCE((item->>'qty')::int, 1) AS qty
    FROM public.orders o
    JOIN public.conversations c ON c.id = o.conversation_id,
         jsonb_array_elements(o.items) AS item
    WHERE o.restaurant_id = v_conv.restaurant_id
      AND c.customer_handle = v_conv.customer_handle
      AND c.channel::text = v_conv.channel
      AND o.status::text <> 'cancelled'
      AND item ? 'menu_item_id'
  )
  SELECT COALESCE(jsonb_agg(row_to_json(f)::jsonb ORDER BY f.total_qty DESC), '[]'::jsonb)
    INTO v_favs
  FROM (
    SELECT menu_item_id, MAX(item_name) AS name, SUM(qty)::int AS total_qty
    FROM all_items
    WHERE menu_item_id IS NOT NULL
    GROUP BY menu_item_id
    ORDER BY total_qty DESC
    LIMIT 5
  ) f;

  RETURN jsonb_build_object(
    'found', true,
    'memory_id', v_mem.id,
    'name', v_mem.customer_name,
    'total_orders', v_mem.total_orders,
    'lifetime_value', v_mem.lifetime_value,
    'last_order_at', v_mem.last_order_at,
    'last_address', v_mem.last_address,
    'last_phone', v_mem.last_phone,
    'preferences', v_mem.preferences,
    'auto_preferences', v_mem.auto_preferences,
    'notes', v_mem.notes,
    'recent_orders', COALESCE(v_recent, '[]'::jsonb),
    'favorites', COALESCE(v_favs, '[]'::jsonb)
  );
END $$;