import Link from "next/link";
import { acceptInviteAction } from "@/app/actions/team";
import { createClient } from "@/lib/supabase/server";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: preview } = await supabase.rpc("get_invite_preview", {
    p_token: token,
  });

  const info = Array.isArray(preview) ? preview[0] : preview;

  return (
    <main style={{ maxWidth: 480, margin: "48px auto", padding: 16 }}>
      <h1>Entrar na organização</h1>

      {query.error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {query.error}
        </div>
      ) : null}

      {!info ? (
        <p className="error">Convite inválido ou inexistente.</p>
      ) : (
        <div className="panel" style={{ marginTop: 16 }}>
          <p>
            Organização: <strong>{info.organization_name}</strong>
          </p>
          <p className="muted">Papel: {info.role}</p>
          <p className="muted">
            Expira em: {new Date(info.expires_at).toLocaleString("pt-BR")}
          </p>
          {info.accepted ? (
            <p>Este convite já foi utilizado.</p>
          ) : user ? (
            <form action={acceptInviteAction}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="primary">
                Entrar em {info.organization_name}
              </button>
            </form>
          ) : (
            <div>
              <p>Faça login ou crie uma conta para aceitar o convite.</p>
              <p>
                <Link
                  href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
                >
                  Entrar
                </Link>
                {" · "}
                <Link
                  href={`/signup?next=${encodeURIComponent(`/join/${token}`)}`}
                >
                  Criar conta
                </Link>
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
