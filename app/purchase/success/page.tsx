import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { isCheckoutSessionId, isPlausibleToken } from "@/lib/receipts/rules"
import { PaymentStatus } from "@/components/receipt/payment-status"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/**
 * Where hosted Stripe Checkout sends a single-product buyer back to
 * (app/api/checkout success_url). The order is written by the webhook, which
 * can land a moment after the buyer does.
 *
 *  - The order exists: straight to its receipt.
 *  - Stripe says paid, no order yet: wait here and ask again.
 *  - Stripe says not paid, or the session is gone: say so. Nothing on this
 *    page trusts the query string beyond using it to ask Stripe.
 */
export default async function PurchaseSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams
  if (!isCheckoutSessionId(sessionId)) redirect("/account/library")

  const admin = createAdminClient()
  const { data: orders } = await admin
    .from("orders")
    .select("receipt_token, created_at")
    .eq("stripe_session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(1)

  const token = orders?.[0]?.receipt_token
  if (isPlausibleToken(token)) redirect(`/receipt/${token}`)

  let paid = false
  let expired = false
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    paid = session.payment_status === "paid" || session.payment_status === "no_payment_required"
    expired = session.status === "expired"
  } catch {
    expired = true
  }

  return <PaymentStatus state={paid ? "waiting" : expired ? "expired" : "unpaid"} />
}
