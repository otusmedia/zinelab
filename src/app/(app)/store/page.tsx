import Link from "next/link";
import {
  activateOwnStoreAction,
  unpublishOwnStoreAction,
} from "@/app/actions/store";
import { getOwnStoreConnection } from "@/lib/store/catalog";
import { requireOrganization } from "@/lib/tenancy";

export default async function StoreAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ activated?: string }>;
}) {
  const params = await searchParams;
  const { supabase, organization } = await requireOrganization();
  const connection = await getOwnStoreConnection(organization.id);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://zine-lab.vercel.app";
  const publicUrl = `${appUrl}/s/${organization.slug}`;

  const { data: listings } = connection
    ? await supabase
        .from("channel_listings")
        .select(
          "id, status, external_id, metadata, products(name), product_variants(sku, price)",
        )
        .eq("organization_id", organization.id)
        .eq("channel_connection_id", connection.id)
        .order("updated_at", { ascending: false })
    : { data: [] as never[] };

  return (
    <div>
      <h1>Loja própria</h1>
      <p className="muted">
        Vitrine pública ligada ao catálogo e estoque. Publique produtos na página
        do produto.
      </p>

      {params.activated ? (
        <div className="panel" style={{ marginTop: 12 }}>
          Loja ativada.
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Status</h2>
        {connection?.status === "connected" ? (
          <>
            <p>
              Ativa · URL pública:{" "}
              <a href={publicUrl} target="_blank" rel="noreferrer">
                {publicUrl}
              </a>
            </p>
            <p className="muted">Slug: {organization.slug}</p>
          </>
        ) : (
          <>
            <p className="muted">Loja ainda não ativada.</p>
            <form action={activateOwnStoreAction}>
              <button type="submit" className="primary">
                Ativar loja
              </button>
            </form>
          </>
        )}
      </div>

      <h2 style={{ marginTop: 24 }}>Publicados na loja</h2>
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>SKU</th>
            <th>Preço</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(listings ?? []).map((l) => {
            const product = l.products as unknown as { name: string } | null;
            const variant = l.product_variants as unknown as {
              sku: string;
              price: number;
            } | null;
            const meta = l.metadata as { permalink?: string } | null;
            return (
              <tr key={l.id}>
                <td>{product?.name ?? "—"}</td>
                <td>{variant?.sku ?? "—"}</td>
                <td>
                  {variant ? `R$ ${Number(variant.price).toFixed(2)}` : "—"}
                </td>
                <td>{l.status}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  {meta?.permalink ? (
                    <a href={meta.permalink} target="_blank" rel="noreferrer">
                      Ver
                    </a>
                  ) : null}
                  {l.status === "published" ? (
                    <form action={unpublishOwnStoreAction}>
                      <input type="hidden" name="listing_id" value={l.id} />
                      <button type="submit">Pausar</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ marginTop: 16 }}>
        <Link href="/products">Ir para produtos →</Link>
      </p>
    </div>
  );
}
