import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

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

    // Load the order — verify it belongs to this creator via product ownership
    const { data: order } = await adminSupabase
      .from("orders")
      .select(`
        id, amount_cents, status, created_at, stripe_payment_intent_id,
        products!inner(creator_id)
      `)
      .eq("id", orderId)
      .single()

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    // Security: ensure the order's product belongs to this creator
    const productCreatorId = (order as any).products?.creator_id
    if (productCreatorId !== creator.id) {
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
    let balanceTxId: string | null = null

    if (order.stripe_payment_intent_id && creator.stripe_account_id) {
      try {
        // The charge lives on the PLATFORM account (destination charge model)
        const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, {
          expand: ["latest_charge"],
        })

        const charge = pi.latest_charge as any
        if (charge?.created) {
          paymentCompletedAt = new Date(charge.created * 1000).toISOString()
        }

        // The transfer to the connected account has a balance transaction there
        // Find balance transaction on the connected account for the destination payment
        if (charge?.destination_payment && creator.stripe_account_id) {
          try {
            const destCharge = await stripe.charges.retrieve(
              typeof charge.destination_payment === "string"
                ? charge.destination_payment
                : charge.destination_payment.id,
              { stripeAccount: creator.stripe_account_id }
            )

            const btId = typeof destCharge.balance_transaction === "string"
              ? destCharge.balance_transaction
              : (destCharge.balance_transaction as any)?.id

            if (btId) {
              balanceTxId = btId
              const bt = await stripe.balanceTransactions.retrieve(btId, {
                stripeAccount: creator.stripe_account_id,
              })

              if (bt.available_on) {
                availableAt = new Date(bt.available_on * 1000).toISOString()
              }
            }
          } catch {
            // Destination charge lookup failed — not critical
          }
        }
      } catch (err) {
        console.error("[OrderTimeline] PI lookup failed:", err)
      }
    }

    timeline.push({
      id: "payment_completed",
      label: "Payment completed",
      description: "Stripe processed the payment",
      timestamp: paymentCompletedAt,
      status: paymentCompletedAt ? "completed" : "upcoming",
    })

    // Step 3: Funds pending
    timeline.push({
      id: "funds_pending",
      label: "Funds pending",
      description: "Funds are in transit to your account",
      timestamp: paymentCompletedAt, // pending starts right after payment
      status: paymentCompletedAt ? "completed" : "upcoming",
    })

    // Step 4: Funds available
    const now = new Date()
    const availableDate = availableAt ? new Date(availableAt) : null
    const isFundsAvailable = availableDate ? availableDate <= now : false

    timeline.push({
      id: "funds_available",
      label: "Funds available to withdraw",
      description: availableAt
        ? `Available since ${new Date(availableAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
        : "Typically 2–7 business days after payment",
      timestamp: availableAt,
      status: isFundsAvailable ? "completed" : paymentCompletedAt ? "pending" : "upcoming",
    })

    // Step 5: Payout created/paid — look up in DB payouts table
    const { data: relatedPayouts } = await adminSupabase
      .from("payouts")
      .select("stripe_payout_id, status, amount_cents, currency, arrival_date, stripe_created")
      .eq("creator_id", creator.id)
      .order("stripe_created", { ascending: true })
      .limit(5)

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

function formatCents(cents: number, currency: string) {
  const amount = cents / 100
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount)
}
