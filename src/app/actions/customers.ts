"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/tenancy";

export async function createCustomerAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) throw new Error("Nome obrigatório");

  const { error } = await supabase.from("customers").insert({
    organization_id: organization.id,
    name,
    email: email || null,
    phone: phone || null,
    external_ids: {},
  });

  if (error) throw new Error(error.message);

  revalidatePath("/customers");
}
