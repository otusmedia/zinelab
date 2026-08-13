import { CartView } from "@/components/store/CartView";

export default async function StoreCartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CartView slug={slug} />;
}
