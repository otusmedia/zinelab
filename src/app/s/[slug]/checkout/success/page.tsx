import Link from "next/link";
import { ClearCartOnMount } from "@/components/store/ClearCartOnMount";

export default async function StoreCheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  return (
    <div className="store-section store-shell">
      <ClearCartOnMount />
      <h2>Pedido confirmado</h2>
      <p className="lede">
        Obrigado. Seu pedido
        {query.order ? ` ${query.order.slice(0, 8)}` : ""} foi registrado e o
        estoque foi atualizado.
      </p>
      <Link href={`/s/${slug}/products`} className="store-cta">
        Voltar à coleção
      </Link>
    </div>
  );
}
