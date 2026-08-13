import { createServiceClient } from "@/lib/supabase/admin";

export type StorefrontOrg = {
  id: string;
  name: string;
  slug: string;
};

export type StorefrontProduct = {
  productId: string;
  variantId: string;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  sku: string;
  variantName: string | null;
  imageUrl: string | null;
  quantity: number;
  listingId: string;
  permalink: string;
};

export async function getStorefrontOrgBySlug(slug: string) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();
  return data as StorefrontOrg | null;
}

export async function getOwnStoreConnection(organizationId: string) {
  const admin = createServiceClient();
  const { data: channel } = await admin
    .from("sales_channels")
    .select("id")
    .eq("code", "own_store")
    .single();
  if (!channel) return null;

  const { data: connection } = await admin
    .from("channel_connections")
    .select("id, status, metadata")
    .eq("organization_id", organizationId)
    .eq("sales_channel_id", channel.id)
    .maybeSingle();

  return connection
    ? { ...connection, sales_channel_id: channel.id }
    : null;
}

export async function listPublishedStoreProducts(
  organizationId: string,
  storeSlug: string,
): Promise<StorefrontProduct[]> {
  const admin = createServiceClient();
  const connection = await getOwnStoreConnection(organizationId);
  if (!connection || connection.status !== "connected") return [];

  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .maybeSingle();

  const { data: listings } = await admin
    .from("channel_listings")
    .select(
      "id, product_id, product_variant_id, metadata, products(id, name, description, status), product_variants(id, sku, name, price, compare_at_price, status)",
    )
    .eq("organization_id", organizationId)
    .eq("channel_connection_id", connection.id)
    .eq("status", "published");

  const rows: StorefrontProduct[] = [];

  for (const listing of listings ?? []) {
    const product = (
      Array.isArray(listing.products) ? listing.products[0] : listing.products
    ) as {
      id: string;
      name: string;
      description: string | null;
      status: string;
    } | null;
    const variant = (
      Array.isArray(listing.product_variants)
        ? listing.product_variants[0]
        : listing.product_variants
    ) as {
      id: string;
      sku: string;
      name: string | null;
      price: number;
      compare_at_price: number | null;
      status: string;
    } | null;

    if (!product || !variant || product.status !== "active") continue;
    if (variant.status !== "active") continue;

    let quantity = 0;
    if (store?.id) {
      const { data: inv } = await admin
        .from("inventory")
        .select("quantity, reserved")
        .eq("store_id", store.id)
        .eq("product_variant_id", variant.id)
        .maybeSingle();
      quantity = Math.max(0, Number(inv?.quantity ?? 0) - Number(inv?.reserved ?? 0));
    }

    const { data: images } = await admin
      .from("product_images")
      .select("storage_path")
      .eq("product_id", product.id)
      .order("position", { ascending: true })
      .limit(1);

    const meta = listing.metadata as { permalink?: string } | null;

    rows.push({
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      description: product.description,
      price: Number(variant.price),
      compareAtPrice: variant.compare_at_price
        ? Number(variant.compare_at_price)
        : null,
      sku: variant.sku,
      variantName: variant.name,
      imageUrl: images?.[0]?.storage_path ?? null,
      quantity,
      listingId: listing.id,
      permalink:
        meta?.permalink ?? `/s/${storeSlug}/p/${product.id}`,
    });
  }

  return rows;
}

export async function getPublishedStoreProduct(
  organizationId: string,
  storeSlug: string,
  productId: string,
) {
  const products = await listPublishedStoreProducts(organizationId, storeSlug);
  const match = products.find((p) => p.productId === productId);
  if (!match) return null;

  const admin = createServiceClient();
  const { data: images } = await admin
    .from("product_images")
    .select("storage_path, alt")
    .eq("product_id", productId)
    .order("position", { ascending: true });

  return {
    ...match,
    images: (images ?? []).map((img) => ({
      url: img.storage_path,
      alt: img.alt,
    })),
  };
}
