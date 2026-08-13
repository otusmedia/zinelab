import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { CartProvider } from "@/components/store/CartProvider";
import { StoreHeader } from "@/components/store/StoreHeader";
import { getStorefrontOrgBySlug } from "@/lib/store/catalog";
import "./store.css";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-store-display",
});

const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-store-sans",
});

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getStorefrontOrgBySlug(slug);
  if (!org) notFound();

  return (
    <div className={`store-root ${display.variable} ${sans.variable}`}>
      <CartProvider slug={slug}>
        <StoreHeader brand={org.name} slug={slug} />
        <main>{children}</main>
        <footer className="store-footer store-shell">
          {org.name} · Loja própria Zine Lab
        </footer>
      </CartProvider>
    </div>
  );
}
