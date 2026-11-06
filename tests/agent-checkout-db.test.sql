-- Run against a disposable, migrated PostgreSQL database:
-- psql "$CHECKOUT_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/agent-checkout-db.test.sql
begin;
set local plpgsql.check_asserts = on;

create function pg_temp.fail_cart_close()
returns trigger language plpgsql as $$
begin
  if new.state = 'submitted' and current_setting('checkout_test.fail_cart_close', true) = 'on' then
    return null;
  end if;
  return new;
end;
$$;

create trigger test_fail_cart_close before update on public.conversations
for each row execute function pg_temp.fail_cart_close();

do $test$
declare
  v_function constant text := 'public.commit_agent_checkout(uuid, uuid, uuid, uuid, jsonb, timestamptz, text, integer)';
  v_owner uuid := gen_random_uuid();
  v_restaurant uuid := gen_random_uuid();
  v_other_restaurant uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_conversation uuid := gen_random_uuid();
  v_plan uuid := gen_random_uuid();
  v_preview uuid := gen_random_uuid();
  v_second_preview uuid := gen_random_uuid();
  v_scheduled_preview uuid := gen_random_uuid();
  v_preview_message uuid;
  v_confirmation_message uuid;
  v_cart jsonb := jsonb_build_array(jsonb_build_object('menu_item_id', v_item, 'qty', 2, 'unit_price', 3500));
  v_delivery jsonb := '{"address":"Test address","phone":"07700000000","payment_method":"cash"}';
  v_snapshot jsonb;
  v_result jsonb;
  v_first_order uuid;
  v_second_order uuid;
  v_when timestamptz := now() + interval '1 hour';
