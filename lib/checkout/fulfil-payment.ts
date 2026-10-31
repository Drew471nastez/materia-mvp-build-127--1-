import { tagOrderPricing } from "@/lib/money/order-pricing"
import "server-only"

/**
 * ===========================================================================
 *  A PAID CHECKOUT BECOMES AN ORDER, EXACTLY ONCE
 * ===========================================================================
 * Two things can report that a checkout's PaymentIntent succeeded:
 *
 *   the buyer's browser   /api/checkout/confirm-payment, straight after
 *                         paying or after a bank's 3-D Secure page;
 *   Stripe itself         the payment_intent.succeeded webhook.
 *
 * Both call this, and whichever arrives first makes the order. The browser
 * used to be the only one: a buyer who paid and closed the tab was charged,
 * the seller was paid, and no order, library entry or email ever existed,
 * because the webhook looked for the order and did nothing when it was not
 * there.
 *
 * ONCE, UNDER A RACE. The two can arrive together. Each checks for an order
 * with this PaymentIntent and inserts when there is none; the insert carries
 * the checkout's `receipt_token`, which the orders table holds UNIQUE, so the
 * second insert fails with 23505 and that caller reads the winner's order
 * back. Only the caller whose insert made the row sends emails, grants the
 * product and writes the seller's ledger, so none of that happens twice.
 *
 * `latest_charge`, not `charges`: Stripe removed `charges` from the
 * PaymentIntent in API version 2022-11-15, and asking to expand a field that
 * does not exist is an error. The SDK here pins 2025-11-17.clover.
 */

import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { sendOrderEmails, triggerEmailFlows } from "@/lib/email"
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { recordCheckoutContactAndWelcome } from "@/lib/contacts/checkout-welcome"
import { orderOriginFrom, orderSourceFrom, tagOrderSource } from "@/lib/orders/order-source"
import { attributionFromMetadata, recordContactAttribution, recordOrderAttribution } from "@/lib/attribution/server"
import { recordCouponUse } from "./coupons"
import { businessFromMetadata } from "./business"
import { invoiceFilename, invoiceForOrder, renderInvoicePdf } from "./invoice"
import { raiseSaleEvents } from "@/lib/orders/sale-events"
import { verifiedAccountForEmail } from "@/lib/orders/attach-guest-orders"
import { postLedger } from "@/lib/payments/ledger"
import { ledgerAmountText, toLedger } from "@/lib/payments/ledger-currency"
import type { PaidCheckout } from "@/lib/payments/checkout"
import { communityAccessAfterEntitlement } from "@/lib/communities/server/payment-hooks"
import { SALE_HOLDER_KEY, claimSale, releaseSale } from "./sales-limit"
import { markSoldOut, owesSoldOutRefund, refundOverLimit } from "./sold-out-refund"
import { beginFollowups, resumeFollowups, type Followups } from "./followups"
import { ensureEntitlement } from "./entitlement-grant"

type Db = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export type Fulfilment =
  | { ok: true; created: boolean; orderId: string; receiptToken: string; sessionFingerprint: string | null; amountCents: number }
  | { ok: false; status: number; error: string }

/** A PaymentIntent the product checkout (stripe-session) made, as opposed to a subscription's, a cart's or a payout's. */
export function isCheckoutIntent(pi: Pick<Stripe.PaymentIntent, "metadata">): boolean {
  return isCheckoutMetadata(pi.metadata || {})
}

/** The same test on any provider's metadata: a product checkout carries these three. */
export function isCheckoutMetadata(m: Record<string, string>): boolean {
  return Boolean(m.product_id && m.creator_id && m.receipt_token)
}

interface PaymentFacts {
  paymentMethod: string
  cardBrand: string | null
  cardLast4: string | null
  paypalEmail: string | null
  applicationFeeCents: number | null
  transferId: string | null
  destinationPaymentId: string | null
  chargeId: string | null
}

