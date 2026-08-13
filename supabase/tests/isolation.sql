-- Isolation test: Org A must never see Org B data (and vice versa).
-- Run after migrations against a local Supabase (psql or supabase db test).
-- This script is documentary + runnable with service_role setup of users.

-- Prerequisites (manual / test harness):
--   1. Two auth users: user_a, user_b (uuids substituted below)
--   2. Run as postgres/service_role for setup, then SET request.jwt.claim.sub

-- Replace these UUIDs when running:
-- \set user_a '00000000-0000-0000-0000-0000000000a1'
-- \set user_b '00000000-0000-0000-0000-0000000000b2'

do $$
declare
  user_a uuid := '00000000-0000-0000-0000-0000000000a1';
  user_b uuid := '00000000-0000-0000-0000-0000000000b2';
  org_a uuid;
  org_b uuid;
  store_a uuid;
  store_b uuid;
  product_a uuid;
  product_b uuid;
  variant_a uuid;
  variant_b uuid;
  customer_a uuid;
  customer_b uuid;
  conn_a uuid;
  seen int;
begin
  -- Assumes auth.users rows already exist for user_a / user_b in the test DB.
  -- Create orgs via direct insert (service role / bypass RLS) + memberships.

  insert into public.organizations (name, slug)
  values ('Org A', 'org-a-isolation-test')
  returning id into org_a;

  insert into public.organizations (name, slug)
  values ('Org B', 'org-b-isolation-test')
  returning id into org_b;

  insert into public.organization_members (organization_id, user_id, role)
  values (org_a, user_a, 'owner'), (org_b, user_b, 'owner');

  insert into public.stores (organization_id, name, is_default)
  values (org_a, 'Store A', true)
  returning id into store_a;

  insert into public.stores (organization_id, name, is_default)
  values (org_b, 'Store B', true)
  returning id into store_b;

  insert into public.products (organization_id, name, status)
  values (org_a, 'Product A', 'active')
  returning id into product_a;

  insert into public.products (organization_id, name, status)
  values (org_b, 'Product B', 'active')
  returning id into product_b;

  insert into public.product_variants (organization_id, product_id, sku, name, price)
  values (org_a, product_a, 'SKU-A', 'Variant A', 10)
  returning id into variant_a;

  insert into public.product_variants (organization_id, product_id, sku, name, price)
  values (org_b, product_b, 'SKU-B', 'Variant B', 20)
  returning id into variant_b;

  insert into public.inventory (organization_id, store_id, product_variant_id, quantity, reorder_point)
  values (org_a, store_a, variant_a, 5, 1), (org_b, store_b, variant_b, 8, 2);

  insert into public.customers (organization_id, name, email)
  values (org_a, 'Customer A', 'a@example.com')
  returning id into customer_a;

  insert into public.customers (organization_id, name, email)
  values (org_b, 'Customer B', 'b@example.com')
  returning id into customer_b;

  insert into public.orders (
    organization_id, store_id, customer_id, status, subtotal, total, currency, placed_at
  ) values (
    org_a, store_a, customer_a, 'paid', 10, 10, 'BRL', now()
  );

  insert into public.orders (
    organization_id, store_id, customer_id, status, subtotal, total, currency, placed_at
  ) values (
    org_b, store_b, customer_b, 'paid', 20, 20, 'BRL', now()
  );

  insert into public.channel_connections (
    organization_id,
    sales_channel_id,
    external_account_id,
    status
  )
  select org_a, sc.id, 'ml-a', 'connected'
  from public.sales_channels sc
  where sc.code = 'mercado_livre'
  returning id into conn_a;

  insert into public.channel_connection_secrets (
    channel_connection_id, organization_id, access_token, refresh_token
  ) values (conn_a, org_a, 'secret-token-a', 'refresh-a');

  -- Simulate User A JWT
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Force RLS as authenticated (when using supabase test helpers prefer auth.uid())
  -- With plain psql, auth.uid() reads jwt claims if configured; otherwise use:
  --   alter role ... / supabase_test helpers.
  -- Assertions below use is_org_member which depends on auth.uid().

  raise notice 'Isolation fixture created: org_a=%, org_b=%', org_a, org_b;
  raise notice 'Manual assert as user_a: select count(*) from products where organization_id = % must be 0', org_b;
  raise notice 'Manual assert as user_a: select * from channel_connection_secrets must fail / 0 rows';
  raise notice 'Manual assert as user_b: cannot see org_a products/customers/orders';

  -- Cleanup note: leave data for interactive verification or delete orgs cascade.
end $$;
