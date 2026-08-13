import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization, Store } from "@/lib/types";

export const ORG_COOKIE = "zine_org_id";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function getMemberships() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organization_id, organizations(*)")
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  return { supabase, user, memberships: data ?? [] };
}

export async function requireOrganization(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string };
  organization: Organization;
  store: Store;
  role: string;
}> {
  const { supabase, user, memberships } = await getMemberships();

  if (!memberships.length) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ORG_COOKIE)?.value;
  const membership =
    memberships.find((m) => m.organization_id === preferred) ?? memberships[0];

  const organization = membership.organizations as unknown as Organization;

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("is_default", true)
    .single();

  if (storeError || !store) {
    throw new Error(storeError?.message ?? "Default store not found");
  }

  return {
    supabase,
    user,
    organization,
    store: store as Store,
    role: membership.role,
  };
}
