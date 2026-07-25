-- Subscription, quota and service monitoring hardening.
-- Safe to apply after the existing plans/subscriptions migrations.

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid references public.restaurant_subscriptions(id) on delete set null,
  amount_iqd numeric not null check (amount_iqd >= 0),
  method text not null default 'cash',
  reference text,
  status text not null default 'paid' check (status in ('paid','pending','failed','refunded')),
  notes text,
  recorded_by uuid,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists subscription_payments_reference_uq
  on public.subscription_payments(reference) where reference is not null;
create index if not exists subscription_payments_restaurant_idx
  on public.subscription_payments(restaurant_id, paid_at desc);

create table if not exists public.service_heartbeats (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  status text not null default 'ok' check (status in ('ok','degraded','down')),
  details jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now()
);
create unique index if not exists service_heartbeats_service_restaurant_uq
  on public.service_heartbeats(service, coalesce(restaurant_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  alert_key text not null,
  severity text not null check (severity in ('info','warning','critical')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz
);
create unique index if not exists monitoring_alerts_open_key_uq
  on public.monitoring_alerts(coalesce(restaurant_id, '00000000-0000-0000-0000-000000000000'::uuid), alert_key)
  where status in ('open','acknowledged');
create index if not exists monitoring_alerts_status_idx on public.monitoring_alerts(status, severity, last_seen_at desc);

alter table public.subscription_payments enable row level security;
alter table public.service_heartbeats enable row level security;
alter table public.monitoring_alerts enable row level security;
grant select on public.subscription_payments, public.service_heartbeats, public.monitoring_alerts to authenticated;
grant all on public.subscription_payments, public.service_heartbeats, public.monitoring_alerts to service_role;

drop policy if exists "owners read own payments" on public.subscription_payments;
create policy "owners read own payments" on public.subscription_payments for select to authenticated
using (public.is_platform_admin(auth.uid()) or exists (
  select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()
));
drop policy if exists "owners read own heartbeats" on public.service_heartbeats;
create policy "owners read own heartbeats" on public.service_heartbeats for select to authenticated
using (public.is_platform_admin(auth.uid()) or exists (
  select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()
));
drop policy if exists "owners read own alerts" on public.monitoring_alerts;
create policy "owners read own alerts" on public.monitoring_alerts for select to authenticated
using (public.is_platform_admin(auth.uid()) or exists (
  select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()
));

-- One charge per logical reference. NULL references remain chargeable.
create unique index if not exists usage_events_dedupe_ref_uq
  on public.usage_events(restaurant_id, kind, ref_id) where ref_id is not null;

create or replace function public.consume_quota(_restaurant_id uuid, _kind text, _ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sub record; v_limit integer; v_used integer; v_existing boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if _kind not in ('ai_reply','confirmed_order') then
    return jsonb_build_object('allowed',false,'reason','unknown_kind');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(_restaurant_id::text || ':' || _kind || ':' || coalesce(_ref, gen_random_uuid()::text), 0));
  if _ref is not null then
    select exists(select 1 from public.usage_events where restaurant_id=_restaurant_id and kind=_kind and ref_id=_ref) into v_existing;
    if v_existing then return jsonb_build_object('allowed',true,'deduplicated',true); end if;
  end if;
  select s.*, p.max_ai_replies, p.max_confirmed_orders into v_sub
  from public.restaurant_subscriptions s join public.plans p on p.id=s.plan_id
  where s.restaurant_id=_restaurant_id and s.status in ('active','trialing')
    and s.period_start <= now() and s.period_end > now()
  order by s.period_start desc limit 1;
  if v_sub.id is null then return jsonb_build_object('allowed',false,'reason','no_active_subscription'); end if;
  insert into public.usage_counters(restaurant_id,period_start) values(_restaurant_id,v_sub.period_start)
  on conflict (restaurant_id,period_start) do nothing;
  if _kind='ai_reply' then
    v_limit:=v_sub.max_ai_replies;
    update public.usage_counters set ai_replies_used=ai_replies_used+1,updated_at=now()
      where restaurant_id=_restaurant_id and period_start=v_sub.period_start returning ai_replies_used into v_used;
  else
    v_limit:=v_sub.max_confirmed_orders;
    update public.usage_counters set confirmed_orders_used=confirmed_orders_used+1,updated_at=now()
      where restaurant_id=_restaurant_id and period_start=v_sub.period_start returning confirmed_orders_used into v_used;
  end if;
  if v_used > v_limit then
    if _kind='ai_reply' then update public.usage_counters set ai_replies_used=ai_replies_used-1 where restaurant_id=_restaurant_id and period_start=v_sub.period_start;
    else update public.usage_counters set confirmed_orders_used=confirmed_orders_used-1 where restaurant_id=_restaurant_id and period_start=v_sub.period_start; end if;
    return jsonb_build_object('allowed',false,'reason',case when _kind='ai_reply' then 'ai_reply_limit' else 'order_limit' end,'used',v_used-1,'limit',v_limit);
  end if;
  insert into public.usage_events(restaurant_id,kind,ref_id) values(_restaurant_id,_kind,_ref);
  return jsonb_build_object('allowed',true,'used',v_used,'limit',v_limit);
exception when unique_violation then
  return jsonb_build_object('allowed',true,'deduplicated',true);
end $$;
revoke all on function public.consume_quota(uuid,text,text) from public, anon, authenticated;
grant execute on function public.consume_quota(uuid,text,text) to service_role;

create or replace function public.record_service_heartbeat(_service text, _restaurant_id uuid default null, _status text default 'ok', _details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select id into v_id from public.service_heartbeats where service=_service and restaurant_id is not distinct from _restaurant_id limit 1;
  if v_id is null then
    insert into public.service_heartbeats(service,restaurant_id,status,details,last_seen_at)
    values(_service,_restaurant_id,_status,coalesce(_details,'{}'::jsonb),now());
  else
    update public.service_heartbeats set status=_status,details=coalesce(_details,'{}'::jsonb),last_seen_at=now() where id=v_id;
  end if;
end $$;
revoke all on function public.record_service_heartbeat(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_service_heartbeat(text,uuid,text,jsonb) to service_role;

create or replace function public.upsert_monitoring_alert(_restaurant_id uuid,_key text,_severity text,_title text,_details jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select id into v_id from public.monitoring_alerts
   where restaurant_id is not distinct from _restaurant_id and alert_key=_key and status in ('open','acknowledged') limit 1;
  if v_id is null then
    insert into public.monitoring_alerts(restaurant_id,alert_key,severity,title,details)
    values(_restaurant_id,_key,_severity,_title,coalesce(_details,'{}'::jsonb)) returning id into v_id;
  else
    update public.monitoring_alerts set severity=_severity,title=_title,details=coalesce(_details,'{}'::jsonb),last_seen_at=now() where id=v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.upsert_monitoring_alert(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.upsert_monitoring_alert(uuid,text,text,text,jsonb) to service_role;

create or replace function public.run_monitoring_sweep()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_count integer:=0; r record;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  for r in
    select restaurant_id, count(*) filter(where error is not null)::int errors, count(*)::int runs
    from public.agent_logs where created_at > now()-interval '30 minutes' and kind='run'
    group by restaurant_id having count(*) >= 5 and count(*) filter(where error is not null)::numeric/count(*) >= .2
  loop perform public.upsert_monitoring_alert(r.restaurant_id,'agent_error_rate','critical','ارتفاع أخطاء الوكيل',jsonb_build_object('errors',r.errors,'runs',r.runs)); v_count:=v_count+1; end loop;
  for r in select restaurant_id,count(*)::int total from public.orders where status='scheduled' and scheduled_for < now()-interval '10 minutes' group by restaurant_id
  loop perform public.upsert_monitoring_alert(r.restaurant_id,'overdue_scheduled_orders','critical','طلبات مجدولة متأخرة',jsonb_build_object('count',r.total)); v_count:=v_count+1; end loop;
  for r in select restaurant_id,count(*)::int total from public.complaints where status in ('open','pending') and created_at < now()-interval '30 minutes' group by restaurant_id
  loop perform public.upsert_monitoring_alert(r.restaurant_id,'complaint_backlog','warning','شكاوى تنتظر المتابعة',jsonb_build_object('count',r.total)); v_count:=v_count+1; end loop;
  for r in select restaurant_id,period_end from public.restaurant_subscriptions where status in ('active','trialing') and period_end between now() and now()+interval '3 days'
  loop perform public.upsert_monitoring_alert(r.restaurant_id,'subscription_expiring','warning','الاشتراك أو التجربة قارب على الانتهاء',jsonb_build_object('period_end',r.period_end)); v_count:=v_count+1; end loop;
  update public.monitoring_alerts a set status='resolved',resolved_at=now()
   where status in ('open','acknowledged') and last_seen_at < now()-interval '15 minutes';
  return jsonb_build_object('ok',true,'alerts_seen',v_count,'ran_at',now());
end $$;
revoke all on function public.run_monitoring_sweep() from public,anon,authenticated;
grant execute on function public.run_monitoring_sweep() to service_role;

create or replace function public.admin_acknowledge_monitoring_alert(_alert_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'not authorized'; end if;
  update public.monitoring_alerts set status='acknowledged',acknowledged_at=now(),acknowledged_by=auth.uid() where id=_alert_id and status='open';
  perform public.log_admin_action('monitoring.alert.acknowledge',null,jsonb_build_object('alert_id',_alert_id));
end $$;
grant execute on function public.admin_acknowledge_monitoring_alert(uuid) to authenticated;

create or replace function public.admin_activate_subscription(
  _restaurant_id uuid,_plan_code text,_months integer default 1,_status text default 'active',
  _payment_method text default 'cash',_payment_reference text default null,_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_plan public.plans%rowtype; v_sub uuid; v_start timestamptz:=now();
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'not authorized'; end if;
  if _status not in ('active','trialing') then raise exception 'bad status'; end if;
  if coalesce(_months,0)<1 or _months>24 then raise exception 'bad months'; end if;
  select * into v_plan from public.plans where code=_plan_code and is_active=true;
  if v_plan.id is null then raise exception 'plan not found'; end if;
  update public.restaurant_subscriptions set status='expired',updated_at=now()
   where restaurant_id=_restaurant_id and status in ('active','trialing');
  insert into public.restaurant_subscriptions(restaurant_id,plan_id,status,period_start,period_end,activated_by,notes)
  values(_restaurant_id,v_plan.id,_status,v_start,v_start+(_months||' months')::interval,auth.uid(),_notes) returning id into v_sub;
  insert into public.usage_counters(restaurant_id,period_start) values(_restaurant_id,v_start) on conflict do nothing;
  if _status='active' then
    insert into public.subscription_payments(restaurant_id,subscription_id,amount_iqd,method,reference,notes,recorded_by)
    values(_restaurant_id,v_sub,v_plan.price_iqd*_months,_payment_method,_payment_reference,_notes,auth.uid());
  end if;
  perform public.log_admin_action('subscription.activate',_restaurant_id,jsonb_build_object('subscription_id',v_sub,'plan',_plan_code,'months',_months,'status',_status,'payment_reference',_payment_reference));
  return v_sub;
end $$;
grant execute on function public.admin_activate_subscription(uuid,text,integer,text,text,text,text) to authenticated;

-- Enforce the plan at the database boundary. The first active branch is allowed
-- for onboarding; additional branches require an active/trial subscription.
create or replace function public.enforce_branch_limit() returns trigger language plpgsql security definer set search_path=public as $$
declare v_count integer; v_max integer;
begin
  if not new.is_active then return new; end if;
  select count(*) into v_count from public.branches where restaurant_id=new.restaurant_id and is_active and id<>new.id;
  if v_count=0 then return new; end if;
  select p.max_branches into v_max from public.restaurant_subscriptions s join public.plans p on p.id=s.plan_id
   where s.restaurant_id=new.restaurant_id and s.status in ('active','trialing') and s.period_end>now() order by s.period_start desc limit 1;
  if v_max is null then raise exception 'active subscription required for additional branches'; end if;
  if v_count+1>v_max then raise exception 'branch limit exceeded (% of %)',v_count+1,v_max; end if;
  return new;
end $$;
drop trigger if exists enforce_branch_limit_trigger on public.branches;
create trigger enforce_branch_limit_trigger before insert or update of is_active,restaurant_id on public.branches
for each row execute function public.enforce_branch_limit();

-- Atomic order cancellation/restock. Locks the order and stock rows so retries
-- cannot restore stock twice.
create or replace function public.transition_order_status(_order_id uuid,_from text[],_to text,_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; item jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service role required'; end if;
  select * into v_order from public.orders where id=_order_id for update;
  if v_order.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if not (v_order.status::text=any(_from)) then return jsonb_build_object('ok',false,'reason','status_changed','status',v_order.status); end if;
  update public.orders set status=_to::public.order_status,notes=coalesce(_notes,notes) where id=_order_id;
  if _to='cancelled' and v_order.status::text='pending' then
    for item in select * from jsonb_array_elements(coalesce(v_order.items,'[]'::jsonb)) loop
      update public.menu_items set stock_qty=coalesce(stock_qty,0)+greatest(0,coalesce((item->>'qty')::integer,0))
       where id=(item->>'menu_item_id')::uuid and track_stock=true;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'previous_status',v_order.status,'status',_to);
end $$;
revoke all on function public.transition_order_status(uuid,text[],text,text) from public,anon,authenticated;
grant execute on function public.transition_order_status(uuid,text[],text,text) to service_role;
