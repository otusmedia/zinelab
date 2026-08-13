import {
  disconnectMercadoLivreAction,
  importMercadoLivreOrdersAction,
  importMercadoLivreProductsAction,
  startMercadoLivreOAuth,
} from "@/app/actions/channels";
import { requireOrganization } from "@/lib/tenancy";

function tokenBadge(meta: { token_expires_at?: string } | null, status: string) {
  if (status === "disconnected") return "Desconectado";
  if (status === "error" || status === "reauthorization_required") {
    return "Reconectar necessário";
  }
  if (status === "expired") return "Expirado";
  const exp = meta?.token_expires_at ? new Date(meta.token_expires_at) : null;
  if (!exp || Number.isNaN(exp.getTime())) return "Conectado";
  if (exp.getTime() < Date.now()) return "Token expirado (renova no próximo uso)";
  return `Token válido até ${exp.toLocaleString("pt-BR")}`;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    connected?: string;
    disconnected?: string;
    imported_products?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase, organization } = await requireOrganization();

  const { data: connections } = await supabase
    .from("channel_connections")
    .select(
      "id, status, external_account_id, connected_at, metadata, sales_channels(code, name)",
    )
    .eq("organization_id", organization.id);

  return (
    <div>
      <h1>Integrações</h1>
      <p className="muted">
        OAuth Mercado Livre. Tokens ficam em channel_connection_secrets
        (service_role only) — nunca no frontend.
      </p>
      <p className="muted" style={{ marginTop: 8 }}>
        Webhook (cadastre no app ML):{" "}
        <code>
          https://zine-lab.vercel.app/api/integrations/mercado-livre/notifications
        </code>
      </p>

      {params.connected ? (
        <div className="panel" style={{ marginTop: 12 }}>
          Conta conectada.
        </div>
      ) : null}
      {params.disconnected ? (
        <div className="panel" style={{ marginTop: 12 }}>
          Conta desconectada.
        </div>
      ) : null}
      {params.imported_products ? (
        <div className="panel" style={{ marginTop: 12 }}>
          Importação de produtos ML concluída. Veja em Produtos / Anúncios.
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
            <th>Token</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {(connections ?? []).map((c) => {
            const ch = c.sales_channels as unknown as {
              code: string;
              name: string;
            } | null;
            const meta = c.metadata as {
              nickname?: string;
              token_expires_at?: string;
            } | null;
            return (
              <tr key={c.id}>
                <td>{ch?.name ?? "—"}</td>
                <td>
                  {meta?.nickname ?? c.external_account_id ?? "—"}
                  {c.external_account_id ? (
                    <span className="muted"> ({c.external_account_id})</span>
                  ) : null}
                </td>
                <td>{c.status}</td>
                <td>{tokenBadge(meta, c.status)}</td>
                <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ch?.code === "mercado_livre" && c.status === "connected" ? (
                    <>
                      <form action={importMercadoLivreProductsAction}>
                        <input
                          type="hidden"
                          name="channel_connection_id"
                          value={c.id}
                        />
                        <input
                          type="hidden"
                          name="redirect_to"
                          value="/integrations"
                        />
                        <button type="submit">Importar produtos</button>
                      </form>
                      <form action={importMercadoLivreOrdersAction}>
                        <input
                          type="hidden"
                          name="channel_connection_id"
                          value={c.id}
                        />
                        <button type="submit">Importar pedidos</button>
                      </form>
                      <form action={disconnectMercadoLivreAction}>
                        <input
                          type="hidden"
                          name="channel_connection_id"
                          value={c.id}
                        />
                        <button type="submit">Desconectar</button>
                      </form>
                    </>
                  ) : ch?.code === "mercado_livre" ? (
                    <form action={startMercadoLivreOAuth}>
                      <button type="submit">Reconectar</button>
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
    </div>
  );
}
