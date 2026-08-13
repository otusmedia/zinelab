import Link from "next/link";
import { ProductCreateForm } from "@/components/ProductCreateForm";
import { importMercadoLivreProductsAction } from "@/app/actions/channels";
import { requireOrganization } from "@/lib/tenancy";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    imported_products?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase, organization } = await requireOrganization();
  const [{ data: products }, { data: mlConnections }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, status, created_at, product_variants(id, sku, price)")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("channel_connections")
      .select("id, status, sales_channels(code, name)")
      .eq("organization_id", organization.id)
      .eq("status", "connected"),
  ]);

  const ml = (mlConnections ?? []).filter((c) => {
    const ch = c.sales_channels as unknown as { code: string } | null;
    return ch?.code === "mercado_livre";
  });

  return (
    <div>
      <h1>Produtos</h1>
      <p className="muted">Catálogo canônico interno (não é anúncio de canal)</p>

      {params.error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {params.error}
        </div>
      ) : null}
      {params.imported_products ? (
        <div className="panel" style={{ marginTop: 12 }}>
          Produtos importados do Mercado Livre. Anúncios já vinculados em
          Anúncios; rode de novo para pular os que já existem.
        </div>
      ) : null}

      {ml.length > 0 ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Importar do Mercado Livre</h2>
          <p className="muted">
            Traz até 50 anúncios ativos: produto, estoque, fotos e vínculo MLB.
          </p>
          {ml.map((c) => (
            <form key={c.id} action={importMercadoLivreProductsAction}>
              <input type="hidden" name="channel_connection_id" value={c.id} />
              <input type="hidden" name="redirect_to" value="/products" />
              <button type="submit" className="primary">
                Importar produtos do ML
              </button>
            </form>
          ))}
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: 16, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Novo produto</h2>
        <ProductCreateForm />
      </div>

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Status</th>
            <th>Variantes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(products ?? []).map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.status}</td>
              <td>
                {(p.product_variants ?? [])
                  .map(
                    (v: { sku: string; price: number }) =>
                      `${v.sku} · R$ ${v.price}`,
                  )
                  .join(", ") || "—"}
              </td>
              <td>
                <Link href={`/products/${p.id}`}>Abrir</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
