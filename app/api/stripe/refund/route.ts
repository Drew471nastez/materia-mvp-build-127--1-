import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { syncChargeRefund } from "@/lib/stripe/refund-sync"
import { fullyRefunded } from "@/lib/orders/refund-state"
import { emit } from "@/lib/notify/outbox"

function tryCreateAdminClient() {
  try {
    const { createAdminClient } = require("@/lib/supabase/admin")
    return createAdminClient()
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const dbClient = tryCreateAdminClient() || supabase

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await dbClient.from("creators").select("*").eq("user_id", user.id).single()
    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const body = await request.json()
    const { orderId, reason, amount } = body

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 })
    }

    // Fetch the order
    const { data: order, error: orderError } = await dbClient
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Verify this order belongs to the creator's product
    const { data: product } = await dbClient
      .from("products")
      .select("id, creator_id, title")
      .eq("id", order.product_id)
      .single()

    if (!product || product.creator_id !== creator.id) {
      return NextResponse.json({ error: "Unauthorized - order does not belong to you" }, { status: 403 })
    }

    /* A partly refunded order can be refunded again, up to what is left;
       one refunded in full cannot. */
    const alreadyRefunded = order.status === "refunded" ? Math.max(0, Number(order.refund_amount_cents) || 0) : 0
    if (order.status === "refunded" && fullyRefunded(order)) {
      return NextResponse.json({ error: "Order has already been refunded" }, { status: 400 })
    }

    /* Only money that was taken can go back. A pending or failed row has a
       payment intent too, and refunding it would ask Stripe for a refund of
       a charge that never happened. */
    if (order.status !== "completed" && order.status !== "refunded") {
      return NextResponse.json({ error: "Only a paid order can be refunded" }, { status: 400 })
    }

    if (!order.stripe_payment_intent_id) {
      return NextResponse.json({ error: "No payment intent found for this order" }, { status: 400 })
    }

    // Validate refund amount
    const maxRefundCents = Math.max(0, (order.amount_cents || 0) - alreadyRefunded)
    const refundAmountCents = amount === undefined || amount === null ? maxRefundCents : Math.round(Number(amount) * 100)

    if (!Number.isFinite(refundAmountCents) || refundAmountCents <= 0) {
      return NextResponse.json({ error: "Refund amount must be positive" }, { status: 400 })
    }

    if (refundAmountCents > maxRefundCents) {
      return NextResponse.json({
        error: `Refund amount cannot exceed the order total of $${(maxRefundCents / 100).toFixed(2)}`,
      }, { status: 400 })
    }

    // Create Stripe refund — use connected account if available
    const refundParams: any = {
      payment_intent: order.stripe_payment_intent_id,
      amount: refundAmountCents,
      reason: reason === "duplicate" ? "duplicate" : reason === "fraudulent" ? "fraudulent" : "requested_by_customer",
      metadata: {
        order_id: orderId,
        creator_id: creator.id,
        product_id: order.product_id,
        refund_reason: reason || "requested_by_customer",
      },
    }
    /*
      DESTINATION CHARGES: the PaymentIntent and its refunds live on the
      platform account, so no stripeAccount here. Stripe does NOT take the
      seller's part back on its own: without `reverse_transfer` the platform
      paid every refund in full while the seller kept what was transferred,
      and the balance on Payouts (lib/stripe/refund-sync.ts) already takes it
      off the seller. The application fee is not refunded, which is the fee
      share that balance leaves with the platform.

      ONE REFUND PER SUBMIT: the key makes a second submit of the same refund
      (a double tap, two tabs) return the first instead of refunding twice.
    */
    refundParams.reverse_transfer = true
    /* Keyed on what was refunded before too: a double tap repeats the key,
       a later partial refund of what is left does not. */
    const refund = await stripe.refunds.create(refundParams, { idempotencyKey: `storelib-refund:${orderId}:${alreadyRefunded}:${refundAmountCents}` })

    /* The row, at once, with the running total: the page reads it next. */
    const refundedAt = new Date().toISOString()
    const refundedTotal = Math.min(order.amount_cents || 0, alreadyRefunded + refundAmountCents)
    await dbClient.from("orders").update({ status: "refunded" }).eq("id", orderId)
    try {
      await dbClient
        .from("orders")
        .update({ refunded_at: refundedAt, refund_reason: reason || "requested_by_customer", refund_amount_cents: refundedTotal, stripe_refund_id: refund.id })
        .eq("id", orderId)
    } catch {
      /* Older databases have no refund columns; the status above is enough. */
    }

    /* The notification engine, under the key charge.refunded raises too
       (lib/stripe/refund-sync.ts), so the refund is told once. */
    await emit({
      name: "order.refunded",
      key: `refund:${orderId}:${refund.id}`,
      userId: user.id,
      creatorId: creator.id,
      entityType: "order",
      entityId: orderId,
      correlationId: refund.id,
      payload: {
        orderId,
        refundId: refund.id,
        productId: order.product_id ?? null,
        amountCents: refundAmountCents,
        currency: (refund.currency || "usd").toLowerCase(),
        full: refundedTotal >= (order.amount_cents || 0),
        reason: reason || "requested_by_customer",
        buyerEmail: order.customer_email || order.buyer_email || null,
      },
    })

    /* The seller's balance and the buyer's library, now rather than when
       charge.refunded arrives. Idempotent with the webhook: each refund is
       applied to each row once (lib/stripe/refund-sync.ts). */
    const admin = tryCreateAdminClient()
    if (admin) {
      try {
        const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, { expand: ["latest_charge"] })
        const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? (pi.latest_charge as import("stripe").Stripe.Charge) : null
        if (charge) await syncChargeRefund(admin, stripe, charge)
      } catch (syncErr) {
        console.error("[Refund] ledger now failed; charge.refunded will apply it:", syncErr instanceof Error ? syncErr.message : syncErr)
      }
      /* Refunded in full across several refunds from this page: the library
         entry goes, which a single refund's share cannot see on its own. */
      if (refundedTotal >= (order.amount_cents || 0) && order.buyer_id && order.product_id) {
        let revoke = admin.from("entitlements").delete().eq("buyer_id", order.buyer_id).eq("product_id", order.product_id)
        revoke = order.variant_id ? revoke.eq("variant_id", order.variant_id) : revoke.is("variant_id", null)
        await revoke.then(
          () => undefined,
          () => undefined,
        )
      }
    }

    // Send refund notification emails
    try {
      const { sendRefundEmails, resolveCreatorIdentity } = await import("@/lib/email")

      // Resolve proper creator display name and email
      let storeName = creator.username || "Store"
      let sellerContactEmail = user.email || ""
      let sellerAvatarUrl = ""
      try {
        const identity = await resolveCreatorIdentity(dbClient, creator.id)
        storeName = identity.fromName || storeName
        sellerContactEmail = identity.sellerEmail || sellerContactEmail
      } catch (identityErr) {
        console.log("[Refund] Could not resolve creator identity, using fallback:", identityErr)
      }

      // Resolve seller avatar URL
      try {
        const { data: profile } = await dbClient
          .from("profiles")
          .select("avatar_url")
          .eq("id", creator.user_id)
          .single()
        if (profile?.avatar_url) sellerAvatarUrl = profile.avatar_url
      } catch {
        // No avatar available
      }
      if (!sellerAvatarUrl && creator.avatar_url) {
        sellerAvatarUrl = creator.avatar_url
      }

      await sendRefundEmails({
        buyerEmail: order.customer_email || order.buyer_email,
        sellerEmail: user.email,
        sellerContactEmail,
        productTitle: product.title,
        refundAmount: refundAmountCents,
        currency: creator.default_currency || "USD",
        orderId,
        reason: reason || "Requested by seller",
        storeName,
        orderDate: order.created_at || order.order_date,
        sellerAvatarUrl,
      })
    } catch (emailErr) {
      console.error("[Refund] Email notification failed:", emailErr)
      // Don't fail the refund if email fails
    }

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      status: refund.status,
      amount: refundAmountCents,
      refundedAt,
    })
  } catch (error: any) {
    console.error("[Stripe Refund Error]", error)
    /* Stripe's own words for a refund it refused are useful to the seller;
       anything else is plumbing and stays in the log. */
    const message = error?.type === "StripeInvalidRequestError" && error?.raw?.message ? error.raw.message : "The refund could not be made. Nothing was changed. Try again."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
