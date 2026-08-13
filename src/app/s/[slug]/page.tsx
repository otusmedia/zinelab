import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/store/ProductGrid";
import { StoreHero } from "@/components/store/StoreHero";
import {
  getStorefrontOrgBySlug,
  listPublishedStoreProducts,
} from "@/lib/store/catalog";

export default async function StoreHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getStorefrontOrgBySlug(slug);
  if (!org) notFound();

  const products = await listPublishedStoreProducts(org.id, slug);
  const featured = products.find((p) => p.imageUrl) ?? products[0] ?? null;

  return (
    <>
      <StoreHero brand={org.name} slug={slug} featured={featured} />
      <section className="store-section store-shell">
        <h2>Coleção</h2>
        <p className="lede">
          Seleção atual disponível em estoque. Cada peça publicada aqui vem do
          catálogo da loja.
        </p>
        <ProductGrid slug={slug} products={products.slice(0, 8)} />
      </section>
    </>
  );
}
