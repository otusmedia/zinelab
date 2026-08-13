import {
  pauseListingAction,
  retrySyncJobAction,
} from "@/app/actions/channels";
import { requireOrganization } from "@/lib/tenancy";

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    retried?: string;
    paused?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase, organization } = await requireOrganization();

  const [{ data: listings }, { data: jobs }] = await Promise.all([
    supabase
      .from("channel_listings")
      .select(
        "id, status, external_id, last_error, metadata, products(name), product_variants(sku), channel_connections(sales_channels(name))",
      )
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("sync_jobs")
      .select(
        "id, type, status, attempts, error_message, created_at, completed_at",
      )
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div>
      <h1>Anúncios / Listings</h1>
      <p className="muted">Representações externas dos produtos canônicos</p>

      {params.error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {params.error}
        </div>
      ) : null}
      {params.retried ? (
        <div className="panel" style={{ marginTop: 12 }}>
          Job reenfileirado.
        </div>
      ) : null}
      {params.paused ? (
        <div className="panel" style={{ marginTop: 12 }}>
          Anúncio pausado no ML.
        </div>
      ) : null}

      <table style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Produto</th>
            <th>SKU</th>
            <th>Canal</th>
            <th>Status</th>
            <th>External ID</th>
            <th>Erro</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {(listings ?? []).map((l) => {
            const product = l.products as unknown as { name: string } | null;
            const variant = l.product_variants as unknown as {
              sku: string;
            } | null;
            const conn = l.channel_connections as unknown as {
              sales_channels: { name: string };
            } | null;
            const meta = l.metadata as {
              permalink?: string;
              ml_status?: string;
            } | null;
            return (
              <tr key={l.id}>
                <td>{product?.name ?? "—"}</td>
                <td>{variant?.sku ?? "—"}</td>
                <td>{conn?.sales_channels?.name ?? "—"}</td>
                <td>
                  {l.status}
                  {meta?.ml_status ? ` · ML:${meta.ml_status}` : ""}
                </td>
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
                <td>
                  {l.external_id && l.status !== "paused" ? (
                    <form action={pauseListingAction}>
                      <input type="hidden" name="listing_id" value={l.id} />
                      <button type="submit">Pausar</button>
                    </form>
                  ) : (
                    "—"
                  )}
                </td>
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
            <th>Ações</th>
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
              <td>
                {j.status === "failed" ? (
                  <form action={retrySyncJobAction}>
                    <input type="hidden" name="job_id" value={j.id} />
                    <button type="submit">Retry</button>
                  </form>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
