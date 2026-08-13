import { createServiceClient } from "@/lib/supabase/admin";
import { refreshMercadoLivreToken } from "@/lib/ml/client";

const REFRESH_SKEW_MS = 2 * 60 * 1000;

/**
 * Returns a usable access token for a channel connection.
 * Refreshes when expires_at is missing or within 2 minutes.
 */
export async function getValidAccessToken(connectionId: string): Promise<string> {
  const admin = createServiceClient();

  const { data: secret, error } = await admin
    .from("channel_connection_secrets")
    .select("access_token, refresh_token, expires_at, organization_id")
    .eq("channel_connection_id", connectionId)
    .maybeSingle();

  if (error || !secret?.access_token) {
    throw new Error(
      "Token ML ausente. Reconecte a integração (secrets só no server).",
    );
  }

  const expiresMs = secret.expires_at
    ? new Date(secret.expires_at).getTime()
    : 0;
  const needsRefresh = !expiresMs || expiresMs < Date.now() + REFRESH_SKEW_MS;

  if (!needsRefresh) {
    return secret.access_token;
  }

  if (!secret.refresh_token) {
    await admin
      .from("channel_connections")
      .update({
        status: "reauthorization_required",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
    throw new Error(
      "Token ML expirado sem refresh_token. Reconecte o Mercado Livre.",
    );
  }

  try {
    const token = await refreshMercadoLivreToken(secret.refresh_token);
    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;

    const { error: secretError } = await admin
      .from("channel_connection_secrets")
      .upsert({
        channel_connection_id: connectionId,
        organization_id: secret.organization_id,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? secret.refresh_token,
        token_type: token.token_type ?? "bearer",
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      });

    if (secretError) {
      throw new Error(secretError.message);
    }

    const { data: connection } = await admin
      .from("channel_connections")
      .select("metadata")
      .eq("id", connectionId)
      .single();

    const meta =
      connection &&
      typeof connection.metadata === "object" &&
      connection.metadata
        ? (connection.metadata as Record<string, unknown>)
        : {};

    await admin
      .from("channel_connections")
      .update({
        status: "connected",
        metadata: { ...meta, token_expires_at: expiresAt },
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);

    return token.access_token;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh falhou";
    await admin
      .from("channel_connections")
      .update({
        status: "error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
    throw new Error(
      `Falha ao renovar token ML. Reconecte a integração. (${message})`,
    );
  }
}
