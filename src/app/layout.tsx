import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zine Lab",
  description: "Gestão multi-tenant de produtos, canais e vendas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