export function paymentFacts(pi: Stripe.PaymentIntent): PaymentFacts {
  const facts: PaymentFacts = {
    paymentMethod: "card",
    cardBrand: null,
    cardLast4: null,
    paypalEmail: null,
    applicationFeeCents: null,
    transferId: null,
    destinationPaymentId: null,
    chargeId: null,
  }
  const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? (pi.latest_charge as Stripe.Charge) : null
  if (!charge) return facts
  facts.chargeId = charge.id
  if (typeof charge.application_fee_amount === "number") facts.applicationFeeCents = charge.application_fee_amount
  if (charge.transfer) {
    if (typeof charge.transfer === "string") facts.transferId = charge.transfer
    else {
      facts.transferId = charge.transfer.id
      const dest = charge.transfer.destination_payment
      facts.destinationPaymentId = typeof dest === "string" ? dest : dest?.id ?? null
    }
  }
  const d = charge.payment_method_details
  if (d?.card) {
    facts.paymentMethod = "card"
    facts.cardBrand = d.card.brand || null
    facts.cardLast4 = d.card.last4 || null
  } else if (d?.paypal) {
    facts.paymentMethod = "paypal"
    facts.paypalEmail = d.paypal.payer_email || null
  } else if (d?.type) {
    facts.paymentMethod = d.type
  }
  return facts
}

/* `created_at` is the invoice's date and half its number: read back from the row, never the clock's. */
const ORDER_READ = "id, receipt_token, session_fingerprint, amount_cents, created_at"

async function existingOrder(admin: Db, paymentIntentId: string, receiptToken?: string) {
  const { data } = await admin.from("orders").select(ORDER_READ).eq("stripe_payment_intent_id", paymentIntentId).maybeSingle()
  if (data || !receiptToken) return data
  const { data: byToken } = await admin.from("orders").select(ORDER_READ).eq("receipt_token", receiptToken).maybeSingle()
  return byToken
}

export async function fulfilPaymentIntent(
  admin: Db,
  paymentIntentId: string,
  opts: {
    request?: Request
    baseUrl: string
    /**
     * From the browser: the PaymentIntent's client secret, which only the
     * page that paid holds. A PaymentIntent id alone shows up in addresses
     * (the 3-D Secure return puts it there) and must not be enough to be
     * handed the receipt, which is the key to the download.
     */
    clientSecret?: string | null
    /** Where the slow, non-critical follow-ups go (see Defer below). */
    defer?: Defer
  },
): Promise<Fulfilment> {
  if (typeof paymentIntentId !== "string" || !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
    return { ok: false, status: 400, error: "Missing payment." }
  }

  let pi: Stripe.PaymentIntent
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge", "latest_charge.transfer"] })
  } catch (e) {
    /* Stripe unreachable or rate limited is not "no such payment": the
       webhook must answer 5xx so Stripe tries again, or a buyer who closed
       the tab would be charged with no order. */
    const code = (e as { statusCode?: number; type?: string })?.statusCode
    if (code === 404 || (e as { type?: string })?.type === "StripeInvalidRequestError") {
      return { ok: false, status: 400, error: "That payment could not be found." }
    }
    return { ok: false, status: 503, error: "The payment could not be checked just now. It is safe; try again in a moment." }
  }
  if (opts.clientSecret !== undefined && !sameSecret(pi.client_secret, opts.clientSecret)) {
    return { ok: false, status: 404, error: "That payment could not be found." }
  }
  if (pi.status !== "succeeded") return { ok: false, status: 400, error: "The payment has not completed." }
  if (!isCheckoutIntent(pi)) return { ok: false, status: 400, error: "That payment is not a checkout." }

  return fulfilPaidCheckout(
    admin,
    {
      provider: "stripe",
      paymentId: pi.id,
      amountMinor: pi.amount_received || pi.amount || 0,
      /* Stripe always names the currency it charged in; never a guessed one. */
      currency: pi.currency,
      metadata: pi.metadata,
      receiptEmail: pi.receipt_email || null,
      createdSeconds: pi.created,
      facts: paymentFacts(pi),
    },
    opts,
  )
}

/**
 * A payment that succeeded, made into its order. Only the few facts of the
 * payment come in `paid`; everything else is the one path it always was.
 */
