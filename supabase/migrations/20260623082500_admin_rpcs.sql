-- Super-admin RPCs. Every function:
--   1) gates on is_platform_admin(auth.uid()) and RAISEs if not admin,
--   2) for mutating actions, writes to admin_audit_log via log_admin_action().
-- Read RPCs (overview/health/finance) do not log.

-- ============================================================
-- READ: platform-wide bot health, one row per restaurant (24h window).
-- Replaces the per-restaurant N calls the dashboard would otherwise make.
-- ============================================================
create or replace function public.admin_bot_health_all()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_out jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_out
  from (
    select
      r.id                                                          as restaurant_id,
      r.name                                                        as restaurant_name,
      r.is_active                                                   as is_active,
      (r.telegram_bot_token is not null)                            as bot_connected,
      coalesce(h.total_runs_24h, 0)                                 as total_runs_24h,
      coalesce(h.errors_24h, 0)                                     as errors_24h,
      coalesce(h.avg_latency_ms, 0)                                 as avg_latency_ms,
      h.last_activity_at                                            as last_activity_at
    from public.restaurants r
    left join lateral (
      select
        count(*) filter (where kind = 'run')                                            as total_runs_24h,
        count(*) filter (where error is not null)                                       as errors_24h,
        round(avg(latency_ms) filter (where kind = 'run' and latency_ms is not null))   as avg_latency_ms,
        max(created_at)                                                                 as last_activity_at
      from public.agent_logs al
      where al.restaurant_id = r.id
        and al.created_at > now() - interval '24 hours'
    ) h on true
    order by coalesce(h.errors_24h, 0) desc, r.name
  ) t;

  return v_out;
end;
$$;
grant execute on function public.admin_bot_health_all() to authenticated;

-- ============================================================
-- READ: finance summary (MRR from active subs + counts).
-- ============================================================
create or replace function public.admin_finance_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mrr numeric;
  v_active integer;
  v_suspended integer;
  v_expiring jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select coalesce(sum(p.price_iqd), 0), count(*)
    into v_mrr, v_active
  from public.restaurant_subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.status = 'active';

  select count(*) into v_suspended
  from public.restaurant_subscriptions where status = 'suspended';

  -- subs expiring within 7 days (still active)
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_expiring
  from (
    select s.restaurant_id, r.name as restaurant_name, s.period_end
    from public.restaurant_subscriptions s
    join public.restaurants r on r.id = s.restaurant_id
    where s.status = 'active'
      and s.period_end between now() and now() + interval '7 days'
    order by s.period_end asc
  ) t;

  return jsonb_build_object(
    'mrr_iqd', v_mrr,
    'active_subs', coalesce(v_active, 0),
    'suspended_subs', coalesce(v_suspended, 0),
    'expiring_soon', v_expiring
  );
end;
$$;
grant execute on function public.admin_finance_summary() to authenticated;

-- ============================================================
-- WRITE: activate / deactivate a restaurant (kill switch).
-- ============================================================
create or replace function public.admin_set_restaurant_active(
  _restaurant_id uuid,
  _active boolean,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_prev boolean;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select is_active into v_prev from public.restaurants where id = _restaurant_id;
  if v_prev is null then raise exception 'restaurant not found'; end if;

  update public.restaurants set is_active = _active where id = _restaurant_id;

  perform public.log_admin_action(
    case when _active then 'restaurant.activate' else 'restaurant.deactivate' end,
    _restaurant_id,
    jsonb_build_object('before', v_prev, 'after', _active, 'reason', _reason)
  );
end;
$$;
grant execute on function public.admin_set_restaurant_active(uuid, boolean, text) to authenticated;

-- ============================================================
-- WRITE: suspend / cancel / reactivate a subscription, audited.
-- Wraps the existing set_subscription_status (which also gates on admin),
-- adding an audit-log entry.
-- ============================================================
create or replace function public.admin_set_subscription_status(
  _restaurant_id uuid,
  _status text,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_sub_id uuid; v_prev text;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;
  if _status not in ('active','suspended','expired','cancelled') then
    raise exception 'bad status';
  end if;

  select id, status into v_sub_id, v_prev
  from public.restaurant_subscriptions
  where restaurant_id = _restaurant_id
  order by period_end desc nulls last
  limit 1;
  if v_sub_id is null then raise exception 'no subscription for restaurant'; end if;

  update public.restaurant_subscriptions
  set status = _status, updated_at = now()
  where id = v_sub_id;

  perform public.log_admin_action(
    'subscription.' || _status,
    _restaurant_id,
    jsonb_build_object('sub_id', v_sub_id, 'before', v_prev, 'after', _status, 'reason', _reason)
  );
end;
$$;
grant execute on function public.admin_set_subscription_status(uuid, text, text) to authenticated;

-- ============================================================
-- WRITE: manually adjust current-period quota usage (e.g. reset / grant).
-- Sets the used counters for the restaurant's current subscription period.
-- ============================================================
create or replace function public.admin_adjust_quota(
  _restaurant_id uuid,
  _ai_used integer,
  _orders_used integer,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_period_start timestamptz; v_prev_ai integer; v_prev_ord integer;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;
  if _ai_used < 0 or _orders_used < 0 then
    raise exception 'counters must be >= 0';
  end if;

  select period_start into v_period_start
  from public.restaurant_subscriptions
  where restaurant_id = _restaurant_id and status = 'active'
  order by period_end desc nulls last
  limit 1;
  if v_period_start is null then raise exception 'no active subscription period'; end if;

  select ai_replies_used, confirmed_orders_used into v_prev_ai, v_prev_ord
  from public.usage_counters
  where restaurant_id = _restaurant_id and period_start = v_period_start;

  insert into public.usage_counters (restaurant_id, period_start, ai_replies_used, confirmed_orders_used)
  values (_restaurant_id, v_period_start, _ai_used, _orders_used)
  on conflict (restaurant_id, period_start)
  do update set ai_replies_used = excluded.ai_replies_used,
                confirmed_orders_used = excluded.confirmed_orders_used;

  perform public.log_admin_action(
    'quota.adjust',
    _restaurant_id,
    jsonb_build_object(
      'period_start', v_period_start,
      'before', jsonb_build_object('ai', coalesce(v_prev_ai, 0), 'orders', coalesce(v_prev_ord, 0)),
      'after', jsonb_build_object('ai', _ai_used, 'orders', _orders_used),
      'reason', _reason
    )
  );
end;
$$;
grant execute on function public.admin_adjust_quota(uuid, integer, integer, text) to authenticated;
