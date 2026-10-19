import { NextResponse } from "next/server"
import { formatStoreMoney } from "@/lib/store/currency"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { syncChargeRefund } from "@/lib/stripe/refund-sync"
import { fullyRefunded } from "@/lib/orders/refund-state"
import { emit } from "@/lib/notify/outbox"
import { refundAirwallexOrder } from "@/lib/payments/refunds"

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
    const { orderId, amount } = body
    /* A reason value from the store's list (lib/store/reasons), or none: never free text on the order. */
    const reason = typeof body.reason === "string" && /^[a-z0-9_]{1,40}$/.test(body.reason) ? body.reason : null

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

    /* A sale paid through Storelib Payments on Airwallex carries its payment in provider_payment_id (part 76). */
    const onAirwallex = order.provider === "airwallex" && typeof order.provider_payment_id === "string" && order.provider_payment_id.startsWith("int_")
    /*
      CASH ON DELIVERY (lib/physical/cash-on-delivery.ts): no card to send
      money back to. Before the cash is in there is nothing to refund, and the
      order is cancelled instead; after, the refund is the cash the seller
      gives back, recorded here, with nothing sent to Stripe.
    */
    const byCash = order.provider === "cod"
    if (byCash) {
      const { data: co } = order.checkout_id
        ? await dbClient.from("commerce_checkouts").select("cod_collected_at").eq("id", order.checkout_id).eq("creator_id", creator.id).maybeSingle()
        : { data: null }
      if (!(co as { cod_collected_at?: string | null } | null)?.cod_collected_at) {
        return NextResponse.json({ error: "This order hasn't been paid yet: the cash is collected on delivery. Cancel the order instead." }, { status: 409 })
      }
    }
    /* A free order took no money, so there is nothing to send back: said plainly, not as a missing payment. */
    if ((order.amount_cents || 0) <= 0) {
      return NextResponse.json({ error: "This order was free, so there's nothing to refund." }, { status: 400 })
    }
    if (!order.stripe_payment_intent_id && !onAirwallex && !byCash) {
      return NextResponse.json({ error: "This order has no card payment to refund. If the buyer paid another way, refund them directly." }, { status: 400 })
    }

    // Validate refund amount
    const maxRefundCents = Math.max(0, (order.amount_cents || 0) - alreadyRefunded)
    const refundAmountCents = amount === undefined || amount === null ? maxRefundCents : Math.round(Number(amount) * 100)

    if (!Number.isFinite(refundAmountCents) || refundAmountCents <= 0) {
      return NextResponse.json({ error: "Refund amount must be positive" }, { status: 400 })
    }

    if (refundAmountCents > maxRefundCents) {
      return NextResponse.json({
        error: `Refund amount cannot exceed the order total of ${formatStoreMoney(maxRefundCents, order.currency)}`,
      }, { status: 400 })
    }

    /* Airwallex: Storelib refunds the buyer and charges the creator's share back (lib/payments/refunds). */
    let refund: { id: string; status: string | null; currency: string | null }
    if (byCash) {
      /* Keyed like a card refund, so a double tap records it once (the emitted event's key below). */
      refund = { id: `cash_${orderId}_${alreadyRefunded}_${refundAmountCents}`, status: "succeeded", currency: order.currency ? String(order.currency).toLowerCase() : null }
    } else if (onAirwallex) {
      const done = await refundAirwallexOrder({
        orderId,
        creatorId: creator.id,
        paymentIntentId: order.provider_payment_id,
        amountMinor: refundAmountCents,
        alreadyRefundedMinor: alreadyRefunded,
        reason: reason || null,
      })
      refund = { id: done.id, status: done.status, currency: done.currency }
    } else {
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
    const stripeRefund = await stripe.refunds.create(refundParams, { idempotencyKey: `storelib-refund:${orderId}:${alreadyRefunded}:${refundAmountCents}` })
    refund = { id: stripeRefund.id, status: stripeRefund.status ?? null, currency: stripeRefund.currency ?? null }
    }

    /* Stripe has not confirmed it yet (or refused it): nothing is marked,
       revoked or emailed here. refund.updated applies it once it succeeds.
       Airwallex refunds keep their own flow (lib/payments/refunds). */
    if (!onAirwallex && (refund.status === "failed" || refund.status === "canceled")) {
      return NextResponse.json({ error: "The refund didn't go through. Nothing was changed. Try again, or contact support." }, { status: 402 })
    }
    if (!onAirwallex && !byCash && refund.status !== "succeeded") {
      await stripe.refunds.update(refund.id, { metadata: { settled_by: "webhook" } }).catch((e) => console.error("[Refund] pending tag failed:", e instanceof Error ? e.message : "unknown"))
      return NextResponse.json({ success: true, pending: true, refundId: refund.id, status: refund.status, amount: refundAmountCents })
    }

    /* The row, at once, with the running total: the page reads it next. */
    const refundedAt = new Date().toISOString()
    const refundedTotal = Math.min(order.amount_cents || 0, alreadyRefunded + refundAmountCents)
    await dbClient.from("orders").update({ status: "refunded" }).eq("id", orderId)
    try {
      await dbClient
        .from("orders")
        .update({ refunded_at: refundedAt, refund_reason: reason || "requested_by_customer", refund_amount_cents: refundedTotal, ...(onAirwallex || byCash ? {} : { stripe_refund_id: refund.id }) })
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
        currency: (refund.currency || order.currency || "").toLowerCase() || null,
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
      /* Stripe's balance mirror (seller_ledger); an Airwallex creator's balance is their Airwallex wallet; cash never touched either. */
      if (!onAirwallex && !byCash) {
        try {
          const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, { expand: ["latest_charge"] })
          const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? (pi.latest_charge as import("stripe").Stripe.Charge) : null
          if (charge) await syncChargeRefund(admin, stripe, charge)
        } catch (syncErr) {
          console.error("[Refund] ledger now failed; charge.refunded will apply it:", syncErr instanceof Error ? syncErr.message : syncErr)
        }
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

      /* The seller's one picture, as every email of theirs carries it
         (lib/email-campaigns/sender). It used to fall back to
         creators.avatar_url, a copy of the photo that can still hold an old one. */
      try {
        const { loadBrand } = await import("@/lib/email-campaigns/brand-server")
        const { senderPicture } = await import("@/lib/email-campaigns/sender")
        const brand = await loadBrand(dbClient, creator.id)
        sellerAvatarUrl = senderPicture({ photoUrl: brand.avatarUrl, logoUrl: brand.logoUrl })?.url ?? ""
      } catch {
        // No picture: the email draws the initials
      }

      await sendRefundEmails({
        /*
          An order that ships (a line of a physical checkout) has its own refund
          email, in the store's look and with the order's number, queued when
          the order page catches up with this refund (lib/physical/orders-server
          noteRefund, keyed by the refunded total so the webhook adds none).
          This generic one said "a full refund", a line's id for the order
          number and "download links revoked" for a mug.
        */
        buyerEmail: order.checkout_id ? undefined : order.customer_email || order.buyer_email,
        sellerEmail: user.email,
        sellerContactEmail,
        productTitle: product.title,
        refundAmount: refundAmountCents,
        /* The order's own currency (what the buyer paid in), as Stripe refunded it. */
        currency: (refund.currency || order.currency || "").toUpperCase(),
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