export async function fulfilPaidCheckout(admin: Db, paid: PaidCheckout, opts: { request?: Request; baseUrl: string; defer?: Defer }): Promise<Fulfilment> {
  const m = paid.metadata
  const found = await existingOrder(admin, paid.paymentId, m.receipt_token)
  /* An order written over the sales limit whose refund did not go through the first time: tried again, under the same key, so once. */
  if (found && m.product_id && (await owesSoldOutRefund(admin, found.id))) {
    return refundedOverLimit(admin, paid, { orderId: found.id, receiptToken: found.receipt_token, sessionFingerprint: found.session_fingerprint ?? null, productId: m.product_id, creatorId: m.creator_id, total: found.amount_cents ?? paid.amountMinor, feeCents: 0, destinationPaymentId: null, retry: true })
  }
  const productId = m.product_id
  const creatorId = m.creator_id
  const buyerId = m.buyer_id || null
  const buyerEmail = (m.buyer_email || paid.receiptEmail || "").trim()
  const total = paid.amountMinor || 0
  const tipCents = Math.max(0, Number.parseInt(m.tip_cents || "0", 10) || 0)
  const variantId = m.variant_id || null
  const variantName = m.variant_name || null
  const variantPriceCents = m.variant_price_cents ? Number.parseInt(m.variant_price_cents, 10) : null
  const facts = paid.facts
  const recordedFee = Number.parseInt(m.platform_fee_cents || "", 10)
  const feeCents = facts.applicationFeeCents ?? (Number.isFinite(recordedFee) ? recordedFee : 0)
  const device = opts.request ? await deviceFrom(opts.request) : null

  const row = {
    buyer_id: buyerId,
    buyer_first_name: m.buyer_first_name || null,
    buyer_last_name: m.buyer_last_name || null,
    buyer_email: buyerEmail || null,
    product_id: productId,
    amount_cents: total,
    tip_cents: tipCents,
    fee_cents: feeCents,
    application_fee_cents: feeCents,
    plan_used: m.plan_used || null,
    pricing_tier: m.pricing_tier || null,
    fee_rule_version: m.fee_rule_version || null,
    currency: (paid.currency || m.currency || "").toLowerCase() || null,
    transfer_id: facts.transferId,
    provider: paid.provider,
    status: "completed",
    stripe_payment_intent_id: paid.paymentId,
    access_token: buyerId ? null : m.access_token || null,
    session_fingerprint: m.session_fingerprint || null,
    receipt_token: m.receipt_token,
    allowed_fingerprints: m.session_fingerprint ? [m.session_fingerprint] : [],
    buyer_email_attempt_count: 0,
    seller_email_attempt_count: 0,
    payment_method: facts.paymentMethod,
    card_brand: facts.cardBrand,
    card_last4: facts.cardLast4,
    paypal_email: facts.paypalEmail,
    buyer_country: m.buyer_country || device?.geoInfo.country || null,
    buyer_country_code: m.buyer_country_code || device?.geoInfo.countryCode || null,
    buyer_device_type: m.buyer_device_type || device?.deviceInfo.deviceType || null,
    buyer_os: m.buyer_os || device?.deviceInfo.os || null,
    buyer_browser: m.buyer_browser || device?.deviceInfo.browser || null,
    variant_id: variantId,
    variant_name: variantName,
    variant_price_cents: variantPriceCents,
    /* What the buyer was charged in, not a fixed USD. */
    variant_currency: (paid.currency || m.currency || "").toUpperCase() || null,
    variant_snapshot: variantId && variantName ? { id: variantId, name: variantName, price_cents: variantPriceCents } : null,
    agreed_to_terms: m.agreed_to_terms === "true",
    agreed_at: m.agreed_at || new Date(paid.createdSeconds * 1000).toISOString(),
  }

  /*
    FOUND: another caller wrote this order. Its follow-ups are finished here
    when that caller died before doing them (./followups.ts), and never run
    a second time when it did.
  */
  if (found) {
    const resumed = await resumeFollowups(admin, found.id, { log: "fulfil" })
    if (resumed) await followUp(admin, resumed, { paid, opts, order: found, row, productId, creatorId, buyerId, buyerEmail, total, tipCents, variantId, variantName, feeCents })
    return { ok: true, created: false, orderId: found.id, receiptToken: found.receipt_token, sessionFingerprint: found.session_fingerprint ?? null, amountCents: found.amount_cents ?? paid.amountMinor }
  }

  /*
    LIMIT SALES (lib/checkout/sales-limit.ts): the copy this payment held
    when it started is taken again, and kept while the order is written. A
    payment that arrives with no copy left is still written as an order (the
    money was taken) but is refunded below instead of fulfilled. Asked only
    for a product with a limit; anything else answers yes at once.
  */
  const saleHolder = m[SALE_HOLDER_KEY] || `p:${paid.paymentId}`
  const withinLimit = await claimSale(admin, productId, saleHolder)

  const { data: order, error } = await admin.from("orders").insert(row).select(ORDER_READ).single()
  if (error || !order) {
    /* Somebody else made it a moment ago: theirs is the order. */
    const raced = await existingOrder(admin, paid.paymentId, m.receipt_token)
    if (raced) return { ok: true, created: false, orderId: raced.id, receiptToken: raced.receipt_token, sessionFingerprint: raced.session_fingerprint ?? null, amountCents: raced.amount_cents ?? total }
    console.error("[fulfil] order insert failed", paid.paymentId, error?.code, error?.message)
    return { ok: false, status: 500, error: "The order could not be saved. The payment is safe; refresh this page in a moment." }
  }
  /* The order counts the copy now; the place it held goes. */
  await releaseSale(admin, productId, saleHolder)
  if (!withinLimit) await markSoldOut(admin, order.id)
  if (!withinLimit) return refundedOverLimit(admin, paid, { orderId: order.id, receiptToken: order.receipt_token, sessionFingerprint: order.session_fingerprint ?? null, productId, creatorId, total, feeCents, destinationPaymentId: facts.destinationPaymentId })

  /* Everything after the order is recorded, step by step, so a retry finishes what a crash left (./followups.ts). */
  const f = await beginFollowups(admin, order.id, { kind: "payment", ref: paid.paymentId, log: "fulfil" })
  await followUp(admin, f, { paid, opts, order, row, productId, creatorId, buyerId, buyerEmail, total, tipCents, variantId, variantName, feeCents })

  return { ok: true, created: true, orderId: order.id, receiptToken: order.receipt_token, sessionFingerprint: order.session_fingerprint ?? null, amountCents: total }
}

