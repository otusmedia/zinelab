import Link from "next/link";
import { signUp } from "@/app/actions/auth";

export default function SignupPage() {
  return (
    <main style={{ maxWidth: 420, margin: "48px auto", padding: 16 }}>
      <h1>Zine Lab</h1>
      <p className="muted">Criar conta</p>
      <form action={signUp} className="panel" style={{ marginTop: 16 }}>
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
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </main>
  );
}
