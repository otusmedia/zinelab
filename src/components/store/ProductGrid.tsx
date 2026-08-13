import Link from "next/link";
import type { StorefrontProduct } from "@/lib/store/catalog";

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ProductGrid({
  slug,
  products,
}: {
  slug: string;
  products: StorefrontProduct[];
}) {
  if (!products.length) {
    return (
      <p className="store-empty">
        Nenhum produto publicado na loja ainda.
      </p>
    );
  }

  return (
    <div className="store-grid">
      {products.map((product) => (
        <Link
          key={product.productId}
          href={`/s/${slug}/p/${product.productId}`}
          className="store-product"
        >
          <div className="store-product-image">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt={product.name} />
            ) : null}
          </div>
          <h3 className="store-product-name">{product.name}</h3>
          <div className="store-product-price">
            {formatPrice(product.price)}
            {product.quantity <= 0 ? " · Esgotado" : ""}
          </div>
        </Link>
      ))}
    </div>
  );
}
