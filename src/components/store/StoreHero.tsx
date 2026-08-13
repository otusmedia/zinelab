import Link from "next/link";
import type { CSSProperties } from "react";
import type { StorefrontProduct } from "@/lib/store/catalog";

export function StoreHero({
  brand,
  slug,
  featured,
}: {
  brand: string;
  slug: string;
  featured: StorefrontProduct | null;
}) {
  const image = featured?.imageUrl
    ? `url(${featured.imageUrl})`
    : undefined;

  return (
    <section
      className="store-hero"
      style={
        image
          ? ({ ["--hero-image"]: image } as CSSProperties)
          : undefined
      }
    >
      <div className="store-hero-media" aria-hidden />
      <div className="store-hero-content">
        <h1>{brand}</h1>
        <p>
          Peças selecionadas, estoque real e presença editorial. Explore a
          coleção e reserve o seu.
        </p>
        <Link href={`/s/${slug}/products`} className="store-cta">
          Ver coleção
        </Link>
      </div>
    </section>
  );
}
