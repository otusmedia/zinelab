import { requireOrganization } from "@/lib/tenancy";

export default async function ChannelsPage() {
  const { supabase, organization } = await requireOrganization();

  const [{ data: listings }, { data: jobs }] = await Promise.all([
    supabase
      .from("channel_listings")
      .select(
        "id, status, external_id, last_error, products(name), product_variants(sku), channel_connections(sales_channels(name))",
      )
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("sync_jobs")
      .select("id, type, status, attempts, error_message, created_at, completed_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div>
      <h1>Anúncios / Listings</h1>
      <p className="muted">Representações externas dos produtos canônicos</p>

      <table style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Produto</th>
            <th>SKU</th>
            <th>Canal</th>
            <th>Status</th>
            <th>External ID</th>
            <th>Erro</th>
          </tr>
        </thead>
        <tbody>
          {(listings ?? []).map((l) => {
            const product = l.products as unknown as { name: string } | null;
            const variant = l.product_variants as unknown as { sku: string } | null;
            const conn = l.channel_connections as unknown as {
              sales_channels: { name: string };
            } | null;
            return (
              <tr key={l.id}>
                <td>{product?.name ?? "—"}</td>
                <td>{variant?.sku ?? "—"}</td>
                <td>{conn?.sales_channels?.name ?? "—"}</td>
                <td>{l.status}</td>
                <td>{l.external_id ?? "—"}</td>
                <td>{l.last_error ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 style={{ marginTop: 32 }}>Sync jobs</h2>
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Status</th>
            <th>Tentativas</th>
            <th>Criado</th>
            <th>Erro</th>
          </tr>
        </thead>
        <tbody>
          {(jobs ?? []).map((j) => (
            <tr key={j.id}>
              <td>{j.type}</td>
              <td>{j.status}</td>
              <td>{j.attempts}</td>
              <td>{new Date(j.created_at).toLocaleString("pt-BR")}</td>
              <td>{j.error_message ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
