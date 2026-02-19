import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

export async function GET(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get("orderId")
    if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 })

    const supabase = await createClient()
    const admin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await admin
      .from("creators")
      .select("id,user_id,stripe_account_id")
      .eq("user_id", user.id)
      .single()
    if (!creator?.stripe_account_id) return NextResponse.json({ events: [] })

    const { data: order } = await admin
      .from("orders")
      .select("id,product_id,amount_cents,created_at,stripe_payment_intent_id,transfer_id")
      .eq("id", orderId)
      .single()
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    const { data: product } = await admin
      .from("products")
      .select("id,creator_id")
      .eq("id", order.product_id)
      .single()

    if (!product || product.creator_id !== creator.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if ((order.amount_cents || 0) <= 0) {
      return NextResponse.json({ events: [], freeOrder: true })
    }

    const events: Array<{ label: string; timestamp: string; type: string }> = [
      { label: "Order created", timestamp: order.created_at, type: "order_created" },
    ]

    if (order.stripe_payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id)
      if (pi.status === "succeeded") {
        events.push({ label: "Payment completed", timestamp: new Date((pi.created || 0) * 1000).toISOString(), type: "payment_completed" })
      }
    }

    if (order.transfer_id) {
      const txList = await stripe.balanceTransactions.list(
        { limit: 1, source: order.transfer_id },
        { stripeAccount: creator.stripe_account_id }
      )
      const tx = txList.data[0]
      if (tx) {
        events.push({ label: "Funds pending", timestamp: new Date(tx.created * 1000).toISOString(), type: "funds_pending" })
        events.push({ label: "Funds available to withdraw", timestamp: new Date(tx.available_on * 1000).toISOString(), type: "funds_available" })
      }
    }

    const payoutEvents = await admin
      .from("stripe_payout_events")
      .select("status,created_at,arrival_date")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: true })
      .limit(10)

    for (const ev of payoutEvents.data || []) {
      if (ev.status === "pending") events.push({ label: "Payout created", timestamp: ev.created_at, type: "payout_created" })
      if (ev.status === "in_transit") events.push({ label: "Payout in transit", timestamp: ev.created_at, type: "payout_in_transit" })
      if (ev.status === "paid") {
        events.push({ label: "Payout paid", timestamp: ev.created_at, type: "payout_paid" })
        if (ev.arrival_date) events.push({ label: "Estimated arrival", timestamp: ev.arrival_date, type: "payout_arrival" })
      }
    }

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    return NextResponse.json({ events, freeOrder: false })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load timeline" }, { status: 500 })
  }
}
