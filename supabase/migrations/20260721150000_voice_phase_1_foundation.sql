-- Voice ordering phase 1: tenant-safe call storage and idempotency boundaries.
-- This migration does not provision a phone number or connect OpenAI Realtime.

create table if not exists public.restaurant_voice_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,
  locale text not null default 'ar-IQ'
    check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  voice_profile text not null default 'default'
    check (char_length(voice_profile) between 1 and 80),
  greeting_text text check (greeting_text is null or char_length(greeting_text) <= 1000),
  handoff_enabled boolean not null default true,
  max_call_seconds integer not null default 600 check (max_call_seconds between 30 and 3600),
  recording_enabled boolean not null default false,
  transcript_retention_days smallint not null default 30
    check (transcript_retention_days between 0 and 365),
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null
    check (provider ~ '^[a-z0-9][a-z0-9_-]{0,49}$'),
  external_number_id text
    check (external_number_id is null or char_length(external_number_id) <= 200),
  phone_number text not null
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  sip_uri text check (sip_uri is null or char_length(sip_uri) <= 500),
  label text check (label is null or char_length(label) <= 100),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'disabled', 'failed')),
  inbound_enabled boolean not null default false,
  routing_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(routing_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_phone_numbers_id_restaurant_uq unique (id, restaurant_id)
);

create unique index if not exists restaurant_phone_numbers_number_uq
  on public.restaurant_phone_numbers(phone_number);
create unique index if not exists restaurant_phone_numbers_provider_external_uq
  on public.restaurant_phone_numbers(provider, external_number_id)
  where external_number_id is not null;
create index if not exists restaurant_phone_numbers_restaurant_idx
  on public.restaurant_phone_numbers(restaurant_id, status);

create table if not exists public.phone_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  phone_number_id uuid not null,
  provider text not null
    check (provider ~ '^[a-z0-9][a-z0-9_-]{0,49}$'),
  external_call_id text not null
    check (char_length(external_call_id) between 1 and 200),
  direction text not null default 'inbound'
    check (direction in ('inbound', 'outbound')),
  caller_number text check (caller_number is null or char_length(caller_number) <= 80),
  called_number text not null check (char_length(called_number) <= 80),
  status text not null default 'received'
    check (status in (
      'received', 'accepting', 'in_progress', 'completed',
      'rejected', 'failed', 'transferred'
    )),
  conversation_id uuid references public.conversations(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  last_event_at timestamptz not null default now(),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  input_audio_ms bigint not null default 0 check (input_audio_ms >= 0),
  output_audio_ms bigint not null default 0 check (output_audio_ms >= 0),
  estimated_cost_usd numeric(12, 6)
    check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  handoff_reason text check (handoff_reason is null or char_length(handoff_reason) <= 1000),
  failure_code text check (failure_code is null or char_length(failure_code) <= 100),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phone_calls_number_tenant_fk
    foreign key (phone_number_id, restaurant_id)
    references public.restaurant_phone_numbers(id, restaurant_id) on delete no action,
  constraint phone_calls_id_restaurant_uq unique (id, restaurant_id),
  constraint phone_calls_provider_external_uq unique (provider, external_call_id),
  constraint phone_calls_time_order_ck check (
    (answered_at is null or answered_at >= started_at) and
    (ended_at is null or ended_at >= started_at) and
    (answered_at is null or ended_at is null or ended_at >= answered_at) and
    last_event_at >= started_at
  )
);

create index if not exists phone_calls_restaurant_created_idx
  on public.phone_calls(restaurant_id, created_at desc);
create index if not exists phone_calls_active_idx
  on public.phone_calls(restaurant_id, status, last_event_at desc)
  where status in ('received', 'accepting', 'in_progress');
create index if not exists phone_calls_order_idx
  on public.phone_calls(order_id) where order_id is not null;

create table if not exists public.phone_call_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  call_id uuid not null,
  provider_event_id text
    check (provider_event_id is null or char_length(provider_event_id) <= 200),
  event_type text not null check (char_length(event_type) between 1 and 120),
  sequence_no bigint check (sequence_no is null or sequence_no >= 0),
  safe_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_payload) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint phone_call_events_call_tenant_fk
    foreign key (call_id, restaurant_id)
    references public.phone_calls(id, restaurant_id) on delete cascade
);

