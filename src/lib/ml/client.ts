import { createHash, randomBytes } from "crypto";

const ML_AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const ML_API = "https://api.mercadolibre.com";

export const ML_PKCE_COOKIE = "ml_oauth_code_verifier";

export function getMercadoLivreConfig() {
  const appId = process.env.ML_APP_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const redirectUri =
    process.env.ML_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/mercado-livre/callback`;

  return { appId, clientSecret, redirectUri };
}

/** PKCE: random verifier (43-128 chars) + S256 challenge */
export function createPkcePair() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function buildMercadoLivreAuthUrl(
  state: string,
  codeChallenge: string,
) {
  const { appId, redirectUri } = getMercadoLivreConfig();
  if (!appId) {
    throw new Error("ML_APP_ID não configurado");
  }

  const url = new URL(ML_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeMercadoLivreCode(
  code: string,
  codeVerifier: string,
) {
  const { appId, clientSecret, redirectUri } = getMercadoLivreConfig();
  if (!appId || !clientSecret) {
    throw new Error("Credenciais ML não configuradas");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: appId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token ML falhou: ${res.status} ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    user_id?: number | string;
  }>;
}

export async function fetchMercadoLivreMe(accessToken: string) {
  const res = await fetch(`${ML_API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`users/me falhou: ${res.status}`);
  }
  return res.json() as Promise<{ id: number; nickname?: string }>;
}

/**
 * Best-effort publish. Real production needs category attributes, pictures, etc.
 * V1: attempt a minimal item create; on missing config/API error, return failure for sync_job.
 */
export async function publishMercadoLivreItem(params: {
  accessToken: string;
  title: string;
  price: number;
  availableQuantity: number;
}) {
  const res = await fetch(`${ML_API}/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      title: params.title.slice(0, 60),
      category_id: "MLB3530",
      price: params.price,
      currency_id: "BRL",
      available_quantity: Math.max(1, params.availableQuantity),
      buying_mode: "buy_it_now",
      condition: "new",
      listing_type_id: "bronze",
    }),
  });

  const text = await res.text();
  let json: { id?: string; message?: string; error?: string } = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { message: text };
  }

  if (!res.ok) {
    throw new Error(json.message || json.error || text || `HTTP ${res.status}`);
  }

  return json;
}
