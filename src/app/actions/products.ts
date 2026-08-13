"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { queueStockSyncForVariant } from "@/app/actions/channels";
import { requireOrganization } from "@/lib/tenancy";

export async function createProductAction(formData: FormData) {
  const { supabase, organization, store } = await requireOrganization();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const variantName = String(formData.get("variant_name") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const quantity = Number(formData.get("quantity") ?? 0);
  const reorderPoint = Number(formData.get("reorder_point") ?? 0);

  if (!name || !sku) {
    throw new Error("Nome e SKU são obrigatórios");
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      organization_id: organization.id,
      name,
      description: description || null,
      status: "active",
    })
    .select("*")
    .single();

  if (productError || !product) {
    throw new Error(productError?.message ?? "Falha ao criar produto");
  }

  const { data: variant, error: variantError } = await supabase
    .from("product_variants")
    .insert({
      organization_id: organization.id,
      product_id: product.id,
      sku,
      name: variantName || "Padrão",
      price,
      status: "active",
    })
    .select("*")
    .single();

  if (variantError || !variant) {
    throw new Error(variantError?.message ?? "Falha ao criar variante");
  }

  const { error: inventoryError } = await supabase.from("inventory").insert({
    organization_id: organization.id,
    store_id: store.id,
    product_variant_id: variant.id,
    quantity,
    reserved: 0,
    reorder_point: reorderPoint,
  });

  if (inventoryError) {
    throw new Error(inventoryError.message);
  }

  if (quantity > 0) {
    await supabase.from("inventory_movements").insert({
      organization_id: organization.id,
      store_id: store.id,
      product_variant_id: variant.id,
      type: "in",
      quantity,
      reason: "Estoque inicial",
    });
  }

  revalidatePath("/products");
  revalidatePath("/inventory");
  redirect(`/products/${product.id}`);
}

export async function updateInventoryAction(formData: FormData) {
  const { supabase, organization, store, user } = await requireOrganization();
  const inventoryId = String(formData.get("inventory_id") ?? "");
  const newQty = Number(formData.get("quantity") ?? 0);
  const reorderPoint = Number(formData.get("reorder_point") ?? 0);

  const { data: current, error } = await supabase
    .from("inventory")
    .select("*")
    .eq("id", inventoryId)
    .eq("organization_id", organization.id)
    .single();

  if (error || !current) {
    throw new Error(error?.message ?? "Estoque não encontrado");
  }

  const delta = newQty - current.quantity;

  const { error: updateError } = await supabase
    .from("inventory")
    .update({
      quantity: newQty,
      reorder_point: reorderPoint,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inventoryId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (delta !== 0) {
    await supabase.from("inventory_movements").insert({
      organization_id: organization.id,
      store_id: store.id,
      product_variant_id: current.product_variant_id,
      type: "adjust",
      quantity: delta,
      reason: "Ajuste manual",
      created_by: user.id,
    });

    await queueStockSyncForVariant({
      organizationId: organization.id,
      productVariantId: current.product_variant_id,
    });
  }

  revalidatePath("/inventory");
  revalidatePath("/channels");
}
