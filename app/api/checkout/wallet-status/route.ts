import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"

/**
 * Whether an in-app wallet checkout (Apple Pay / Google Pay via Stripe's
 * page) has been paid. The app asks after the in-app browser closes.
 * Only a paid session answers with the PaymentIntent the order is made from.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("session_id") || ""
  if (!id.startsWith("cs_")) return NextResponse.json({ paid: false }, { status: 400 })
  try {
    const session = await stripe.checkout.sessions.retrieve(id, { expand: ["payment_intent"] })
    const pi = session.payment_intent
    const paymentIntent = pi && typeof pi === "object" ? pi : null
    if (session.payment_status !== "paid" || !paymentIntent?.id || !paymentIntent.client_secret) {
      return NextResponse.json({ paid: false })
    }
    return NextResponse.json({
      paid: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
    })
  } catch {
    return NextResponse.json({ paid: false }, { status: 404 })
  }
}
