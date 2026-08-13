"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
  variantId: string;
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  addItem: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQty: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(slug: string) {
  return `zine_store_cart_${slug}`;
}

export function CartProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(slug));
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      setItems([]);
    }
    setReady(true);
  }, [slug]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(storageKey(slug), JSON.stringify(items));
  }, [items, ready, slug]);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity">, qty = 1) => {
      setItems((prev) => {
        const existing = prev.find((p) => p.variantId === item.variantId);
        if (existing) {
          return prev.map((p) =>
            p.variantId === item.variantId
              ? { ...p, quantity: p.quantity + qty }
              : p,
          );
        }
        return [...prev, { ...item, quantity: qty }];
      });
    },
    [],
  );

  const setQty = useCallback((variantId: string, quantity: number) => {
    setItems((prev) =>
      prev
        .map((p) =>
          p.variantId === variantId
            ? { ...p, quantity: Math.max(0, quantity) }
            : p,
        )
        .filter((p) => p.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setItems((prev) => prev.filter((p) => p.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return { items, count, total, addItem, setQty, removeItem, clear };
  }, [items, addItem, setQty, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
