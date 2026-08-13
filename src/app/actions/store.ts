"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireOrganization } from "@/lib/tenancy";

export async function ensureOwnStoreConnection(organizationId: string) {
  const admin = createServiceClient();
  const { data: channel } = await admin
    .from("sales_channels")
    .select("id")
    .eq("code", "own_store")
    .single();

  if (!channel) {
    throw new Error("Canal own_store não seedado");
  }

  const { data: existing } = await admin
    .from("channel_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("sales_channel_id", channel.id)
    .maybeSingle();

  if (existing) {
    if (existing.status !== "connected") {
      await admin
        .from("channel_connections")
        .update({
          status: "connected",
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
    return existing.id as string;
  }

  const { data: created, error } = await admin
    .from("channel_connections")
    .insert({
      organization_id: organizationId,
      sales_channel_id: channel.id,
      external_account_id: `store:${organizationId}`,
      status: "connected",
      connected_at: new Date().toISOString(),
      metadata: { activated: true },
    })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "Falha ao ativar loja");
  }
  return created.id as string;
}

export async function activateOwnStoreAction(_formData?: FormData) {
  const { organization } = await requireOrganization();
  await ensureOwnStoreConnection(organization.id);
  revalidatePath("/store");
  revalidatePath("/products");
  redirect("/store?activated=1");
}

async function upsertOwnStoreListing(params: {
  supabase: Awaited<ReturnType<typeof requireOrganization>>["supabase"];
  organizationId: string;
  organizationSlug: string;
  connectionId: string;
  productId: string;
  variantId: string;
}) {
  const permalink = `/s/${params.organizationSlug}/p/${params.productId}`;
  const externalId = `store:${params.variantId}`;

  const { data: existing } = await params.supabase
    .from("channel_listings")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("channel_connection_id", params.connectionId)
    .eq("product_variant_id", params.variantId)
    .maybeSingle();

  if (existing) {
    const { error } = await params.supabase
      .from("channel_listings")
      .update({
        status: "published",
        external_id: externalId,
        last_error: null,
        last_sync_at: new Date().toISOString(),
        metadata: {
          permalink,
          channel: "own_store",
          published_listing_type_id: "store",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return "updated" as const;
  }

  const { error } = await params.supabase.from("channel_listings").insert({
    organization_id: params.organizationId,
    channel_connection_id: params.connectionId,
    product_id: params.productId,
    product_variant_id: params.variantId,
    external_id: externalId,
    status: "published",
    last_sync_at: new Date().toISOString(),
    metadata: {
      permalink,
      channel: "own_store",
      published_listing_type_id: "store",
    },
  });
  if (error) throw new Error(error.message);
  return "created" as const;
}

export async function publishOwnStoreAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const productId = String(formData.get("product_id") ?? "");
  const variantId = String(formData.get("product_variant_id") ?? "");

  if (!productId || !variantId) {
    redirect(`/products/${productId}?error=${encodeURIComponent("Produto/variante inválidos")}`);
  }

  const connectionId = await ensureOwnStoreConnection(organization.id);

  const { data: variant } = await supabase
    .from("product_variants")
    .select("id, price, name, sku, product_id")
    .eq("id", variantId)
    .eq("organization_id", organization.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (!variant) {
    redirect(`/products/${productId}?error=${encodeURIComponent("Variante não encontrada")}`);
  }

  try {
    await upsertOwnStoreListing({
      supabase,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      connectionId,
      productId,
      variantId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao publicar";
    redirect(`/products/${productId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/store");
  revalidatePath(`/s/${organization.slug}`);
  redirect(`/products/${productId}?store_published=1`);
}

/** Publish every active product/variant into the own-store channel. */
export async function publishAllOwnStoreAction(_formData?: FormData) {
  const { supabase, organization } = await requireOrganization();
  const connectionId = await ensureOwnStoreConnection(organization.id);

  const { data: variants, error } = await supabase
    .from("product_variants")
    .select("id, product_id, products!inner(id, status)")
    .eq("organization_id", organization.id)
    .eq("status", "active")
    .eq("products.status", "active");

  if (error) {
    redirect(`/store?error=${encodeURIComponent(error.message)}`);
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const row of variants ?? []) {
    try {
      const result = await upsertOwnStoreListing({
        supabase,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        connectionId,
        productId: row.product_id,
        variantId: row.id,
      });
      if (result === "created") created += 1;
      else updated += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/store");
  revalidatePath("/products");
  revalidatePath(`/s/${organization.slug}`);
  redirect(
    `/store?bulk=1&created=${created}&updated=${updated}&failed=${failed}`,
  );
}

export async function unpublishOwnStoreAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const listingId = String(formData.get("listing_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");

  await supabase
    .from("channel_listings")
    .update({
      status: "paused",
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId)
    .eq("organization_id", organization.id);

  revalidatePath("/store");
  if (productId) revalidatePath(`/products/${productId}`);
  revalidatePath(`/s/${organization.slug}`);
  redirect(productId ? `/products/${productId}?store_paused=1` : "/store");
}

export async function checkoutStoreOrderAction(formData: FormData) {
  const admin = createServiceClient();
  const slug = String(formData.get("slug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const itemsRaw = String(formData.get("items") ?? "[]");

  const toCheckoutError = (message: string) =>
    `/s/${slug}/checkout?error=${encodeURIComponent(message)}`;

  if (!slug || !name) redirect(toCheckoutError("Informe seu nome"));

  let items: Array<{ variantId: string; quantity: number }> = [];
  try {
    items = JSON.parse(itemsRaw) as Array<{
      variantId: string;
      quantity: number;
    }>;
  } catch {
    redirect(toCheckoutError("Carrinho inválido"));
  }
  if (!items.length) redirect(toCheckoutError("Carrinho vazio"));

  const { data: orgData } = await admin
    .from("organizations")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!orgData) redirect(toCheckoutError("Loja não encontrada"));
  const organizationId = orgData.id as string;

  const connectionId = await ensureOwnStoreConnection(organizationId);

  const { data: storeData } = await admin
    .from("stores")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .maybeSingle();
  if (!storeData) redirect(toCheckoutError("Store da loja não encontrada"));
  const storeId = storeData.id as string;

  const lineRows: Array<{
    variantId: string;
    quantity: number;
    sku: string;
    productName: string;
    variantName: string | null;
    unitPrice: number;
  }> = [];

  for (const item of items) {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 0));
    if (!item.variantId || qty < 1) continue;

    const { data: listing } = await admin
      .from("channel_listings")
      .select(
        "id, product_id, product_variants(id, sku, name, price), products(name)",
      )
      .eq("organization_id", organizationId)
      .eq("channel_connection_id", connectionId)
      .eq("product_variant_id", item.variantId)
      .eq("status", "published")
      .maybeSingle();

    if (!listing) {
      redirect(toCheckoutError("Um item do carrinho não está mais à venda"));
    }

    const variantRaw = listing.product_variants as unknown;
    const variant = (
      Array.isArray(variantRaw) ? variantRaw[0] : variantRaw
    ) as {
      id: string;
      sku: string;
      name: string | null;
      price: number;
    } | null;
    const productRaw = listing.products as unknown;
    const product = (
      Array.isArray(productRaw) ? productRaw[0] : productRaw
    ) as { name: string } | null;

    if (!variant) redirect(toCheckoutError("Variante inválida"));

    const { data: inv } = await admin
      .from("inventory")
      .select("id, quantity, reserved")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .eq("product_variant_id", variant.id)
      .maybeSingle();

    const available = Math.max(
      0,
      Number(inv?.quantity ?? 0) - Number(inv?.reserved ?? 0),
    );
    if (available < qty) {
      redirect(
        toCheckoutError(
          `Estoque insuficiente para ${product?.name ?? variant.sku}`,
        ),
      );
    }

    lineRows.push({
      variantId: variant.id,
      quantity: qty,
      sku: variant.sku,
      productName: product?.name ?? "Produto",
      variantName: variant.name,
      unitPrice: Number(variant.price),
    });
  }

  if (!lineRows.length) redirect(toCheckoutError("Carrinho vazio"));

  const subtotal = lineRows.reduce(
    (sum, row) => sum + row.unitPrice * row.quantity,
    0,
  );

  let customerId: string | null = null;
  if (email) {
    const { data: existingCustomer } = await admin
      .from("customers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", email)
      .maybeSingle();
    if (existingCustomer) {
      customerId = existingCustomer.id;
      await admin
        .from("customers")
        .update({
          name,
          phone: phone || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingCustomer.id);
    }
  }

  if (!customerId) {
    const { data: createdCustomer, error: customerError } = await admin
      .from("customers")
      .insert({
        organization_id: organizationId,
        name,
        email: email || null,
        phone: phone || null,
        external_ids: { own_store: "checkout" },
      })
      .select("id")
      .single();
    if (customerError || !createdCustomer) {
      redirect(
        toCheckoutError(customerError?.message ?? "Falha ao salvar cliente"),
      );
    }
    customerId = createdCustomer.id;
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      organization_id: organizationId,
      store_id: storeId,
      customer_id: customerId,
      channel_connection_id: connectionId,
      external_order_id: `STORE-${Date.now()}`,
      status: "paid",
      subtotal,
      discount_total: 0,
      shipping_total: 0,
      tax_total: 0,
      total: subtotal,
      currency: "BRL",
      placed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderError || !order) {
    redirect(toCheckoutError(orderError?.message ?? "Falha ao criar pedido"));
  }

  for (const row of lineRows) {
    await admin.from("order_items").insert({
      organization_id: organizationId,
      order_id: order.id,
      product_variant_id: row.variantId,
      sku: row.sku,
      product_name: row.productName,
      variant_name: row.variantName,
      quantity: row.quantity,
      unit_price: row.unitPrice,
      discount_amount: 0,
      total: row.unitPrice * row.quantity,
    });

    const { data: inv } = await admin
      .from("inventory")
      .select("id, quantity")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .eq("product_variant_id", row.variantId)
      .maybeSingle();

    if (inv) {
      const nextQty = Math.max(0, inv.quantity - row.quantity);
      await admin
        .from("inventory")
        .update({ quantity: nextQty, updated_at: new Date().toISOString() })
        .eq("id", inv.id);
      await admin.from("inventory_movements").insert({
        organization_id: organizationId,
        store_id: storeId,
        product_variant_id: row.variantId,
        type: "sale",
        quantity: -row.quantity,
        reason: "Pedido loja própria",
        reference_type: "order",
        reference_id: order.id,
      });
    }
  }

  redirect(`/s/${slug}/checkout/success?order=${order.id}`);
}
