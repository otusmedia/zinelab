-- Fix: gen_random_bytes lives in extensions schema on Supabase
create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_organization_invite(p_role text default 'member')
returns public.organization_invites
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_invite public.organization_invites;
  v_role text := coalesce(nullif(p_role, ''), 'member');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_role not in ('admin', 'member') then
    raise exception 'Invalid role';
  end if;

  select m.organization_id into v_org_id
  from public.organization_members m
  where m.user_id = v_user_id
    and m.role in ('owner', 'admin')
  order by m.created_at
  limit 1;

  if v_org_id is null then
    raise exception 'Not allowed to invite';
  end if;

  insert into public.organization_invites (
    organization_id, token, role, created_by, expires_at
  ) values (
    v_org_id,
    encode(gen_random_bytes(24), 'hex'),
    v_role,
    v_user_id,
    now() + interval '7 days'
  )
  returning * into v_invite;

  return v_invite;
end;
$$;

create or replace function public.create_organization_invite_for_org(
  p_organization_id uuid,
  p_role text default 'member'
)
returns public.organization_invites
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.organization_invites;
  v_role text := coalesce(nullif(p_role, ''), 'member');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_role not in ('admin', 'member') then
    raise exception 'Invalid role';
  end if;

  if not private.is_org_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Not allowed to invite';
  end if;

  insert into public.organization_invites (
    organization_id, token, role, created_by, expires_at
  ) values (
    p_organization_id,
    encode(gen_random_bytes(24), 'hex'),
    v_role,
    v_user_id,
    now() + interval '7 days'
  )
  returning * into v_invite;

  return v_invite;
end;
$$;
