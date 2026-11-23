-- Only orders created by the new checkout have a preview ID. Existing orders
-- and other order producers can continue to leave it null.
alter table public.orders add column checkout_preview_id uuid;

create unique index orders_checkout_preview_uidx
  on public.orders (conversation_id, checkout_preview_id)
  where checkout_preview_id is not null;

create function public.commit_agent_checkout(
  _restaurant_id uuid,
  _conversation_id uuid,
  _preview_id uuid,
  _confirmation_message_id uuid,
  _expected jsonb,
  _scheduled_for timestamptz,
  _scheduled_label text,
  _eta_minutes integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_order_id uuid;
  v_latest_message_id uuid;
  v_latest_message_at timestamptz;
  v_pending jsonb;
  v_branch_id uuid;
  v_location jsonb;
  v_total numeric;
  v_stock_items jsonb;
  v_all_items_available boolean;
begin
  -- Serialize checkout against edits and other commits of this conversation.
  select * into v_conversation
    from public.conversations
    where id = _conversation_id and restaurant_id = _restaurant_id
    for update;

  if not found or _preview_id is null then
    return jsonb_build_object('outcome', 'stale_preview');
  end if;

  -- A replay can still return its receipt after the customer starts a new cart.
  select id into v_order_id
    from public.orders
    where conversation_id = _conversation_id and restaurant_id = _restaurant_id
      and checkout_preview_id = _preview_id;
  if found then
    return jsonb_build_object('outcome', 'replayed', 'order_id', v_order_id);
  end if;

  v_pending := v_conversation.meta->'pending_confirmation';
  if _expected is null or v_conversation.state <> 'confirm' or v_conversation.is_bot_paused
    or v_pending->>'token' is distinct from _preview_id::text
    or v_pending->>'after_user_message_id' is null or v_pending->>'created_at' is null then
    return jsonb_build_object('outcome', 'stale_preview');
  end if;

  -- The Edge function validates the text. Verify the message it saw is still
  -- the latest user message, and was sent after the preview's turn.
  select id, created_at into v_latest_message_id, v_latest_message_at
    from public.messages
    where conversation_id = _conversation_id and role = 'user'
    order by created_at desc, id desc
    limit 1;
  if _confirmation_message_id is null
    or _confirmation_message_id is distinct from v_latest_message_id
    or _confirmation_message_id::text = v_pending->>'after_user_message_id'
    or v_latest_message_at < (v_pending->>'created_at')::timestamptz then
    return jsonb_build_object('outcome', 'confirmation_required');
  end if;

  v_branch_id := (v_conversation.meta->>'branch_id')::uuid;
  v_location := coalesce(
    nullif(v_conversation.delivery->'customer_location', 'null'::jsonb),
    v_conversation.meta->'customer_location'
  );
  if _expected is distinct from jsonb_build_object(
    'cart', v_conversation.cart,
    'delivery', v_conversation.delivery,
    'branch_id', v_branch_id,
    'customer_name', v_conversation.customer_name,
    'customer_location', v_location
  ) then
    return jsonb_build_object('outcome', 'order_changed');
  end if;

  if v_branch_id is not null and not exists (
    select 1 from public.branches
    where id = v_branch_id and restaurant_id = _restaurant_id and is_active
  ) then
    return jsonb_build_object('outcome', 'branch_unavailable');
  end if;

  -- Preserve the prices in the reviewed cart, including option and combo prices.
  -- Refuse items removed or disabled since the customer was shown that cart.
  select sum(item.qty * item.unit_price), bool_and(
    menu.id is not null and menu.is_available and item.qty is not null and item.qty > 0
    and item.unit_price is not null and item.unit_price >= 0
  ) into v_total, v_all_items_available
    from jsonb_to_recordset(v_conversation.cart) as item(menu_item_id uuid, qty integer, unit_price numeric)
    left join public.menu_items as menu
      on menu.id = item.menu_item_id and menu.restaurant_id = _restaurant_id;
  if v_all_items_available is distinct from true then
    return jsonb_build_object('outcome', 'items_unavailable');
  end if;

  v_order_id := gen_random_uuid();
  if _scheduled_for is null then
    if (public.consume_quota(_restaurant_id, 'confirmed_order', v_order_id::text)->>'allowed')
      is distinct from 'true' then
      return jsonb_build_object('outcome', 'quota_denied');
    end if;

    -- Keep stock updates in a consistent item order across conversations.
    select jsonb_agg(jsonb_build_object('menu_item_id', menu_item_id, 'qty', qty) order by menu_item_id)
      into v_stock_items
      from (
        select item.menu_item_id, sum(item.qty)::integer as qty
        from jsonb_to_recordset(v_conversation.cart) as item(menu_item_id uuid, qty integer)
        group by item.menu_item_id
      ) as quantities;
    if jsonb_array_length(public.decrement_stock(v_stock_items)->'failed') > 0 then
      raise exception using errcode = 'PCA01', message = 'Insufficient stock for checkout';
    end if;
  end if;

  insert into public.orders (
    id, restaurant_id, conversation_id, checkout_preview_id, branch_id,
    customer_name, customer_phone, delivery_address, items, subtotal, total,
    payment_method, status, scheduled_for, notes, meta
  ) values (
    v_order_id, _restaurant_id, _conversation_id, _preview_id, v_branch_id,
    v_conversation.customer_name, v_conversation.delivery->>'phone',
    v_conversation.delivery->>'address', v_conversation.cart, v_total, v_total,
    v_conversation.delivery->>'payment_method',
    (case when _scheduled_for is null then 'pending' else 'scheduled' end)::public.order_status,
    _scheduled_for, case when _scheduled_label is not null then 'مجدول: ' || _scheduled_label end,
    jsonb_strip_nulls(jsonb_build_object(
      'customer_location', v_location,
      'eta_minutes', _eta_minutes,
      'confirmed_at', case when _scheduled_for is null then now() end
    ))
  );
  if not found then
    raise exception 'Checkout did not create an order';
  end if;

  update public.conversations
    set state = 'submitted', cart = '[]'::jsonb, delivery = '{}'::jsonb,
        meta = v_conversation.meta
          || jsonb_build_object('pending_confirmation', null, 'last_order_id', v_order_id)
    where id = _conversation_id and restaurant_id = _restaurant_id;
  if not found then
    raise exception 'Checkout did not close the cart';
  end if;

  return jsonb_build_object('outcome', 'committed', 'order_id', v_order_id, 'total', v_total);
exception when sqlstate 'PCA01' then
  -- Roll back quota consumption and any partially decremented stock as well.
  return jsonb_build_object('outcome', 'items_unavailable');
end;
$$;

revoke all on function public.commit_agent_checkout(uuid, uuid, uuid, uuid, jsonb, timestamptz, text, integer)
  from public, anon, authenticated;
grant execute on function public.commit_agent_checkout(uuid, uuid, uuid, uuid, jsonb, timestamptz, text, integer)
  to service_role;
