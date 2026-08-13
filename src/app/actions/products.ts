"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { queueStockSyncForVariant } from "@/app/actions/channels";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireOrganization } from "@/lib/tenancy";

const IMAGE_BUCKET = "product-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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

export async function uploadProductImageAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const productId = String(formData.get("product_id") ?? "");
  const files = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);

  const fail = (message: string) => {
    redirect(`/products/${productId}?error=${encodeURIComponent(message)}`);
  };

  if (!productId) fail("Produto inválido");
  if (files.length === 0) fail("Selecione pelo menos uma imagem");
  if (files.length > 12) fail("Envie no máximo 12 imagens por vez");

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!product) fail("Produto não encontrado");

  const { count } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  let position = count ?? 0;
  const admin = createServiceClient();
  const uploadedPaths: string[] = [];
  let uploaded = 0;

  try {
    for (const image of files) {
      if (!ALLOWED_TYPES.has(image.type)) {
        throw new Error(`Tipo inválido em ${image.name}. Use JPG, PNG, WEBP ou GIF.`);
      }
      if (image.size > MAX_IMAGE_BYTES) {
        throw new Error(`${image.name} é maior que 5MB`);
      }

      const ext =
        image.type === "image/png"
          ? "png"
          : image.type === "image/webp"
            ? "webp"
            : image.type === "image/gif"
              ? "gif"
              : "jpg";
      const objectPath = `${organization.id}/${productId}/${crypto.randomUUID()}.${ext}`;
      const bytes = Buffer.from(await image.arrayBuffer());
      const { error: uploadError } = await admin.storage
        .from(IMAGE_BUCKET)
        .upload(objectPath, bytes, {
          contentType: image.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(
          `Upload falhou (${image.name}): ${uploadError.message}. Aplique a migration do bucket product-images no Supabase.`,
        );
      }
      uploadedPaths.push(objectPath);

      const { data: publicData } = admin.storage
        .from(IMAGE_BUCKET)
        .getPublicUrl(objectPath);

      const { error: insertError } = await supabase.from("product_images").insert({
        organization_id: organization.id,
        product_id: productId,
        storage_path: publicData.publicUrl,
        position,
        alt: image.name.slice(0, 120) || null,
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      position += 1;
      uploaded += 1;
    }
  } catch (err) {
    if (uploadedPaths.length) {
      await admin.storage.from(IMAGE_BUCKET).remove(uploadedPaths);
    }
    fail(err instanceof Error ? err.message : "Falha no upload");
  }

  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}?image=${uploaded}`);
}

export async function deleteProductImageAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const productId = String(formData.get("product_id") ?? "");
  const imageId = String(formData.get("image_id") ?? "");

  const { data: image } = await supabase
    .from("product_images")
    .select("*")
    .eq("id", imageId)
    .eq("organization_id", organization.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (!image) {
    redirect(`/products/${productId}?error=${encodeURIComponent("Imagem não encontrada")}`);
  }

  const admin = createServiceClient();
  const path = image.storage_path as string;
  // Public URL → extract object path after /product-images/
  const marker = `/${IMAGE_BUCKET}/`;
  const idx = path.indexOf(marker);
  if (idx >= 0) {
    const objectPath = decodeURIComponent(path.slice(idx + marker.length));
    await admin.storage.from(IMAGE_BUCKET).remove([objectPath]);
  } else if (!path.startsWith("http")) {
    const objectPath = path.startsWith(`${IMAGE_BUCKET}/`)
      ? path.slice(IMAGE_BUCKET.length + 1)
      : path;
    await admin.storage.from(IMAGE_BUCKET).remove([objectPath]);
  }

  await supabase.from("product_images").delete().eq("id", imageId);

  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}
