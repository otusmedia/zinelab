import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { requireOrganization } from "@/lib/tenancy";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Produtos" },
  { href: "/inventory", label: "Estoque" },
  { href: "/customers", label: "Clientes" },
  { href: "/orders", label: "Pedidos" },
  { href: "/team", label: "Equipe" },
  { href: "/integrations", label: "Integrações" },
  { href: "/channels", label: "Anúncios" },
  { href: "/store", label: "Loja" },
  { href: "/marketing", label: "Marketing (em breve)", stub: true },
  { href: "/support", label: "Suporte (em breve)", stub: true },
  { href: "/ads", label: "Ads (em breve)", stub: true },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organization } = await requireOrganization();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 220,
          borderRight: "1px solid #000",
          padding: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <strong>Zine Lab</strong>
          <div className="muted" style={{ marginTop: 4 }}>
            {organization.name}
          </div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.stub ? "#" : item.href}
              style={{
                textDecoration: "none",
                opacity: item.stub ? 0.45 : 1,
                pointerEvents: item.stub ? "none" : "auto",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} style={{ marginTop: 24 }}>
          <button type="submit">Sair</button>
        </form>
      </aside>
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
