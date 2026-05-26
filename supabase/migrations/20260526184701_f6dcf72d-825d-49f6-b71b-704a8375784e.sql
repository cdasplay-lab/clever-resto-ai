
-- Extensions
create extension if not exists vector;
create extension if not exists pgcrypto;

-- Enum for app roles
create type public.app_role as enum ('admin', 'owner', 'staff');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "users read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Restaurants
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  language text not null default 'ar',
  tone text not null default 'ودود ومحترف',
  currency text not null default 'IQD',
  delivery_areas jsonb not null default '[]'::jsonb,
  min_order numeric not null default 0,
  open_hours jsonb not null default '{}'::jsonb,
  platform_webhook_url text,
  platform_webhook_secret text,
  telegram_bot_username text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.restaurants to authenticated;
grant all on public.restaurants to service_role;
alter table public.restaurants enable row level security;
create policy "owners manage own restaurants" on public.restaurants for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- User roles per restaurant
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  role app_role not null,
  unique (user_id, restaurant_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "users read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _restaurant_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and restaurant_id = _restaurant_id and role = _role)
$$;

-- Menu items
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  category text,
  price numeric not null,
  is_available boolean not null default true,
  image_url text,
  options jsonb not null default '[]'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_restaurant_idx on public.menu_items(restaurant_id);
create index menu_items_embedding_idx on public.menu_items using hnsw (embedding vector_cosine_ops);
grant select, insert, update, delete on public.menu_items to authenticated;
grant all on public.menu_items to service_role;
alter table public.menu_items enable row level security;
create policy "owners manage own menu" on public.menu_items for all to authenticated
  using (exists (select 1 from public.restaurants r where r.id = menu_items.restaurant_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.restaurants r where r.id = menu_items.restaurant_id and r.owner_id = auth.uid()));

-- Conversations
create type public.conversation_state as enum ('greeting','collecting_items','address','confirm','submitted','handoff','closed');
create type public.channel_type as enum ('telegram','instagram','facebook','tiktok','web');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  channel channel_type not null,
  external_chat_id text not null,
  customer_handle text,
  customer_name text,
  state conversation_state not null default 'greeting',
  cart jsonb not null default '[]'::jsonb,
  delivery jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (restaurant_id, channel, external_chat_id)
);
create index conversations_restaurant_idx on public.conversations(restaurant_id);
grant select, insert, update, delete on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "owners read own conversations" on public.conversations for select to authenticated
  using (exists (select 1 from public.restaurants r where r.id = conversations.restaurant_id and r.owner_id = auth.uid()));

-- Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text,
  tool_calls jsonb,
  tool_call_id text,
  name text,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages(conversation_id, created_at);
grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "owners read own messages" on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c join public.restaurants r on r.id = c.restaurant_id
    where c.id = messages.conversation_id and r.owner_id = auth.uid()
  ));

-- Orders
create type public.order_status as enum ('pending','confirmed','preparing','out_for_delivery','completed','cancelled');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  external_order_id text,
  customer_name text,
  customer_phone text,
  delivery_address text,
  items jsonb not null,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  notes text,
  status order_status not null default 'pending',
  dispatched_at timestamptz,
  dispatch_attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index orders_restaurant_idx on public.orders(restaurant_id, created_at desc);
grant select, insert, update on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "owners manage own orders" on public.orders for all to authenticated
  using (exists (select 1 from public.restaurants r where r.id = orders.restaurant_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.restaurants r where r.id = orders.restaurant_id and r.owner_id = auth.uid()));

-- Agent logs
create table public.agent_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  step int not null default 0,
  kind text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index agent_logs_conv_idx on public.agent_logs(conversation_id, created_at);
grant select on public.agent_logs to authenticated;
grant all on public.agent_logs to service_role;
alter table public.agent_logs enable row level security;
create policy "owners read own logs" on public.agent_logs for select to authenticated
  using (exists (select 1 from public.restaurants r where r.id = agent_logs.restaurant_id and r.owner_id = auth.uid()));

-- API keys for platform integration
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  key_hash text not null unique,
  key_prefix text not null,
  label text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.api_keys to authenticated;
grant all on public.api_keys to service_role;
alter table public.api_keys enable row level security;
create policy "owners manage own api keys" on public.api_keys for all to authenticated
  using (exists (select 1 from public.restaurants r where r.id = api_keys.restaurant_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.restaurants r where r.id = api_keys.restaurant_id and r.owner_id = auth.uid()));

-- Profile autocreate trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger helper
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger restaurants_touch before update on public.restaurants for each row execute function public.touch_updated_at();
create trigger menu_items_touch before update on public.menu_items for each row execute function public.touch_updated_at();
