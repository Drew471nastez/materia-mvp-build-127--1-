import { tagOrderPricing } from "@/lib/money/order-pricing"
import { NextResponse, after } from "next/server"
import { headers } from "next/headers"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import { generateReceiptToken } from "@/lib/security"
import { createHash } from "node:crypto"
import { sendOrderEmails, triggerEmailFlows } from "@/lib/email"
import { orderOriginFrom, orderSourceFrom, tagOrderSource } from "@/lib/orders/order-source"
import { attributionFromMetadata, recordContactAttribution, recordOrderAttribution } from "@/lib/attribution/server"
import { fulfilPaymentIntent, isCheckoutIntent, recordCustomer } from "@/lib/checkout/fulfil-payment"
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { recordCheckoutContactAndWelcome } from "@/lib/contacts/checkout-welcome"
import { fulfilCartPayment, fulfilCartSession, isCartIntent, isCartSession } from "@/lib/checkout/fulfil-cart-session"
import { releaseHeldCopies } from "@/lib/checkout/sales-limit"
import { syncChargeRefund } from "@/lib/stripe/refund-sync"
import { closeAccessForDispute, disputedProductName, markPaymentDisputed, reopenAccessAfterWonDispute, restorePaymentAfterWonDispute } from "@/lib/stripe/dispute-orders"
import { communityAccessAfterEntitlement } from "@/lib/communities/server/payment-hooks"
import { disputeFeeMinor, isClosed, isInquiry, outcomeOf } from "@/lib/stripe/dispute-facts"
import { disputeContext, disputeCreator, giveBackAfterWon, readDispute, reversedFor, saveDispute, takeBackForDispute } from "@/lib/stripe/disputes"
import { decimalsOf } from "@/lib/payments/money"
import { toLedger } from "@/lib/payments/ledger-currency"
import { emit, type EmitInput } from "@/lib/notify/outbox"
import { raiseSaleEvents } from "@/lib/orders/sale-events"
import { claimStripeEvent, noteStripeEvent, postLedger, stripeEventHandled } from "@/lib/payments/ledger"
import { verifyStripeEvent } from "@/lib/stripe/webhook-secrets"
import { reportError } from "@/lib/observability/report"
import { handleMembershipEvent, isMembershipEventType } from "@/lib/memberships/webhook"
import { subscriptionIdOf } from "@/lib/memberships/sync"
import { timed } from "@/lib/perf/server-timing"
import { existingSessionOrder, isUniqueViolation } from "@/lib/orders/session-order"

export const runtime = "nodejs"

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// LIVE Stripe Price IDs
const PRICE_GROWTH = process.env.PRICE_GROWTH_MONTHLY || "price_1SzBWaBYevnBVyznNCTOXDoS"
const PRICE_PRO = process.env.PRICE_PRO_MONTHLY || "price_1SzBXSBYevnBVyznYjXfOOXX"

function safeTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (ts instanceof Date) return ts.toISOString()
  if (typeof ts === "string") return ts
  if (typeof ts === "number" && !isNaN(ts)) {
    const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }
  return new Date().toISOString()
}

function planIdFromPriceId(priceId?: string): "free" | "growth" | "pro" {
  if (!priceId) return "free"
  if (priceId === PRICE_GROWTH) return "growth"
  if (priceId === PRICE_PRO) return "pro"
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return "free"
}

/**
 * A Storelib plan event for the creator who pays for it (lib/notify/outbox).
 * The engine reads the creator's user itself. Never throws: the webhook's
 * answer to Stripe does not depend on it.
 */
async function raiseForCreator(creatorId: string, event: Omit<EmitInput, "userId" | "creatorId">): Promise<boolean> {
  return (await emit({ ...event, creatorId })).ok
}

/** When a scheduled cancellation takes effect, from whichever field this API version fills. */
function periodEndOf(sub: any): number | null {
  const at = sub?.cancel_at || sub?.current_period_end || sub?.items?.data?.[0]?.current_period_end || null
  return typeof at === "number" ? at : null
}

/**
 * EVERY STRIPE EVENT, HANDLED ONCE. Stripe delivers an event again whenever
 * an answer is slow or lost, and it can deliver one twice even after a 200.
 * The handlers below are each idempotent on their own records; this is the
 * layer in front of all of them: an event the webhook already finished
 * (public.stripe_webhook_events, run-now part 64) is answered 200 and
 * nothing runs again. An event that failed is recorded with its error and
 * runs again on the next delivery. The id is read from the body before the
 * signature is checked, but only to skip an event that a signed delivery
 * already finished; nothing is written for a delivery until the handler,
 * which checks the signature, has answered 200.
 */
async function handlePOST(request: Request) {
  const body = await request.text()
  let eventId: string | null = null
  let eventType = ""
  let account: string | null = null
  try {
    const parsed = JSON.parse(body) as { id?: unknown; type?: unknown; account?: unknown }
    eventId = typeof parsed.id === "string" && parsed.id.startsWith("evt_") ? parsed.id : null
    eventType = typeof parsed.type === "string" ? parsed.type : ""
    account = typeof parsed.account === "string" ? parsed.account : null
  } catch {
    /* Not JSON: the handler refuses it. */
  }
  if (eventId && (await stripeEventHandled(supabaseAdmin, eventId))) {
    return NextResponse.json({ received: true, duplicate: true })
  }
  let answer: Response
  /* Whether this delivery took the event (claimStripeEvent, after the signature): only then is its outcome written, which also lets it go. */
  const held = { claimed: false }
  try {
    answer = await handleStripeEvent(new Request(request.url, { method: "POST", headers: request.headers, body }), held)
  } catch (error) {
    if (eventId) await noteStripeEvent(supabaseAdmin, { id: eventId, type: eventType, account, ok: false, error: error instanceof Error ? error.message : String(error) })
    await reportError({ source: "webhook", where: `stripe ${eventType || "event"}`, error, context: { eventId } })
    throw error
  }
  if (eventId && answer.status === 200) await noteStripeEvent(supabaseAdmin, { id: eventId, type: eventType, account, ok: true })
  else if (eventId && held.claimed && answer.status < 500) {
    /* Taken and answered 4xx: written down as failed, so the hold does not keep the next delivery waiting. */
    await noteStripeEvent(supabaseAdmin, { id: eventId, type: eventType, account, ok: false, error: `answered ${answer.status}` })
  } else if (eventId && answer.status >= 500) {
    await noteStripeEvent(supabaseAdmin, { id: eventId, type: eventType, account, ok: false, error: `answered ${answer.status}` })
    /* Stripe will try again, but a payment event failing is the owner's to know about now. */
    await reportError({ source: "webhook", where: `stripe ${eventType || "event"}`, error: new Error(`answered ${answer.status}`), context: { eventId } })
  }
  return answer
}

