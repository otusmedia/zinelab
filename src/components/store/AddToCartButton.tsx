"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/store/CartProvider";

export function AddToCartButton({
  slug,
  variantId,
  productId,
  name,
  price,
  imageUrl,
  disabled,
}: {
  slug: string;
  variantId: string;
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  disabled?: boolean;
}) {
  const { addItem } = useCart();
  const router = useRouter();
  const [added, setAdded] = useState(false);

  return (
    <button
      type="button"
      className="store-cta primary"
      disabled={disabled}
      onClick={() => {
        addItem({ variantId, productId, name, price, imageUrl }, 1);
        setAdded(true);
        window.setTimeout(() => router.push(`/s/${slug}/cart`), 400);
      }}
    >
      {disabled ? "Esgotado" : added ? "Adicionado" : "Adicionar à sacola"}
    </button>
  );
}