create unique index if not exists phone_call_events_provider_event_uq
  on public.phone_call_events(call_id, provider_event_id)
  where provider_event_id is not null;
create unique index if not exists phone_call_events_sequence_uq
  on public.phone_call_events(call_id, sequence_no)
  where sequence_no is not null;
create index if not exists phone_call_events_call_time_idx
  on public.phone_call_events(call_id, occurred_at);

create table if not exists public.phone_call_transcripts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  call_id uuid not null,
  provider_item_id text,
  role text not null check (role in ('customer', 'assistant', 'system', 'tool')),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  language text check (language is null or char_length(language) <= 35),
  ordinal integer check (ordinal is null or ordinal >= 0),
  start_ms bigint check (start_ms is null or start_ms >= 0),
  end_ms bigint check (end_ms is null or end_ms >= 0),
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  constraint phone_call_transcripts_call_tenant_fk
    foreign key (call_id, restaurant_id)
    references public.phone_calls(id, restaurant_id) on delete cascade,
  constraint phone_call_transcripts_time_order_ck
    check (start_ms is null or end_ms is null or end_ms >= start_ms)
);

create unique index if not exists phone_call_transcripts_provider_item_uq
  on public.phone_call_transcripts(call_id, provider_item_id)
  where provider_item_id is not null;
create unique index if not exists phone_call_transcripts_ordinal_uq
  on public.phone_call_transcripts(call_id, ordinal)
  where ordinal is not null;
create index if not exists phone_call_transcripts_call_created_idx
  on public.phone_call_transcripts(call_id, created_at);

create table if not exists public.phone_call_tool_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  call_id uuid not null,
  tool_call_id text not null check (char_length(tool_call_id) between 1 and 200),
  tool_name text not null check (tool_name ~ '^[A-Za-z0-9_]{1,64}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'rejected')),
  input jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input) = 'object'),
  output jsonb,
  error_code text check (error_code is null or char_length(error_code) <= 100),
  order_id uuid references public.orders(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint phone_call_tool_runs_call_tenant_fk
    foreign key (call_id, restaurant_id)
    references public.phone_calls(id, restaurant_id) on delete cascade,
  constraint phone_call_tool_runs_call_key_uq unique (call_id, idempotency_key),
  constraint phone_call_tool_runs_call_tool_id_uq unique (call_id, tool_call_id),
  constraint phone_call_tool_runs_finish_state_ck check (
    (status = 'running' and finished_at is null) or
    (status <> 'running' and finished_at is not null)
  )
);

create index if not exists phone_call_tool_runs_restaurant_started_idx
  on public.phone_call_tool_runs(restaurant_id, started_at desc);
create index if not exists phone_call_tool_runs_order_idx
  on public.phone_call_tool_runs(order_id) where order_id is not null;

comment on column public.restaurant_phone_numbers.routing_metadata is
  'Non-secret routing metadata only. Provider credentials belong in secrets/Vault.';
comment on column public.phone_call_events.safe_payload is
  'Redacted event metadata only; never persist authorization headers or raw audio.';

-- Keep direct service-role writes from accidentally crossing restaurant boundaries.
create or replace function public.enforce_phone_call_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_restaurant_id uuid;
  v_provider text;
  v_phone_number text;
begin
  select n.restaurant_id, n.provider, n.phone_number
  into v_restaurant_id, v_provider, v_phone_number
  from public.restaurant_phone_numbers n where n.id = new.phone_number_id;
  if v_restaurant_id is null or v_restaurant_id <> new.restaurant_id then
    raise exception 'phone_number_tenant_mismatch';
  end if;
  if v_provider <> new.provider or v_phone_number <> new.called_number then
    raise exception 'phone_number_route_mismatch';
  end if;
  if new.conversation_id is not null and not exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id and c.restaurant_id = new.restaurant_id
  ) then
    raise exception 'conversation_tenant_mismatch';
  end if;
  if new.order_id is not null and not exists (
    select 1 from public.orders o
    where o.id = new.order_id and o.restaurant_id = new.restaurant_id
  ) then
    raise exception 'order_tenant_mismatch';
  end if;
  return new;
end $$;
revoke all on function public.enforce_phone_call_tenant() from public, anon, authenticated;

