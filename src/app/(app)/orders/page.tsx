import { createOrderAction } from "@/app/actions/orders";
import { requireOrganization } from "@/lib/tenancy";

export default async function OrdersPage() {
  const { supabase, organization } = await requireOrganization();

  const [{ data: orders }, { data: customers }, { data: variants }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("*, customers(name), order_items(*)")
        .eq("organization_id", organization.id)
        .order("placed_at", { ascending: false }),
      supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", organization.id)
        .order("name"),
      supabase
        .from("product_variants")
        .select("id, sku, name, price, products(name)")
        .eq("organization_id", organization.id)
        .order("sku"),
    ]);

  return (
    <div>
      <h1>Pedidos</h1>
      <p className="muted">
        Itens guardam snapshot (sku, nomes, preços) para histórico.
      </p>

      <form action={createOrderAction} className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Pedido manual</h2>
        <div className="field">
          <label className="label" htmlFor="customer_id">
            Cliente
          </label>
          <select id="customer_id" name="customer_id">
            <option value="">—</option>
            {(customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="product_variant_id">
            Variante
          </label>
          <select id="product_variant_id" name="product_variant_id" required>
            {(variants ?? []).map((v) => {
              const product = v.products as unknown as { name: string } | null;
              return (
                <option key={v.id} value={v.id}>
                  {product?.name} · {v.sku} · R$ {v.price}
                </option>
              );
            })}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="quantity">
            Quantidade
          </label>
          <input id="quantity" name="quantity" type="number" min={1} defaultValue={1} />
        </div>
        <button type="submit" className="primary">
          Criar pedido
        </button>
      </form>

      <table style={{ marginTop: 24 }}>
        <thead>
          <tr>
            <th>Data</th>
            <th>Cliente</th>
            <th>Status</th>
            <th>Total</th>
            <th>Itens (snapshot)</th>
          </tr>
        </thead>
        <tbody>
          {(orders ?? []).map((o) => {
            const customer = o.customers as unknown as { name: string } | null;
            const items = (o.order_items ?? []) as Array<{
              sku: string;
              product_name: string;
              variant_name: string | null;
              quantity: number;
              unit_price: number;
            }>;
            return (
              <tr key={o.id}>
                <td>{new Date(o.placed_at).toLocaleString("pt-BR")}</td>
                <td>{customer?.name ?? "—"}</td>
                <td>{o.status}</td>
                <td>
                  {o.currency} {Number(o.total).toFixed(2)}
                </td>
                <td>
                  {items
                    .map(
                      (i) =>
                        `${i.quantity}x ${i.product_name} (${i.sku}) @ ${i.unit_price}`,
                    )
                    .join("; ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
