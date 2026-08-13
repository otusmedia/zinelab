import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/store/ProductGrid";
import {
  getStorefrontOrgBySlug,
  listPublishedStoreProducts,
} from "@/lib/store/catalog";

export default async function StoreProductsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getStorefrontOrgBySlug(slug);
  if (!org) notFound();
  const products = await listPublishedStoreProducts(org.id, slug);

  return (
    <section className="store-section store-shell">
      <h2>Coleção</h2>
      <p className="lede">Todos os produtos publicados na loja.</p>
      <ProductGrid slug={slug} products={products} />
    </section>
  );
}
