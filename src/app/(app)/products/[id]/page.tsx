import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/tenancy";
import { queuePublishListingAction } from "@/app/actions/channels";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; published?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, organization } = await requireOrganization();

  const { data: product } = await supabase
    .from("products")
    .select("*, product_variants(*), product_images(*)")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .single();

  if (!product) notFound();

  const { data: connections } = await supabase
    .from("channel_connections")
    .select("id, status, sales_channels(code, name)")
    .eq("organization_id", organization.id)
    .eq("status", "connected");

  const { data: listings } = await supabase
    .from("channel_listings")
    .select("*, channel_connections(sales_channels(name))")
    .eq("product_id", product.id)
    .eq("organization_id", organization.id);

  const mlConnections = (connections ?? []).filter((c) => {
    const ch = c.sales_channels as unknown as { code: string; name: string } | null;
    return ch?.code === "mercado_livre";
  });

  return (
    <div>
      <p>
        <Link href="/products">← Produtos</Link>
      </p>
      <h1>{product.name}</h1>
      <p className="muted">{product.status}</p>
      <p>{product.description || "Sem descrição"}</p>

      {query.error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {query.error}
        </div>
      ) : null}
      {query.published ? (
        <div className="panel" style={{ marginTop: 12 }}>
          Publicação enviada. Veja o status em Listings abaixo.
        </div>
      ) : null}

      <h2>Variantes</h2>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Nome</th>
            <th>Preço</th>
          </tr>
        </thead>
        <tbody>
          {(product.product_variants ?? []).map(
            (v: { id: string; sku: string; name: string | null; price: number }) => (
              <tr key={v.id}>
                <td>{v.sku}</td>
                <td>{v.name}</td>
                <td>R$ {Number(v.price).toFixed(2)}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>Publicar em canal</h2>
      <p className="muted">
        Cria channel_listing + sync_job (não chama API no clique de forma síncrona
        “descartável”).
      </p>

      {mlConnections.length === 0 ? (
        <p>
          Nenhuma conta Mercado Livre conectada.{" "}
          <Link href="/integrations">Conectar</Link>
        </p>
      ) : (
        <form action={queuePublishListingAction} className="panel">
          <input type="hidden" name="product_id" value={product.id} />
          <div className="field">
            <label className="label" htmlFor="product_variant_id">
              Variante
            </label>
            <select id="product_variant_id" name="product_variant_id" required>
              {(product.product_variants ?? []).map(
                (v: { id: string; sku: string; name: string | null }) => (
                  <option key={v.id} value={v.id}>
                    {v.sku} — {v.name}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="channel_connection_id">
              Conexão
            </label>
            <select
              id="channel_connection_id"
              name="channel_connection_id"
              required
            >
              {mlConnections.map((c) => {
                const ch = c.sales_channels as unknown as { name: string };
                return (
                  <option key={c.id} value={c.id}>
                    {ch?.name ?? "Mercado Livre"}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="listing_type_id">
              Tipo de anúncio
            </label>
            <select id="listing_type_id" name="listing_type_id" defaultValue="gold_special">
              <option value="gold_special">Clássico</option>
              <option value="gold_pro">Premium</option>
            </select>
          </div>
          <button type="submit" className="primary">
            Publicar no Mercado Livre
          </button>
        </form>
      )}

      <h2 style={{ marginTop: 24 }}>Listings</h2>
      <table>
        <thead>
          <tr>
            <th>Canal</th>
            <th>Tipo</th>
            <th>Status</th>
            <th>External ID</th>
            <th>Erro</th>
          </tr>
        </thead>
        <tbody>
          {(listings ?? []).map((l) => {
            const conn = l.channel_connections as unknown as {
              sales_channels: { name: string };
            } | null;
            const meta = l.metadata as {
              listing_type_id?: string;
              permalink?: string;
            } | null;
            const tipo =
              meta?.listing_type_id === "gold_pro" ? "Premium" : "Clássico";
            return (
              <tr key={l.id}>
                <td>{conn?.sales_channels?.name ?? "—"}</td>
                <td>{tipo}</td>
                <td>{l.status}</td>
                <td>
                  {l.external_id ? (
                    meta?.permalink ? (
                      <a href={meta.permalink} target="_blank" rel="noreferrer">
                        {l.external_id}
                      </a>
                    ) : (
                      l.external_id
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td>{l.last_error ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
