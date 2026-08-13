import Link from "next/link";
import { signUp } from "@/app/actions/auth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main style={{ maxWidth: 420, margin: "48px auto", padding: 16 }}>
      <h1>Zine Lab</h1>
      <p className="muted">Criar conta</p>

      {params.error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {params.error}
        </div>
      ) : null}

      <form action={signUp} className="panel" style={{ marginTop: 16 }}>
        {params.next ? (
          <input type="hidden" name="next" value={params.next} />
        ) : null}
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
          <input
            id="password"
            name="password"
            type="password"
            minLength={6}
            required
          />
        </div>
        <button type="submit" className="primary">
          Criar conta
        </button>
      </form>
      <p style={{ marginTop: 16 }}>
        Já tem conta?{" "}
        <Link
          href={
            params.next
              ? `/login?next=${encodeURIComponent(params.next)}`
              : "/login"
          }
        >
          Entrar
        </Link>
      </p>
    </main>
  );
}
