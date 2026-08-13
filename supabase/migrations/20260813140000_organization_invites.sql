-- Team invites: share a link so partners join the same organization

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organization_invites_token_unique unique (token)
);

create index organization_invites_org_idx on public.organization_invites (organization_id);

alter table public.organization_invites enable row level security;

create policy organization_invites_select on public.organization_invites
  for select using (private.is_org_member(organization_id));

create policy organization_invites_insert on public.organization_invites
  for insert with check (private.is_org_role(organization_id, array['owner', 'admin']));

create policy organization_invites_delete on public.organization_invites
  for delete using (private.is_org_role(organization_id, array['owner', 'admin']));

-- Create invite (owner/admin only)
create or replace function public.create_organization_invite(p_role text default 'member')
returns public.organization_invites
language plpgsql
security definer
set search_path = public
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

  -- Prefer cookie org if multiple: use any owner/admin membership matching request header is hard in SQL.
  -- Callers should pass org via a dedicated overload; for V1 pick first owner/admin org.
  if v_org_id is null then
    raise exception 'Not allowed to invite';
  end if;

  insert into public.organization_invites (
    organization_id, token, role, created_by, expires_at
  ) values (
    v_org_id,
    encode(extensions.gen_random_bytes(24), 'hex'),
    v_role,
    v_user_id,
    now() + interval '7 days'
  )
  returning * into v_invite;

  return v_invite;
end;
$$;

-- Better: create invite for a specific organization
create or replace function public.create_organization_invite_for_org(
  p_organization_id uuid,
  p_role text default 'member'
)
returns public.organization_invites
language plpgsql
security definer
set search_path = public
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
    encode(extensions.gen_random_bytes(24), 'hex'),
    v_role,
    v_user_id,
    now() + interval '7 days'
  )
  returning * into v_invite;

  return v_invite;
end;
$$;

-- Accept invite: authenticated user joins the org
create or replace function public.accept_organization_invite(p_token text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.organization_invites;
  v_org public.organizations;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.organization_invites
  where token = p_token
  for update;

  if v_invite.id is null then
    raise exception 'Convite inválido';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'Convite já utilizado';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'Convite expirado';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_invite.organization_id, v_user_id, v_invite.role)
  on conflict (organization_id, user_id) do nothing;

  update public.organization_invites
  set accepted_at = now(), accepted_by = v_user_id
  where id = v_invite.id;

  select * into v_org
  from public.organizations
  where id = v_invite.organization_id;

  return v_org;
end;
$$;

revoke all on function public.create_organization_invite(text) from public;
revoke all on function public.create_organization_invite_for_org(uuid, text) from public;
revoke all on function public.accept_organization_invite(text) from public;

grant execute on function public.create_organization_invite(text) to authenticated;
grant execute on function public.create_organization_invite_for_org(uuid, text) to authenticated;
grant execute on function public.accept_organization_invite(text) to authenticated;
grant execute on function public.create_organization_invite(text) to service_role;
grant execute on function public.create_organization_invite_for_org(uuid, text) to service_role;
grant execute on function public.accept_organization_invite(text) to service_role;

-- Preview invite org name without accepting (for join page)
create or replace function public.get_invite_preview(p_token text)
returns table (
  organization_name text,
  role text,
  expires_at timestamptz,
  accepted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.name,
    i.role,
    i.expires_at,
    (i.accepted_at is not null) as accepted
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token
  limit 1;
$$;

revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to authenticated;
grant execute on function public.get_invite_preview(text) to anon;
grant execute on function public.get_invite_preview(text) to service_role;
