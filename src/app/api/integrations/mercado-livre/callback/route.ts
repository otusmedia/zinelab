import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  ML_PKCE_COOKIE,
  exchangeMercadoLivreCode,
  fetchMercadoLivreMe,
} from "@/lib/ml/client";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const clearPkce = (response: NextResponse) => {
    response.cookies.set(ML_PKCE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  };

  if (oauthError) {
    return clearPkce(
      NextResponse.redirect(
        `${appUrl}/integrations?error=${encodeURIComponent(oauthError)}`,
      ),
    );
  }

  if (!code || !stateRaw) {
    return clearPkce(
      NextResponse.redirect(
        `${appUrl}/integrations?error=${encodeURIComponent("callback inválido")}`,
      ),
    );
  }

  const codeVerifier = request.cookies.get(ML_PKCE_COOKIE)?.value;
  if (!codeVerifier) {
    return clearPkce(
      NextResponse.redirect(
        `${appUrl}/integrations?error=${encodeURIComponent(
          "PKCE code_verifier ausente. Clique novamente em Conectar Mercado Livre.",
        )}`,
      ),
    );
  }

  let organizationId: string;
  try {
    const parsed = JSON.parse(
      Buffer.from(stateRaw, "base64url").toString("utf8"),
    ) as { organizationId: string };
    organizationId = parsed.organizationId;
  } catch {
    return clearPkce(
      NextResponse.redirect(
        `${appUrl}/integrations?error=${encodeURIComponent("state inválido")}`,
      ),
    );
  }

  try {
    const token = await exchangeMercadoLivreCode(code, codeVerifier);
    const me = await fetchMercadoLivreMe(token.access_token);
    const admin = createServiceClient();

    const { data: channel } = await admin
      .from("sales_channels")
      .select("id")
      .eq("code", "mercado_livre")
      .single();

    if (!channel) {
      throw new Error("sales_channel mercado_livre não seedado");
    }

    const externalAccountId = String(me.id);

    const { data: connection, error: connError } = await admin
      .from("channel_connections")
      .upsert(
        {
          organization_id: organizationId,
          sales_channel_id: channel.id,
          external_account_id: externalAccountId,
          status: "connected",
          metadata: { nickname: me.nickname ?? null },
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "organization_id,sales_channel_id,external_account_id",
        },
      )
      .select("*")
      .single();

    if (connError || !connection) {
      throw new Error(connError?.message ?? "Falha ao salvar connection");
    }

    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;

    const { error: secretError } = await admin
      .from("channel_connection_secrets")
      .upsert({
        channel_connection_id: connection.id,
        organization_id: organizationId,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        token_type: token.token_type ?? "bearer",
        expires_at: expiresAt,
        raw: {},
        updated_at: new Date().toISOString(),
      });

    if (secretError) {
      throw new Error(secretError.message);
    }

    await admin
      .from("channel_connections")
      .update({
        metadata: {
          nickname: me.nickname ?? null,
          token_expires_at: expiresAt,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return clearPkce(
      NextResponse.redirect(`${appUrl}/integrations?connected=1`),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro OAuth ML";
    return clearPkce(
      NextResponse.redirect(
        `${appUrl}/integrations?error=${encodeURIComponent(message)}`,
      ),
    );
  }
}
