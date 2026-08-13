import Link from "next/link";
import { requireOrganization } from "@/lib/tenancy";

export default async function DashboardPage() {
  const { supabase, organization } = await requireOrganization();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [
    { count: productsCount },
    { count: customersCount },
    { data: orders },
    { data: lowStock },
    { data: connections },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organization.id),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organization.id),
    supabase
      .from("orders")
      .select("id, total, status, placed_at")
      .eq("organization_id", organization.id)
      .gte("placed_at", since.toISOString()),
    supabase
      .from("inventory")
      .select("id, quantity, reorder_point, product_variant_id")
      .eq("organization_id", organization.id),
    supabase
      .from("channel_connections")
      .select("id, status, sales_channels(name)")
      .eq("organization_id", organization.id),
  ]);

  const salesTotal = (orders ?? []).reduce(
    (sum, o) => sum + Number(o.total ?? 0),
    0,
  );
  const low = (lowStock ?? []).filter((r) => r.quantity <= r.reorder_point);
  const connected = (connections ?? []).filter((c) => c.status === "connected");

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">Últimos 30 dias · wireframe</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        <div className="panel">
          <div className="muted">Vendas (R$)</div>
          <div style={{ fontSize: 24 }}>{salesTotal.toFixed(2)}</div>
          <div className="muted">{orders?.length ?? 0} pedidos</div>
        </div>
        <div className="panel">
          <div className="muted">Produtos</div>
          <div style={{ fontSize: 24 }}>{productsCount ?? 0}</div>
        </div>
        <div className="panel">
          <div className="muted">Clientes</div>
          <div style={{ fontSize: 24 }}>{customersCount ?? 0}</div>
        </div>
        <div className="panel">
          <div className="muted">Estoque baixo</div>
          <div style={{ fontSize: 24 }}>{low.length}</div>
          <Link href="/inventory">Ver estoque</Link>
        </div>
        <div className="panel">
          <div className="muted">Canais conectados</div>
          <div style={{ fontSize: 24 }}>{connected.length}</div>
          <Link href="/integrations">Integrações</Link>
        </div>
      </div>
    </div>
  );
}
