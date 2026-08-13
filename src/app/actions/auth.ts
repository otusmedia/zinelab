"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/tenancy";

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "").trim();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const q = next ? `&next=${encodeURIComponent(next)}` : "";
    redirect(`/signup?error=${encodeURIComponent(error.message)}${q}`);
  }

  // If email confirmation is enabled, there is no session yet.
  if (!data.session) {
    redirect(
      `/login?message=${encodeURIComponent(
        "Conta criada. Confirme o email (ou desative confirmação no Supabase) e entre.",
      )}&next=${encodeURIComponent(next || "/onboarding")}`,
    );
  }

  redirect(next && next.startsWith("/") ? next : "/onboarding");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "").trim();
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const q = next ? `&next=${encodeURIComponent(next)}` : "";
    redirect(`/login?error=${encodeURIComponent(error.message)}${q}`);
  }

  redirect(next && next.startsWith("/") ? next : "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createOrganizationAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/onboarding?error=${encodeURIComponent("Nome obrigatório")}`);
  }

  const slugBase = slugify(name) || "empresa";
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_slug: slug,
  });

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  const org = Array.isArray(data) ? data[0] : data;
  if (org?.id) {
    const cookieStore = await cookies();
    cookieStore.set(ORG_COOKIE, org.id, { path: "/", sameSite: "lax" });
  }

  redirect("/dashboard");
}