/**
 * Runs a task after the answer has gone (the webhook passes next/server's
 * after()). Absent, everything runs before the answer, as it always did.
 */
export type Defer = (task: () => Promise<void>) => void

interface FollowUpInput {
  paid: PaidCheckout
  opts: { request?: Request; baseUrl: string; defer?: Defer }
  order: { id: string; receipt_token: string; created_at?: string | null }
  row: { currency: string | null; buyer_country: string | null }
  productId: string
  creatorId: string
  buyerId: string | null
  buyerEmail: string
  total: number
  tipCents: number
  variantId: string | null
  variantName: string | null
  feeCents: number
}

/**
 * What a paid order needs after it is written: run by the caller that wrote
 * it, and by a retry for whatever that caller did not finish. Each step is
 * idempotent or claimed once (./followups.ts), so a retry never sends an
 * email twice or counts a sale twice on the ledger.
 */
async function followUp(admin: Db, f: Followups, input: FollowUpInput): Promise<void> {
  const { paid, opts, order, row, productId, creatorId, buyerId, buyerEmail, total, variantId, feeCents } = input
  const m = paid.metadata
  const facts = paid.facts
  const origin = orderOriginFrom(m, opts.request)
  const source = orderSourceFrom(m, opts.request)
  await f.idempotent("source", () => tagOrderSource(admin, order.id, source, origin))
  /* First and last touch and the property, from what stripe-session checked
     and put on the payment; the property follows `source` (lib/attribution).
     Only this caller made the row, and the write is once anyway. */
  const attribution = attributionFromMetadata(m, { source, origin })
  await f.idempotent("attribution", () => recordOrderAttribution(admin, order.id, attribution))
  /* How its price was made: the store's own, or a marketplace dollar price and its rate day (lib/money/order-pricing). */
  await f.idempotent("pricing", () => tagOrderPricing(admin, order.id, m as Record<string, string>))

  /* Everything after the order is recorded is allowed to fail on its own:
     the buyer paid and the order exists, whatever an email server says. */

  /* Settings › Taxes: the tax inside the amount, as stripe-session worked it
     out, on the order for receipts and reports. Its own write, so a
     database without part 110 refuses this and nothing else. */
  const taxCents = Math.max(0, Number.parseInt(m.tax_cents || "0", 10) || 0)
  if (taxCents > 0) {
    await f.idempotent("tax", async () => {
      const { error: taxError } = await admin.from("orders").update({ tax_cents: Math.min(taxCents, total), tax_country: /^[A-Z]{2}$/.test(m.tax_country || "") ? m.tax_country : null }).eq("id", order.id)
      if (taxError) throw new Error(taxError.message)
      /* Part of the price or on top (SQL part 129), for the receipt's Tax row: its own write, so an older database loses only this. */
      if (m.tax_included === "true") {
        const { error: inError } = await admin.from("orders").update({ tax_included: true }).eq("id", order.id)
        if (inError) throw new Error(inError.message)
      }
      /* "VAT 19%", as the checkout named it (SQL part 153): last, so an older database loses only the words. */
      if (m.tax_label) {
        const { error: labelError } = await admin.from("orders").update({ tax_label: String(m.tax_label).slice(0, 80) }).eq("id", order.id)
        if (labelError) throw new Error(labelError.message)
      }
    })
  }

  /* The company the buyer bought for, on the order itself, where the
     creator's copy of the invoice and any later one read it. Its own write
     after the order exists: a database without the column yet (part 35)
     refuses this and nothing else. */
  const business = businessFromMetadata(m)
  if (business) {
    await f.idempotent("business details", async () => {
      const { error: kept } = await admin.from("orders").update({ business_details: business }).eq("id", order.id)
      if (kept) throw new Error(`${kept.code ?? ""} ${kept.message ?? ""}`.trim())
    })
  }

  await f.once("customer", () => recordCustomer(admin, { creatorId, email: buyerEmail, first: m.buyer_first_name, last: m.buyer_last_name, total }))
  /* A contact either way: subscribed when they ticked the box, a customer
     when they did not (lib/contacts/checkout-contact). A tick that puts them
     on the list starts the creator's welcome, once (lib/contacts/checkout-welcome). */
  await f.once("contact", () =>
    recordCheckoutContactAndWelcome(admin, {
      creatorId,
      email: buyerEmail,
      name: `${m.buyer_first_name || ""} ${m.buyer_last_name || ""}`.trim(),
      orderId: order.id,
      basis: m.email_opt_in === "true" ? "ticked" : "none",
      bought: true,
      source: contactSourceOfOrder(origin, productId),
    }),
  )
  await f.idempotent("contact attribution", () => recordContactAttribution(admin, creatorId, buyerEmail, attribution))
  await f.idempotent("entitlement", () => grant(admin, { buyerId, email: buyerEmail, orderId: order.id, creatorId, productId, variantId }))
  await f.once("sales count", async () => {
    await admin.rpc("increment_product_sales", { p_product_id: productId })
    await admin.from("analytics_events").insert({ creator_id: creatorId, product_id: productId, event_type: "purchase" })
  })
  if (m.coupon_id) await f.once("coupon use", () => recordCouponUse(admin, m.coupon_id, m.coupon_holder))
  /* Stripe's balance is mirrored in seller_ledger. */
  await f.idempotent("ledger", () => recordSale(admin, { creatorId, orderId: order.id, total, fee: feeCents, destinationPaymentId: facts.destinationPaymentId, currency: row.currency }))

  /*
    EVERYTHING ABOVE is the order's durable state (the order, its library
    entry, counts, the seller's ledger) and is written before the caller
    answers. EVERYTHING BELOW is slow and not needed for that answer: a
    Stripe read for the processing fee, the receipt PDF and the emails, the
    creator's automations and the notification events. The webhook hands
    them to after() (opts.defer), so Stripe hears back in time and does not
    count a slow answer as a failed delivery (PAY-12). Each step keeps its
    journal row and key (./followups.ts): a redelivery inside IN_FLIGHT_MS
    leaves the run alone, a "once" step is claimed before it runs so an
    email never goes twice, and a step that failed (or a run that died) is
    left unfinished for the ten minute sweep.
  */
  const rest = () => slowFollowUps(admin, f, input)
  if (!opts.defer) return rest()
  opts.defer(async () => {
    try {
      await rest()
    } catch (e) {
      /* Steps record their own failures; this is only a run that broke between them. The order stays unfinished for the sweep. */
      console.error(`[fulfil] follow-ups after the answer broke for order ${order.id}:`, e instanceof Error ? e.message : e)
    }
  })
}

