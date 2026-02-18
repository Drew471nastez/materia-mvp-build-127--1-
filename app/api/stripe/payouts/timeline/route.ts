import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orderId = request.nextUrl.searchParams.get("orderId")
    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 })
    }

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id, user_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Fetch the order — ensure it belongs to this creator's products
    const { data: order } = await adminSupabase
      .from("orders")
      .select("*, product:products!inner(id, creator_id)")
      .eq("id", orderId)
      .single()

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Security: verify the order's product belongs to this creator
    if ((order as any).product?.creator_id !== creator.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Free orders have no payout timeline
    if (!order.amount_cents || order.amount_cents === 0) {
      return NextResponse.json({
        timeline: [],
        isFreeOrder: true,
        message: "No payout timeline for free orders.",
      })
    }

    const timeline: {
      event: string
      label: string
      timestamp: string | null
      status: "completed" | "pending" | "upcoming"
    }[] = []

    // 1. Order created
    timeline.push({
      event: "order_created",
      label: "Order created",
      timestamp: order.created_at,
      status: "completed",
    })

    // 2. Payment completed
    if (order.stripe_payment_intent_id) {
      timeline.push({
        event: "payment_completed",
        label: "Payment completed",
        timestamp: order.created_at, // Payment happens at order creation
        status: "completed",
      })
    }

    // Try to get Stripe data for availability info
    const stripeAccountId = creator.stripe_account_id
    let availableOn: string | null = null
    let payoutInfo: any = null

    if (stripeAccountId && order.stripe_payment_intent_id) {
      try {
        // For destination charges, the PI lives on the platform account.
        // The transfer to the connected account creates a balance transaction there.
        // We need the transfer_id to find the connected account's balance transaction.
        const pi = await stripe.paymentIntents.retrieve(
          order.stripe_payment_intent_id,
          { expand: ["latest_charge.balance_transaction", "transfer"] }
        )

        const charge = pi.latest_charge as any
        const transfer = pi.transfer as any

        // If there's a transfer, look up the balance transaction on the connected account
        if (transfer) {
          try {
            const transferObj =
              typeof transfer === "string"
                ? await stripe.transfers.retrieve(transfer)
                : transfer

            // The destination_payment is the charge on the connected account
            if (transferObj.destination_payment) {
              const destCharge = await stripe.charges.retrieve(
                transferObj.destination_payment as string,
                { expand: ["balance_transaction"] },
                { stripeAccount: stripeAccountId }
              )

              const destBt = destCharge.balance_transaction as any
              if (destBt?.available_on) {
                availableOn = new Date(destBt.available_on * 1000).toISOString()
              }
            }
          } catch (transferErr) {
            console.error("[Timeline] Transfer lookup error:", transferErr)
          }
        }

        // Fallback: use the platform balance transaction's available_on
        if (!availableOn && charge?.balance_transaction) {
          const bt = charge.balance_transaction as any
          if (bt?.available_on) {
            availableOn = new Date(bt.available_on * 1000).toISOString()
          }
        }
      } catch (piErr) {
        console.error("[Timeline] PI lookup error:", piErr)
      }
    }

    // 3. Funds pending
    const now = new Date()
    if (availableOn) {
      const availDate = new Date(availableOn)
      const isPast = availDate <= now
      timeline.push({
        event: "funds_pending",
        label: "Funds pending",
        timestamp: order.created_at,
        status: "completed",
      })

      // 4. Funds available
      timeline.push({
        event: "funds_available",
        label: isPast ? "Funds available to withdraw" : "Funds available to withdraw",
        timestamp: availableOn,
        status: isPast ? "completed" : "pending",
      })
    } else {
      // Estimate: typically 2-7 business days after payment
      timeline.push({
        event: "funds_pending",
        label: "Funds pending",
        timestamp: order.created_at,
        status: "completed",
      })
      timeline.push({
        event: "funds_available",
        label: "Funds available to withdraw (estimated)",
        timestamp: null,
        status: "upcoming",
      })
    }

    // 5. Check for payout events from DB
    if (stripeAccountId) {
      const { data: payoutEvents } = await adminSupabase
        .from("payout_events")
        .select("*")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })
        .limit(5)

      // Find a payout that occurred after the funds became available
      if (payoutEvents && payoutEvents.length > 0) {
        const latestPayout = payoutEvents[0]
        payoutInfo = latestPayout

        timeline.push({
          event: "payout_created",
          label: "Payout created",
          timestamp: latestPayout.created_at,
          status: "completed",
        })

        if (latestPayout.status === "paid") {
          timeline.push({
            event: "payout_paid",
            label: "Payout arrived",
            timestamp: latestPayout.arrival_date || latestPayout.updated_at,
            status: "completed",
          })
        } else if (latestPayout.status === "in_transit") {
          timeline.push({
            event: "payout_in_transit",
            label: "Payout in transit",
            timestamp: latestPayout.updated_at,
            status: "pending",
          })
        } else if (latestPayout.status === "failed") {
          timeline.push({
            event: "payout_failed",
            label: "Payout failed",
            timestamp: latestPayout.updated_at,
            status: "completed",
          })
        }
      }
    }

    return NextResponse.json({
      timeline,
      isFreeOrder: false,
      availableOn,
      payoutInfo,
    })
  } catch (error: any) {
    console.error("[Timeline Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch timeline" },
      { status: 500 }
    )
  }
}
