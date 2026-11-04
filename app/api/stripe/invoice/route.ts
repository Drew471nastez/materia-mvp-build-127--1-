import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const who = await routeUser()
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get("orderId")

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 })
    }

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const { data: order } = await adminSupabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single()

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    // Verify order belongs to creator's product
    const { data: product } = await adminSupabase
      .from("products")
      .select("id, creator_id, title")
      .eq("id", order.product_id)
      .single()

    if (!product || product.creator_id !== creator.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    if (!order.stripe_payment_intent_id) {
      return NextResponse.json({ error: "No payment intent for this order" }, { status: 400 })
    }

    // Retrieve the payment intent to get the charge, then find the receipt URL
    const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, {
      expand: ["latest_charge"],
    })

    const charge = pi.latest_charge as any
    if (charge?.receipt_url) {
      return NextResponse.redirect(charge.receipt_url)
    }

    return NextResponse.json({
      error: "No receipt available for this payment",
    }, { status: 404 })
  } catch (error: any) {
    console.error("[Stripe Invoice Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to retrieve invoice" },
      { status: 500 }
    )
  }
}
