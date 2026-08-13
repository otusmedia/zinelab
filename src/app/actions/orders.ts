"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/tenancy";

export async function createOrderAction(formData: FormData) {
  const { supabase, organization, store } = await requireOrganization();

  const customerId = String(formData.get("customer_id") ?? "") || null;
  const variantId = String(formData.get("product_variant_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);

  const { data: variant, error: variantError } = await supabase
    .from("product_variants")
    .select("*, products(name)")
    .eq("id", variantId)
    .eq("organization_id", organization.id)
    .single();

  if (variantError || !variant) {
    throw new Error(variantError?.message ?? "Variante não encontrada");
  }

  const unit = Number(variant.price);
  const lineTotal = unit * quantity;
  const productName =
    (variant.products as unknown as { name: string } | null)?.name ?? "Produto";

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      organization_id: organization.id,
      store_id: store.id,
      customer_id: customerId,
      status: "paid",
      subtotal: lineTotal,
      discount_total: 0,
      shipping_total: 0,
      tax_total: 0,
      total: lineTotal,
      currency: "BRL",
      placed_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? "Falha ao criar pedido");
  }

  const { error: itemError } = await supabase.from("order_items").insert({
    organization_id: organization.id,
    order_id: order.id,
    product_variant_id: variant.id,
    sku: variant.sku,
    product_name: productName,
    variant_name: variant.name,
    quantity,
    unit_price: unit,
    discount_amount: 0,
    total: lineTotal,
  });

  if (itemError) {
    throw new Error(itemError.message);
  }

  const { data: inv } = await supabase
    .from("inventory")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("store_id", store.id)
    .eq("product_variant_id", variant.id)
    .maybeSingle();

  if (inv) {
    const nextQty = Math.max(0, inv.quantity - quantity);
    await supabase
      .from("inventory")
      .update({ quantity: nextQty, updated_at: new Date().toISOString() })
      .eq("id", inv.id);

    await supabase.from("inventory_movements").insert({
      organization_id: organization.id,
      store_id: store.id,
      product_variant_id: variant.id,
      type: "sale",
      quantity: -quantity,
      reason: "Pedido manual",
      reference_type: "order",
      reference_id: order.id,
    });
  }

  revalidatePath("/orders");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}
