import { redirect } from "next/navigation"

/**
 * An old address for buying one product. It had its own payment routes,
 * which charged the platform when the seller could not be paid and never
 * made an order; nothing links here now. The one checkout is /checkout.
 */
export default async function CheckoutRedirect({ searchParams }: { searchParams: Promise<{ product_id?: string }> }) {
  const { product_id } = await searchParams
  redirect(product_id && /^[0-9a-f-]{36}$/i.test(product_id) ? `/checkout?productId=${product_id}` : "/explore")
}