drop trigger if exists enforce_phone_call_tenant_trigger on public.phone_calls;
create trigger enforce_phone_call_tenant_trigger
before insert or update of
  restaurant_id, phone_number_id, provider, called_number, conversation_id, order_id
on public.phone_calls for each row execute function public.enforce_phone_call_tenant();

create or replace function public.enforce_phone_tool_run_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.order_id is not null and not exists (
    select 1 from public.orders o
    where o.id = new.order_id and o.restaurant_id = new.restaurant_id
  ) then
    raise exception 'order_tenant_mismatch';
  end if;
  return new;
end $$;
revoke all on function public.enforce_phone_tool_run_tenant() from public, anon, authenticated;

drop trigger if exists enforce_phone_tool_run_tenant_trigger on public.phone_call_tool_runs;
create trigger enforce_phone_tool_run_tenant_trigger
before insert or update of restaurant_id, call_id, order_id
on public.phone_call_tool_runs for each row execute function public.enforce_phone_tool_run_tenant();

drop trigger if exists restaurant_voice_settings_touch_updated_at on public.restaurant_voice_settings;
create trigger restaurant_voice_settings_touch_updated_at
before update on public.restaurant_voice_settings
for each row execute function public.touch_updated_at();

drop trigger if exists restaurant_phone_numbers_touch_updated_at on public.restaurant_phone_numbers;
create trigger restaurant_phone_numbers_touch_updated_at
before update on public.restaurant_phone_numbers
for each row execute function public.touch_updated_at();

drop trigger if exists phone_calls_touch_updated_at on public.phone_calls;
create trigger phone_calls_touch_updated_at
before update on public.phone_calls
for each row execute function public.touch_updated_at();

-- Resolve an inbound number and claim the provider call exactly once. The
-- webhook may retry freely; an external call cannot be rebound to a tenant.
create or replace function public.register_inbound_phone_call(
  _provider text,
  _external_call_id text,
  _provider_event_id text,
  _caller_number text,
  _called_number text,
  _safe_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_number public.restaurant_phone_numbers%rowtype;
  v_call public.phone_calls%rowtype;
  v_created boolean := false;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if coalesce(_provider, '') !~ '^[a-z0-9][a-z0-9_-]{0,49}$'
     or char_length(coalesce(_external_call_id, '')) not between 1 and 200
     or char_length(coalesce(_provider_event_id, '')) > 200
     or char_length(coalesce(_caller_number, '')) > 80
     or coalesce(_called_number, '') !~ '^\+[1-9][0-9]{7,14}$'
     or jsonb_typeof(coalesce(_safe_payload, '{}'::jsonb)) <> 'object' then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_input');
  end if;

  select n.* into v_number
  from public.restaurant_phone_numbers n
  join public.restaurant_voice_settings s on s.restaurant_id = n.restaurant_id
  where n.provider = _provider
    and n.phone_number = _called_number
    and n.status = 'active'
    and n.inbound_enabled = true
    and s.enabled = true
  limit 1;

  if v_number.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'number_not_active');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(_provider || ':' || _external_call_id, 0)
  );

  select * into v_call from public.phone_calls
  where provider = _provider and external_call_id = _external_call_id
  for update;

  if v_call.id is not null then
    if v_call.restaurant_id <> v_number.restaurant_id
       or v_call.phone_number_id <> v_number.id then
      raise exception 'external_call_tenant_conflict';
    end if;
  else
    insert into public.phone_calls (
      restaurant_id, phone_number_id, provider, external_call_id,
      direction, caller_number, called_number, status
    ) values (
      v_number.restaurant_id, v_number.id, _provider, _external_call_id,
      'inbound', nullif(_caller_number, ''), _called_number, 'received'
    ) returning * into v_call;
    v_created := true;
  end if;

  if nullif(_provider_event_id, '') is not null then
    insert into public.phone_call_events (
      restaurant_id, call_id, provider_event_id, event_type, safe_payload
    ) values (
      v_call.restaurant_id, v_call.id, _provider_event_id,
      'call.received', coalesce(_safe_payload, '{}'::jsonb)
    ) on conflict do nothing;
  end if;

  update public.phone_calls set last_event_at = now() where id = v_call.id;
  return jsonb_build_object(
    'allowed', true,
    'created', v_created,
    'call_id', v_call.id,
    'restaurant_id', v_call.restaurant_id,
    'phone_number_id', v_call.phone_number_id
  );
