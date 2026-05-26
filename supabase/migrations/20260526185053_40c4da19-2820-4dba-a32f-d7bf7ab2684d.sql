
-- Fix search_path on touch_updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- Lock down security definer functions
revoke execute on function public.has_role(uuid, uuid, app_role) from public, anon, authenticated;
grant execute on function public.has_role(uuid, uuid, app_role) to service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- keep service_role only; trigger runs as definer regardless
grant execute on function public.handle_new_user() to service_role;
