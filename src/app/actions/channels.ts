"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireOrganization } from "@/lib/tenancy";
import { resolveMercadoLivrePictureUrls } from "@/lib/ml/pictures";
import { getValidAccessToken } from "@/lib/ml/token";
import {
  ML_PKCE_COOKIE,
  activateMercadoLivreItem,
  buildMercadoLivreAuthUrl,
  changeMercadoLivreListingType,
  createPkcePair,
  fetchMercadoLivreItem,
  getMercadoLivreOrder,
  mapMercadoLivreOrderStatus,
  pauseMercadoLivreItem,
  publishMercadoLivreItem,
  searchMercadoLivreOrders,
  updateMercadoLivreItem,
  type MercadoLivreOrder,
} from "@/lib/ml/client";

export async function startMercadoLivreOAuth(_formData?: FormData) {
  if (!process.env.ML_APP_ID || !process.env.ML_CLIENT_SECRET) {
    redirect(
      `/integrations?error=${encodeURIComponent(
        "Mercado Livre ainda não configurado. Defina ML_APP_ID e ML_CLIENT_SECRET na Vercel (e o redirect URI no app do ML).",
      )}`,
    );
  }

  const { organization } = await requireOrganization();
  const { codeVerifier, codeChallenge } = createPkcePair();

  const cookieStore = await cookies();
  cookieStore.set(ML_PKCE_COOKIE, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  const state = Buffer.from(
    JSON.stringify({
      organizationId: organization.id,
      nonce: crypto.randomUUID(),
    }),
  ).toString("base64url");

  redirect(buildMercadoLivreAuthUrl(state, codeChallenge));
}

export async function disconnectMercadoLivreAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const connectionId = String(formData.get("channel_connection_id") ?? "");
  const admin = createServiceClient();

  const { data: connection } = await supabase
    .from("channel_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!connection) {
    redirect(`/integrations?error=${encodeURIComponent("Conexão não encontrada")}`);
  }

  await admin
    .from("channel_connection_secrets")
    .delete()
    .eq("channel_connection_id", connectionId);

  await admin
    .from("channel_connections")
    .update({
      status: "disconnected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  revalidatePath("/integrations");
  redirect("/integrations?disconnected=1");
}

export async function importMercadoLivreOrdersAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const connectionId = String(formData.get("channel_connection_id") ?? "");

  const { data: connection } = await supabase
    .from("channel_connections")
    .select("id, status")
    .eq("id", connectionId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!connection || connection.status !== "connected") {
    redirect(
      `/integrations?error=${encodeURIComponent("Conexão ML inválida ou desconectada")}`,
    );
  }

  const { data: job, error } = await supabase
    .from("sync_jobs")
    .insert({
      organization_id: organization.id,
      channel_connection_id: connectionId,
      type: "import_orders",
      entity_type: "channel_connection",
      entity_id: connectionId,
      status: "queued",
      payload: { days: 30 },
    })
    .select("*")
    .single();

  if (error || !job) {
    redirect(
      `/integrations?error=${encodeURIComponent(error?.message ?? "Falha ao criar job")}`,
    );
  }

  await processSyncJob(job.id);
  revalidatePath("/integrations");
  revalidatePath("/orders");
  revalidatePath("/channels");
  redirect("/orders?imported=1");
}

export async function retrySyncJobAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const jobId = String(formData.get("job_id") ?? "");

  const { data: old } = await supabase
    .from("sync_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!old) {
    redirect(`/channels?error=${encodeURIComponent("Job não encontrado")}`);
  }

  const { data: job, error } = await supabase
    .from("sync_jobs")
    .insert({
      organization_id: organization.id,
      channel_connection_id: old.channel_connection_id,
      type: old.type,
      entity_type: old.entity_type,
      entity_id: old.entity_id,
      status: "queued",
      payload: old.payload ?? {},
    })
    .select("*")
    .single();

  if (error || !job) {
    redirect(
      `/channels?error=${encodeURIComponent(error?.message ?? "Falha ao recriar job")}`,
    );
  }

  await processSyncJob(job.id);
  revalidatePath("/channels");
  redirect("/channels?retried=1");
}

