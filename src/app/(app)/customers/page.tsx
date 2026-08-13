import { createCustomerAction } from "@/app/actions/customers";
import { requireOrganization } from "@/lib/tenancy";

export default async function CustomersPage() {
  const { supabase, organization } = await requireOrganization();
  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1>Clientes</h1>
      <p className="muted">
        external_ids jsonb é V1; evoluir para customer_external_identities quando
        houver vários canais.
      </p>

      <form action={createCustomerAction} className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Novo cliente</h2>
        <div className="field">
          <label className="label" htmlFor="name">
            Nome
          </label>
          <input id="name" name="name" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" />
        </div>
        <div className="field">
          <label className="label" htmlFor="phone">
            Telefone
          </label>
          <input id="phone" name="phone" />
        </div>
        <button type="submit" className="primary">
          Salvar
        </button>
      </form>

      <table style={{ marginTop: 24 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Telefone</th>
          </tr>
        </thead>
        <tbody>
          {(customers ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.email ?? "—"}</td>
              <td>{c.phone ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
