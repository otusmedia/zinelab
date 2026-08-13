import Link from "next/link";
import { ProductCreateForm } from "@/components/ProductCreateForm";
import { requireOrganization } from "@/lib/tenancy";

export default async function ProductsPage() {
  const { supabase, organization } = await requireOrganization();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, status, created_at, product_variants(id, sku, price)")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1>Produtos</h1>
      <p className="muted">Catálogo canônico interno (não é anúncio de canal)</p>

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
