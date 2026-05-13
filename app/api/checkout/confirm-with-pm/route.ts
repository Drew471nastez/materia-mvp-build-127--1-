import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"

export const runtime = "nodejs"

/**
 * Confirm a PaymentIntent server-side with a given PaymentMethod ID.
 *
 * Used by the native-app card path: the client collects raw card data in plain
 * HTML inputs, creates a PaymentMethod directly via the Stripe REST API
 * (no Stripe.js / no iframes), then calls this endpoint to confirm.
 *
 * Returns:
 *   { status: "succeeded" }
 *   { status: "requires_action", actionUrl: "https://hooks.stripe.com/..." }
 *   { error: "..." }  (4xx)
 */
export async function POST(request: Request) {
  let body: { paymentIntentId?: string; paymentMethodId?: string; returnUrl?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { paymentIntentId, paymentMethodId, returnUrl } = body

  if (!paymentIntentId || !paymentMethodId) {
    return NextResponse.json({ error: "Missing paymentIntentId or paymentMethodId" }, { status: 400 })
  }

  try {
    const pi = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
      return_url: returnUrl || `${process.env.NEXT_PUBLIC_SITE_URL || ""}/checkout`,
    })

    if (pi.status === "succeeded") {
      return NextResponse.json({ status: "succeeded" })
    }

    if (pi.status === "requires_action") {
      const actionUrl = (pi.next_action as any)?.redirect_to_url?.url ?? null
      return NextResponse.json({ status: "requires_action", actionUrl })
    }

    return NextResponse.json({ status: pi.status })
  } catch (err: any) {
    const msg = err?.raw?.message || err?.message || "Failed to confirm payment"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
