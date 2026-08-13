"use client";

import { useEffect } from "react";
import { useCart } from "@/components/store/CartProvider";

export function ClearCartOnMount() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}
