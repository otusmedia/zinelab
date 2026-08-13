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

type MlAttributeDef = {
  id: string;
  name?: string;
  value_type?: string;
  tags?: Record<string, boolean>;
  values?: Array<{ id: string; name: string }>;
  allowed_units?: Array<{ id: string; name: string }>;
};

type MlAttrPayload = {
  id: string;
  value_id?: string;
  value_name?: string;
};

async function discoverCategory(accessToken: string, title: string) {
  const t = title.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const isSunglasses = t.includes("oculos") && t.includes("sol");

  // Hard preference for sunglasses — avoids cycling glasses category MLB48191
  if (isSunglasses) {
    return {
      category_id: "MLB8378",
      category_name: "De Sol",
      domain_id: "MLB-SUNGLASSES",
      domain_name: "Óculos de sol",
      attributes: [] as Array<{
        id: string;
        value_id?: string;
        value_name?: string;
      }>,
    };
  }

  const query = title;
  const url = new URL(`${ML_API}/sites/MLB/domain_discovery/search`);
  url.searchParams.set("limit", "8");
  url.searchParams.set("q", query);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`domain_discovery falhou: ${res.status}`);
  }

  const data = (await res.json()) as Array<{
    category_id: string;
    category_name?: string;
    domain_id?: string;
    domain_name?: string;
    attributes?: Array<{
      id: string;
      value_id?: string;
      value_name?: string;
    }>;
  }>;

  if (!data?.length) {
    throw new Error("ML não encontrou categoria para este título");
  }

  const scored = data.map((item, index) => {
    const name =
      `${item.category_name ?? ""} ${item.domain_name ?? ""} ${item.domain_id ?? ""}`.toLowerCase();
    let score = 100 - index;
    if (item.domain_id === "MLB-SUNGLASSES") score += 100;
    if (item.category_id === "MLB8378") score += 80;
    if (name.includes("ciclismo")) score -= 80;
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].item;
}

function buildFamilyName(title: string) {
  const brand = guessBrand(title);
  const cleaned = title
    .replace(new RegExp(brand, "ig"), "")
    .replace(/\s+/g, " ")
    .trim();
  const family = cleaned ? `${brand} ${cleaned}` : brand;
  return family.slice(0, 60);
}

async function fetchCategoryAttributes(accessToken: string, categoryId: string) {
  const res = await fetch(`${ML_API}/categories/${categoryId}/attributes`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`attributes falhou: ${res.status}`);
  }
  return (await res.json()) as MlAttributeDef[];
}

function guessBrand(title: string) {
  const known = [
    "Oakley",
    "Ray-Ban",
    "Ray Ban",
    "Adidas",
    "Nike",
    "Apple",
    "Samsung",
    "Xiaomi",
    "Sony",
  ];
  const found = known.find((b) =>
    title.toLowerCase().includes(b.toLowerCase()),
  );
  if (found) return found.replace("Ray Ban", "Ray-Ban");
  const first = title.trim().split(/\s+/)[0];
  return first && first.length > 1 ? first : "Genérica";
}

