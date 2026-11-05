import { redirect } from "next/navigation"

/**
 * An order opens over the Orders list now (app/app/orders/orders-client.tsx),
 * so the list is still there, exactly as it was, when the order is closed.
 * Links to the old address, from emails and bookmarks, land on the same order.
 * The id is only carried across: the list opens an order only if it is one of
 * this creator's own.
 */
export default async function OrderRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/app/orders?order=${encodeURIComponent(id)}`)
}
