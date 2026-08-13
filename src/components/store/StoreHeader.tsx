"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/store/CartProvider";

export function StoreHeader({
  brand,
  slug,
}: {
  brand: string;
  slug: string;
}) {
  const { count } = useCart();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`store-header store-shell ${scrolled ? "is-scrolled" : ""}`}>
      <Link href={`/s/${slug}`} className="store-brand">
        {brand}
      </Link>
      <nav className="store-nav">
        <Link href={`/s/${slug}/products`}>Coleção</Link>
        <Link href={`/s/${slug}/cart`}>Sacola ({count})</Link>
      </nav>
    </header>
  );
}