end $$;

revoke all on function public.register_inbound_phone_call(text,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.register_inbound_phone_call(text,text,text,text,text,jsonb)
  to service_role;

-- Claim a function call before executing business logic. Repeated OpenAI or
-- network deliveries return the original run instead of executing it twice.
create or replace function public.claim_phone_tool_run(
  _call_id uuid,
  _tool_call_id text,
  _tool_name text,
  _idempotency_key text,
  _input jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_call public.phone_calls%rowtype;
  v_run public.phone_call_tool_runs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if _call_id is null
     or char_length(coalesce(_tool_call_id, '')) not between 1 and 200
     or coalesce(_tool_name, '') !~ '^[A-Za-z0-9_]{1,64}$'
     or char_length(coalesce(_idempotency_key, '')) not between 1 and 200
     or jsonb_typeof(coalesce(_input, '{}'::jsonb)) <> 'object' then
    return jsonb_build_object('claimed', false, 'reason', 'invalid_input');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(_call_id::text || ':tool-claim', 0)
  );
  select * into v_call from public.phone_calls where id = _call_id for update;
  if v_call.id is null then
    return jsonb_build_object('claimed', false, 'reason', 'call_not_found');
  end if;
  if v_call.status not in ('accepting', 'in_progress') then
    return jsonb_build_object('claimed', false, 'reason', 'call_not_active');
  end if;

  select * into v_run from public.phone_call_tool_runs
  where call_id = _call_id
    and (idempotency_key = _idempotency_key or tool_call_id = _tool_call_id)
  order by started_at asc limit 1;

  if v_run.id is not null then
    if v_run.tool_name <> _tool_name
       or v_run.idempotency_key <> _idempotency_key
       or v_run.tool_call_id <> _tool_call_id then
      return jsonb_build_object('claimed', false, 'reason', 'tool_identity_conflict');
    end if;
    return jsonb_build_object(
      'claimed', false,
      'deduplicated', true,
      'tool_run_id', v_run.id,
      'restaurant_id', v_run.restaurant_id,
      'status', v_run.status,
      'output', v_run.output
    );
  end if;

  insert into public.phone_call_tool_runs (
    restaurant_id, call_id, tool_call_id, tool_name, idempotency_key, input
  ) values (
    v_call.restaurant_id, v_call.id, _tool_call_id, _tool_name,
    _idempotency_key, coalesce(_input, '{}'::jsonb)
  ) returning * into v_run;

  return jsonb_build_object(
    'claimed', true,
    'tool_run_id', v_run.id,
    'restaurant_id', v_run.restaurant_id,
    'status', v_run.status
  );
end $$;

revoke all on function public.claim_phone_tool_run(uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_phone_tool_run(uuid,text,text,text,jsonb)
  to service_role;

create or replace function public.complete_phone_tool_run(
  _tool_run_id uuid,
  _status text,
  _output jsonb default null,
  _error_code text default null,
  _order_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_run public.phone_call_tool_runs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if _status not in ('succeeded', 'failed', 'rejected') then
    return jsonb_build_object('completed', false, 'reason', 'invalid_status');
  end if;

  select * into v_run from public.phone_call_tool_runs
  where id = _tool_run_id for update;
  if v_run.id is null then
    return jsonb_build_object('completed', false, 'reason', 'tool_run_not_found');
  end if;
  if v_run.status <> 'running' then
    return jsonb_build_object(
      'completed', false,
      'deduplicated', true,
      'status', v_run.status,
      'output', v_run.output
    );
  end if;
  if _order_id is not null and not exists (
    select 1 from public.orders o
    where o.id = _order_id and o.restaurant_id = v_run.restaurant_id
  ) then
    return jsonb_build_object('completed', false, 'reason', 'order_tenant_mismatch');
  end if;

  update public.phone_call_tool_runs set
    status = _status,
    output = _output,
    error_code = nullif(_error_code, ''),
    order_id = _order_id,
    finished_at = now()
  where id = v_run.id;

  return jsonb_build_object('completed', true, 'status', _status);
end $$;

revoke all on function public.complete_phone_tool_run(uuid,text,jsonb,text,uuid)
  from public, anon, authenticated;
grant execute on function public.complete_phone_tool_run(uuid,text,jsonb,text,uuid)
  to service_role;

alter table public.restaurant_voice_settings enable row level security;
alter table public.restaurant_phone_numbers enable row level security;
alter table public.phone_calls enable row level security;
alter table public.phone_call_events enable row level security;
alter table public.phone_call_transcripts enable row level security;
alter table public.phone_call_tool_runs enable row level security;

revoke all on public.restaurant_voice_settings, public.restaurant_phone_numbers,
  public.phone_calls, public.phone_call_events, public.phone_call_transcripts,
  public.phone_call_tool_runs from anon, authenticated;
grant select on public.restaurant_voice_settings, public.restaurant_phone_numbers,
  public.phone_calls, public.phone_call_events, public.phone_call_transcripts,
  public.phone_call_tool_runs to authenticated;
grant insert (
  restaurant_id, enabled, locale, voice_profile, greeting_text, handoff_enabled,
  max_call_seconds, recording_enabled, transcript_retention_days, settings
) on public.restaurant_voice_settings to authenticated;
grant update (
  enabled, locale, voice_profile, greeting_text, handoff_enabled,
  max_call_seconds, recording_enabled, transcript_retention_days, settings
) on public.restaurant_voice_settings to authenticated;
grant all on public.restaurant_voice_settings, public.restaurant_phone_numbers,
  public.phone_calls, public.phone_call_events, public.phone_call_transcripts,
  public.phone_call_tool_runs to service_role;

drop policy if exists "owners read own voice settings" on public.restaurant_voice_settings;
create policy "owners read own voice settings"
on public.restaurant_voice_settings for select to authenticated
using (
  public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.restaurants r
    where r.id = restaurant_voice_settings.restaurant_id and r.owner_id = auth.uid()
  )
);

drop policy if exists "owners create own voice settings" on public.restaurant_voice_settings;
create policy "owners create own voice settings"
on public.restaurant_voice_settings for insert to authenticated
with check (
  public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.restaurants r
    where r.id = restaurant_voice_settings.restaurant_id and r.owner_id = auth.uid()
  )
);

drop policy if exists "owners update own voice settings" on public.restaurant_voice_settings;
create policy "owners update own voice settings"
on public.restaurant_voice_settings for update to authenticated
using (
  public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.restaurants r
    where r.id = restaurant_voice_settings.restaurant_id and r.owner_id = auth.uid()
  )
)
with check (
  public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.restaurants r
    where r.id = restaurant_voice_settings.restaurant_id and r.owner_id = auth.uid()
  )
);