function buildRequiredAttributes(
  attrs: MlAttributeDef[],
  title: string,
  suggested?: Array<{ id: string; value_id?: string; value_name?: string }>,
): MlAttrPayload[] {
  const out: MlAttrPayload[] = [];
  const byId = new Map(attrs.map((a) => [a.id, a]));
  const suggestedMap = new Map((suggested ?? []).map((s) => [s.id, s]));

  const push = (attr: MlAttrPayload) => {
    if (!out.some((a) => a.id === attr.id)) out.push(attr);
  };

  const required = attrs.filter(
    (a) => a.tags?.required || a.tags?.catalog_required,
  );

  for (const attr of required) {
    const fromDiscovery = suggestedMap.get(attr.id);
    if (fromDiscovery?.value_name || fromDiscovery?.value_id) {
      push({
        id: attr.id,
        ...(fromDiscovery.value_id ? { value_id: fromDiscovery.value_id } : {}),
        ...(fromDiscovery.value_name
          ? { value_name: fromDiscovery.value_name }
          : {}),
      });
      continue;
    }

    if (attr.id === "BRAND") {
      const brandName = guessBrand(title);
      const match = attr.values?.find(
        (v) => v.name.toLowerCase() === brandName.toLowerCase(),
      );
      if (match) push({ id: "BRAND", value_id: match.id, value_name: match.name });
      else if (attr.values?.length) {
        // catalog brands require an id from the list
        const v = attr.values[0];
        push({ id: "BRAND", value_id: v.id, value_name: v.name });
      } else {
        push({ id: "BRAND", value_name: brandName });
      }
      continue;
    }
    if (attr.id === "MODEL") {
      push({ id: "MODEL", value_name: title.slice(0, 40) || "Modelo padrão" });
      continue;
    }
    if (attr.id === "GENDER" && attr.values?.length) {
      const uni =
        attr.values.find((v) => /sem g[eê]nero/i.test(v.name)) ?? attr.values[0];
      push({ id: "GENDER", value_id: uni.id, value_name: uni.name });
      continue;
    }
    if (attr.id === "GTIN" || attr.id === "EAN" || attr.id === "UPC") {
      continue; // handled via EMPTY_GTIN_REASON below
    }
    if (attr.id === "ITEM_CONDITION") {
      const neu = attr.values?.find((v) => /novo|new/i.test(v.name));
      if (neu) push({ id: attr.id, value_id: neu.id, value_name: neu.name });
      continue;
    }
    if (attr.values?.length) {
      const v = attr.values[0];
      push({ id: attr.id, value_id: v.id, value_name: v.name });
      continue;
    }
    if (attr.value_type === "number_unit" && attr.allowed_units?.length) {
      push({
        id: attr.id,
        value_name: `1 ${attr.allowed_units[0].id}`,
      });
    }
  }

  // GTIN: prefer empty reason over inventing a barcode
  const emptyGtin = byId.get("EMPTY_GTIN_REASON");
  if (emptyGtin?.values?.length) {
    const reason =
      emptyGtin.values.find((v) =>
        /n[aã]o tem c[oó]digo cadastrado/i.test(v.name),
      ) ?? emptyGtin.values[0];
    push({
      id: "EMPTY_GTIN_REASON",
      value_id: reason.id,
      value_name: reason.name,
    });
  } else if (byId.get("GTIN")) {
    // fallback test EAN-13 (valid checksum) for categories that force GTIN
    push({ id: "GTIN", value_name: "7891234567895" });
  }

  // Package dimensions required by many MLB categories
  const pkgDefaults: Record<string, string> = {
    SELLER_PACKAGE_HEIGHT: "10 cm",
    SELLER_PACKAGE_WIDTH: "15 cm",
    SELLER_PACKAGE_LENGTH: "20 cm",
    SELLER_PACKAGE_WEIGHT: "200 g",
  };
  for (const [id, value] of Object.entries(pkgDefaults)) {
    if (byId.has(id)) push({ id, value_name: value });
  }

  if (!out.some((a) => a.id === "BRAND")) {
    const brandAttr = byId.get("BRAND");
    const brand = suggestedMap.get("BRAND");
    if (brand?.value_id || brand?.value_name) {
      push({
        id: "BRAND",
        value_id: brand.value_id,
        value_name: brand.value_name,
      });
    } else if (brandAttr?.values?.length) {
      const v = brandAttr.values[0];
      push({ id: "BRAND", value_id: v.id, value_name: v.name });
    } else {
      push({ id: "BRAND", value_name: guessBrand(title) });
    }
  }

  if (!out.some((a) => a.id === "MODEL")) {
    push({ id: "MODEL", value_name: title.slice(0, 40) || "Modelo padrão" });
  }

  return out;
}

