import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { isCheckoutSessionId, isPlausibleToken } from "@/lib/receipts/rules"
import { PaymentStatus } from "@/components/receipt/payment-status"
import { STRIPE_RENDER_WAIT_MS, isStripeUnreachable } from "@/lib/stripe-wait"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/**
 * A basket's address, kept because /api/checkout/cart/complete and older
 * emails point here. A basket is now one receipt at /receipt/<token>, which
 * finds every line of the same payment by itself, so this only forwards.
 *
 * The Stripe session id is the buyer's own (it is in the URL Stripe sent
 * them back to). When no order exists for it yet, Stripe is asked whether it
 * was paid: paid goes back through fulfilment, which is idempotent on the
 * session, and anything else is shown as not paid.
 */
export default async function CartReceiptPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  if (!isCheckoutSessionId(sessionId)) notFound()

  const admin = createAdminClient()
  const { data: orders } = await admin
    .from("orders")
    .select("receipt_token, created_at")
    .eq("stripe_session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(1)

  const token = orders?.[0]?.receipt_token
  if (isPlausibleToken(token)) redirect(`/receipt/${token}`)

  let state: "paid" | "unpaid" | "expired" | "waiting" = "expired"
  try {
    /* Bounded: Stripe's own default is 80s, and the buyer stared at a blank page for it. */
    const session = await stripe.checkout.sessions.retrieve(sessionId, undefined, { timeout: STRIPE_RENDER_WAIT_MS })
    if (session.metadata?.cart !== "1") notFound()
    state = session.payment_status === "paid" ? "paid" : session.status === "expired" ? "expired" : "unpaid"
  } catch (error) {
    /* Stripe slow or unreachable is not "no such checkout": wait and ask again (PaymentStatus asks every few seconds). */
    if (isStripeUnreachable(error)) return <PaymentStatus state="waiting" />
    notFound()
  }

  if (state === "paid") redirect(`/api/checkout/cart/complete?session_id=${encodeURIComponent(sessionId)}`)
  return <PaymentStatus state={state} />
}
