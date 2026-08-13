import { createOrganizationAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/tenancy";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  return (
    <main style={{ maxWidth: 480, margin: "48px auto", padding: 16 }}>
      <h1>Criar organização</h1>
      <p className="muted">
        Cada organização é um tenant isolado. Uma loja padrão será criada
        automaticamente.
      </p>

      {params.error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {params.error}
        </div>
      ) : null}

      <form
        action={createOrganizationAction}
        className="panel"
        style={{ marginTop: 16 }}
      >
        <div className="field">
          <label className="label" htmlFor="name">
            Nome da empresa
          </label>
          <input id="name" name="name" required placeholder="SOS Mobile" />
        </div>
        <button type="submit" className="primary">
          Continuar
        </button>
      </form>
    </main>
  );
}
