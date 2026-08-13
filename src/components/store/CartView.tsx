"use client";

import Link from "next/link";
import { useCart } from "@/components/store/CartProvider";

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function CartView({ slug }: { slug: string }) {
  const { items, total, setQty, removeItem } = useCart();

  if (!items.length) {
    return (
      <div className="store-section store-shell">
        <h2>Sacola</h2>
        <p className="store-empty">Sua sacola está vazia.</p>
        <Link href={`/s/${slug}/products`} className="store-cta">
          Continuar comprando
        </Link>
      </div>
    );
  }

  return (
    <div className="store-section store-shell">
      <h2>Sacola</h2>
      <p className="lede">Revise os itens antes do checkout.</p>
      <table className="store-cart-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Qtd</th>
            <th>Preço</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.variantId}>
              <td>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      width={56}
                      height={72}
                      style={{ objectFit: "cover", border: "1px solid rgba(244,239,230,0.14)" }}
                    />
                  ) : null}
                  <span>{item.name}</span>
                </div>
              </td>
              <td>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    setQty(item.variantId, Number(e.target.value) || 1)
                  }
                  style={{
                    width: 72,
                    background: "#161412",
                    color: "#f4efe6",
                    border: "1px solid rgba(244,239,230,0.14)",
                    padding: 8,
                  }}
                />
              </td>
              <td>{formatPrice(item.price * item.quantity)}</td>
              <td>
                <button
                  type="button"
                  className="store-cta"
                  onClick={() => removeItem(item.variantId)}
                >
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 24, fontSize: "1.1rem" }}>
        Total: {formatPrice(total)}
      </p>
      <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
        <Link href={`/s/${slug}/products`} className="store-cta">
          Continuar
        </Link>
        <Link href={`/s/${slug}/checkout`} className="store-cta primary">
          Finalizar
        </Link>
      </div>
    </div>
  );
}
