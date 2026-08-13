"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireOrganization } from "@/lib/tenancy";
import {
  ML_PKCE_COOKIE,
  buildMercadoLivreAuthUrl,
  createPkcePair,
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

  const { data: listing, error: listingError } = await supabase
    .from("channel_listings")
    .insert({
      organization_id: organization.id,
      channel_connection_id: connectionId,
      product_id: productId,
      product_variant_id: variantId,
      status: "pending",
    })
    .select("*")
    .single();

  if (listingError || !listing) {
    throw new Error(listingError?.message ?? "Falha ao criar listing");
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
      payload: { product_id: productId, product_variant_id: variantId },
    })
    .select("*")
    .single();

  if (jobError || !job) {
    throw new Error(jobError?.message ?? "Falha ao criar sync_job");
  }

  // Process in-process (no Redis/BullMQ). Failures become sync_error.
  await processSyncJob(job.id);

  revalidatePath(`/products/${productId}`);
  revalidatePath("/channels");
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

      const variant = listing.product_variants as unknown as {
        price: number;
        name: string | null;
      } | null;
      const product = listing.products as unknown as {
        id: string;
        name: string;
        description: string | null;
      } | null;
      const title =
        listing.title_override ||
        `${product?.name ?? "Produto"} ${variant?.name ?? ""}`.trim();
      const price = Number(listing.price_override ?? variant?.price ?? 0);

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

      const result = await publishMercadoLivreItem({
        accessToken: secret.access_token,
        title,
        price,
        availableQuantity: 1,
        description: product?.description,
        pictureUrls,
      });

      await admin
        .from("channel_listings")
        .update({
          status: "published",
          external_id: result.id ?? null,
          last_sync_at: new Date().toISOString(),
          last_error: null,
          metadata: {
            category_id: result.category_id ?? null,
            permalink: result.permalink ?? null,
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
