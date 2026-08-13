import Link from "next/link";
import { signIn } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <main style={{ maxWidth: 420, margin: "48px auto", padding: 16 }}>
      <h1>Zine Lab</h1>
      <p className="muted">Login (wireframe V1)</p>

      {params.message ? (
        <div className="panel" style={{ marginTop: 12 }}>
          {params.message}
        </div>
      ) : null}
      {params.error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {params.error}
        </div>
      ) : null}

      <form action={signIn} className="panel" style={{ marginTop: 16 }}>
        <div className="field">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">
            Senha
          </label>
          <input id="password" name="password" type="password" required />
        </div>
        <button type="submit" className="primary">
          Entrar
        </button>
      </form>
      <p style={{ marginTop: 16 }}>
        Não tem conta? <Link href="/signup">Criar conta</Link>
      </p>
    </main>
  );
}
