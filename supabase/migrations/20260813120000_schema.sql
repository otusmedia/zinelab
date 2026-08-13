-- Zine Lab V1 core schema (multi-tenant)
-- products = internal truth; channel_listings = external representation

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- TENANCY
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_unique unique (slug)
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  constraint organization_members_org_user_unique unique (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_members_user_org_idx on public.organization_members (user_id, organization_id);
create index organization_members_org_id_idx on public.organization_members (organization_id);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stores_organization_id_idx on public.stores (organization_id);

-- At most one default store per organization (enforced in DB, not only in app)
create unique index stores_one_default_per_org_idx
  on public.stores (organization_id)
  where (is_default = true);

-- ---------------------------------------------------------------------------
-- CATALOG
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_organization_id_idx on public.products (organization_id);
create index products_org_status_idx on public.products (organization_id, status);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null,
  name text,
  attributes jsonb not null default '{}'::jsonb,
  price numeric(12, 2) not null default 0,
  compare_at_price numeric(12, 2),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_org_sku_unique unique (organization_id, sku)
);

create index product_variants_product_id_idx on public.product_variants (product_id);
create index product_variants_organization_id_idx on public.product_variants (organization_id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  position int not null default 0,
  alt text,
  created_at timestamptz not null default now()
);

create index product_images_product_position_idx on public.product_images (product_id, position);

-- ---------------------------------------------------------------------------
-- INVENTORY (always per store)
-- ---------------------------------------------------------------------------

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  product_variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity int not null default 0 check (quantity >= 0),
  reserved int not null default 0 check (reserved >= 0),
  reorder_point int not null default 0 check (reorder_point >= 0),
  updated_at timestamptz not null default now(),
  constraint inventory_store_variant_unique unique (store_id, product_variant_id)
);

create index inventory_organization_id_idx on public.inventory (organization_id);
create index inventory_org_reorder_idx on public.inventory (organization_id, reorder_point);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  product_variant_id uuid not null references public.product_variants (id) on delete cascade,
  type text not null check (type in ('in', 'out', 'adjust', 'sale', 'sync')),
  quantity int not null,
  reason text,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index inventory_movements_org_created_idx
  on public.inventory_movements (organization_id, created_at desc);
create index inventory_movements_variant_idx on public.inventory_movements (product_variant_id);

-- ---------------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------------

-- V1: external_ids jsonb is a temporary convenience for marketplace ids.
-- When multiple channels need queryable/deduped identities, evolve to
-- customer_external_identities (customer_id, channel_connection_id, external_id).
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_organization_id_idx on public.customers (organization_id);
create index customers_org_email_idx on public.customers (organization_id, email);

-- ---------------------------------------------------------------------------
-- CHANNELS
-- ---------------------------------------------------------------------------

create table public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  constraint sales_channels_code_unique unique (code)
);

create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sales_channel_id uuid not null references public.sales_channels (id) on delete restrict,
  external_account_id text,
  status text not null default 'disconnected'
    check (status in ('connected', 'expired', 'reauthorization_required', 'error', 'disconnected')),
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_connections_org_channel_account_unique
    unique (organization_id, sales_channel_id, external_account_id)
);

create index channel_connections_org_status_idx
  on public.channel_connections (organization_id, status);

-- OAuth tokens: NEVER exposed to authenticated/anon clients.
-- Access only via service_role (server) or privileged SECURITY DEFINER helpers.
-- Do not invent app-level crypto; rely on DB privilege boundary (+ Vault later if needed).
create table public.channel_connection_secrets (
  channel_connection_id uuid primary key
    references public.channel_connections (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  access_token text,
  refresh_token text,
  token_type text,
  expires_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.channel_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_connection_id uuid not null references public.channel_connections (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  product_variant_id uuid references public.product_variants (id) on delete set null,
  external_id text,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'publishing', 'published', 'sync_error', 'paused', 'closed')),
  title_override text,
  price_override numeric(12, 2),
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index channel_listings_connection_variant_unique
  on public.channel_listings (channel_connection_id, product_variant_id)
  where (product_variant_id is not null);

create index channel_listings_org_status_idx on public.channel_listings (organization_id, status);
create index channel_listings_external_id_idx on public.channel_listings (external_id);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_connection_id uuid references public.channel_connections (id) on delete set null,
  type text not null,
  entity_type text,
  entity_id uuid,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts int not null default 0,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index sync_jobs_org_status_created_idx
  on public.sync_jobs (organization_id, status, created_at);
create index sync_jobs_entity_idx on public.sync_jobs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- COMMERCE (orders after channels so FK to channel_connections works)
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  channel_connection_id uuid references public.channel_connections (id) on delete set null,
  external_order_id text,
  status text not null default 'pending'
    check (status in ('draft', 'pending', 'paid', 'cancelled', 'fulfilled', 'refunded')),
  subtotal numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0,
  shipping_total numeric(12, 2) not null default 0,
  tax_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  currency text not null default 'BRL',
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index orders_channel_external_unique
  on public.orders (channel_connection_id, external_order_id)
  where (channel_connection_id is not null and external_order_id is not null);

create index orders_org_placed_idx on public.orders (organization_id, placed_at desc);
create index orders_org_status_idx on public.orders (organization_id, status);

-- Snapshot fields preserve historical line data if variants are renamed/deleted
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_variant_id uuid references public.product_variants (id) on delete set null,
  sku text not null,
  product_name text not null,
  variant_name text,
  quantity int not null check (quantity > 0),
  unit_price numeric(12, 2) not null,
  discount_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  external_item_id text
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_organization_id_idx on public.order_items (organization_id);

-- ---------------------------------------------------------------------------
-- Onboarding helper: create org + owner membership + default store
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org public.organizations;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.organizations (name, slug)
  values (p_name, p_slug)
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, v_user_id, 'owner');

  insert into public.stores (organization_id, name, is_default)
  values (v_org.id, 'Loja principal', true);

  return v_org;
end;
$$;

-- Execute granted only to authenticated (needed for onboarding); not a general data RPC.
revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.create_organization(text, text) to service_role;