async function slowFollowUps(admin: Db, f: Followups, input: FollowUpInput): Promise<void> {
  const { paid, opts, order, row, productId, creatorId, buyerEmail, total, tipCents, variantName, feeCents } = input
  const m = paid.metadata
  const facts = paid.facts
  const origin = orderOriginFrom(m, opts.request)
  const source = orderSourceFrom(m, opts.request)
  const business = businessFromMetadata(m)
  await f.idempotent("stripe processing fee", async () => {
    if (!facts.chargeId) return
    const { processingFeeFromChargeId, persistOrderStripeEconomics } = await import("@/lib/payments/stripe/reconcile-processing-fee")
    const econ = await processingFeeFromChargeId(facts.chargeId)
    if (econ) await persistOrderStripeEconomics(admin, order.id, econ)
  })

  await f.once("emails", async () => {
    if (!buyerEmail) return
    const { data: product } = await admin.from("products").select("title").eq("id", productId).maybeSingle()
    /* Every paid order's receipt goes with the email as a PDF, an invoice
       with the company on it when the buyer bought for one. It is extra: if
       it cannot be drawn, the email and the seller's still go, and the PDF
       waits on the receipt page. Drawn from the row as it was written, so
       it carries the same number as every later download of it. */
    let attachments: { filename: string; content: Uint8Array; contentType: string }[] | undefined
    try {
      const invoice = await invoiceForOrder(
        admin,
        {
          id: order.id,
          created_at: order.created_at ?? new Date(paid.createdSeconds * 1000).toISOString(),
          status: "completed",
          amount_cents: total,
          tip_cents: tipCents,
          currency: row.currency,
          buyer_email: buyerEmail,
          buyer_first_name: m.buyer_first_name || null,
          buyer_last_name: m.buyer_last_name || null,
          payment_method: facts.paymentMethod,
          card_brand: facts.cardBrand,
          card_last4: facts.cardLast4,
          variant_name: variantName,
          stripe_payment_intent_id: paid.paymentId,
          product: { title: product?.title ?? m.product_title ?? null, creator_id: creatorId },
        },
        { metadata: m, business },
      )
      if (invoice) attachments = [{ filename: invoiceFilename(invoice), content: await renderInvoicePdf(invoice), contentType: "application/pdf" }]
    } catch (e) {
      console.error(`[fulfil] invoice for order ${order.id} could not be drawn:`, e instanceof Error ? e.message : e)
    }
    await sendOrderEmails(admin, {
      orderId: order.id,
      buyerEmail,
      buyerFirstName: m.buyer_first_name || "",
      buyerLastName: m.buyer_last_name || "",
      productTitle: product?.title || m.product_title || "Your purchase",
      receiptToken: order.receipt_token,
      creatorId,
      amountCents: total,
      feeCents,
      baseUrl: opts.baseUrl,
      variantName,
      attachments,
      /* The code, for the seller's order summary: the rows keep only what was charged. */
      sale: { couponCode: m.coupon_code || null, discountCents: Math.max(0, Number.parseInt(m.discount_cents || "0", 10) || 0) },
      /* Where it was bought: the receipt's language and who signs it (lib/emails/buyer-channel.ts). */
      source,
      origin,
    })
  })

  /* The creator's purchase automations. Only the caller that made the order
     gets here, and the engine enters each flow once per order in any case. */
  if (buyerEmail) {
    await f.idempotent("email flows", () =>
      triggerEmailFlows(admin, {
        triggerType: "purchase",
        creatorId,
        recipientEmail: buyerEmail,
        recipientName: m.buyer_first_name || undefined,
        productTitle: m.product_title || undefined,
        productId,
        orderId: order.id,
        source: contactSourceOfOrder(origin),
      }),
    )
  }

  /* The notification engine's order, sale and first sale, under the keys
     the webhook's other paths use too (lib/orders/sale-events.ts). */
  await f.idempotent("notify", () =>
    raiseSaleEvents(admin, {
      creatorId,
      purchase: { orderId: order.id, amountCents: total, lineCount: 1 },
      lines: [{ orderId: order.id, productId, productTitle: m.product_title || null, amountCents: total, feeCents }],
      currency: paid.currency.toLowerCase(),
      buyerEmail: buyerEmail || null,
      buyerCountry: row.buyer_country,
      correlationId: paid.paymentId,
    }),
  )

  /* The seller's push is raiseSaleEvents' own, once per purchase. */

  await f.finish()
}

