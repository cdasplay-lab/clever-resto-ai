-- Per-conversation lock to serialize concurrent agent-run invocations.
-- Without this, two quick messages from the same customer spawn two parallel
-- agent-run calls that both load + overwrite the same cart/state (lost update).
--
-- Strategy: a TTL-based row lock. claim_conversation atomically takes the lock
-- iff it is free OR stale (older than TTL, meaning a previous run crashed).
-- The conditional UPDATE is atomic, so only one caller can win the race.

alter table public.conversations
  add column if not exists lock_token uuid,
  add column if not exists locked_at  timestamptz;

-- Try to acquire the lock. Returns true on success.
create or replace function public.claim_conversation(
  _conversation_id uuid,
  _token uuid,
  _ttl_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set lock_token = _token, locked_at = now()
  where id = _conversation_id
    and (locked_at is null or locked_at < now() - make_interval(secs => _ttl_seconds));
  return found;  -- true iff our conditional UPDATE affected the row
end;
$$;

-- Release the lock, but only if we still own it (token match).
create or replace function public.release_conversation(
  _conversation_id uuid,
  _token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set lock_token = null, locked_at = null
  where id = _conversation_id and lock_token = _token;
  return found;
end;
$$;

-- Only the service role (used by agent-run) needs these.
revoke all on function public.claim_conversation(uuid, uuid, integer) from public, authenticated;
revoke all on function public.release_conversation(uuid, uuid) from public, authenticated;
grant execute on function public.claim_conversation(uuid, uuid, integer) to service_role;
grant execute on function public.release_conversation(uuid, uuid) to service_role;
