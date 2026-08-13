-- Runnable isolation checks (pgTAP-style comments; execute sections manually).
-- Goal: Org A never sees Org B; secrets never readable by authenticated.

/*
Setup (service role / postgres):
1. Create two auth.users (or use existing test users).
2. Substitute user_a / user_b UUIDs below.
3. Apply migrations + seed.
4. Run the DO block in isolation.sql for fixtures OR insert orgs manually.
5. As authenticated user_a (JWT sub = user_a):

   select count(*) from public.products where organization_id = '<org_b>';
   -- expect 0

   select count(*) from public.customers where organization_id = '<org_b>';
   -- expect 0

   select count(*) from public.orders where organization_id = '<org_b>';
   -- expect 0

   select * from public.channel_connection_secrets;
   -- expect permission denied or 0 rows (no policy + revoked grants)

6. Repeat mirrored checks as user_b against org_a.
*/
