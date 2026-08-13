import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/store/AddToCartButton";
import {
  getPublishedStoreProduct,
  getStorefrontOrgBySlug,
} from "@/lib/store/catalog";

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const org = await getStorefrontOrgBySlug(slug);
  if (!org) notFound();

  const product = await getPublishedStoreProduct(org.id, slug, productId);
  if (!product) notFound();

  return (
    <div className="store-shell store-pdp">
      <div className="store-pdp-gallery">
        {(product.images.length
          ? product.images
          : [{ url: product.imageUrl, alt: product.name }]
        ).map((img, index) =>
          img.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${img.url}-${index}`}
              src={img.url}
              alt={img.alt ?? product.name}
            />
          ) : (
            <div
              key={index}
              className="store-product-image"
              style={{ minHeight: 420 }}
            />
          ),
        )}
      </div>
      <div className="store-pdp-info">
        <h1>{product.name}</h1>
        <div className="price">{formatPrice(product.price)}</div>
        {product.description ? (
          <p className="desc">{product.description}</p>
        ) : (
          <p className="desc">Peça da coleção {org.name}.</p>
        )}
        <p className="desc" style={{ marginBottom: 20 }}>
          Estoque: {product.quantity > 0 ? product.quantity : "esgotado"}
        </p>
        <AddToCartButton
          slug={slug}
          variantId={product.variantId}
          productId={product.productId}
          name={product.name}
          price={product.price}
          imageUrl={product.imageUrl}
          disabled={product.quantity <= 0}
        />
      </div>
    </div>
  );
}
