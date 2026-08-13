import Link from "next/link";
import { createProductAction } from "@/app/actions/products";
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
        <form action={createProductAction}>
          <div className="field">
            <label className="label" htmlFor="name">
              Nome
            </label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="description">
              Descrição
            </label>
            <textarea id="description" name="description" rows={3} />
          </div>
          <div className="field">
            <label className="label" htmlFor="sku">
              SKU (variante)
            </label>
            <input id="sku" name="sku" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="variant_name">
              Nome da variante
            </label>
            <input id="variant_name" name="variant_name" placeholder="Padrão" />
          </div>
          <div className="field">
            <label className="label" htmlFor="price">
              Preço
            </label>
            <input id="price" name="price" type="number" step="0.01" defaultValue={0} />
          </div>
          <div className="field">
            <label className="label" htmlFor="quantity">
              Estoque inicial (loja padrão)
            </label>
            <input id="quantity" name="quantity" type="number" defaultValue={0} />
          </div>
          <div className="field">
            <label className="label" htmlFor="reorder_point">
              Ponto de reposição
            </label>
            <input
              id="reorder_point"
              name="reorder_point"
              type="number"
              defaultValue={0}
            />
          </div>
          <button type="submit" className="primary">
            Criar produto
          </button>
        </form>
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
                  .map((v: { sku: string; price: number }) => `${v.sku} · R$ ${v.price}`)
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
