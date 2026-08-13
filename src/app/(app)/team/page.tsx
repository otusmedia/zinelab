import { createInviteAction } from "@/app/actions/team";
import { requireOrganization } from "@/lib/tenancy";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; link?: string }>;
}) {
  const params = await searchParams;
  const { supabase, organization, role } = await requireOrganization();

  const { data: members } = await supabase
    .from("organization_members")
    .select("id, role, user_id, created_at")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true });

  const canInvite = role === "owner" || role === "admin";

  return (
    <div>
      <h1>Equipe</h1>
      <p className="muted">
        Membros da organização <strong>{organization.name}</strong>
      </p>

      {params.error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {params.error}
        </div>
      ) : null}

      {params.link ? (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="muted">Link de convite (válido 7 dias, 1 uso)</div>
          <p style={{ wordBreak: "break-all", marginBottom: 0 }}>{params.link}</p>
          <p className="muted" style={{ marginTop: 8 }}>
            Envie para o sócio. Ele cria a conta (ou entra) e abre esse link.
          </p>
        </div>
      ) : null}

      <h2 style={{ marginTop: 24 }}>Membros</h2>
      <table>
        <thead>
          <tr>
            <th>User ID</th>
            <th>Papel</th>
            <th>Desde</th>
          </tr>
        </thead>
        <tbody>
          {(members ?? []).map((m) => (
            <tr key={m.id}>
              <td style={{ fontSize: 12 }}>{m.user_id}</td>
              <td>{m.role}</td>
              <td>{new Date(m.created_at).toLocaleString("pt-BR")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {canInvite ? (
        <form action={createInviteAction} className="panel" style={{ marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Convidar sócio</h2>
          <div className="field">
            <label className="label" htmlFor="role">
              Papel
            </label>
            <select id="role" name="role" defaultValue="admin">
              <option value="admin">admin</option>
              <option value="member">member</option>
            </select>
          </div>
          <button type="submit" className="primary">
            Gerar link de convite
          </button>
        </form>
      ) : (
        <p className="muted" style={{ marginTop: 24 }}>
          Apenas owner/admin podem gerar convites.
        </p>
      )}
    </div>
  );
}