/**
 * The order for a payment that came in over the product's limit: the seller's
 * ledger gets the sale (so the refund's debit has something to come off), and
 * then the whole payment goes back (./sold-out-refund.ts). No library entry,
 * no download email, no sales count. The buyer's receipt page reads the
 * order as refunded.
 */
async function refundedOverLimit(
  admin: Db,
  paid: PaidCheckout,
  o: { orderId: string; receiptToken: string; sessionFingerprint: string | null; productId: string; creatorId: string; total: number; feeCents: number; destinationPaymentId: string | null; retry?: boolean },
): Promise<Fulfilment> {
  console.warn("[fulfil] over the sales limit, refunding:", paid.paymentId, o.productId)
  /* The sale on the ledger once (its key is the order), on the first pass only. */
  if (!o.retry) {
    try {
      await recordSale(admin, { creatorId: o.creatorId, orderId: o.orderId, total: o.total, fee: o.feeCents, destinationPaymentId: o.destinationPaymentId, currency: paid.currency })
    } catch (e) {
      console.error("[fulfil] ledger for a sold out order:", e instanceof Error ? e.message : e)
    }
  }
  try {
    await refundOverLimit(admin, { orderId: o.orderId, productId: o.productId, creatorId: o.creatorId, amountCents: o.total, provider: paid.provider, paymentId: paid.paymentId })
  } catch (e) {
    /* Stripe could not be reached: the webhook answers 500 and Stripe sends the event again, which finds the order and comes back here. */
    console.error("[fulfil] sold out refund failed for order", o.orderId, e instanceof Error ? e.message : e)
    return { ok: false, status: 503, error: "This product sold out while you were paying. Your payment is being refunded." }
  }
  return { ok: true, created: true, orderId: o.orderId, receiptToken: o.receiptToken, sessionFingerprint: o.sessionFingerprint, amountCents: o.total }
}