async function handleStripeEvent(request: Request, held: { claimed: boolean } = { claimed: false }) {
  console.log("[Webhook] Received")

  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get("stripe-signature")

  if (!signature) {
    console.error("[Webhook] Missing Stripe signature")
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  /*
    EACH SECRET FOR ITS OWN KIND OF EVENT (lib/stripe/webhook-secrets). Both
    are still tried, so a Connect destination pointed here (set up before
    /api/stripe/webhook/connect existed) keeps working, but a platform event
    is only accepted under STRIPE_WEBHOOK_SECRET and a connected account's
    event only under STRIPE_CONNECT_WEBHOOK_SECRET. The two routes share one
    record of events handled (lib/payments/ledger), so an event that reaches
    both is acted on once. Nothing unsigned is accepted.
  */
  const verified = verifyStripeEvent(
    body,
    signature,
    { platform: process.env.STRIPE_WEBHOOK_SECRET, connect: process.env.STRIPE_CONNECT_WEBHOOK_SECRET },
    (b, s, k) => stripe.webhooks.constructEvent(b, s, k),
  )
  if (!verified.ok) {
    if (verified.reason === "no_secret") {
      console.error("[Webhook] No webhook signing secret is configured")
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
    }
    /* Which: a forged or stale payload, or a destination whose secret does not match its kind. Never which secret. */
    console.error(`[Webhook] refused: ${verified.reason}`)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }
  const event = verified.event

  /* One delivery of an event at a time (lib/payments/ledger claimStripeEvent). Signed first, so nothing is written for a forged body. */
  const claim = await claimStripeEvent(supabaseAdmin, { id: event.id, type: event.type, account: typeof event.account === "string" ? event.account : null })
  if (claim === "done") return NextResponse.json({ received: true, duplicate: true })
  if (claim === "busy") return NextResponse.json({ error: "This event is being handled. Stripe will send it again." }, { status: 409 })
  held.claimed = true

  console.log("[Webhook] Event type:", event.type)

  /* A connected account's status or bank changed: re-read from Stripe (idempotent). */
  if (event.type.startsWith("account.")) {
    const { handleConnectAccountEvent } = await import("@/lib/stripe/connect-webhook")
    await handleConnectAccountEvent(event)
    return NextResponse.json({ received: true })
  }

  /*
    A BUYER'S MEMBERSHIP OF A CREATOR, first. Its subscription and invoices
    are Storelib's own, like a creator's plan, and carry metadata.kind
    "membership"; lib/memberships/webhook.ts answers them and nothing below
    sees them. Anything else it answers null for, and goes on as before.
  */
  if (isMembershipEventType(event.type)) {
    const answered = await handleMembershipEvent(supabaseAdmin, event)
    if (answered) return answered
  }

  /*
    LIMIT SALES: a payment that will not happen gives back the copies of
    limited downloads it held (lib/checkout/sales-limit), now rather than
    when the hold lapses. A product's PaymentIntent cancelled; a basket's
    Stripe page expired or its delayed payment failed. Nothing is answered
    here: the handlers below still see the event.
  */
  if (event.type === "payment_intent.canceled") {
    const pi = event.data.object as Stripe.PaymentIntent
    await releaseHeldCopies(supabaseAdmin, pi.metadata as Record<string, string>)
  }
  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session
    if (isCartSession(session)) await releaseHeldCopies(supabaseAdmin, session.metadata as Record<string, string>)
  }

  // ============================================================================
  // checkout.session.completed
  // ============================================================================
  /*
    A PHYSICAL ORDER (app/api/physical/checkout): its own sessions, marked
    by metadata.physical_checkout_id and never by cart, so nothing below
    sees them. Paid: written once, by whichever of this and the buyer's
    return comes first (lib/physical/checkout-server.ts). Expired or failed:
    the stock held for it goes back. Answered even with physical commerce
    switched off, because the money was taken while it was on.
  */
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    if (typeof session.metadata?.physical_checkout_id === "string") {
      const physical = await import("@/lib/physical/checkout-server")
      if (physical.isPhysicalSession(session)) {
        if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
          await physical.expireCheckoutSession(supabaseAdmin, session)
          return NextResponse.json({ received: true })
        }
        if (session.payment_status !== "paid") return NextResponse.json({ received: true, message: "Order not paid yet" })
        const baseUrl = `https://${process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"}`
        const done = await physical.completeStripeSession(supabaseAdmin, session.id, baseUrl)
        if (done.ok === false ? done.status >= 500 : !done.complete) {
          console.error("[Webhook] physical order incomplete:", session.id)
          return NextResponse.json({ error: "Order not fully written" }, { status: 500 })
        }
        return NextResponse.json({ received: true })
      }
    }
  }

  /*
    A BASKET from a creator's website (app/api/checkout/cart). The buyer's
    return writes it too; whichever comes first does, once
    (lib/checkout/fulfil-cart-session.ts). A server failure answers 500 so
    Stripe retries, and a retry only writes the lines still missing. A
    delayed payment method completes later, with the async event.
  */
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session
    if (isCartSession(session)) {
      if (session.payment_status !== "paid") return NextResponse.json({ received: true, message: "Basket not paid yet" })
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ""
      const result = await fulfilCartSession(supabaseAdmin, session.id, { baseUrl })
      if (result.ok === false ? result.status >= 500 : !result.complete) {
        console.error("[Webhook] basket fulfilment incomplete:", session.id)
        return NextResponse.json({ error: "Basket not fully written" }, { status: 500 })
      }
      return NextResponse.json({ received: true })
    }
  }

  /*
    A COMMUNITY PROGRAM bought in its sheet (lib/communities/server/
    learn-checkout.ts): its own sessions, marked by metadata.kind
    "community_program" and never by cart or a product, so nothing below
    sees them. Paid: the program is the member's, once, whichever of this
    and the sheet's own confirm comes first. A server failure answers 500
    so Stripe retries.
  */
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session
    /* Round AG: one module of a program, bought on its own (lib/communities/server/module-sales.ts). */
    if (session.metadata?.kind === "community_module") {
      const sales = await import("@/lib/communities/server/module-sales")
      if (sales.isModuleSession(session)) {
        if (session.payment_status !== "paid") return NextResponse.json({ received: true, message: "Module not paid yet" })
        const done = await sales.grantModuleFromSession(supabaseAdmin, session)
        if (done.ok === false && done.status >= 500) {
          console.error("[Webhook] module grant failed:", session.id, done.error)
          return NextResponse.json({ error: "Module not granted yet" }, { status: 500 })
        }
        return NextResponse.json({ received: true })
      }
    }
    if (session.metadata?.kind === "community_program") {
      const learn = await import("@/lib/communities/server/learn-checkout")
      if (learn.isProgramSession(session)) {
        if (session.payment_status !== "paid") return NextResponse.json({ received: true, message: "Program not paid yet" })
        const done = await learn.grantFromSession(supabaseAdmin, session)
        if (done.ok === false && done.status >= 500) {
          console.error("[Webhook] program grant failed:", session.id, done.error)
          return NextResponse.json({ error: "Program not granted yet" }, { status: 500 })
        }
        return NextResponse.json({ received: true })
      }
    }
  }

  /*
    A TICKET FOR A PAID COMMUNITY EVENT bought in its sheet
    (lib/communities/server/event-checkout.ts): its own sessions, marked by
    metadata.kind "community_event" and never by cart or a product, so
    nothing below sees them. Paid: the ticket is the member's, once,
    whichever of this and the sheet's own confirm comes first. A server
    failure answers 500 so Stripe retries.
  */
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.metadata?.kind === "community_event") {
      const tickets = await import("@/lib/communities/server/event-checkout")
      if (tickets.isEventSession(session)) {
        if (session.payment_status !== "paid") return NextResponse.json({ received: true, message: "Ticket not paid yet" })
        const done = await tickets.grantFromSession(supabaseAdmin, session)
        if (done.ok === false && done.status >= 500) {
          console.error("[Webhook] ticket not granted:", session.id, done.error)
          return NextResponse.json({ error: "Ticket not granted yet" }, { status: 500 })
        }
        return NextResponse.json({ received: true })
      }
    }
  }

  /*
    A COMMUNITY LIBRARY ITEM bought in its sheet (lib/communities/server/
    library-checkout.ts, round 39): its own sessions, marked by
    metadata.kind "community_library" and never by a product, so the session
    path below never makes an order from one. Its PaymentIntent is a product
    checkout's, so the order is made by the same fulfilment as every product
    sale (here, by the PaymentIntent's own event, or by the sheet's confirm,
    whichever is first), and the purchase is recorded against the item. A
    server failure answers 500 so Stripe retries.
  */
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.metadata?.kind === "community_library") {
      const library = await import("@/lib/communities/server/library-checkout")
      if (library.isLibrarySession(session)) {
        if (session.payment_status !== "paid") return NextResponse.json({ received: true, message: "Library item not paid yet" })
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ""
        const done = await library.grantLibraryFromSession(supabaseAdmin, session, (pi) => fulfilPaymentIntent(supabaseAdmin, pi, { baseUrl }))
        if (done.ok === false && done.status >= 500) {
          console.error("[Webhook] library purchase not recorded:", session.id, done.error)
          return NextResponse.json({ error: "Library purchase not recorded yet" }, { status: 500 })
        }
        return NextResponse.json({ received: true })
      }
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session

    console.log("[Webhook] Checkout session:", session.id, "mode:", session.mode)

    // --- SETUP MODE: Adding payment method without charging ---
    if (session.mode === "setup") {
      const setupCreatorId = session.metadata?.creator_id
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id
      const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id

      console.log("[Webhook] Setup session for creator:", setupCreatorId)

      if (setupIntentId && setupCreatorId) {
        try {
          const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)
          const paymentMethodId = typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id

          if (paymentMethodId) {
            const pm = await stripe.paymentMethods.retrieve(paymentMethodId)

            if (customerId) {
              await stripe.customers.update(customerId, {
                invoice_settings: { default_payment_method: paymentMethodId },
              })
            }

            /**
             * ON THE KEY THE TABLE HAS. A Stripe payment method id is unique
             * across all of Stripe and the table's only unique key is on that
             * column alone, so the pair (creator_id, stripe_payment_method_id)
             * matched no unique index and Postgres refused the whole upsert.
             * The catch below swallowed it, so no saved card was ever recorded.
             * `type` is NOT NULL with no value here, which failed next.
             */
            await supabaseAdmin.from("payment_methods").upsert({
              creator_id: setupCreatorId,
              stripe_payment_method_id: paymentMethodId,
              type: pm.type || "card",
              card_brand: pm.card?.brand || "unknown",
              card_last4: pm.card?.last4 || "0000",
              card_exp_month: pm.card?.exp_month || 0,
              card_exp_year: pm.card?.exp_year || 0,
              is_default: true,
            }, { onConflict: "stripe_payment_method_id" })

            console.log("[Webhook] Payment method saved for creator:", setupCreatorId)
          }
        } catch (err) {
          console.error("[Webhook] Error saving setup payment method:", err)
        }
      }

      return NextResponse.json({ received: true, message: "Setup session processed" })
    }

    // --- SUBSCRIPTION MODE: New subscription checkout ---
    if (session.mode === "subscription") {
      const metadata = session.metadata || {}
      const creatorId = metadata.creator_id
      const planId = metadata.plan_id

      console.log("[Webhook] Subscription checkout for creator:", creatorId, "plan:", planId)

      // Subscription events (created/updated) handle the actual DB sync
      // Here we just save the payment method from the subscription checkout
      if (creatorId && session.customer) {
        try {
          const customerId = typeof session.customer === "string" ? session.customer : session.customer.id

          // Save payment method from the subscription
          const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer
          const defaultPmId = customer.invoice_settings?.default_payment_method
          if (defaultPmId) {
            const pmId = typeof defaultPmId === "string" ? defaultPmId : defaultPmId.id
            const pm = await stripe.paymentMethods.retrieve(pmId)

            /* Same key, same reason: see the setup mode upsert above. */
            await supabaseAdmin.from("payment_methods").upsert({
              creator_id: creatorId,
              stripe_payment_method_id: pmId,
              type: pm.type || "card",
              card_brand: pm.card?.brand || "unknown",
              card_last4: pm.card?.last4 || "0000",
              card_exp_month: pm.card?.exp_month || 0,
              card_exp_year: pm.card?.exp_year || 0,
              is_default: true,
            }, { onConflict: "stripe_payment_method_id" })

            console.log("[Webhook] Subscription payment method saved")
          }
        } catch (err) {
          console.error("[Webhook] Error saving subscription payment method:", err)
        }
      }

      // Don't process further as product checkout - just return
      if (!metadata.product_id) {
        return NextResponse.json({ received: true, message: "Subscription checkout processed" })
      }
    }

    // --- PAYMENT MODE: Product purchase checkout ---
    if (session.payment_status !== "paid") {
      console.log("[Webhook] Payment not completed yet:", session.payment_status)
      return NextResponse.json({ received: true, message: "Payment not completed" })
    }

    const metadata = session.metadata || {}
    const productId = metadata.product_id
    const creatorId = metadata.creator_id
    const buyerId = metadata.buyer_id || null

    const buyerEmail = (session.customer_details?.email || metadata.buyer_email || "").toString()
    const buyerFirstName = (metadata.buyer_first_name || "").toString()
    const buyerLastName = (metadata.buyer_last_name || "").toString()

    const tipCents = Number.parseInt(metadata.tip_cents || "0", 10) || 0
    const accessToken = metadata.access_token || null
    const sessionFingerprint = metadata.session_fingerprint || null
    const receiptToken = metadata.receipt_token || generateReceiptToken()

    if (!productId || !creatorId) {
      console.log("[Webhook] Missing product metadata, skipping order creation")
      return NextResponse.json({ received: true, message: "No product metadata" })
    }

    // idempotency: prevent duplicates
    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle()

    if (existingOrder) {
      console.log("[Webhook] Order already exists:", existingOrder.id)
      return NextResponse.json({ received: true, message: "Already processed" })
    }

    const totalAmount = session.amount_total || 0

    const platformFeeCents = Number.parseInt(metadata.platform_fee_cents || "0", 10)
    if (!Number.isFinite(platformFeeCents) || platformFeeCents < 0) {
      console.error("[Webhook] checkout session missing platform_fee_cents:", session.id)
      return NextResponse.json({ error: "Missing platform fee metadata" }, { status: 500 })
    }

    let applicationFeeAmount = platformFeeCents
    let transferId: string | null = null
    let destinationPaymentId: string | null = null

    let paymentMethod = "card"
    let cardBrand: string | null = null
    let cardLast4: string | null = null
    let paypalEmail: string | null = null

    try {
      if (session.payment_intent) {
        const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string, {
          expand: ["charges", "transfer", "payment_method"],
        }) as any

        if (paymentIntent.application_fee_amount) {
          applicationFeeAmount = paymentIntent.application_fee_amount
        }

        if (paymentIntent.transfer) {
          transferId = typeof paymentIntent.transfer === "string" ? paymentIntent.transfer : paymentIntent.transfer.id
        }

        if (paymentIntent.charges?.data?.[0]) {
          destinationPaymentId = (paymentIntent.charges.data[0].destination_payment as string) || null

          const charge = paymentIntent.charges.data[0]
          if (charge.payment_method_details) {
            const pmDetails = charge.payment_method_details
            if (pmDetails.card) {
              paymentMethod = "card"
              cardBrand = pmDetails.card.brand || null
              cardLast4 = pmDetails.card.last4 || null
            } else if (pmDetails.paypal) {
              paymentMethod = "paypal"
              paypalEmail = (pmDetails.paypal as any).payer_email || null
            } else if (pmDetails.type) {
              paymentMethod = pmDetails.type
            }
          }
        }
      }
    } catch (error) {
      console.error("[Webhook] Failed to retrieve payment intent details:", error)
    }

    let productTitle = (metadata.product_title || "").toString().trim()
    if (!productTitle) {
      const { data: productRow } = await supabaseAdmin.from("products").select("title").eq("id", productId).maybeSingle()
      productTitle = productRow?.title || "Product"
    }

    const variantId = metadata.variant_id || null
    const variantName = metadata.variant_name || null

    const orderData: any = {
      buyer_id: buyerId || null,
      buyer_first_name: buyerFirstName || null,
      buyer_last_name: buyerLastName || null,
      buyer_email: buyerEmail || null,
      product_id: productId,
      amount_cents: totalAmount,
      tip_cents: tipCents,
      fee_cents: applicationFeeAmount,
      application_fee_cents: applicationFeeAmount,
      transfer_id: transferId,
      currency: session.currency || null,
      provider: "stripe",
      status: "completed",
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent as string,
      session_fingerprint: sessionFingerprint,
      receipt_token: receiptToken,
      allowed_fingerprints: sessionFingerprint ? [sessionFingerprint] : [],
      agreed_to_terms: metadata.agreed_to_terms === "true",
      agreed_at: metadata.agreed_at || null,
      payment_method: paymentMethod,
      card_brand: cardBrand,
      card_last4: cardLast4,
      paypal_email: paypalEmail,
      buyer_country: metadata.buyer_country || null,
      buyer_country_code: metadata.buyer_country_code || null,
      buyer_device_type: metadata.buyer_device_type || null,
      buyer_os: metadata.buyer_os || null,
      buyer_browser: metadata.buyer_browser || null,
      variant_id: variantId || null,
      variant_name: variantName || null,
    }

    if (!buyerId) {
      orderData.access_token = accessToken
    }

    // Try full insert first, fallback to minimal if it fails
    let order = null
    let orderInsertError = null

    const result1 = await supabaseAdmin.from("orders").insert(orderData).select().single()
    order = result1.data
    orderInsertError = result1.error

    /* Another delivery of this payment wrote the order first (orders_stripe_session_line_key, run-now part 190): read it back, and leave its follow up to that delivery. */
    if (isUniqueViolation(orderInsertError)) {
      const written = await existingSessionOrder(supabaseAdmin, session.id, receiptToken)
      if (written) {
        console.log("[Webhook] Order already written by another delivery:", written.id)
        return NextResponse.json({ received: true, message: "Already processed" })
      }
    }

    if (orderInsertError) {
      console.log("[Webhook] Full insert failed, trying minimal:", orderInsertError.message)

      const minimalOrderData: Record<string, any> = {
        product_id: productId,
        amount_cents: totalAmount,
        /* The currency it was paid in, always: without it the column's default would call a lei payment dollars. */
        currency: session.currency || null,
        status: "completed",
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string,
        receipt_token: receiptToken,
        buyer_email: buyerEmail || null,
      }

      if (buyerId) {
        minimalOrderData.buyer_id = buyerId
      }

      const result2 = await supabaseAdmin.from("orders").insert(minimalOrderData).select().single()
      order = result2.data
      orderInsertError = result2.error
      if (isUniqueViolation(orderInsertError)) {
        const written = await existingSessionOrder(supabaseAdmin, session.id, receiptToken)
        if (written) {
          console.log("[Webhook] Order already written by another delivery:", written.id)
          return NextResponse.json({ received: true, message: "Already processed" })
        }
      }
    }

    if (orderInsertError) {
      console.error("[Webhook] Order creation failed:", orderInsertError)
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
    }

    console.log("[Webhook] Order created:", order.id)
    await tagOrderSource(supabaseAdmin, order.id, orderSourceFrom(metadata), orderOriginFrom(metadata))
    /* How its price was made (lib/money/order-pricing). */
    await tagOrderPricing(supabaseAdmin, order.id, metadata as Record<string, string>)
    const attribution = attributionFromMetadata(metadata, { source: orderSourceFrom(metadata), origin: orderOriginFrom(metadata) })
    await recordOrderAttribution(supabaseAdmin, order.id, attribution)

    // ── Ledger: record sale earnings ──────────────────────────────────────
    if (creatorId && totalAmount > 0) {
      try {
        const netSeller = totalAmount - applicationFeeAmount

        // Determine hold_until from Stripe's actual settlement date (available_on)
        // This respects Stripe's per-country/risk settlement times:
        //  - US creators: ~2 business days
        //  - International: up to ~7 business days
        //  - First payout: may be longer (extra verification)
        let holdUntil: Date | null = null

        if (destinationPaymentId && creatorId) {
          try {
            // Look up the creator's stripe_account_id
            const { data: sellerCreator } = await supabaseAdmin
              .from("creators")
              .select("stripe_account_id")
              .eq("id", creatorId)
              .single()

            if (sellerCreator?.stripe_account_id && destinationPaymentId) {
              const destCharge = await stripe.charges.retrieve(
                destinationPaymentId,
                { expand: ["balance_transaction"] }, { stripeAccount: sellerCreator.stripe_account_id }
              )
              const bt = destCharge.balance_transaction as any
              if (bt?.available_on) {
                holdUntil = new Date(bt.available_on * 1000)
              }
            }
          } catch (btErr) {
            console.error("[Webhook] Balance transaction lookup failed (non-fatal):", btErr)
          }
        }

        // Fallback: if we couldn't get Stripe's available_on, estimate ~3 business days
        if (!holdUntil) {
          holdUntil = new Date()
          holdUntil.setDate(holdUntil.getDate() + 3)
        }

        /* Once per order, in one locked step (lib/payments/ledger), under the key the
           PaymentIntent path writes too. The code below is the path before run-now part 64. */
        /* In the wallet's currency, as every other sale is added (lib/payments/ledger-currency): the
           sale's own currency converted at the day's ECB rate, or kept and labelled when no rate exists. */
        const { toLedger, ledgerAmountText } = await import("@/lib/payments/ledger-currency")
        const wallet = await toLedger([totalAmount, netSeller, applicationFeeAmount], session.currency)
        const [wTotal, wNet, wFee] = wallet.amounts
        const saleLine = `Sale: ${ledgerAmountText(wTotal, wallet, { amount: totalAmount, currency: session.currency })} (net ${ledgerAmountText(wNet, { ...wallet, converted: false }, { amount: wNet, currency: wallet.currency })})`
        const posted = await postLedger(supabaseAdmin, {
          creatorId,
          key: `sale:${order.id}`,
          op: "sale",
          amountCents: wNet,
          event: {
            event_type: "sale",
            amount_cents: wTotal,
            net_seller_cents: wNet,
            fee_cents: wFee,
            currency: wallet.currency,
            order_id: order.id,
            hold_until: holdUntil.toISOString(),
            description: saleLine,
            add_lifetime_earnings: wTotal,
            add_lifetime_fees: wFee,
          },
        })

        if (posted.unavailable) {
          await supabaseAdmin
            .from("seller_ledger")
            .upsert({ creator_id: creatorId }, { onConflict: "creator_id" })
        }
        const { data: ledger } = posted.unavailable
          ? await supabaseAdmin.from("seller_ledger").select("*").eq("creator_id", creatorId).single()
          : { data: null }

        if (ledger) {
          let actualPending = wNet
          let newNegative = ledger.negative_balance

          // Absorb negative balance from prior refunds
          if (newNegative > 0) {
            const absorbed = Math.min(actualPending, newNegative)
            actualPending -= absorbed
            newNegative -= absorbed
          }

          await supabaseAdmin
            .from("seller_ledger")
            .update({
              pending_amount: ledger.pending_amount + actualPending,
              lifetime_earnings: ledger.lifetime_earnings + wTotal,
              lifetime_fees: ledger.lifetime_fees + wFee,
              negative_balance: newNegative,
            })
            .eq("creator_id", creatorId)

          await supabaseAdmin.from("ledger_events").insert({
            creator_id: creatorId,
            event_type: "sale",
            amount_cents: wTotal,
            net_seller_cents: wNet,
            fee_cents: wFee,
            currency: wallet.currency,
            pending_delta: actualPending,
            order_id: order.id,
            hold_until: holdUntil.toISOString(),
            description: saleLine,
          })
        }
      } catch (ledgerErr) {
        console.error("[Webhook] Ledger sale update failed (non-fatal):", ledgerErr)
      }
    }

    // Customer record upsert
    if (buyerEmail && creatorId) {
      /* Added to the buyer's history (lib/checkout/fulfil-payment recordCustomer): this was an upsert of 1 and this order's total, which reset a returning customer's orders and spend on every purchase. */
      try {
        await recordCustomer(supabaseAdmin, { creatorId, email: buyerEmail.trim(), first: buyerFirstName || undefined, last: buyerLastName || undefined, total: totalAmount })
      } catch (customerErr) {
        console.error("[Webhook] customer record failed (non-fatal):", customerErr instanceof Error ? customerErr.message : customerErr)
      }

      /* The buyer as the creator's contact: subscribed only with the
         session's own yes, a customer otherwise, and never back on the list
         after unsubscribing (lib/contacts/checkout-contact). This used to
         subscribe every buyer of an older session. A yes that puts them on
         the list starts the welcome, once (lib/contacts/checkout-welcome). */
      await recordCheckoutContactAndWelcome(supabaseAdmin, {
        creatorId,
        email: buyerEmail,
        name: `${buyerFirstName || ""} ${buyerLastName || ""}`.trim(),
        orderId: order.id,
        basis: metadata.email_opt_in === "true" ? "ticked" : "none",
        bought: true,
        source: contactSourceOfOrder(orderOriginFrom(metadata), productId),
      })
      await recordContactAttribution(supabaseAdmin, creatorId, buyerEmail, attribution)
    }

    // Entitlement
    if (buyerId) {
      let entitlementQuery = supabaseAdmin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", buyerId)
        .eq("product_id", productId)

      if (variantId) {
        entitlementQuery = entitlementQuery.eq("variant_id", variantId)
      } else {
        entitlementQuery = entitlementQuery.is("variant_id", null)
      }

      const { data: existingEntitlement } = await entitlementQuery.maybeSingle()

      if (!existingEntitlement) {
        const { error: entErr } = await supabaseAdmin.from("entitlements").insert({
          buyer_id: buyerId,
          creator_id: creatorId,
          product_id: productId,
          variant_id: variantId || null,
          community_access: metadata.includes_community === "true" || metadata.product_type === "course",
        })
        if (entErr) console.error("[Webhook] Entitlement error:", entErr)
      }
    }

    // Sales count
    const { error: salesErr } = await supabaseAdmin.rpc("increment_product_sales", { p_product_id: productId })
    if (salesErr) console.error("[Webhook] Failed to increment sales:", salesErr)

    // Analytics
    const { error: analyticsErr } = await supabaseAdmin
      .from("analytics_events")
      .insert({ creator_id: creatorId, product_id: productId, event_type: "purchase" })
    if (analyticsErr) console.error("[Webhook] Analytics error:", analyticsErr)

    // Emails
    try {
      const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

      await sendOrderEmails(supabaseAdmin, {
        orderId: order.id,
        creatorId,
        buyerEmail,
        buyerFirstName,
        buyerLastName,
        productTitle,
        receiptToken,
        amountCents: totalAmount,
        feeCents: applicationFeeAmount,
        baseUrl,
        variantName: variantName || null,
        sale: { couponCode: metadata.coupon_code || null, discountCents: Math.max(0, Number.parseInt(metadata.discount_cents || "0", 10) || 0) },
        /* Where it was bought: the receipt's language and who signs it (lib/emails/buyer-channel.ts). */
        source: orderSourceFrom(metadata),
        origin: orderOriginFrom(metadata),
      })

      try {
        await triggerEmailFlows(supabaseAdmin, {
          triggerType: "purchase",
          creatorId,
          recipientEmail: buyerEmail,
          recipientName: buyerFirstName,
          productTitle,
          productId,
          orderId: order.id,
          source: { surface: "checkout" },
        })
      } catch (flowErr) {
        console.error("[Webhook] Email flow trigger error (non-fatal):", flowErr)
      }
    } catch (emailErr) {
      console.error("[Webhook] Email sending failed (order still ok):", emailErr)
    }

    /* The sale, the order and, once in the creator's life, the first sale:
       the notification engine's events (lib/orders/sale-events.ts). The
       first-sale email that used to be sent from here is the engine's
       FIRST_SALE now, on the same guard (creators.first_sale_email_sent). */
    await raiseSaleEvents(supabaseAdmin, {
      creatorId,
      purchase: { orderId: order.id, amountCents: totalAmount, lineCount: 1 },
      lines: [{ orderId: order.id, productId, productTitle, amountCents: totalAmount, feeCents: applicationFeeAmount }],
      currency: session.currency || null,
      buyerEmail,
      buyerCountry: metadata.buyer_country || null,
      correlationId: event.id,
    })

    // Push notification to seller — non-fatal
    try {
      const { notifySale } = await import("@/lib/push/notifications")
      const { data: creatorRow } = await supabaseAdmin
        .from("creators")
        .select("user_id")
        .eq("id", creatorId)
        .single()
      if (creatorRow?.user_id) {
        console.log("[push] Sending sale notification to creator user:", creatorRow.user_id)
        await notifySale(creatorRow.user_id, {
          productName: productTitle,
          amountCents: totalAmount,
          orderId: order.id,
          productId,
        })
        console.log("[push] Push send result: OK")
      } else {
        console.log("[push] No user_id found for creator:", creatorId, "— skipping push")
      }
    } catch (pushErr) {
      console.error("[push] Sale notification error (non-fatal):", pushErr)
    }

    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // payment_intent.succeeded
  // ============================================================================
  /*
    The product checkout's payments become orders here as well as from the
    buyer's browser (lib/checkout/fulfil-payment.ts). This used to check for
    an order and stop: a buyer who closed the tab after paying had nothing.
    Whichever of the two arrives first makes the order; the other finds it.
    A failure answers 500 so Stripe retries the event.
  */
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent
    /*
      A WEBSITE'S CHECKOUT, paid in Storelib's own form on the site's address
      (app/checkout/site): a basket of downloads (metadata cart + site_basket)
      or a cart that ships (metadata physical_intent). The buyer's browser
      writes it too; whichever comes first does, each line once. A Checkout
      Session's own PaymentIntent carries neither mark, so it is never
      written here as well as by its session.
    */
    if (isCartIntent(pi)) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ""
      const result = await fulfilCartPayment(supabaseAdmin, pi.id, { baseUrl })
      if (result.ok === false ? result.status >= 500 : !result.complete) {
        console.error("[Webhook] website basket incomplete:", pi.id)
        return NextResponse.json({ error: "Basket not fully written" }, { status: 500 })
      }
      return NextResponse.json({ received: true })
    }
    if (pi.metadata?.physical_intent === "1") {
      const physical = await import("@/lib/physical/checkout-server")
      if (physical.isPhysicalIntent(pi)) {
        const baseUrl = `https://${process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"}`
        const done = await physical.completePhysicalIntent(supabaseAdmin, pi.id, baseUrl)
        if (done.ok === false ? done.status >= 500 : !done.complete) {
          console.error("[Webhook] website order incomplete:", pi.id)
          return NextResponse.json({ error: "Order not fully written" }, { status: 500 })
        }
        return NextResponse.json({ received: true })
      }
    }
    if (isCheckoutIntent(pi)) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ""
      const result = await fulfilPaymentIntent(supabaseAdmin, pi.id, { baseUrl })
      if (result.ok === false) {
        console.error("[Webhook] checkout fulfilment failed:", pi.id, result.error)
        if (result.status >= 500) return NextResponse.json({ error: result.error }, { status: 500 })
      }
      /* Round 39: a community Library sale, recorded against its item once its order exists (lib/communities/server/library-checkout.ts). */
      if (result.ok && pi.metadata?.kind === "community_library") await (await import("@/lib/communities/server/library-checkout")).recordFromIntent(supabaseAdmin, pi, result.orderId)
      return NextResponse.json({ received: true })
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent
    console.error("[Webhook] Payment failed:", pi.id, pi.last_payment_error?.code ?? "")
    /*
      PAYMENT FAILED, for an order that ships: the buyer is told half an hour
      later if they still haven't paid (lib/physical/jobs-server
      queuePaymentFailedEmail), once per checkout however many cards were
      declined. A retry that succeeds in the meantime sends nothing.
    */
    try {
      /*
        Paid on Stripe's page (a Checkout Session), the checkout learns its
        PaymentIntent only once paid, so a declined card is found by the id the
        session put on the PaymentIntent (metadata physical_checkout_id). The
        card form's checkout has the PaymentIntent's id from the start.
      */
      const byIntent = await supabaseAdmin.from("commerce_checkouts").select("id, creator_id, status, buyer_email").eq("stripe_payment_intent_id", pi.id).maybeSingle()
      const named = typeof pi.metadata?.physical_checkout_id === "string" && /^[0-9a-f-]{36}$/i.test(pi.metadata.physical_checkout_id) ? pi.metadata.physical_checkout_id : null
      const co = byIntent.data ?? (named ? (await supabaseAdmin.from("commerce_checkouts").select("id, creator_id, status, buyer_email").eq("id", named).eq("creator_id", String(pi.metadata?.creator_id ?? "")).maybeSingle()).data : null)
      const row = co as { id: string; creator_id: string; status: string; buyer_email: string | null } | null
      if (row && row.status === "pending" && row.buyer_email) {
        const { queuePaymentFailedEmail } = await import("@/lib/physical/jobs-server")
        await queuePaymentFailedEmail(supabaseAdmin, row.id, row.creator_id, row.buyer_email)
      }
    } catch (e) {
      console.error("[Webhook] payment failed email not queued:", e instanceof Error ? e.message : "error")
    }
  }

  // ============================================================================
  // SUBSCRIPTION EVENTS
  // ============================================================================

  if (event.type === "customer.subscription.created") {
    const subscription = event.data.object as any
    const metadata = subscription.metadata || {}
    const creatorId = metadata.creator_id
    const planId = metadata.plan_id

    console.log("[Subscription] Created:", subscription.id, "creator:", creatorId, "plan:", planId)

    if (!creatorId || !planId) {
      console.error("[Subscription] Missing metadata")
      return NextResponse.json({ received: true, message: "Missing metadata" })
    }

    try {
      const subAny = subscription as any
      let periodStart = subAny.current_period_start || subAny.current_period?.start_date || null
      let periodEnd = subAny.current_period_end || subAny.current_period?.end_date || null
      // Fallback to latest_invoice period
      if (!periodStart || !periodEnd) {
        const inv = typeof subAny.latest_invoice === "object" ? subAny.latest_invoice : null
        if (inv?.period_start) periodStart = periodStart || inv.period_start
        if (inv?.period_end) periodEnd = periodEnd || inv.period_end
      }

      // Upsert subscription record (may already exist from a previous attempt)
      await supabaseAdmin.from("subscriptions").upsert({
        creator_id: creatorId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
        plan_id: planId,
        status: subscription.status,
        current_period_start: safeTimestamp(periodStart),
        current_period_end: safeTimestamp(periodEnd),
        cancel_at_period_end: subscription.cancel_at_period_end,
      }, { onConflict: "creator_id" })

      await supabaseAdmin
        .from("creators")
        .update({
          subscription_plan_id: planId,
          subscription_status: subscription.status,
          stripe_customer_id: subscription.customer as string,
        })
        .eq("id", creatorId)

      console.log("[Subscription] Created successfully")

      await raiseForCreator(creatorId, {
        name: "subscription.created",
        key: `subscription:${subscription.id}:created`,
        entityType: "subscription",
        entityId: subscription.id,
        correlationId: event.id,
        payload: { subscriptionId: subscription.id, planId, status: subscription.status },
      })
    } catch (error) {
      console.error("[Subscription] Error creating:", error)
    }

    return NextResponse.json({ received: true })
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as any

    console.log("[Subscription] Updated:", subscription.id, "Status:", subscription.status)

    try {
      const { data: existingSubscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id, plan_id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle()

      if (!existingSubscription) {
        console.log("[Subscription] No existing record found")
        return NextResponse.json({ received: true, message: "No existing subscription" })
      }

      const currentPriceId = subscription.items?.data?.[0]?.price?.id
      let planId = planIdFromPriceId(currentPriceId)
      const metadata = subscription.metadata || {}
      if (metadata.pending_plan_id && subscription.status === "active") {
        planId = metadata.pending_plan_id
      } else if (metadata.plan_id) {
        planId = metadata.plan_id
      }

      let updPeriodStart = subscription.current_period_start || subscription.current_period?.start_date || null
      let updPeriodEnd = subscription.current_period_end || subscription.current_period?.end_date || null
      if (!updPeriodStart || !updPeriodEnd) {
        const inv = typeof subscription.latest_invoice === "object" ? subscription.latest_invoice : null
        if (inv?.period_start) updPeriodStart = updPeriodStart || inv.period_start
        if (inv?.period_end) updPeriodEnd = updPeriodEnd || inv.period_end
      }

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: subscription.status,
          plan_id: planId,
          current_period_start: safeTimestamp(updPeriodStart),
          current_period_end: safeTimestamp(updPeriodEnd),
          cancel_at_period_end: subscription.cancel_at_period_end,
          pending_plan_id: metadata.pending_plan_id && subscription.status !== "active" ? metadata.pending_plan_id : null,
          canceled_at: subscription.canceled_at ? safeTimestamp(subscription.canceled_at) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id)

      // If subscription is no longer active/trialing, force plan to "free"
      // so fee calculation always defaults correctly
      const isSubscriptionActive = ["active", "trialing"].includes(subscription.status)
      const creatorPlanId = isSubscriptionActive ? planId : "free"

      await supabaseAdmin
        .from("creators")
        .update({
          subscription_plan_id: creatorPlanId,
          subscription_status: isSubscriptionActive ? subscription.status : "active",
        })
        .eq("id", existingSubscription.creator_id)

      console.log("[Subscription] Creator plan synced:", {
        creatorId: existingSubscription.creator_id,
        stripeStatus: subscription.status,
        resolvedPlanId: creatorPlanId,
        isActive: isSubscriptionActive,
      })

      /* A cancellation scheduled for the period's end (Settings, Billing, or
         a downgrade to free): told once for that end date, so a cancel that
         is undone and made again is told again. The end itself is
         customer.subscription.deleted. */
      const previous = (event.data as any).previous_attributes || {}
      if (subscription.cancel_at_period_end === true && previous.cancel_at_period_end === false) {
        const endsAt = periodEndOf(subscription)
        await raiseForCreator(existingSubscription.creator_id, {
          name: "subscription.cancelled",
          key: `subscription:${subscription.id}:cancel_at:${endsAt ?? event.id}`,
          entityType: "subscription",
          entityId: subscription.id,
          correlationId: event.id,
          payload: {
            subscriptionId: subscription.id,
            planId: existingSubscription.plan_id ?? planId,
            atPeriodEnd: true,
            endsAt: endsAt ? new Date(endsAt * 1000).toISOString() : null,
          },
        })
      }

      if (subscription.status === "active" && metadata.pending_plan_id) {
        await stripe.subscriptions.update(subscription.id, {
          metadata: { ...metadata, pending_plan_id: "" },
        })
      }

      console.log("[Subscription] Updated successfully")
    } catch (error) {
      console.error("[Subscription] Error updating:", error)
    }

    return NextResponse.json({ received: true })
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription & { current_period_start: number; current_period_end: number }

    console.log("[Subscription] Deleted:", subscription.id)

    try {
      const { data: existingSubscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle()

      if (!existingSubscription) {
        return NextResponse.json({ received: true, message: "No existing subscription" })
      }

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id)

      await supabaseAdmin
        .from("creators")
        .update({
          subscription_plan_id: "free",
          subscription_status: "active",
        })
        .eq("id", existingSubscription.creator_id)

      console.log("[Subscription] Reverted to free plan")

      await raiseForCreator(existingSubscription.creator_id, {
        name: "subscription.cancelled",
        key: `subscription:${subscription.id}:ended`,
        entityType: "subscription",
        entityId: subscription.id,
        correlationId: event.id,
        payload: { subscriptionId: subscription.id, atPeriodEnd: false, ended: true, planId: "free" },
      })
    } catch (error) {
      console.error("[Subscription] Error handling deletion:", error)
    }

    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // INVOICE EVENTS
  // ============================================================================

  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice & { subscription?: string; period_start?: number; period_end?: number }

    console.log("[Invoice] Paid:", invoice.id)
    /* NEWER STRIPE API VERSIONS MOVED THE SUBSCRIPTION ONTO invoice.parent.
       Read it from either place, so a plan renewal is never mistaken for a
       one-off invoice whichever version the webhook endpoint sends. */
    const subscriptionId = subscriptionIdOf(invoice)

    if (!subscriptionId) {
      return NextResponse.json({ received: true, message: "Not a subscription invoice" })
    }

    try {
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle()

      if (!subscription) {
        return NextResponse.json({ received: true, message: "No subscription found" })
      }

      // Upsert invoice to avoid duplicates
      await supabaseAdmin.from("invoices").upsert({
        creator_id: subscription.creator_id,
        subscription_id: subscription.id,
        stripe_invoice_id: invoice.id,
        amount_cents: invoice.amount_paid,
        status: "paid",
        invoice_pdf_url: invoice.invoice_pdf || null,
        hosted_invoice_url: invoice.hosted_invoice_url || null,
        period_start: invoice.period_start ? safeTimestamp(invoice.period_start) : null,
        period_end: invoice.period_end ? safeTimestamp(invoice.period_end) : null,
      }, { onConflict: "stripe_invoice_id" })

      console.log("[Invoice] Record saved")

      /* A renewal, not the first invoice (that one is subscription.created).
         invoice.paid and invoice.payment_succeeded both arrive for one
         invoice: the key is the invoice. */
      if ((invoice as any).billing_reason === "subscription_cycle") {
        await raiseForCreator(subscription.creator_id, {
          name: "subscription.renewed",
          key: `invoice:${invoice.id}:paid`,
          entityType: "subscription",
          entityId: subscriptionId,
          correlationId: event.id,
          payload: {
            subscriptionId,
            invoiceId: invoice.id,
            amountCents: invoice.amount_paid,
            currency: invoice.currency.toLowerCase(),
            periodEnd: invoice.period_end ? safeTimestamp(invoice.period_end) : null,
          },
        })
      }
    } catch (error) {
      console.error("[Invoice] Error:", error)
    }

    return NextResponse.json({ received: true })
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice & { subscription?: string; period_start?: number; period_end?: number }

    console.log("[Invoice] Payment failed:", invoice.id)
    /* NEWER STRIPE API VERSIONS MOVED THE SUBSCRIPTION ONTO invoice.parent.
       Read it from either place, so a plan renewal is never mistaken for a
       one-off invoice whichever version the webhook endpoint sends. */
    const subscriptionId = subscriptionIdOf(invoice)

    if (!subscriptionId) {
      return NextResponse.json({ received: true, message: "Not a subscription invoice" })
    }

    try {
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("id, creator_id")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle()

      if (!subscription) {
        return NextResponse.json({ received: true, message: "No subscription found" })
      }

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscriptionId)

      await supabaseAdmin
        .from("creators")
        .update({ subscription_status: "past_due" })
        .eq("id", subscription.creator_id)

      console.log("[Invoice] Subscription set to past_due")

      /* Each attempt Stripe makes is its own event; the key is the invoice and the attempt. */
      await raiseForCreator(subscription.creator_id, {
        name: "subscription.payment_failed",
        key: `invoice:${invoice.id}:failed:${(invoice as any).attempt_count ?? event.id}`,
        entityType: "subscription",
        entityId: subscriptionId,
        correlationId: event.id,
        payload: {
          subscriptionId,
          invoiceId: invoice.id,
          amountCents: invoice.amount_due,
          currency: (invoice.currency || "usd").toLowerCase(),
          attempt: (invoice as any).attempt_count ?? null,
          nextAttemptAt: (invoice as any).next_payment_attempt ? safeTimestamp((invoice as any).next_payment_attempt) : null,
        },
      })
    } catch (error) {
      console.error("[Invoice] Error:", error)
    }

    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // REFUND EVENTS — sync refunds initiated from Stripe Dashboard
  // ============================================================================

  /* A refund that was pending when it was made: applied once Stripe says it went through. */
  if (event.type === "refund.updated" || event.type === "charge.refund.updated") {
    const refund = event.data.object as Stripe.Refund
    if (refund.status !== "succeeded" || !refund.charge) return NextResponse.json({ received: true })
    try {
      const charge = await stripe.charges.retrieve(typeof refund.charge === "string" ? refund.charge : refund.charge.id)
      const done = await syncChargeRefund(supabaseAdmin, stripe, charge)
      console.log("[Webhook] refund settled", refund.id, "applied:", done.applied, "already applied:", done.skipped)
    } catch (error) {
      console.error("[Webhook] Error applying settled refund:", error instanceof Error ? error.message : error)
      return NextResponse.json({ error: "Refund not recorded yet" }, { status: 500 })
    }
    return NextResponse.json({ received: true })
  }

  if (event.type === "charge.refunded") {
    /* Every refund of the charge, split across the order rows it belongs to
       and applied to each once: lib/stripe/refund-sync.ts has the why. */
    const charge = event.data.object as Stripe.Charge
    /* A community program refunded in full is locked again (lib/communities/server/learn-checkout.ts),
       and an event ticket refunded in full gives its seat back
       (lib/communities/server/event-checkout.ts), whoever made the refund. */
    if (charge.refunded && charge.payment_intent) {
      const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent.id
      const [{ revokeRefundedProgram }, { revokeRefundedTicket }] = await Promise.all([
        import("@/lib/communities/server/learn-checkout"),
        import("@/lib/communities/server/event-checkout"),
      ])
      await revokeRefundedProgram(supabaseAdmin, intentId)
      await revokeRefundedTicket(supabaseAdmin, intentId)
      await (await import("@/lib/communities/server/module-sales")).revokeRefundedModule(supabaseAdmin, intentId)
      /* Round 39: a Library sale's record marked; the refund itself takes the product out of the buyer's library (lib/stripe/refund-sync.ts), which locks the item. */
      await (await import("@/lib/communities/server/library-checkout")).revokeRefundedLibrary(supabaseAdmin, intentId)
    }
    try {
      const done = await syncChargeRefund(supabaseAdmin, stripe, charge)
      console.log("[Webhook] charge.refunded", charge.id, "applied:", done.applied, "already applied:", done.skipped)
      /* A physical order's own status and refunded total, so the order list agrees with Stripe (lib/physical/orders-server.ts). */
      const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
      if (intent) {
        const { syncCheckoutRefunds } = await import("@/lib/physical/orders-server")
        await syncCheckoutRefunds(supabaseAdmin as never, intent).catch((e) => console.error("[Webhook] physical refund restate:", e instanceof Error ? e.message : e))
      }
    } catch (error) {
      console.error("[Webhook] Error processing charge.refunded:", error instanceof Error ? error.message : error)
      /* A 500 makes Stripe retry, and a retry skips what was applied. */
      return NextResponse.json({ error: "Refund not recorded yet" }, { status: 500 })
    }
    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // PAYOUT EVENTS — from connected seller accounts (Connect webhooks)
  // event.account = the connected Stripe account ID
  // ============================================================================

  if (
    event.type === "payout.created" ||
    event.type === "payout.paid" ||
    event.type === "payout.failed" ||
    event.type === "payout.updated" ||
    event.type === "payout.canceled"
  ) {
    const payout = event.data.object as Stripe.Payout
    const connectedAccountId = (event as any).account as string | undefined

    console.log(`[Webhook] ${event.type}:`, payout.id, "account:", connectedAccountId)

    if (!connectedAccountId) {
      // Not a Connect event — ignore
      return NextResponse.json({ received: true })
    }

    // Find the creator by their connected Stripe account
    const { data: creator } = await supabaseAdmin
      .from("creators")
      .select("id, user_id")
      .eq("stripe_account_id", connectedAccountId)
      .maybeSingle()

    if (!creator) {
      console.log("[Webhook] No creator found for account:", connectedAccountId)
      return NextResponse.json({ received: true })
    }

    const arrivalDate = payout.arrival_date
      ? new Date(payout.arrival_date * 1000).toISOString()
      : null

    const destination =
      typeof payout.destination === "string"
        ? payout.destination
        : (payout.destination as any)?.last4
          ? `****${(payout.destination as any).last4}`
          : null

    // Upsert payout record in DB
    try {
      await supabaseAdmin.from("payouts").upsert(
        {
          creator_id: creator.id,
          stripe_payout_id: payout.id,
          amount_cents: payout.amount,
          currency: payout.currency,
          status: payout.status,
          arrival_date: arrivalDate,
          description: payout.description,
          destination,
          method: payout.method,
          failure_code: (payout as any).failure_code || null,
          failure_message: (payout as any).failure_message || null,
          stripe_created: new Date(payout.created * 1000).toISOString(),
          webhook_received_at: new Date().toISOString(),
        },
        { onConflict: "stripe_payout_id" }
      )
    } catch (err) {
      console.error("[Webhook] Failed to upsert payout:", err)
    }

    /* A failed payout, or the one that fixes it: the creator's notifications, after the answer. */
    const payoutCreatorId = creator.id as string
    after(async () => (await import("@/lib/notifications/events")).notePayout(payoutCreatorId))

    // ── Ledger: update balance buckets for payout status changes ─────────
    try {
      const { data: ledger } = await supabaseAdmin
        .from("seller_ledger")
        .select("*")
        .eq("creator_id", creator.id)
        .single()

      if (ledger) {
        // Find the original cashout event to get USD amount
        const { data: cashoutEvent } = await supabaseAdmin
          .from("ledger_events")
          .select("amount_cents, currency")
          .eq("creator_id", creator.id)
          .eq("event_type", "cashout_initiated")
          .eq("stripe_payout_id", payout.id)
          .maybeSingle()

        /*
          THE WALLET'S UNITS. The balance buckets are kept in the wallet's one
          currency (lib/payments/ledger-currency). A cash out recorded its own
          amount in them; a payout Storelib did not start (Stripe's schedule)
          is in the bank's currency, so it is converted at the day's ECB rate
          first. A payout no rate can convert leaves the buckets alone rather
          than taking lei from a dollar balance; Stripe's own balance, which
          Payouts reads, is the truth either way.
        */
        const { toLedger, ledgerCurrency } = await import("@/lib/payments/ledger-currency")
        const { formatMinor } = await import("@/lib/markets/money")
        const walletOf = cashoutEvent
          ? { amount: Number(cashoutEvent.amount_cents) || 0, currency: String(cashoutEvent.currency || ledgerCurrency()).toLowerCase() }
          : await toLedger([payout.amount], payout.currency).then((w) => ({ amount: w.amounts[0] ?? 0, currency: w.currency }))
        const usdAmount = walletOf.amount
        const walletText = formatMinor(usdAmount, walletOf.currency.toUpperCase(), "en")
        if (walletOf.currency !== ledgerCurrency()) {
          /* Caught below, which only logs: the notifications after this still go. */
          throw new Error(`payout ${payout.id} is in ${walletOf.currency.toUpperCase()} and no rate converts it to the wallet's currency: balance buckets left as they are`)
        }

        /* Once per payout and outcome, in one locked step (lib/payments/ledger): Stripe
           delivering payout.paid twice no longer pays it out twice on the balance. */
        const returned = event.type === "payout.failed" || event.type === "payout.canceled"
        const posted = event.type === "payout.paid" || returned
          ? await postLedger(supabaseAdmin, {
              creatorId: creator.id,
              key: `payout:${payout.id}:${returned ? "cashout_failed" : "cashout_completed"}`,
              op: returned ? "payout_returned" : "payout_paid",
              amountCents: usdAmount,
              event: {
                event_type: returned ? "cashout_failed" : "cashout_completed",
                amount_cents: usdAmount,
                net_seller_cents: usdAmount,
                currency: walletOf.currency,
                stripe_payout_id: payout.id,
                description: returned
                  ? `Cashout ${event.type === "payout.failed" ? "failed" : "canceled"}: ${walletText} returned to available`
                  : `Cashout completed: ${walletText} arrived at bank`,
              },
            })
          : { unavailable: true as const }

        if (!posted.unavailable) {
          /* Written in the database. */
        } else if (event.type === "payout.paid") {
          await supabaseAdmin
            .from("seller_ledger")
            .update({
              in_transit_amount: Math.max(0, ledger.in_transit_amount - usdAmount),
              lifetime_paid_out: ledger.lifetime_paid_out + usdAmount,
            })
            .eq("creator_id", creator.id)

          await supabaseAdmin.from("ledger_events").insert({
            creator_id: creator.id,
            event_type: "cashout_completed",
            amount_cents: usdAmount,
            net_seller_cents: usdAmount,
            currency: walletOf.currency,
            in_transit_delta: -usdAmount,
            stripe_payout_id: payout.id,
            description: `Cashout completed: ${walletText} arrived at bank`,
          })
        } else if (event.type === "payout.failed" || event.type === "payout.canceled") {
          // Return funds to available
          await supabaseAdmin
            .from("seller_ledger")
            .update({
              in_transit_amount: Math.max(0, ledger.in_transit_amount - usdAmount),
              available_amount: ledger.available_amount + usdAmount,
            })
            .eq("creator_id", creator.id)

          await supabaseAdmin.from("ledger_events").insert({
            creator_id: creator.id,
            event_type: "cashout_failed",
            amount_cents: usdAmount,
            net_seller_cents: usdAmount,
            currency: walletOf.currency,
            in_transit_delta: -usdAmount,
            available_delta: usdAmount,
            stripe_payout_id: payout.id,
            description: `Cashout ${event.type === "payout.failed" ? "failed" : "canceled"}: ${walletText} returned to available`,
          })
        }
      }
    } catch (ledgerPayoutErr) {
      console.error("[Webhook] Ledger payout update failed (non-fatal):", ledgerPayoutErr)
    }

    /*
      The creator hears about the payout through the notification engine:
      created is PAYOUT_SCHEDULED (the same key cashout and withdraw raise,
      so a payout Storelib started is told once), paid is PAYOUT_SENT (with
      whether it is the first ever), failed is PAYOUT_FAILED. The payout
      emails sent from here before read profiles by a column it does not
      have, and so were mostly never sent.
    */
    const payoutState =
      event.type === "payout.created" ? "scheduled" : event.type === "payout.paid" ? "sent" : event.type === "payout.failed" ? "failed" : null
    if (payoutState) {
      let first = false
      if (payoutState === "sent") {
        try {
          const { count } = await supabaseAdmin
            .from("payouts")
            .select("id", { count: "exact", head: true })
            .eq("creator_id", creator.id)
            .eq("status", "paid")
            .neq("stripe_payout_id", payout.id)
          first = count === 0
        } catch {
          /* Not known: an ordinary payout. */
        }
      }
      const bank = payout.destination && typeof payout.destination === "object" ? (payout.destination as any) : null
      await emit({
        name: `payout.${payoutState}` as "payout.scheduled" | "payout.sent" | "payout.failed",
        key: `payout:${payout.id}:${payoutState}`,
        userId: (creator.user_id as string | null) ?? null,
        creatorId: creator.id,
        entityType: "payout",
        entityId: payout.id,
        correlationId: event.id,
        payload: {
          payoutId: payout.id,
          amountCents: payout.amount,
          currency: payout.currency,
          arrivalDate,
          method: payout.method,
          bankName: bank?.bank_name || null,
          last4: bank?.last4 || null,
          failureCode: (payout as any).failure_code || null,
          failureMessage: (payout as any).failure_message || null,
          first,
        },
      })
    }

    return NextResponse.json({ received: true })
  }

  // ============================================================================
  // DISPUTE EVENTS: charge.dispute.created / .updated / .closed
  // ============================================================================
  /*
    A Storelib sale is charged on Storelib's own account and the creator's
    share is transferred on (destination charges), so its dispute arrives
    here with no `account`: the creator is found from the charge's transfer
    (lib/stripe/disputes). Only an older charge made directly on a creator's
    account carries one. While a case is open the creator's share of that
    sale is taken back; if the creator wins it goes back to them. An inquiry
    (Stripe's warning_ statuses) moves no money and is only recorded.

    A STEP THAT FAILS IS ANSWERED 500, so Stripe sends the event again (it
    used to be caught and answered 200, and a dispute half handled stayed
    that way). Every step is safe to run again: the money moves once (the
    ledger keys and the reversal's own idempotency key), the orders' marks
    and the library are set, not added to, and the notices are keyed. A
    retry after the closing money was written skips the money and finishes
    the rest.
  */
  if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.closed" ||
    event.type === "charge.dispute.updated"
  ) {
    const dispute = event.data.object as Stripe.Dispute
    const accountOnEvent = typeof event.account === "string" ? event.account : null

    try {
      const ctx = await disputeContext(dispute, accountOnEvent)
      const creator = await disputeCreator(supabaseAdmin, ctx)

      if (!creator) {
        console.warn("[Webhook] Dispute: no creator found for", dispute.id)
        return NextResponse.json({ received: true })
      }

      /* A dispute opened or closed: the creator's notifications, after the ledger below is written and the answer sent. */
      const disputeCreatorId = creator.id as string
      after(async () => (await import("@/lib/notifications/events")).noteDispute(disputeCreatorId))

      const disputeAmountCents = dispute.amount
      const disputeCurrency = (dispute.currency || "usd").toLowerCase()
      const disputeUserId = creator.user_id ?? null
      const inquiry = isInquiry(dispute.status)
      /* Stripe's own fee, from the withdrawal (never a guessed $15). Only an older charge's fee is the creator's: Stripe took it from their account. */
      const disputeFeeCents = ctx.onPlatform ? 0 : disputeFeeMinor((dispute as { balance_transactions?: unknown }).balance_transactions)
      const evidenceDueBy = dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null
      const paymentIntentId = ctx.paymentIntentId
      const disputeFacts = {
        disputeId: dispute.id,
        amountCents: dispute.amount,
        currency: disputeCurrency,
        reason: dispute.reason || null,
        status: dispute.status,
        inquiry,
        dueBy: evidenceDueBy,
      }

      /*
        What the creator gives up while the case is open, once per dispute:
        on a Storelib sale, their share taken back (a transfer reversal, never
        more than they received); on an older charge, what Stripe already
        took from their own account, fee included.
      */
      const takeBack = async () => {
        const { data: existingEvent } = await supabaseAdmin
          .from("ledger_events")
          .select("id")
          .eq("stripe_dispute_id", dispute.id)
          .eq("event_type", "dispute_created")
          .maybeSingle()
        if (existingEvent) return null

        const taken = await takeBackForDispute(ctx, dispute)
        await saveDispute(supabaseAdmin, { stripe_dispute_id: dispute.id, reversed_minor: taken.reversedMinor, reversal_id: taken.reversalId, recovery: taken.state })
        const totalDeduction = ctx.onPlatform ? taken.reversedMinor : disputeAmountCents + disputeFeeCents
        if (totalDeduction <= 0) return taken
        /* In the wallet's currency, as the sale was added and a refund is taken (lib/payments/ledger-currency): a dispute of 500 lei took 500.00 off a dollar balance. */
        const deductionWallet = await toLedger([totalDeduction, disputeFeeCents], disputeCurrency)
        const [walletDeduction, walletFee] = deductionWallet.amounts

        /* Once per dispute, in one locked step (lib/payments/ledger). Below: before run-now part 64. */
        const posted = await postLedger(supabaseAdmin, {
          creatorId: creator.id,
          key: `dispute:${dispute.id}:dispute_created`,
          op: "debit_available_first",
          amountCents: walletDeduction,
          event: {
            event_type: "dispute_created",
            amount_cents: walletDeduction,
            net_seller_cents: walletDeduction,
            fee_cents: walletFee,
            currency: deductionWallet.currency,
            stripe_dispute_id: dispute.id,
            description: `Dispute opened: ${amountText(totalDeduction, disputeCurrency)} held`,
          },
        })
        const { data: ledger } = posted.unavailable
          ? await supabaseAdmin.from("seller_ledger").select("*").eq("creator_id", creator.id).single()
          : { data: null }

        if (ledger) {
          let remaining = walletDeduction
          let newNegative = ledger.negative_balance
          const fromAvailable = Math.min(remaining, ledger.available_amount)
          remaining -= fromAvailable
          const fromPending = Math.min(remaining, ledger.pending_amount)
          remaining -= fromPending
          if (remaining > 0) newNegative += remaining

          await supabaseAdmin
            .from("seller_ledger")
            .update({
              available_amount: ledger.available_amount - fromAvailable,
              pending_amount: ledger.pending_amount - fromPending,
              negative_balance: newNegative,
            })
            .eq("creator_id", creator.id)

          await supabaseAdmin.from("ledger_events").insert({
            creator_id: creator.id,
            event_type: "dispute_created",
            amount_cents: walletDeduction,
            net_seller_cents: walletDeduction,
            fee_cents: walletFee,
            currency: deductionWallet.currency,
            available_delta: -fromAvailable,
            pending_delta: -fromPending,
            stripe_dispute_id: dispute.id,
            description: `Dispute opened: ${amountText(totalDeduction, disputeCurrency)} held`,
          })
        }
        return taken
      }

      if (event.type === "charge.dispute.created") {
        await saveDispute(supabaseAdmin, {
          stripe_dispute_id: dispute.id,
          creator_id: creator.id,
          payment_intent_id: paymentIntentId,
          charge_id: ctx.chargeId,
          amount_minor: disputeAmountCents,
          currency: disputeCurrency,
          reason: dispute.reason || null,
          status: dispute.status,
          inquiry,
          evidence_due_by: evidenceDueBy,
          opened_at: new Date(dispute.created * 1000).toISOString(),
        })

        if (!inquiry) await takeBack()

        /* The sale's rows: marked disputed only when money moved (an inquiry leaves them sales), and named in the email either way. */
        let productName: string | null = null
        let orderId: string | null = null
        if (paymentIntentId) {
          try {
            const rows = inquiry
              ? (((await supabaseAdmin.from("orders").select("id, product_id").eq("stripe_payment_intent_id", paymentIntentId)).data ?? []) as Array<{ id: string; product_id: string | null }>)
              : await markPaymentDisputed(supabaseAdmin, paymentIntentId)
            /* The bank holds the money: the product leaves the buyer's library until the dispute is won (lib/stripe/dispute-orders). */
            if (!inquiry) await closeAccessForDispute(supabaseAdmin, paymentIntentId, "stripe_payment_intent_id", communityAccessAfterEntitlement)
            orderId = rows[0]?.id ?? null
            const productIds = [...new Set(rows.map((r) => r.product_id).filter((id): id is string => !!id))]
            if (productIds.length > 0) {
              const { data: prods } = await supabaseAdmin.from("products").select("id, title").in("id", productIds)
              const titleOf = new Map(((prods ?? []) as Array<{ id: string; title: string | null }>).map((p) => [p.id, p.title]))
              productName = disputedProductName(productIds.map((id) => titleOf.get(id)))
            }
          } catch (markErr) {
            /* Half handled: answered 500 below, so Stripe sends it again and this is done then. */
            console.error("[Webhook] Dispute: orders not marked disputed:", markErr)
            throw markErr
          }
        }
        await saveDispute(supabaseAdmin, { stripe_dispute_id: dispute.id, order_id: orderId, product_title: productName })

        /* The creator is told through the engine (DISPUTE_CREATED, and a reminder while evidence is due). */
        await emit({
          name: "dispute.created",
          key: `dispute:${dispute.id}:created`,
          userId: disputeUserId,
          creatorId: creator.id,
          entityType: "dispute",
          entityId: dispute.id,
          correlationId: event.id,
          payload: { ...disputeFacts, productTitle: productName, orderId },
        })
      }

      if (event.type === "charge.dispute.closed") {
        // Idempotency: check if we already processed this dispute closure
        const { data: existingClosed } = await supabaseAdmin
          .from("ledger_events")
          .select("id")
          .eq("stripe_dispute_id", dispute.id)
          .eq("event_type", "dispute_closed")
          .maybeSingle()

        /* Written by an earlier delivery: the money moved then (it is written after the give back), so only the rest is finished now. */
        const moneyDone = !!existingClosed

        await saveDispute(supabaseAdmin, { stripe_dispute_id: dispute.id, status: dispute.status, inquiry, outcome: outcomeOf(dispute.status), closed_at: new Date().toISOString() })

        if (dispute.status === "won") {
          /* What was taken back goes back: Storelib's own record of it, or Stripe's reversals of the transfer. */
          const recorded = await readDispute(supabaseAdmin, dispute.id)
          let totalRestored = 0
          if (moneyDone) {
            /* For the notice only: what the earlier delivery gave back. */
            const { data: kept } = await supabaseAdmin.from("payment_disputes").select("restored_minor").eq("stripe_dispute_id", dispute.id).maybeSingle()
            totalRestored = Math.max(0, Number((kept as { restored_minor?: number } | null)?.restored_minor) || 0)
          }
          if (!moneyDone) {
            const reversed = recorded && recorded.reversed_minor > 0 ? recorded.reversed_minor : (await reversedFor(ctx.transferId, dispute.id)).reversedMinor
            const given = await giveBackAfterWon(ctx, dispute, reversed)
            if (given.state !== "not_needed") {
              await saveDispute(supabaseAdmin, { stripe_dispute_id: dispute.id, restored_minor: given.restoredMinor, restore_transfer_id: given.transferId, recovery: given.state })
            }
            /* On an older charge Stripe returns the amount and the fee to the creator's own account. */
            totalRestored = ctx.onPlatform ? given.restoredMinor : disputeAmountCents + disputeFeeCents
          }

          if (!moneyDone && totalRestored > 0) {
            /* Back in the wallet's currency, as it was taken. */
            const restoredWallet = await toLedger([totalRestored], disputeCurrency)
            const [walletRestored] = restoredWallet.amounts
            /* Once per dispute, in one locked step (lib/payments/ledger). Below: before run-now part 64. */
            const posted = await postLedger(supabaseAdmin, {
              creatorId: creator.id,
              key: `dispute:${dispute.id}:dispute_closed`,
              op: "credit_available",
              amountCents: walletRestored,
              event: {
                event_type: "dispute_closed",
                amount_cents: walletRestored,
                currency: restoredWallet.currency,
                stripe_dispute_id: dispute.id,
                description: `Dispute won: ${amountText(totalRestored, disputeCurrency)} returned`,
              },
            })
            const { data: ledger } = posted.unavailable
              ? await supabaseAdmin.from("seller_ledger").select("*").eq("creator_id", creator.id).single()
              : { data: null }

            if (ledger) {
              // Restore funds: first absorb any negative balance, rest goes to available
              let toAvailable = walletRestored
              let newNegative = ledger.negative_balance
              if (newNegative > 0 && toAvailable > 0) {
                const absorbed = Math.min(toAvailable, newNegative)
                toAvailable -= absorbed
                newNegative -= absorbed
              }

              await supabaseAdmin
                .from("seller_ledger")
                .update({
                  available_amount: ledger.available_amount + toAvailable,
                  negative_balance: newNegative,
                })
                .eq("creator_id", creator.id)

              await supabaseAdmin.from("ledger_events").insert({
                creator_id: creator.id,
                event_type: "dispute_closed",
                amount_cents: walletRestored,
                net_seller_cents: toAvailable,
                currency: restoredWallet.currency,
                available_delta: toAvailable,
                stripe_dispute_id: dispute.id,
                description: `Dispute won: ${amountText(totalRestored, disputeCurrency)} returned`,
              })
            }
          }

          /* Each row back to what it was: a partly refunded row stays refunded (lib/stripe/dispute-orders). */
          const piId = paymentIntentId
          if (piId) {
            try {
              await restorePaymentAfterWonDispute(supabaseAdmin, piId)
              /* And the product back in the buyer's library, which the dispute took (lib/stripe/dispute-orders). */
              await reopenAccessAfterWonDispute(supabaseAdmin, piId, "stripe_payment_intent_id", communityAccessAfterEntitlement)
            } catch (restoreErr) {
              /* Half handled: answered 500 below, so Stripe sends it again and the orders are restored then. */
              console.error("[Webhook] Dispute won: orders not restored:", restoreErr)
              throw restoreErr
            }
          }

          await emit({
            name: "dispute.closed",
            key: `dispute:${dispute.id}:closed`,
            userId: disputeUserId,
            creatorId: creator.id,
            entityType: "dispute",
            entityId: dispute.id,
            correlationId: event.id,
            payload: { ...disputeFacts, outcome: "won", restoredCents: totalRestored },
          })
        } else {
          /* Lost: what was taken back stays taken. An inquiry that closed moved nothing, so it writes nothing. */
          if (!inquiry && !moneyDone) {
            const { error: lostError } = await supabaseAdmin.from("ledger_events").insert({
              creator_id: creator.id,
              event_type: "dispute_closed",
              amount_cents: disputeAmountCents,
              net_seller_cents: 0,
              currency: disputeCurrency,
              stripe_dispute_id: dispute.id,
              description: `Dispute lost: ${amountText(disputeAmountCents, disputeCurrency)}`,
            })
            if (lostError) throw new Error(`dispute close not recorded: ${lostError.message}`)
          }

          await emit({
            name: "dispute.closed",
            key: `dispute:${dispute.id}:closed`,
            userId: disputeUserId,
            creatorId: creator.id,
            entityType: "dispute",
            entityId: dispute.id,
            correlationId: event.id,
            payload: { ...disputeFacts, outcome: dispute.status === "warning_closed" ? "warning_closed" : "lost" },
          })
        }
      }

      /* Evidence submitted, a status that moved: each update is its own Stripe event. */
      if (event.type === "charge.dispute.updated") {
        await saveDispute(supabaseAdmin, { stripe_dispute_id: dispute.id, status: dispute.status, inquiry, evidence_due_by: evidenceDueBy })
        /* An inquiry the bank turned into a chargeback on the same case: the money moves now, once. */
        if (!inquiry && !isClosed(dispute.status)) {
          const taken = await takeBack()
          if (taken && paymentIntentId) {
            try {
              await markPaymentDisputed(supabaseAdmin, paymentIntentId)
              await closeAccessForDispute(supabaseAdmin, paymentIntentId, "stripe_payment_intent_id", communityAccessAfterEntitlement)
            } catch (markErr) {
              /* Half handled: answered 500 below, so Stripe sends it again. */
              console.error("[Webhook] Dispute: orders not marked disputed:", markErr)
              throw markErr
            }
          }
        }
        await emit({
          name: "dispute.updated",
          key: `stripe:${event.id}`,
          userId: disputeUserId,
          creatorId: creator.id,
          entityType: "dispute",
          entityId: dispute.id,
          correlationId: event.id,
          payload: disputeFacts,
        })
      }
    } catch (error: any) {
      /* Not 200: Stripe sends the event again, and every step above is safe to run twice. */
      console.error("[Webhook] Error processing dispute event:", error)
      return NextResponse.json({ error: "The dispute could not be fully recorded. Stripe will send it again." }, { status: 500 })
    }

    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}

/** An amount for a ledger line, in its own currency: 12.50 RON, not $12.50. */
function amountText(minor: number, currency: string): string {
  const d = decimalsOf(currency)
  return `${(minor / 10 ** d).toFixed(d)} ${currency.toUpperCase()}`
}

/* Timed on the server for /admin/performance (lib/perf/server-timing.ts). */
export const POST = timed("infra", "/api/stripe/webhook", handlePOST)
