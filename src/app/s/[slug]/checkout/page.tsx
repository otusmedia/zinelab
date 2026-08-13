import { CheckoutForm } from "@/components/store/CheckoutForm";

export default async function StoreCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  return <CheckoutForm slug={slug} error={query.error} />;
}