export function sameSecret(expected: string | null | undefined, given: string | null | undefined): boolean {
  if (typeof expected !== "string" || typeof given !== "string" || expected.length !== given.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0
}

async function deviceFrom(request: Request) {
  const { collectOrderDeviceInfo } = await import("@/lib/device-info")
  return collectOrderDeviceInfo(request)
}

export async function recordCustomer(admin: Db, c: { creatorId: string; email: string; first?: string; last?: string; total: number }) {
  if (!c.email) return
  const email = c.email.toLowerCase()
  const { data: existing } = await admin
    .from("customers")
    .select("id, order_count, total_spent_cents")
    .eq("creator_id", c.creatorId)
    .eq("email", email)
    .maybeSingle()
  if (existing) {
    /* Added to, not overwritten: this was an upsert of 1 and this order's
       total, which reset a returning customer's history on every purchase. */
    await admin
      .from("customers")
      .update({
        order_count: (existing.order_count || 0) + 1,
        total_spent_cents: (existing.total_spent_cents || 0) + c.total,
        first_name: c.first || undefined,
        last_name: c.last || undefined,
      })
      .eq("id", existing.id)
    return
  }
  await admin.from("customers").insert({
    email,
    creator_id: c.creatorId,
    first_name: c.first || null,
    last_name: c.last || null,
    order_count: 1,
    total_spent_cents: c.total,
  })
}

/**
 * The product in the buyer's library: by their account when signed in, or
 * by an account with the address they paid with.
 */
async function grant(
  admin: Db,
  g: { buyerId: string | null; email: string; orderId: string; creatorId: string; productId: string; variantId: string | null },
) {
  let buyerId = g.buyerId
  if (!buyerId && g.email) {
    /* Only an account whose address is CONFIRMED: one made with somebody else's email and never verified collects nothing (lib/orders/attach-guest-orders.ts). The rest join when it is verified, at /auth/continue. */
    const account = await verifiedAccountForEmail(admin, g.email)
    if (account) {
      buyerId = account
      await admin.from("orders").update({ buyer_id: buyerId }).eq("id", g.orderId).is("buyer_id", null)
    }
  }
  if (!buyerId) return
  /* Throws when the entry could not be read or written, so the follow-up is recorded failed and the sweep runs it again (lib/checkout/entitlement-grant). */
  await ensureEntitlement(admin, { buyerId, creatorId: g.creatorId, productId: g.productId, variantId: g.variantId })
  /* A product that opens a community (a tier sold once, or a course that grants one) lets the buyer in. Never throws. */
  try {
    await communityAccessAfterEntitlement(admin, { userId: buyerId, productId: g.productId, orderId: g.orderId, granted: true })
  } catch (e) {
    console.error("[fulfil] community access:", e instanceof Error ? e.message : e)
  }
}

/**
 * The seller's balance. Only the webhook's old Checkout Session path wrote
 * it, so every sale through this checkout was missing from the ledger and a
 * later refund of one took its full amount off a balance it had never
 * added to.
 */
export async function recordSale(
  admin: Db,
  s: {
    creatorId: string
    orderId: string
    /** In the currency the buyer was charged in. */
    total: number
    fee: number
    destinationPaymentId: string | null
    /** That currency: a store's own (lib/store/selling-currency), turned into the wallet's here (lib/payments/ledger-currency). Absent, the wallet's. */
    currency?: string | null
  },
) {
  if (s.total <= 0) return
  const wallet = await toLedger([s.total, s.fee], s.currency)
  const [total, fee] = wallet.amounts
  const net = total - fee

  /* Held until Stripe says the money is available on the seller's side. */
  let holdUntil: Date | null = null
  if (s.destinationPaymentId) {
    try {
      const { data: seller } = await admin.from("creators").select("stripe_account_id").eq("id", s.creatorId).maybeSingle()
      if (seller?.stripe_account_id) {
        /* Bounded (PAY-12): a slow Stripe must not hold the webhook's answer; the three day estimate below covers a read that did not come. */
        const charge = await stripe.charges.retrieve(s.destinationPaymentId, { expand: ["balance_transaction"] }, { stripeAccount: seller.stripe_account_id, timeout: 5_000, maxNetworkRetries: 1 })
        const bt = charge.balance_transaction as Stripe.BalanceTransaction | null
        if (bt?.available_on) holdUntil = new Date(bt.available_on * 1000)
      }
    } catch {
      /* estimated below */
    }
  }
  if (!holdUntil) {
    holdUntil = new Date()
    holdUntil.setDate(holdUntil.getDate() + 3)
  }

  const saleText = `Sale: ${ledgerAmountText(total, wallet, { amount: s.total, currency: s.currency })} (net ${ledgerAmountText(net, { ...wallet, converted: false }, { amount: net, currency: wallet.currency })})`

  /* Once per order, in one locked step in the database (lib/payments/ledger): the
     webhook's Checkout Session path writes the same key, so a sale is never counted twice. */
  const posted = await postLedger(admin, {
    creatorId: s.creatorId,
    key: `sale:${s.orderId}`,
    op: "sale",
    amountCents: net,
    event: {
      event_type: "sale",
      amount_cents: total,
      net_seller_cents: net,
      fee_cents: fee,
      currency: wallet.currency,
      order_id: s.orderId,
      hold_until: holdUntil.toISOString(),
      description: saleText,
      add_lifetime_earnings: total,
      add_lifetime_fees: fee,
    },
  })
  if (!posted.unavailable) return

  /* Before run-now part 64: as it was. */
  await admin.from("seller_ledger").upsert({ creator_id: s.creatorId }, { onConflict: "creator_id" })
  const { data: ledger } = await admin.from("seller_ledger").select("*").eq("creator_id", s.creatorId).single()
  if (!ledger) return

  let pending = net
  let negative = ledger.negative_balance || 0
  if (negative > 0) {
    const absorbed = Math.min(pending, negative)
    pending -= absorbed
    negative -= absorbed
  }
  await admin
    .from("seller_ledger")
    .update({
      pending_amount: (ledger.pending_amount || 0) + pending,
      lifetime_earnings: (ledger.lifetime_earnings || 0) + total,
      lifetime_fees: (ledger.lifetime_fees || 0) + fee,
      negative_balance: negative,
    })
    .eq("creator_id", s.creatorId)
  await admin.from("ledger_events").insert({
    creator_id: s.creatorId,
    event_type: "sale",
    amount_cents: total,
    net_seller_cents: net,
    fee_cents: fee,
    currency: wallet.currency,
    pending_delta: pending,
    order_id: s.orderId,
    hold_until: holdUntil.toISOString(),
    description: saleText,
  })
}