begin
  assert not has_function_privilege('anon', v_function, 'EXECUTE'), 'anonymous RPC access';
  assert not has_function_privilege('authenticated', v_function, 'EXECUTE'), 'client RPC access';
  assert has_function_privilege('service_role', v_function, 'EXECUTE'), 'missing service role RPC access';

  insert into auth.users(id, email) values (v_owner, v_owner::text || '@checkout.test');
  insert into public.restaurants(id, owner_id, name) values
    (v_restaurant, v_owner, 'Checkout test'), (v_other_restaurant, v_owner, 'Other restaurant');
  insert into public.plans(id, code, name_ar, max_confirmed_orders) values (v_plan, v_plan::text, 'Test', 2);
  insert into public.restaurant_subscriptions(restaurant_id, plan_id, period_end)
    values (v_restaurant, v_plan, now() + interval '1 day');
  insert into public.branches(id, restaurant_id, name) values (v_branch, v_restaurant, 'Main');
  insert into public.menu_items(id, restaurant_id, name, price, track_stock, stock_qty)
    values (v_item, v_restaurant, 'Test item', 3500, true, 5);
  insert into public.conversations(id, restaurant_id, channel, external_chat_id, customer_name, state, cart, delivery)
    values (v_conversation, v_restaurant, 'telegram', v_conversation::text, 'Test customer', 'confirm', v_cart, v_delivery);
  insert into public.messages(conversation_id, role, content, created_at)
    values (v_conversation, 'user', 'Test address', now() - interval '1 minute') returning id into v_preview_message;
  insert into public.messages(conversation_id, role, content, created_at)
    values (v_conversation, 'user', 'إي', now() - interval '40 seconds') returning id into v_confirmation_message;

  update public.conversations
    set meta = jsonb_build_object('branch_id', v_branch, 'pending_confirmation',
      jsonb_build_object('token', v_preview, 'after_user_message_id', v_preview_message,
        'created_at', now() - interval '30 seconds'))
    where id = v_conversation;
  v_snapshot := jsonb_build_object('cart', v_cart, 'delivery', v_delivery, 'branch_id', v_branch,
    'customer_name', 'Test customer', 'customer_location', null);

  v_result := public.commit_agent_checkout(v_restaurant, v_conversation, v_preview, v_confirmation_message,
    v_snapshot, null, null, 45);
  assert v_result->>'outcome' = 'confirmation_required', 'a message received before the preview was accepted';
  insert into public.messages(conversation_id, role, content, created_at)
    values (v_conversation, 'user', 'إي', now()) returning id into v_confirmation_message;

  v_result := public.commit_agent_checkout(v_other_restaurant, v_conversation, v_preview, v_confirmation_message,
    v_snapshot, null, null, 45);
  assert v_result->>'outcome' = 'stale_preview', 'another restaurant accepted the preview';
  v_result := public.commit_agent_checkout(v_restaurant, v_conversation, v_preview, v_preview_message,
    v_snapshot, null, null, 45);
  assert v_result->>'outcome' = 'confirmation_required', 'same-turn or superseded message accepted';
  v_result := public.commit_agent_checkout(v_restaurant, v_conversation, v_preview, v_confirmation_message,
    jsonb_set(v_snapshot, '{delivery,address}', '"Stale address"'), null, null, 45);
  assert v_result->>'outcome' = 'order_changed', 'changed delivery accepted';

  perform set_config('checkout_test.fail_cart_close', 'on', true);
  begin
    perform public.commit_agent_checkout(v_restaurant, v_conversation, v_preview, v_confirmation_message,
      v_snapshot, null, null, 45);
    raise exception 'checkout did not report the failed cart close';
  exception when raise_exception then
    if sqlerrm <> 'Checkout did not close the cart' then raise; end if;
  end;
  perform set_config('checkout_test.fail_cart_close', 'off', true);
  assert not exists (select 1 from public.orders where conversation_id = v_conversation), 'order survived rollback';
  assert not exists (select 1 from public.usage_events where restaurant_id = v_restaurant), 'quota event survived rollback';
  assert (select stock_qty from public.menu_items where id = v_item) = 5, 'stock survived rollback';
  assert (select cart from public.conversations where id = v_conversation) = v_cart, 'cart lost after rollback';

  update public.menu_items set stock_qty = 1 where id = v_item;
  v_result := public.commit_agent_checkout(v_restaurant, v_conversation, v_preview, v_confirmation_message,
    v_snapshot, null, null, 45);
  assert v_result->>'outcome' = 'items_unavailable', 'tracked item committed with insufficient stock';
  assert not exists (select 1 from public.orders where conversation_id = v_conversation), 'stock failure left an order';
  assert not exists (select 1 from public.usage_events where restaurant_id = v_restaurant), 'stock failure consumed quota';
  update public.menu_items set stock_qty = 5 where id = v_item;

  v_result := public.commit_agent_checkout(v_restaurant, v_conversation, v_preview, v_confirmation_message,
    v_snapshot, null, null, 45);
  assert v_result->>'outcome' = 'committed', 'first checkout did not commit';
  v_first_order := (v_result->>'order_id')::uuid;
  assert (select total from public.orders where id = v_first_order) = 7000, 'wrong total';
  assert exists (select 1 from public.conversations where id = v_conversation and state = 'submitted'
    and cart = '[]' and delivery = '{}' and meta->>'last_order_id' = v_first_order::text
    and meta->>'pending_confirmation' is null), 'successful checkout did not close the cart';
  assert (select stock_qty from public.menu_items where id = v_item) = 3, 'stock was not decremented';

  -- Start a later checkout with the exact same basket and delivery details.
  update public.conversations set state = 'confirm', cart = v_cart, delivery = v_delivery,
    meta = meta || jsonb_build_object('pending_confirmation',
      jsonb_build_object('token', v_second_preview, 'after_user_message_id', v_confirmation_message,
        'created_at', now() + interval '0.5 seconds'))
    where id = v_conversation;
  insert into public.messages(conversation_id, role, content, created_at)
    values (v_conversation, 'user', 'إي', now() + interval '1 second') returning id into v_confirmation_message;
  v_result := public.commit_agent_checkout(v_restaurant, v_conversation, v_preview, v_confirmation_message,
    null, null, null, null);
  assert v_result->>'outcome' = 'replayed' and v_result->>'order_id' = v_first_order::text, 'replay changed receipt';
  assert (select cart from public.conversations where id = v_conversation) = v_cart, 'replay cleared the new cart';
  assert (select stock_qty from public.menu_items where id = v_item) = 3, 'replay decremented stock';

  v_result := public.commit_agent_checkout(v_restaurant, v_conversation, v_second_preview, v_confirmation_message,
    v_snapshot, null, null, 45);
  assert v_result->>'outcome' = 'committed', 'fresh preview of identical basket did not commit';
  v_second_order := (v_result->>'order_id')::uuid;
  assert v_second_order <> v_first_order, 'fresh checkout reused the first receipt';
  assert (select count(*) from public.orders where conversation_id = v_conversation) = 2, 'wrong order count';
  assert (select confirmed_orders_used from public.usage_counters where restaurant_id = v_restaurant) = 2,
    'replay consumed quota or a commit skipped it';

  -- Quota denial preserves the cart. A scheduled booking still defers stock.
  update public.conversations set state = 'confirm', cart = v_cart, delivery = v_delivery,
    meta = meta || jsonb_build_object('pending_confirmation',
      jsonb_build_object('token', v_scheduled_preview, 'after_user_message_id', v_confirmation_message,
        'created_at', now() + interval '1.5 seconds'))
    where id = v_conversation;
  insert into public.messages(conversation_id, role, content, created_at)
    values (v_conversation, 'user', 'إي', now() + interval '2 seconds') returning id into v_confirmation_message;
  v_result := public.commit_agent_checkout(v_restaurant, v_conversation, v_scheduled_preview, v_confirmation_message,
    v_snapshot, null, null, 45);
  assert v_result->>'outcome' = 'quota_denied', 'quota limit was bypassed';
  assert (select cart from public.conversations where id = v_conversation) = v_cart, 'quota denial closed the cart';
  v_result := public.commit_agent_checkout(v_restaurant, v_conversation, v_scheduled_preview, v_confirmation_message,
    v_snapshot, v_when, 'بعد ساعة', null);
  assert v_result->>'outcome' = 'committed', 'scheduled checkout failed';
  assert exists (select 1 from public.orders where id = (v_result->>'order_id')::uuid
    and status = 'scheduled' and scheduled_for = v_when), 'wrong scheduled status or time';
  assert (select stock_qty from public.menu_items where id = v_item) = 1, 'booking decremented stock before dispatch';
  assert (select cart from public.conversations where id = v_conversation) = '[]', 'booking left the cart open';
end;
$test$;

rollback;
