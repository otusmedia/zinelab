import { startMercadoLivreOAuth } from "@/app/actions/channels";
import { requireOrganization } from "@/lib/tenancy";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const params = await searchParams;
  const { supabase, organization } = await requireOrganization();

  const { data: connections } = await supabase
    .from("channel_connections")
    .select("id, status, external_account_id, connected_at, metadata, sales_channels(code, name)")
    .eq("organization_id", organization.id);

  return (
    <div>
      <h1>Integrações</h1>
      <p className="muted">
        OAuth Mercado Livre. Tokens ficam em channel_connection_secrets
        (service_role only) — nunca no frontend.
      </p>

      {params.connected ? (
        <div className="panel" style={{ marginTop: 12 }}>
          Conta conectada.
        </div>
      ) : null}
      {params.error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {params.error}
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Mercado Livre</h2>
        {!process.env.ML_APP_ID || !process.env.ML_CLIENT_SECRET ? (
          <p className="muted">
            Status: credenciais do app ML não configuradas no servidor. Crie o
            app em developers.mercadolivre.com.br e adicione{" "}
            <code>ML_APP_ID</code> + <code>ML_CLIENT_SECRET</code> na Vercel.
            Redirect URI:{" "}
            <code>
              https://zine-lab.vercel.app/api/integrations/mercado-livre/callback
            </code>
          </p>
        ) : (
          <p className="muted">Status: app ML configurado — pode conectar.</p>
        )}
        <form action={startMercadoLivreOAuth}>
          <button type="submit" className="primary">
            Conectar Mercado Livre
          </button>
        </form>
      </div>

      <h2 style={{ marginTop: 24 }}>Conexões</h2>
      <table>
        <thead>
          <tr>
            <th>Canal</th>
            <th>Conta</th>
            <th>Status</th>
            <th>Conectado em</th>
          </tr>
        </thead>
        <tbody>
          {(connections ?? []).map((c) => {
            const ch = c.sales_channels as unknown as {
              code: string;
              name: string;
            } | null;
            return (
              <tr key={c.id}>
                <td>{ch?.name ?? "—"}</td>
                <td>{c.external_account_id ?? "—"}</td>
                <td>{c.status}</td>
                <td>
                  {c.connected_at
                    ? new Date(c.connected_at).toLocaleString("pt-BR")
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
