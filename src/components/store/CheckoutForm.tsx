"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { checkoutStoreOrderAction } from "@/app/actions/store";
import { useCart } from "@/components/store/CartProvider";

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function CheckoutForm({
  slug,
  error,
}: {
  slug: string;
  error?: string;
}) {
  const { items, total } = useCart();
  const router = useRouter();
  const payload = useMemo(
    () =>
      JSON.stringify(
        items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      ),
    [items],
  );

  useEffect(() => {
    if (!items.length) {
      router.replace(`/s/${slug}/cart`);
    }
  }, [items.length, router, slug]);

  if (!items.length) {
    return <p className="store-empty store-shell">Carrinho vazio.</p>;
  }

  return (
    <div className="store-section store-shell">
      <h2>Checkout</h2>
      <p className="lede">
        Total {formatPrice(total)}. Pagamento online entra depois — o pedido já
        baixa o estoque.
      </p>
      {error ? <div className="store-error">{error}</div> : null}
      <form action={checkoutStoreOrderAction} className="store-form" style={{ maxWidth: 480 }}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="items" value={payload} />
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" name="name" required />
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" />
        </div>
        <div className="field">
          <label htmlFor="phone">Telefone</label>
          <input id="phone" name="phone" />
        </div>
        <button type="submit" className="store-cta primary">
          Confirmar pedido
        </button>
      </form>
    </div>
  );
}
