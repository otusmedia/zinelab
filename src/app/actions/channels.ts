"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireOrganization } from "@/lib/tenancy";
import {
  ML_PKCE_COOKIE,
  activateMercadoLivreItem,
  buildMercadoLivreAuthUrl,
  changeMercadoLivreListingType,
  createPkcePair,
  fetchMercadoLivreItem,
  publishMercadoLivreItem,
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

export async function queuePublishListingAction(formData: FormData) {
  const { supabase, organization } = await requireOrganization();
  const productId = String(formData.get("product_id") ?? "");
  const variantId = String(formData.get("product_variant_id") ?? "");
  const connectionId = String(formData.get("channel_connection_id") ?? "");
  const listingTypeRaw = String(formData.get("listing_type_id") ?? "gold_special");
  const listingTypeId =
    listingTypeRaw === "gold_pro" ? "gold_pro" : "gold_special";

  const fail = (message: string) => {
    redirect(
      `/products/${productId}?error=${encodeURIComponent(message)}`,
    );
  };

  // Reuse existing listing for same connection+variant (republish)
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

  // Process in-process (no Redis/BullMQ). Failures become sync_error.
  await processSyncJob(job!.id);

  revalidatePath(`/products/${productId}`);
  revalidatePath("/channels");
  redirect(`/products/${productId}?published=1`);
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

      const { data: secret } = await admin
        .from("channel_connection_secrets")
        .select("access_token")
        .eq("channel_connection_id", listing.channel_connection_id)
        .single();

      if (!secret?.access_token) {
        throw new Error(
          "Token ML ausente. Reconecte a integração (secrets só no server).",
        );
      }

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

      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "https://zine-lab.vercel.app";
      const pictureUrls = (images ?? [])
        .map((img) =>
          img.storage_path.startsWith("http")
            ? img.storage_path
            : `${appUrl}${img.storage_path.startsWith("/") ? "" : "/"}${img.storage_path}`,
        )
        .filter(Boolean);

      const listingTypeId =
        (job.payload as { listing_type_id?: string } | null)
          ?.listing_type_id === "gold_pro"
          ? "gold_pro"
          : "gold_special";

      const meta =
        typeof listing.metadata === "object" && listing.metadata
          ? (listing.metadata as Record<string, unknown>)
          : {};

      // published_listing_type_id = last type confirmed on ML.
      // Do NOT use metadata.listing_type_id here: queuePublish overwrites it
      // before the job runs, which falsely skipped Premium upgrades.
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
          accessToken: secret.access_token,
          title,
          price,
          availableQuantity: 1,
          description: product?.description,
          pictureUrls,
          listingTypeId,
          preferredCategoryId,
        });
      } else if (typeChanged) {
        // Official upgrade/downgrade — keeps the same MLB id visible on ML.
        result = await changeMercadoLivreListingType({
          accessToken: secret.access_token,
          itemId: previousExternalId,
          listingTypeId,
        });
        const activated = await activateMercadoLivreItem({
          accessToken: secret.access_token,
          itemId: previousExternalId,
        });
        if (!activated.ok) {
          // Non-fatal if already active; still refresh item below.
        }
        const fresh = await fetchMercadoLivreItem({
          accessToken: secret.access_token,
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
        if (fresh.status && !["active", "not_yet_active"].includes(fresh.status)) {
          throw new Error(
            `Anúncio ${fresh.id} está ${fresh.status} no ML após mudança de tipo. Verifique no painel do Mercado Livre.`,
          );
        }
      } else {
        // Same type: refresh status from ML; re-activate if paused.
        const fresh = await fetchMercadoLivreItem({
          accessToken: secret.access_token,
          itemId: previousExternalId,
        });
        if (fresh.status === "paused") {
          await activateMercadoLivreItem({
            accessToken: secret.access_token,
            itemId: previousExternalId,
          });
        }
        const again = await fetchMercadoLivreItem({
          accessToken: secret.access_token,
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
        throw new Error("Publicação ML sem external id — não marcamos como published.");
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