export async function pauseListingAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const listingId = String(formData.get("listing_id") ?? "");

  const { data: listing } = await supabase
    .from("channel_listings")
    .select("*")
    .eq("id", listingId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!listing?.external_id) {
    redirect(`/channels?error=${encodeURIComponent("Listing sem MLB")}`);
  }

  const accessToken = await getValidAccessToken(listing.channel_connection_id);
  const paused = await pauseMercadoLivreItem({
    accessToken,
    itemId: listing.external_id,
  });
  if (!paused.ok) {
    redirect(`/channels?error=${encodeURIComponent(paused.error)}`);
  }

  await supabase
    .from("channel_listings")
    .update({
      status: "paused",
      metadata: {
        ...(typeof listing.metadata === "object" && listing.metadata
          ? listing.metadata
          : {}),
        ml_status: "paused",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", listing.id);

  revalidatePath("/channels");
  redirect("/channels?paused=1");
}

export async function queuePublishListingAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const productId = String(formData.get("product_id") ?? "");
  const variantId = String(formData.get("product_variant_id") ?? "");
  const connectionId = String(formData.get("channel_connection_id") ?? "");
  const listingTypeRaw = String(formData.get("listing_type_id") ?? "gold_special");
  const listingTypeId =
    listingTypeRaw === "gold_pro" ? "gold_pro" : "gold_special";

  const fail = (message: string) => {
    redirect(`/products/${productId}?error=${encodeURIComponent(message)}`);
  };

  const { data: existing } = await supabase
    .from("channel_listings")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("channel_connection_id", connectionId)
    .eq("product_variant_id", variantId)
    .maybeSingle();

  let listing = existing;

  if (listing) {
    const { data: updated, error: updateError } = await supabase
      .from("channel_listings")
      .update({
        status: "pending",
        last_error: null,
        metadata: {
          ...(typeof listing.metadata === "object" && listing.metadata
            ? listing.metadata
            : {}),
          listing_type_id: listingTypeId,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", listing.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      fail(updateError?.message ?? "Falha ao atualizar listing");
    }
    listing = updated;
  } else {
    const { data: created, error: listingError } = await supabase
      .from("channel_listings")
      .insert({
        organization_id: organization.id,
        channel_connection_id: connectionId,
        product_id: productId,
        product_variant_id: variantId,
        status: "pending",
        metadata: { listing_type_id: listingTypeId },
      })
      .select("*")
      .single();

    if (listingError || !created) {
      fail(listingError?.message ?? "Falha ao criar listing");
    }
    listing = created;
  }

  if (!listing) {
    fail("Listing inválido");
  }

  const { data: job, error: jobError } = await supabase
    .from("sync_jobs")
    .insert({
      organization_id: organization.id,
      channel_connection_id: connectionId,
      type: "publish_listing",
      entity_type: "channel_listing",
      entity_id: listing.id,
      status: "queued",
      payload: {
        product_id: productId,
        product_variant_id: variantId,
        listing_type_id: listingTypeId,
      },
    })
    .select("*")
    .single();

  if (jobError || !job) {
    fail(jobError?.message ?? "Falha ao criar sync_job");
  }

  await processSyncJob(job!.id);

  revalidatePath(`/products/${productId}`);
  revalidatePath("/channels");
  redirect(
    `/products/${productId}?published=1${listing.external_id ? "&updated=1" : ""}`,
  );
}

/** Queue stock sync for published ML listings of a variant (fire-and-forget). */
export async function queueStockSyncForVariant(params: {
  organizationId: string;
  productVariantId: string;
}) {
  const admin = createServiceClient();
  const { data: listings } = await admin
    .from("channel_listings")
    .select("id, channel_connection_id, external_id, status")
    .eq("organization_id", params.organizationId)
    .eq("product_variant_id", params.productVariantId)
    .not("external_id", "is", null)
    .in("status", ["published", "paused", "sync_error"]);

  for (const listing of listings ?? []) {
    const { data: job } = await admin
      .from("sync_jobs")
      .insert({
        organization_id: params.organizationId,
        channel_connection_id: listing.channel_connection_id,
        type: "sync_stock",
        entity_type: "channel_listing",
        entity_id: listing.id,
        status: "queued",
        payload: {},
      })
      .select("id")
      .single();
    if (job?.id) {
      await processSyncJob(job.id);
    }
  }
}

async function getDefaultStoreId(
  admin: ReturnType<typeof createServiceClient>,
  organizationId: string,
) {
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .maybeSingle();
  if (store?.id) return store.id as string;
  const { data: anyStore } = await admin
    .from("stores")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  return (anyStore?.id as string | undefined) ?? null;
}

async function getVariantStock(params: {
  admin: ReturnType<typeof createServiceClient>;
  organizationId: string;
  productVariantId: string | null;
}) {
  if (!params.productVariantId) return 1;
  const storeId = await getDefaultStoreId(
    params.admin,
    params.organizationId,
  );
  if (!storeId) return 1;
  const { data: inv } = await params.admin
    .from("inventory")
    .select("quantity")
    .eq("organization_id", params.organizationId)
    .eq("store_id", storeId)
    .eq("product_variant_id", params.productVariantId)
    .maybeSingle();
  return Math.max(0, Number(inv?.quantity ?? 0));
}

async function upsertMercadoLivreOrder(params: {
  admin: ReturnType<typeof createServiceClient>;
  organizationId: string;
  connectionId: string;
  order: MercadoLivreOrder;
}) {
  const { admin, organizationId, connectionId, order } = params;
  const externalOrderId = String(order.id);
  const storeId = await getDefaultStoreId(admin, organizationId);

  const { data: existing } = await admin
    .from("orders")
    .select("id")
    .eq("channel_connection_id", connectionId)
    .eq("external_order_id", externalOrderId)
    .maybeSingle();

  const isNew = !existing;
  const status = mapMercadoLivreOrderStatus(order.status);
  const total = Number(order.total_amount ?? 0);
  const currency = order.currency_id ?? "BRL";
  const placedAt = order.date_created ?? new Date().toISOString();

  const buyer = order.buyer;
  let customerId: string | null = null;
  if (buyer?.id) {
    const buyerKey = String(buyer.id);
    const name =
      [buyer.first_name, buyer.last_name].filter(Boolean).join(" ").trim() ||
      buyer.nickname ||
      `ML ${buyerKey}`;

    const { data: byExternal } = await admin
      .from("customers")
      .select("id, external_ids")
      .eq("organization_id", organizationId)
      .contains("external_ids", { mercado_livre: buyerKey })
      .maybeSingle();

    if (byExternal) {
      customerId = byExternal.id;
    } else if (buyer.email) {
      const { data: byEmail } = await admin
        .from("customers")
        .select("id, external_ids")
        .eq("organization_id", organizationId)
        .eq("email", buyer.email)
        .maybeSingle();
      if (byEmail) {
        customerId = byEmail.id;
        const ext =
          typeof byEmail.external_ids === "object" && byEmail.external_ids
            ? (byEmail.external_ids as Record<string, unknown>)
            : {};
        await admin
          .from("customers")
          .update({
            external_ids: { ...ext, mercado_livre: buyerKey },
            updated_at: new Date().toISOString(),
          })
          .eq("id", byEmail.id);
      }
    }

    if (!customerId) {
      const { data: created } = await admin
        .from("customers")
        .insert({
          organization_id: organizationId,
          name,
          email: buyer.email ?? null,
          external_ids: { mercado_livre: buyerKey },
        })
        .select("id")
        .single();
      customerId = created?.id ?? null;
    }
  }

  let orderId = existing?.id as string | undefined;

  if (existing) {
    await admin
      .from("orders")
      .update({
        status,
        total,
        subtotal: total,
        currency,
        customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    const { data: created, error } = await admin
      .from("orders")
      .insert({
        organization_id: organizationId,
        store_id: storeId,
        customer_id: customerId,
        channel_connection_id: connectionId,
        external_order_id: externalOrderId,
        status,
        subtotal: total,
        discount_total: 0,
        shipping_total: 0,
        tax_total: 0,
        total,
        currency,
        placed_at: placedAt,
      })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error(error?.message ?? "Falha ao criar pedido ML");
    }
    orderId = created.id;

    for (const line of order.order_items ?? []) {
      const mlItemId = line.item?.id ?? null;
      let variantId: string | null = null;
      let sku = line.item?.seller_sku || mlItemId || "ML-ITEM";
      let productName = line.item?.title || "Item Mercado Livre";
      let variantName: string | null = null;

      if (mlItemId) {
        const { data: listing } = await admin
          .from("channel_listings")
          .select(
            "product_variant_id, product_variants(sku, name), products(name)",
          )
          .eq("organization_id", organizationId)
          .eq("channel_connection_id", connectionId)
          .eq("external_id", mlItemId)
          .maybeSingle();
        if (listing) {
          variantId = listing.product_variant_id;
          const pv = listing.product_variants as unknown as {
            sku?: string;
            name?: string | null;
          } | null;
          const pr = listing.products as unknown as { name?: string } | null;
          if (pv?.sku) sku = pv.sku;
          if (pv?.name) variantName = pv.name;
          if (pr?.name) productName = pr.name;
        }
      }

      const qty = Math.max(1, Number(line.quantity ?? 1));
      const unit = Number(line.unit_price ?? line.full_unit_price ?? 0);
      await admin.from("order_items").insert({
        organization_id: organizationId,
        order_id: orderId,
        product_variant_id: variantId,
        sku,
        product_name: productName,
        variant_name: variantName,
        quantity: qty,
        unit_price: unit,
        discount_amount: 0,
        total: unit * qty,
        external_item_id: mlItemId,
      });

      if (isNew && variantId && storeId && status !== "cancelled") {
        const { data: inv } = await admin
          .from("inventory")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("store_id", storeId)
          .eq("product_variant_id", variantId)
          .maybeSingle();
        if (inv) {
          const nextQty = Math.max(0, inv.quantity - qty);
          await admin
            .from("inventory")
            .update({
              quantity: nextQty,
              updated_at: new Date().toISOString(),
            })
            .eq("id", inv.id);
          await admin.from("inventory_movements").insert({
            organization_id: organizationId,
            store_id: storeId,
            product_variant_id: variantId,
            type: "sale",
            quantity: -qty,
            reason: "Pedido Mercado Livre",
            reference_type: "order",
            reference_id: orderId,
          });
        }
      }
    }
  }

  return { orderId: orderId!, isNew };
}

export async function processSyncJob(jobId: string) {
  const admin = createServiceClient();

  const { data: job } = await admin
    .from("sync_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (!job) return;

  await admin
    .from("sync_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      attempts: (job.attempts ?? 0) + 1,
    })
    .eq("id", jobId);

  try {
    if (job.type === "publish_listing" && job.entity_id) {
      await admin
        .from("channel_listings")
        .update({ status: "publishing", updated_at: new Date().toISOString() })
        .eq("id", job.entity_id);

      const { data: listing } = await admin
        .from("channel_listings")
        .select("*, product_variants(*), products(id, name, description)")
        .eq("id", job.entity_id)
        .single();

      if (!listing) throw new Error("Listing não encontrado");

      const accessToken = await getValidAccessToken(
        listing.channel_connection_id,
      );

      const variantRaw = listing.product_variants as unknown;
      const variant = (
        Array.isArray(variantRaw) ? variantRaw[0] : variantRaw
      ) as { price: number; name: string | null } | null;
      const productRaw = listing.products as unknown;
      const product = (
        Array.isArray(productRaw) ? productRaw[0] : productRaw
      ) as { id: string; name: string; description: string | null } | null;
      const title =
        listing.title_override ||
        `${product?.name ?? "óculos de sol"} ${variant?.name ?? ""}`.trim();
      const price = Number(listing.price_override ?? variant?.price ?? 0);
      const preferredCategoryId =
        (listing.metadata as { category_id?: string } | null)?.category_id ??
        null;

      const { data: images } = product?.id
        ? await admin
            .from("product_images")
            .select("storage_path")
            .eq("product_id", product.id)
            .order("position", { ascending: true })
        : { data: [] as Array<{ storage_path: string }> };

      const pictureUrls = resolveMercadoLivrePictureUrls(
        (images ?? []).map((img) => img.storage_path),
      );

      const availableQuantity = await getVariantStock({
        admin,
        organizationId: listing.organization_id,
        productVariantId: listing.product_variant_id,
      });

      const listingTypeId =
        (job.payload as { listing_type_id?: string } | null)
          ?.listing_type_id === "gold_pro"
          ? "gold_pro"
          : "gold_special";

      const meta =
        typeof listing.metadata === "object" && listing.metadata
          ? (listing.metadata as Record<string, unknown>)
          : {};

      const publishedTypeRaw = meta.published_listing_type_id;
      const previousType =
        publishedTypeRaw === "gold_pro"
          ? "gold_pro"
          : publishedTypeRaw === "gold_special"
            ? "gold_special"
            : listing.external_id
              ? "gold_special"
              : null;

      const previousExternalId = listing.external_id as string | null;
      const typeChanged =
        Boolean(previousExternalId) &&
        previousType !== null &&
        previousType !== listingTypeId;

      let result: {
        id?: string;
        permalink?: string;
        category_id?: string;
        listing_type_id?: string;
        status?: string;
      };

      if (!previousExternalId) {
        result = await publishMercadoLivreItem({
          accessToken,
          title,
          price,
          availableQuantity: Math.max(1, availableQuantity || 1),
          description: product?.description,
          pictureUrls,
          listingTypeId,
          preferredCategoryId,
        });
      } else if (typeChanged) {
        await changeMercadoLivreListingType({
          accessToken,
          itemId: previousExternalId,
          listingTypeId,
        });
        await activateMercadoLivreItem({
          accessToken,
          itemId: previousExternalId,
        });
        await updateMercadoLivreItem({
          accessToken,
          itemId: previousExternalId,
          price,
          availableQuantity,
          pictureUrls,
          familyName: title,
        });
        const fresh = await fetchMercadoLivreItem({
          accessToken,
          itemId: previousExternalId,
        });
        result = {
          id: fresh.id,
          permalink: fresh.permalink,
          category_id: fresh.category_id ?? preferredCategoryId ?? undefined,
          listing_type_id: fresh.listing_type_id,
          status: fresh.status,
        };
        if (fresh.listing_type_id && fresh.listing_type_id !== listingTypeId) {
          throw new Error(
            `ML não aplicou Premium/Clássico (ficou ${fresh.listing_type_id}, status ${fresh.status ?? "?"}).`,
          );
        }
        if (
          fresh.status &&
          !["active", "not_yet_active"].includes(fresh.status)
        ) {
          throw new Error(
            `Anúncio ${fresh.id} está ${fresh.status} no ML após mudança de tipo. Verifique no painel do Mercado Livre.`,
          );
        }
      } else {
        await updateMercadoLivreItem({
          accessToken,
          itemId: previousExternalId,
          price,
          availableQuantity,
          pictureUrls,
          familyName: title,
        });
        const fresh = await fetchMercadoLivreItem({
          accessToken,
          itemId: previousExternalId,
        });
        if (fresh.status === "paused") {
          await activateMercadoLivreItem({
            accessToken,
            itemId: previousExternalId,
          });
        }
        const again = await fetchMercadoLivreItem({
          accessToken,
          itemId: previousExternalId,
        });
        result = {
          id: again.id,
          permalink: again.permalink,
          category_id: again.category_id ?? preferredCategoryId ?? undefined,
          listing_type_id: again.listing_type_id,
          status: again.status,
        };
      }

      if (!result.id) {
        throw new Error(
          "Publicação ML sem external id — não marcamos como published.",
        );
      }

      await admin
        .from("channel_listings")
        .update({
          status: "published",
          external_id: result.id,
          last_sync_at: new Date().toISOString(),
          last_error: null,
          metadata: {
            ...meta,
            category_id: result.category_id ?? meta.category_id ?? null,
            permalink: result.permalink ?? meta.permalink ?? null,
            listing_type_id: listingTypeId,
            published_listing_type_id: listingTypeId,
            ml_status: result.status ?? null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", listing.id);

      await admin
        .from("sync_jobs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", jobId);
      return;
    }

    if (job.type === "sync_stock" && job.entity_id) {
      const { data: listing } = await admin
        .from("channel_listings")
        .select("*")
        .eq("id", job.entity_id)
        .single();
      if (!listing?.external_id) {
        throw new Error("Listing sem external_id para sync_stock");
      }
      const accessToken = await getValidAccessToken(
        listing.channel_connection_id,
      );
      const qty = await getVariantStock({
        admin,
        organizationId: listing.organization_id,
        productVariantId: listing.product_variant_id,
      });
      await updateMercadoLivreItem({
        accessToken,
        itemId: listing.external_id,
        availableQuantity: qty,
      });
      const fresh = await fetchMercadoLivreItem({
        accessToken,
        itemId: listing.external_id,
      });
      const meta =
        typeof listing.metadata === "object" && listing.metadata
          ? (listing.metadata as Record<string, unknown>)
          : {};
      await admin
        .from("channel_listings")
        .update({
          last_sync_at: new Date().toISOString(),
          last_error: null,
          status: fresh.status === "paused" ? "paused" : "published",
          metadata: { ...meta, ml_status: fresh.status ?? null },
          updated_at: new Date().toISOString(),
        })
        .eq("id", listing.id);
      await admin
        .from("sync_jobs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", jobId);
      return;
    }

    if (job.type === "refresh_listing" && job.entity_id) {
      const { data: listing } = await admin
        .from("channel_listings")
        .select("*")
        .eq("id", job.entity_id)
        .single();
      if (!listing?.external_id) {
        throw new Error("Listing sem external_id");
      }
      const accessToken = await getValidAccessToken(
        listing.channel_connection_id,
      );
      const fresh = await fetchMercadoLivreItem({
        accessToken,
        itemId: listing.external_id,
      });
      const meta =
        typeof listing.metadata === "object" && listing.metadata
          ? (listing.metadata as Record<string, unknown>)
          : {};
      await admin
        .from("channel_listings")
        .update({
          last_sync_at: new Date().toISOString(),
          last_error: null,
          status:
            fresh.status === "paused"
              ? "paused"
              : fresh.status === "closed"
                ? "closed"
                : "published",
          metadata: {
            ...meta,
            permalink: fresh.permalink ?? meta.permalink ?? null,
            listing_type_id:
              fresh.listing_type_id ?? meta.listing_type_id ?? null,
            published_listing_type_id:
              fresh.listing_type_id ?? meta.published_listing_type_id ?? null,
            ml_status: fresh.status ?? null,
            category_id: fresh.category_id ?? meta.category_id ?? null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", listing.id);
      await admin
        .from("sync_jobs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", jobId);
      return;
    }

    if (
      (job.type === "import_orders" || job.type === "import_order") &&
      job.channel_connection_id
    ) {
      const connectionId = job.channel_connection_id as string;
      const { data: connection } = await admin
        .from("channel_connections")
        .select("id, organization_id, external_account_id")
        .eq("id", connectionId)
        .single();
      if (!connection?.external_account_id) {
        throw new Error("Conexão ML sem external_account_id");
      }
      const accessToken = await getValidAccessToken(connectionId);

      let imported = 0;
      let created = 0;

      if (job.type === "import_order") {
        const orderId =
          (job.payload as { order_id?: string } | null)?.order_id ??
          (typeof job.payload === "object" &&
          job.payload &&
          "resource" in job.payload
            ? String((job.payload as { resource?: string }).resource ?? "")
                .split("/")
                .pop()
            : null);
        if (!orderId) throw new Error("import_order sem order_id");
        const order = await getMercadoLivreOrder({ accessToken, orderId });
        const result = await upsertMercadoLivreOrder({
          admin,
          organizationId: connection.organization_id,
          connectionId,
          order,
        });
        imported = 1;
        created = result.isNew ? 1 : 0;
      } else {
        const days =
          Number((job.payload as { days?: number } | null)?.days ?? 30) || 30;
        const to = new Date();
        const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        let offset = 0;
        const limit = 50;
        for (;;) {
          const page = await searchMercadoLivreOrders({
            accessToken,
            sellerId: connection.external_account_id,
            fromIso: from.toISOString(),
            toIso: to.toISOString(),
            offset,
            limit,
          });
          for (const order of page.results) {
            const result = await upsertMercadoLivreOrder({
              admin,
              organizationId: connection.organization_id,
              connectionId,
              order,
            });
            imported += 1;
            if (result.isNew) created += 1;
          }
          offset += limit;
          if (offset >= page.total || page.results.length === 0) break;
          if (offset > 200) break; // safety cap
        }
      }

      await admin
        .from("sync_jobs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          error_message: null,
          payload: {
            ...(typeof job.payload === "object" && job.payload
              ? job.payload
              : {}),
            imported,
            created,
          },
        })
        .eq("id", jobId);
      return;
    }

    throw new Error(`Tipo de job não suportado: ${job.type}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";

    if (job.entity_id && job.entity_type === "channel_listing") {
      await admin
        .from("channel_listings")
        .update({
          status: "sync_error",
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.entity_id);
    }

    await admin
      .from("sync_jobs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}