drop policy if exists "owners read own phone numbers" on public.restaurant_phone_numbers;
create policy "owners read own phone numbers"
on public.restaurant_phone_numbers for select to authenticated
using (
  public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.restaurants r
    where r.id = restaurant_phone_numbers.restaurant_id and r.owner_id = auth.uid()
  )
);

drop policy if exists "owners read own phone calls" on public.phone_calls;
create policy "owners read own phone calls"
on public.phone_calls for select to authenticated
using (
  public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.restaurants r
    where r.id = phone_calls.restaurant_id and r.owner_id = auth.uid()
  )
);

drop policy if exists "owners read own phone call events" on public.phone_call_events;
create policy "owners read own phone call events"
on public.phone_call_events for select to authenticated
using (
  public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.restaurants r
    where r.id = phone_call_events.restaurant_id and r.owner_id = auth.uid()
  )
);

drop policy if exists "owners read own phone transcripts" on public.phone_call_transcripts;
create policy "owners read own phone transcripts"
on public.phone_call_transcripts for select to authenticated
using (
  public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.restaurants r
    where r.id = phone_call_transcripts.restaurant_id and r.owner_id = auth.uid()
  )
);

drop policy if exists "owners read own phone tool runs" on public.phone_call_tool_runs;
create policy "owners read own phone tool runs"
on public.phone_call_tool_runs for select to authenticated
using (
  public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.restaurants r
    where r.id = phone_call_tool_runs.restaurant_id and r.owner_id = auth.uid()
  )
);
