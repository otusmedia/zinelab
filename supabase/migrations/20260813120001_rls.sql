-- RLS helpers in private schema (not exposed via PostgREST RPC)
-- + policies on public tables

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to postgres;
grant usage on schema private to service_role;
-- authenticated needs USAGE so RLS policy expressions can resolve the functions
grant usage on schema private to authenticated;

create or replace function private.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function private.is_org_role(p_org_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

-- Restrict EXECUTE: not granted to anon; authenticated can use only via RLS eval
revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.is_org_member(uuid) from anon;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.is_org_member(uuid) to service_role;
grant execute on function private.is_org_member(uuid) to postgres;

revoke all on function private.is_org_role(uuid, text[]) from public;
revoke all on function private.is_org_role(uuid, text[]) from anon;
grant execute on function private.is_org_role(uuid, text[]) to authenticated;
grant execute on function private.is_org_role(uuid, text[]) to service_role;
grant execute on function private.is_org_role(uuid, text[]) to postgres;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.sales_channels enable row level security;
alter table public.channel_connections enable row level security;
alter table public.channel_connection_secrets enable row level security;
alter table public.channel_listings enable row level security;
alter table public.sync_jobs enable row level security;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create policy organizations_select on public.organizations
  for select using (private.is_org_member(id));

create policy organizations_update on public.organizations
  for update
  using (private.is_org_role(id, array['owner', 'admin']))
  with check (private.is_org_role(id, array['owner', 'admin']));

-- Inserts go through public.create_organization() (security definer)

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------

create policy organization_members_select on public.organization_members
  for select using (private.is_org_member(organization_id));

create policy organization_members_insert on public.organization_members
  for insert with check (private.is_org_role(organization_id, array['owner', 'admin']));

create policy organization_members_update on public.organization_members
  for update
  using (private.is_org_role(organization_id, array['owner', 'admin']))
  with check (private.is_org_role(organization_id, array['owner', 'admin']));

create policy organization_members_delete on public.organization_members
  for delete using (private.is_org_role(organization_id, array['owner', 'admin']));

-- stores
create policy stores_select on public.stores
  for select using (private.is_org_member(organization_id));
create policy stores_insert on public.stores
  for insert with check (private.is_org_member(organization_id));
create policy stores_update on public.stores
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy stores_delete on public.stores
  for delete using (private.is_org_role(organization_id, array['owner', 'admin']));

-- products
create policy products_select on public.products
  for select using (private.is_org_member(organization_id));
create policy products_insert on public.products
  for insert with check (private.is_org_member(organization_id));
create policy products_update on public.products
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy products_delete on public.products
  for delete using (private.is_org_member(organization_id));

-- product_variants
create policy product_variants_select on public.product_variants
  for select using (private.is_org_member(organization_id));
create policy product_variants_insert on public.product_variants
  for insert with check (private.is_org_member(organization_id));
create policy product_variants_update on public.product_variants
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy product_variants_delete on public.product_variants
  for delete using (private.is_org_member(organization_id));

-- product_images
create policy product_images_select on public.product_images
  for select using (private.is_org_member(organization_id));
create policy product_images_insert on public.product_images
  for insert with check (private.is_org_member(organization_id));
create policy product_images_update on public.product_images
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy product_images_delete on public.product_images
  for delete using (private.is_org_member(organization_id));

-- inventory
create policy inventory_select on public.inventory
  for select using (private.is_org_member(organization_id));
create policy inventory_insert on public.inventory
  for insert with check (private.is_org_member(organization_id));
create policy inventory_update on public.inventory
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy inventory_delete on public.inventory
  for delete using (private.is_org_member(organization_id));

-- inventory_movements
create policy inventory_movements_select on public.inventory_movements
  for select using (private.is_org_member(organization_id));
create policy inventory_movements_insert on public.inventory_movements
  for insert with check (private.is_org_member(organization_id));
create policy inventory_movements_delete on public.inventory_movements
  for delete using (private.is_org_role(organization_id, array['owner', 'admin']));

-- customers
create policy customers_select on public.customers
  for select using (private.is_org_member(organization_id));
create policy customers_insert on public.customers
  for insert with check (private.is_org_member(organization_id));
create policy customers_update on public.customers
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy customers_delete on public.customers
  for delete using (private.is_org_member(organization_id));

-- orders
create policy orders_select on public.orders
  for select using (private.is_org_member(organization_id));
create policy orders_insert on public.orders
  for insert with check (private.is_org_member(organization_id));
create policy orders_update on public.orders
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy orders_delete on public.orders
  for delete using (private.is_org_role(organization_id, array['owner', 'admin']));

-- order_items
create policy order_items_select on public.order_items
  for select using (private.is_org_member(organization_id));
create policy order_items_insert on public.order_items
  for insert with check (private.is_org_member(organization_id));
create policy order_items_update on public.order_items
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy order_items_delete on public.order_items
  for delete using (private.is_org_role(organization_id, array['owner', 'admin']));

-- sales_channels: global catalog
create policy sales_channels_select on public.sales_channels
  for select to authenticated using (true);

-- channel_connections (metadata only; tokens live in channel_connection_secrets)
create policy channel_connections_select on public.channel_connections
  for select using (private.is_org_member(organization_id));
create policy channel_connections_insert on public.channel_connections
  for insert with check (private.is_org_member(organization_id));
create policy channel_connections_update on public.channel_connections
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy channel_connections_delete on public.channel_connections
  for delete using (private.is_org_role(organization_id, array['owner', 'admin']));

-- Secrets: RLS on + no policies for authenticated/anon + revoke grants
revoke all on table public.channel_connection_secrets from public;
revoke all on table public.channel_connection_secrets from anon;
revoke all on table public.channel_connection_secrets from authenticated;
grant all on table public.channel_connection_secrets to service_role;
grant all on table public.channel_connection_secrets to postgres;

-- channel_listings
create policy channel_listings_select on public.channel_listings
  for select using (private.is_org_member(organization_id));
create policy channel_listings_insert on public.channel_listings
  for insert with check (private.is_org_member(organization_id));
create policy channel_listings_update on public.channel_listings
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy channel_listings_delete on public.channel_listings
  for delete using (private.is_org_member(organization_id));

-- sync_jobs
create policy sync_jobs_select on public.sync_jobs
  for select using (private.is_org_member(organization_id));
create policy sync_jobs_insert on public.sync_jobs
  for insert with check (private.is_org_member(organization_id));
create policy sync_jobs_update on public.sync_jobs
  for update using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy sync_jobs_delete on public.sync_jobs
  for delete using (private.is_org_role(organization_id, array['owner', 'admin']));