function formatMlError(status: number, text: string) {
  try {
    const json = JSON.parse(text) as {
      message?: string;
      error?: string;
      cause?: Array<{
        code?: string;
        message?: string;
        type?: string;
        cause_id?: number;
        references?: string[];
      }>;
    };
    const causes = (json.cause ?? [])
      .map((c) => {
        const refs = c.references?.length ? ` [${c.references.join(", ")}]` : "";
        return `${c.message || c.code || "cause"}${refs}`;
      })
      .filter(Boolean)
      .join("; ");
    return (
      causes ||
      json.message ||
      json.error ||
      text ||
      `HTTP ${status}`
    );
  } catch {
    return text || `HTTP ${status}`;
  }
}

/**
 * Publish item with category discovery + required attributes + picture.
 * User Products model: send family_name (title is generated by ML).
 */
export async function publishMercadoLivreItem(params: {
  accessToken: string;
  title: string;
  price: number;
  availableQuantity: number;
  description?: string | null;
  pictureUrls?: string[];
  /** gold_special = Clássico, gold_pro = Premium */
  listingTypeId?: "gold_special" | "gold_pro";
}) {
  const title = params.title.slice(0, 60);
  const listingTypeId = params.listingTypeId ?? "gold_special";
  const discovered = await discoverCategory(params.accessToken, title);
  const categoryId = discovered.category_id;
  const attrDefs = await fetchCategoryAttributes(
    params.accessToken,
    categoryId,
  );
  const attributes = buildRequiredAttributes(
    attrDefs,
    title,
    discovered.attributes,
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zine-lab.vercel.app";
  const pictures = (
    params.pictureUrls?.length
      ? params.pictureUrls
      : [`${appUrl}/ml-placeholder.png`]
  ).map((source) => ({ source }));

  const familyName = buildFamilyName(title);

  // UP model: family_name is required; title is usually generated by ML.
  const payload: Record<string, unknown> = {
    family_name: familyName,
    category_id: categoryId,
    price: Math.max(params.price, 1),
    currency_id: "BRL",
    available_quantity: Math.max(1, params.availableQuantity),
    buying_mode: "buy_it_now",
    condition: "new",
    listing_type_id: listingTypeId,
    channels: ["marketplace"],
    pictures,
    attributes,
  };

  const res = await fetch(`${ML_API}/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json: { id?: string; permalink?: string } = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }

  if (!res.ok) {
    // Retry once with title included (some accounts still expect it)
    if (text.includes("invalid_fields") || text.includes("required_fields")) {
      const retryPayload = { ...payload, title };
      const retry = await fetch(`${ML_API}/items`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(retryPayload),
      });
      const retryText = await retry.text();
      try {
        json = JSON.parse(retryText);
      } catch {
        json = {};
      }
      if (retry.ok) {
        if (params.description && json.id) {
          await fetch(`${ML_API}/items/${json.id}/description`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${params.accessToken}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              plain_text: params.description.slice(0, 50000),
            }),
          }).catch(() => null);
        }
        return { ...json, category_id: categoryId };
      }
      throw new Error(
        `ML publish (${categoryId} · ${discovered.category_name ?? "?"}): ${formatMlError(retry.status, retryText)}`,
      );
    }

    throw new Error(
      `ML publish (${categoryId} · ${discovered.category_name ?? "?"}): ${formatMlError(res.status, text)}`,
    );
  }

  if (params.description && json.id) {
    await fetch(`${ML_API}/items/${json.id}/description`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ plain_text: params.description.slice(0, 50000) }),
    }).catch(() => null);
  }

  return { ...json, category_id: categoryId };
}

export async function updateMercadoLivreListingType(params: {
  accessToken: string;
  itemId: string;
  listingTypeId: "gold_special" | "gold_pro";
}) {
  const res = await fetch(`${ML_API}/items/${params.itemId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ listing_type_id: params.listingTypeId }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `ML update tipo (${params.itemId}): ${formatMlError(res.status, text)}`,
    );
  }
  try {
    return JSON.parse(text) as { id?: string; permalink?: string };
  } catch {
    return { id: params.itemId };
  }
}
