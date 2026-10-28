import { moneyCaller } from "@/lib/team/money"
import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"

export async function GET(request: Request) {
  try {

    /* The owner, or a team member who may see the store's billing (round 42, lib/team/money): the store's own plan and Stripe customer, never the member's. */
    const who = await moneyCaller("billing", "view")
    if (!who.ok) return who.response

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("session_id")

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    return NextResponse.json({
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email,
    })
  } catch (error: any) {
    console.error("Error in GET /api/billing/checkout/status:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get session status" },
      { status: 500 }
    )
  }
}
