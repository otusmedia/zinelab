"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrganization, ORG_COOKIE } from "@/lib/tenancy";
import { createClient } from "@/lib/supabase/server";

export async function createInviteAction(formData: FormData) {
  const { supabase, organization, role } = await requireOrganization();

  if (role !== "owner" && role !== "admin") {
    redirect(`/team?error=${encodeURIComponent("Só owner/admin pode convidar")}`);
  }

  const inviteRole = String(formData.get("role") ?? "member");

  const { data, error } = await supabase.rpc("create_organization_invite_for_org", {
    p_organization_id: organization.id,
    p_role: inviteRole,
  });

  if (error) {
    redirect(`/team?error=${encodeURIComponent(error.message)}`);
  }

  const invite = Array.isArray(data) ? data[0] : data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/join/${invite.token}`;

  revalidatePath("/team");
  redirect(`/team?link=${encodeURIComponent(link)}`);
}

export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  }

  const { data, error } = await supabase.rpc("accept_organization_invite", {
    p_token: token,
  });

  if (error) {
    redirect(`/join/${token}?error=${encodeURIComponent(error.message)}`);
  }

  const org = Array.isArray(data) ? data[0] : data;
  if (org?.id) {
    const cookieStore = await cookies();
    cookieStore.set(ORG_COOKIE, org.id, { path: "/", sameSite: "lax" });
  }

  redirect("/dashboard");
}
