import { NextResponse } from "next/server"
import { formatStoreMoney } from "@/lib/store/currency"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { paidElsewhere, syncChargeRefund } from "@/lib/stripe/refund-sync"
import { fullyRefunded, REFUND_CHANGED, refundChangedMessage, refundEchoStale } from "@/lib/orders/refund-state"
import { emit } from "@/lib/notify/outbox"
import { PAST_PROVIDER_REFUND_NOTE, paidThroughAirwallex } from "@/lib/payments/past-provider"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { ownerAddress } from "@/lib/businesses/email-alias"

/*
  The service client, or null when it can't be made (no service key). It was a require() inside the function, which
  the bundle resolves but plain ESM does not: there it was always null, so the journey suites ran this route without
  the order's restate, the ledger sync or the library revoke that production runs (round 57). A static import is the
  same client either way.
*/
function tryCreateAdminClient() {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const dbClient = tryCreateAdminClient() || supabase

    const who = await routeUser({ fresh: true })
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
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

    /* Paid through Airwallex before Storelib moved to Stripe: nothing here can refund it (lib/payments/past-provider). */
    if (paidThroughAirwallex(order)) {
      return NextResponse.json({ error: PAST_PROVIDER_REFUND_NOTE }, { status: 409 })
    }
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
    if (!order.stripe_payment_intent_id && !byCash) {
      return NextResponse.json({ error: "This order has no card payment to refund. If the buyer paid another way, refund them directly." }, { status: 400 })
    }

    // Validate refund amount
    const maxRefundCents = Math.max(0, (order.amount_cents || 0) - alreadyRefunded)
    /*
      WHAT THE DIALOG READ (lib/orders/refund-state refundEchoStale): the page sends what it showed as left to
      refund. The key below moves on once a refund has gone through, so a press sent again after its answer was
      lost, or from a tab opened before another refund, would be a second refund of the same part. It finds the
      order moved on and is refused instead, with what the order holds now. A page that sends nothing refunds as before.
    */
    if (refundEchoStale(body.refundable, maxRefundCents)) {
      return NextResponse.json(
        { error: refundChangedMessage(alreadyRefunded, (cents) => formatStoreMoney(cents, order.currency)), code: REFUND_CHANGED, refundableCents: maxRefundCents, refundedCents: alreadyRefunded },
        { status: 409 },
      )
    }
    const refundAmountCents = amount === undefined || amount === null ? maxRefundCents : Math.round(Number(amount) * 100)

    if (!Number.isFinite(refundAmountCents) || refundAmountCents <= 0) {
      return NextResponse.json({ error: "Refund amount must be positive" }, { status: 400 })
    }

    if (refundAmountCents > maxRefundCents) {
      return NextResponse.json({
        error: `Refund amount cannot exceed the order total of ${formatStoreMoney(maxRefundCents, order.currency)}`,
      }, { status: 400 })
    }

    let refund: { id: string; status: string | null; currency: string | null }
    if (byCash) {
      /* Keyed like a card refund, so a double tap records it once (the emitted event's key below). */
      refund = { id: `cash_${orderId}_${alreadyRefunded}_${refundAmountCents}`, status: "succeeded", currency: order.currency ? String(order.currency).toLowerCase() : null }
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
       revoked or emailed here. refund.updated applies it once it succeeds. */
    if (refund.status === "failed" || refund.status === "canceled") {
      return NextResponse.json({ error: "The refund didn't go through. Nothing was changed. Try again, or contact support." }, { status: 402 })
    }
    if (!byCash && refund.status !== "succeeded") {
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
        .update({ refunded_at: refundedAt, refund_reason: reason || "requested_by_customer", refund_amount_cents: refundedTotal, ...(byCash ? {} : { stripe_refund_id: refund.id }) })
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
      /* Stripe's balance mirror (seller_ledger); cash never touched it. */
      if (!byCash) {
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
      if (refundedTotal >= (order.amount_cents || 0) && order.buyer_id && order.product_id && !(await paidElsewhere(admin, order))) {
        let revoke = admin.from("entitlements").delete().eq("buyer_id", order.buyer_id).eq("product_id", order.product_id)
        revoke = order.variant_id ? revoke.eq("variant_id", order.variant_id) : revoke.is("variant_id", null)
        await revoke.then(
          () => undefined,
          () => undefined,
        )
      }
    }

    /*
      AN ORDER THAT SHIPS catches up here, on the server: its status and refunded total, the buyer's refund email
      and, refunded in full before anything shipped, its stock (lib/physical/orders-server restateCheckoutRefunds).
      It used to wait for the browser to come back and say "refunded", so a tab closed after the press left the
      order reading Paid and the buyer with no email; a refund in cash has no webhook to do it later either.
      Keyed throughout: the page's follow-up and Stripe's event after it add nothing.
    */
    if (admin && order.checkout_id) {
      try {
        const { restateCheckoutRefunds } = await import("@/lib/physical/orders-server")
        await restateCheckoutRefunds(admin, [String(order.checkout_id)], "creator")
      } catch (restateErr) {
        console.error("[Refund] order not restated; the order page or charge.refunded will:", restateErr instanceof Error ? restateErr.message : restateErr)
      }
    }

    /* The refund's credit note in the store's invoice sequence (lib/checkout/credit-note.ts): issued by the ledger step above, or here for a cash refund. Linked from the buyer's email. */
    let creditNote: { number: string; url: string } | null = null
    if (admin) {
      try {
        const [{ creditNoteForRefund }, { creditNoteLink }] = await Promise.all([import("@/lib/checkout/credit-note"), import("@/lib/stripe/refund-sync")])
        /* A note is in the currency that was refunded; with none recorded there is nothing honest to print, so none is issued. */
        const noteCurrency = refund.currency || order.currency || null
        const issued = noteCurrency ? await creditNoteForRefund(admin, { orderId, creatorId: creator.id, refundKey: refund.id, currency: String(noteCurrency), cents: refundAmountCents }) : null
        creditNote = issued ? creditNoteLink(issued.first, issued.note) : null
      } catch (noteErr) {
        console.error("[Refund] credit note not issued:", noteErr instanceof Error ? noteErr.message : noteErr)
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
        sellerEmail: ownerAddress(user.email) ?? user.email,
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
        creditNote,
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
      /* Everything this line has given back so far, this refund included: what the row now holds. */
      refundedCents: refundedTotal,
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
