import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { formatMinor } from "@/lib/markets/money"

/**
 * GET /api/stripe/order-timeline?orderId=<uuid>
 *
 * Returns a Stripe-based timeline for a paid order:
 *  - Order created
 *  - Payment completed
 *  - Funds pending (in transit to connected account)
 *  - Funds available (availability date from balance transaction)
 *  - Payout created (if seller has already withdrawn)
 *  - Payout paid/arrived (if completed)
 *
 * Security: verifies the order belongs to the authenticated seller.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get("orderId")

    if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 })

    // Load creator for isolation check
    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    // Load the order
    const { data: order } = await adminSupabase
      .from("orders")
      .select("id, amount_cents, status, created_at, stripe_payment_intent_id, product_id, refunded_at, refund_amount_cents, refund_reason")
      .eq("id", orderId)
      .single()

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    // Security: verify the order's product belongs to this creator (two-step, no FK join required)
    const { data: product } = await adminSupabase
      .from("products")
      .select("id, creator_id")
      .eq("id", order.product_id)
      .single()

    if (!product || product.creator_id !== creator.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Free orders — no timeline
    if (!order.amount_cents || order.amount_cents === 0) {
      return NextResponse.json({ free: true, timeline: [] })
    }

    const timeline: Array<{
      id: string
      label: string
      description: string
      timestamp: string | null
      status: "completed" | "pending" | "upcoming"
    }> = []

    // Step 1: Order created
    timeline.push({
      id: "order_created",
      label: "Order created",
      description: "Buyer placed the order",
      timestamp: order.created_at,
      status: "completed",
    })

    // Step 2: Payment completed
    let paymentCompletedAt: string | null = null
    let availableAt: string | null = null

    // Parallelize: fetch Stripe payment data + DB payouts query at the same time
    const stripeDataPromise = (async () => {
      if (!order.stripe_payment_intent_id || !creator.stripe_account_id) return
      try {
        const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, {
          expand: ["latest_charge"],
        })

        const charge = pi.latest_charge as any
        if (charge?.created) {
          paymentCompletedAt = new Date(charge.created * 1000).toISOString()
        }

        if (charge?.destination_payment && creator.stripe_account_id) {
          try {
            const destCharge = await stripe.charges.retrieve(
              typeof charge.destination_payment === "string"
                ? charge.destination_payment
                : charge.destination_payment.id,
              { expand: ["balance_transaction"] }, { stripeAccount: creator.stripe_account_id }
            )

            const bt = destCharge.balance_transaction as any
            if (bt?.available_on) {
              availableAt = new Date(bt.available_on * 1000).toISOString()
            }
          } catch {
            // Destination charge lookup failed — not critical
          }
        }
      } catch (err) {
        console.error("[OrderTimeline] PI lookup failed:", err)
      }
    })()

    const payoutsPromise = adminSupabase
      .from("payouts")
      .select("stripe_payout_id, status, amount_cents, currency, arrival_date, stripe_created")
      .eq("creator_id", creator.id)
      .order("stripe_created", { ascending: true })
      .limit(5)

    // Also fetch the ledger event for this order to get hold_until date
    const ledgerPromise = adminSupabase
      .from("ledger_events")
      .select("hold_until, released_at")
      .eq("order_id", orderId)
      .eq("event_type", "sale")
      .limit(1)
      .single()

    // Wait for all in parallel
    const [, { data: relatedPayouts }, { data: ledgerEvent }] = await Promise.all([
      stripeDataPromise,
      payoutsPromise,
      ledgerPromise,
    ])

    timeline.push({
      id: "payment_completed",
      label: "Payment completed",
      description: "Stripe processed the payment",
      timestamp: paymentCompletedAt,
      status: paymentCompletedAt ? "completed" : "upcoming",
    })

    // Step 3: Funds pending (no separate timestamp — begins the moment payment is captured)
    timeline.push({
      id: "funds_pending",
      label: "Funds pending",
      description: "Payment captured. Funds are clearing and will be available within 2–7 business days.",
      timestamp: null,
      status: paymentCompletedAt ? "completed" : "upcoming",
    })

    // Step 4: Funds available for cashout
    // hold_until is set to Stripe's actual available_on date (settlement time varies by country/risk)
    const now = new Date()
    const holdUntil = ledgerEvent?.hold_until ? new Date(ledgerEvent.hold_until) : null
    const isReleased = !!ledgerEvent?.released_at
    const availableDate = holdUntil || (availableAt ? new Date(availableAt) : null)
    const isFundsAvailable = isReleased || (availableDate ? availableDate <= now : false)

    const availableDescription = (() => {
      if (isReleased) {
        return `Available for cash out since ${new Date(ledgerEvent!.released_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      }
      if (holdUntil) {
        return holdUntil <= now
          ? `Available for cash out since ${holdUntil.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
          : `Available for cash out on ${holdUntil.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      }
      if (availableAt) {
        return `Available for cash out on ${new Date(availableAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      }
      return "Typically 2–7 business days after payment"
    })()

    timeline.push({
      id: "funds_available",
      label: isFundsAvailable ? "Available for cash out" : "Available soon",
      description: availableDescription,
      timestamp: holdUntil?.toISOString() || availableAt,
      status: isFundsAvailable ? "completed" : paymentCompletedAt ? "pending" : "upcoming",
    })

    // Step 5: Refund (if applicable)
    if (order.status === "refunded" && order.refunded_at) {
      const refundAmountStr = order.refund_amount_cents
        ? formatCents(order.refund_amount_cents, "usd")
        : formatCents(order.amount_cents, "usd")
      timeline.push({
        id: "refund_issued",
        label: "Refund issued",
        description: `${refundAmountStr} refunded to buyer${order.refund_reason ? ` — ${order.refund_reason}` : ""}`,
        timestamp: order.refunded_at,
        status: "completed",
      })
    }

    // We can't definitively link a specific payout to a specific order (Stripe doesn't),
    // but we show the most recent payout created after the order as context.
    const recentPayout = relatedPayouts?.find((p) => {
      const payoutCreated = p.stripe_created ? new Date(p.stripe_created) : null
      const orderCreated = new Date(order.created_at)
      return payoutCreated && payoutCreated >= orderCreated
    })

    if (recentPayout) {
      timeline.push({
        id: "payout_created",
        label: "Payout created",
        description: `Withdrawal of ${formatCents(recentPayout.amount_cents, recentPayout.currency)} initiated (${recentPayout.stripe_payout_id})`,
        timestamp: recentPayout.stripe_created,
        status: "completed",
      })

      const payoutPaid = recentPayout.status === "paid"
      const payoutInTransit = recentPayout.status === "in_transit"

      timeline.push({
        id: "payout_paid",
        label: payoutPaid ? "Payout arrived" : "Payout in transit",
        description: recentPayout.arrival_date
          ? `Estimated arrival: ${new Date(recentPayout.arrival_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
          : "Most payouts arrive in 1–3 business days depending on your bank.",
        timestamp: payoutPaid ? recentPayout.arrival_date : null,
        status: payoutPaid ? "completed" : payoutInTransit ? "pending" : "upcoming",
      })
    }

    return NextResponse.json({ free: false, timeline })
  } catch (error: any) {
    console.error("[OrderTimeline Error]", error)
    return NextResponse.json({ error: error.message || "Failed to fetch timeline" }, { status: 500 })
  }
}

/* Stripe's minor units in the charge's own currency: ¥ has no decimals, lei read "25.00 lei" (lib/markets/money formatMinor). */
function formatCents(cents: number, currency: string) {
  return formatMinor(cents, currency.toUpperCase(), "en-US")
}
