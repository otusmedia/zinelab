import { importMercadoLivreOrdersAction } from "@/app/actions/channels";
import { createOrderAction } from "@/app/actions/orders";
import { requireOrganization } from "@/lib/tenancy";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  const params = await searchParams;
  const { supabase, organization } = await requireOrganization();

  const [
    { data: orders },
    { data: customers },
    { data: variants },
    { data: mlConnections },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "*, customers(name), order_items(*), channel_connections(sales_channels(name))",
      )
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
      <h1>Pedidos</h1>
      <p className="muted">
        Itens guardam snapshot (sku, nomes, preços) para histórico.
      </p>

      {params.imported ? (
        <div className="panel" style={{ marginTop: 12 }}>
          Importação ML concluída. Veja os jobs em Anúncios se algo falhar.
        </div>
      ) : null}

      {ml.length > 0 ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Mercado Livre</h2>
          <p className="muted">Importa pedidos dos últimos 30 dias.</p>
          {ml.map((c) => (
            <form key={c.id} action={importMercadoLivreOrdersAction}>
              <input type="hidden" name="channel_connection_id" value={c.id} />
              <button type="submit" className="primary">
                Importar pedidos ML
              </button>
            </form>
          ))}
        </div>
      ) : null}

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
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            defaultValue={1}
          />
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
            <th>Canal</th>
            <th>Status</th>
            <th>Total</th>
            <th>Itens (snapshot)</th>
          </tr>
        </thead>
        <tbody>
          {(orders ?? []).map((o) => {
            const customer = o.customers as unknown as { name: string } | null;
            const conn = o.channel_connections as unknown as {
              sales_channels: { name: string };
            } | null;
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
                <td>
                  {conn?.sales_channels?.name ??
                    (o.external_order_id ? "Mercado Livre" : "Manual")}
                  {o.external_order_id ? (
                    <span className="muted"> · {o.external_order_id}</span>
                  ) : null}
                </td>
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
