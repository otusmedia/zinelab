import Link from "next/link";
import { signIn } from "@/app/actions/auth";

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 420, margin: "48px auto", padding: 16 }}>
      <h1>Zine Lab</h1>
      <p className="muted">Login (wireframe V1)</p>
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
