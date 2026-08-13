import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { processSyncJob } from "@/app/actions/channels";

/**
 * Mercado Livre notifications webhook.
 * Register in the ML app:
 * https://zine-lab.vercel.app/api/integrations/mercado-livre/notifications
 */
export async function POST(request: NextRequest) {
  let body: {
    topic?: string;
    resource?: string;
    user_id?: number | string;
    attempts?: number;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const topic = (body.topic ?? "").toLowerCase();
  const resource = body.resource ?? "";
  const userId = body.user_id != null ? String(body.user_id) : null;

  // Always ACK quickly even if we cannot process.
  if (!userId || !resource) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const admin = createServiceClient();
    const { data: connection } = await admin
      .from("channel_connections")
      .select("id, organization_id, status")
      .eq("external_account_id", userId)
      .eq("status", "connected")
      .maybeSingle();

    if (!connection) {
      return NextResponse.json({ ok: true, unmatched: true });
    }

    if (topic.includes("order")) {
      const orderId = resource.split("/").filter(Boolean).pop();
      if (!orderId) return NextResponse.json({ ok: true });

      const { data: job } = await admin
        .from("sync_jobs")
        .insert({
          organization_id: connection.organization_id,
          channel_connection_id: connection.id,
          type: "import_order",
          entity_type: "channel_connection",
          entity_id: connection.id,
          status: "queued",
          payload: { order_id: orderId, resource, topic },
        })
        .select("id")
        .single();

      if (job?.id) await processSyncJob(job.id);
      return NextResponse.json({ ok: true, job: job?.id ?? null });
    }

    if (topic.includes("item") || topic === "items") {
      const itemId = resource.split("/").filter(Boolean).pop();
      if (!itemId) return NextResponse.json({ ok: true });

      const { data: listing } = await admin
        .from("channel_listings")
        .select("id")
        .eq("organization_id", connection.organization_id)
        .eq("channel_connection_id", connection.id)
        .eq("external_id", itemId)
        .maybeSingle();

      if (!listing) {
        return NextResponse.json({ ok: true, listing: false });
      }

      const { data: job } = await admin
        .from("sync_jobs")
        .insert({
          organization_id: connection.organization_id,
          channel_connection_id: connection.id,
          type: "refresh_listing",
          entity_type: "channel_listing",
          entity_id: listing.id,
          status: "queued",
          payload: { resource, topic },
        })
        .select("id")
        .single();

      if (job?.id) await processSyncJob(job.id);
      return NextResponse.json({ ok: true, job: job?.id ?? null });
    }

    return NextResponse.json({ ok: true, ignored_topic: topic || null });
  } catch {
    // Still 200 so ML does not disable the webhook.
    return NextResponse.json({ ok: true, error: true });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "mercado-livre-notifications",
  });
}
