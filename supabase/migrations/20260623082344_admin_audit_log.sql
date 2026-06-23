-- Super-admin audit log.
-- Every privileged admin action (suspend restaurant, cancel subscription,
-- adjust quota, activate plan) writes one row here via log_admin_action().
-- This table is the source of truth for "who did what, when".

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,                                  -- e.g. 'restaurant.deactivate', 'subscription.cancel'
  target_restaurant_id uuid references public.restaurants(id) on delete set null,
  details jsonb not null default '{}'::jsonb,             -- before/after, reason, params...
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_restaurant_idx on public.admin_audit_log (target_restaurant_id);

grant select on public.admin_audit_log to authenticated;
grant all on public.admin_audit_log to service_role;

alter table public.admin_audit_log enable row level security;

-- Only platform admins may read the audit log.
drop policy if exists "platform admins read audit log" on public.admin_audit_log;
create policy "platform admins read audit log"
  on public.admin_audit_log for select to authenticated
  using (public.is_platform_admin(auth.uid()));

-- Centralized writer. SECURITY DEFINER so it can write regardless of caller RLS,
-- but it must only ever be called from inside an admin RPC that already checked
-- is_platform_admin. It re-derives the actor from auth.uid() (never trusts a param).
create or replace function public.log_admin_action(
  _action text,
  _target_restaurant_id uuid default null,
  _details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.admin_audit_log (actor_id, actor_email, action, target_restaurant_id, details)
  values (auth.uid(), v_email, _action, _target_restaurant_id, coalesce(_details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- Not granted to authenticated directly: callable only from other SECURITY DEFINER
-- admin RPCs (same db role). This prevents clients from forging arbitrary log rows.
revoke all on function public.log_admin_action(text, uuid, jsonb) from public, authenticated;
grant execute on function public.log_admin_action(text, uuid, jsonb) to service_role;
