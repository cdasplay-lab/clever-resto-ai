
-- Semantic search over menu_items
create or replace function public.search_menu_items(
  p_restaurant_id uuid,
  p_query vector(1536),
  p_limit int default 5
) returns table (
  id uuid, name text, description text, price numeric, category text, similarity float
)
language sql stable security definer set search_path = public as $$
  select m.id, m.name, m.description, m.price, m.category,
    1 - (m.embedding <=> p_query) as similarity
  from public.menu_items m
  where m.restaurant_id = p_restaurant_id
    and m.is_available = true
    and m.embedding is not null
  order by m.embedding <=> p_query
  limit p_limit;
$$;

revoke execute on function public.search_menu_items(uuid, vector, int) from public, anon, authenticated;
grant execute on function public.search_menu_items(uuid, vector, int) to service_role;

-- Create an API key for a restaurant (owner only). Returns the plaintext key once.
create or replace function public.create_api_key(p_restaurant_id uuid, p_label text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_hash text;
  v_prefix text;
begin
  if not exists (select 1 from public.restaurants where id = p_restaurant_id and owner_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  v_key := 'lvr_' || encode(gen_random_bytes(24), 'hex');
  v_prefix := substring(v_key from 1 for 12);
  v_hash := encode(digest(v_key, 'sha256'), 'hex');
  insert into public.api_keys (restaurant_id, key_hash, key_prefix, label)
  values (p_restaurant_id, v_hash, v_prefix, p_label);
  return v_key;
end $$;

revoke execute on function public.create_api_key(uuid, text) from public, anon;
grant execute on function public.create_api_key(uuid, text) to authenticated;

-- pgcrypto digest needs the extension; ensure it exists
create extension if not exists pgcrypto;
