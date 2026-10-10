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
import { postLedger } from "@/lib/payments/ledger"
import { markFeeRecord, paidAirwallexCheckout, type PaidCheckout } from "@/lib/payments/checkout"
import { communityAccessAfterEntitlement } from "@/lib/communities/server/payment-hooks"

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

async function existingOrder(admin: Db, provider: PaidCheckout["provider"], paymentIntentId: string, receiptToken?: string) {
  /* Stripe's orders carry the PaymentIntent in their own column; Airwallex's in provider_payment_id (part 76). */
  const column = provider === "stripe" ? "stripe_payment_intent_id" : "provider_payment_id"
  const { data } = await admin.from("orders").select(ORDER_READ).eq(column, paymentIntentId).maybeSingle()
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
      currency: pi.currency || "usd",
      metadata: pi.metadata,
      receiptEmail: pi.receipt_email || null,
      createdSeconds: pi.created,
      facts: paymentFacts(pi),
    },
    opts,
  )
}

/**
 * The same, for a checkout paid on Airwallex (lib/payments/checkout). Called
 * by the buyer's return from Airwallex's payment page and by the
 * payment_intent.succeeded webhook, whichever comes first, exactly as the
 * Stripe path is: the order is made once.
 */
export async function fulfilAirwallexIntent(
  admin: Db,
  intentId: string,
  opts: { request?: Request; baseUrl: string; clientSecret?: string | null },
): Promise<Fulfilment> {
  const loaded = await paidAirwallexCheckout(intentId)
  if (loaded.ok === false) return loaded
  if (opts.clientSecret !== undefined && !sameSecret(loaded.clientSecret, opts.clientSecret)) {
    return { ok: false, status: 404, error: "That payment could not be found." }
  }
  if (!isCheckoutMetadata(loaded.paid.metadata)) return { ok: false, status: 400, error: "That payment is not a checkout." }
  return fulfilPaidCheckout(admin, loaded.paid, opts)
}

/**
 * A payment that succeeded, from either provider, made into its order. Only
 * the few facts that differ come in `paid`; everything else is the one path
 * it always was.
 */
export async function fulfilPaidCheckout(admin: Db, paid: PaidCheckout, opts: { request?: Request; baseUrl: string }): Promise<Fulfilment> {
  const m = paid.metadata
  const found = await existingOrder(admin, paid.provider, paid.paymentId, m.receipt_token)
  if (found) {
    return { ok: true, created: false, orderId: found.id, receiptToken: found.receipt_token, sessionFingerprint: found.session_fingerprint ?? null, amountCents: found.amount_cents ?? paid.amountMinor }
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
    currency: (paid.currency || m.currency || "usd").toLowerCase(),
    transfer_id: facts.transferId,
    provider: paid.provider,
    status: "completed",
    /* Stripe's column for Stripe; Airwallex's payment in its own (part 76), and only then, so a Stripe insert is the one it always was. */
    stripe_payment_intent_id: paid.provider === "stripe" ? paid.paymentId : null,
    ...(paid.provider === "stripe" ? {} : { provider_payment_id: paid.paymentId }),
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
    variant_currency: "USD",
    variant_snapshot: variantId && variantName ? { id: variantId, name: variantName, price_cents: variantPriceCents } : null,
    agreed_to_terms: m.agreed_to_terms === "true",
    agreed_at: m.agreed_at || new Date(paid.createdSeconds * 1000).toISOString(),
  }

  const { data: order, error } = await admin.from("orders").insert(row).select(ORDER_READ).single()
  if (error || !order) {
    /* Somebody else made it a moment ago: theirs is the order. */
    const raced = await existingOrder(admin, paid.provider, paid.paymentId, m.receipt_token)
    if (raced) return { ok: true, created: false, orderId: raced.id, receiptToken: raced.receipt_token, sessionFingerprint: raced.session_fingerprint ?? null, amountCents: raced.amount_cents ?? total }
    console.error("[fulfil] order insert failed", paid.paymentId, error?.code, error?.message)
    return { ok: false, status: 500, error: "The order could not be saved. The payment is safe; refresh this page in a moment." }
  }

  const origin = orderOriginFrom(m, opts.request)
  const source = orderSourceFrom(m, opts.request)
  await tagOrderSource(admin, order.id, source, origin)
  /* First and last touch and the property, from what stripe-session checked
     and put on the payment; the property follows `source` (lib/attribution).
     Only this caller made the row, and the write is once anyway. */
  const attribution = attributionFromMetadata(m, { source, origin })
  await recordOrderAttribution(admin, order.id, attribution)

  /* Everything after the order is recorded is allowed to fail on its own:
     the buyer paid and the order exists, whatever an email server says. */
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      console.error(`[fulfil] ${name} failed for order ${order.id}:`, e instanceof Error ? e.message : e)
    }
  }

  /* Settings › Taxes: the tax inside the amount, as stripe-session worked it
     out, on the order for receipts and reports. Its own write, so a
     database without part 110 refuses this and nothing else. */
  const taxCents = Math.max(0, Number.parseInt(m.tax_cents || "0", 10) || 0)
  if (taxCents > 0) {
    await step("tax", async () => {
      const { error: taxError } = await admin.from("orders").update({ tax_cents: Math.min(taxCents, total), tax_country: /^[A-Z]{2}$/.test(m.tax_country || "") ? m.tax_country : null }).eq("id", order.id)
      if (taxError) throw new Error(taxError.message)
    })
  }

  /* The company the buyer bought for, on the order itself, where the
     creator's copy of the invoice and any later one read it. Its own write
     after the order exists: a database without the column yet (part 35)
     refuses this and nothing else. */
  const business = businessFromMetadata(m)
  if (business) {
    await step("business details", async () => {
      const { error: kept } = await admin.from("orders").update({ business_details: business }).eq("id", order.id)
      if (kept) throw new Error(`${kept.code ?? ""} ${kept.message ?? ""}`.trim())
    })
  }

  await step("customer", () => recordCustomer(admin, { creatorId, email: buyerEmail, first: m.buyer_first_name, last: m.buyer_last_name, total }))
  /* A contact either way: subscribed when they ticked the box, a customer
     when they did not (lib/contacts/checkout-contact). A tick that puts them
     on the list starts the creator's welcome, once (lib/contacts/checkout-welcome). */
  await step("contact", () =>
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
  await recordContactAttribution(admin, creatorId, buyerEmail, attribution)
  await step("entitlement", () => grant(admin, { buyerId, email: buyerEmail, orderId: order.id, creatorId, productId, variantId }))
  await step("sales count", async () => {
    await admin.rpc("increment_product_sales", { p_product_id: productId })
    await admin.from("analytics_events").insert({ creator_id: creatorId, product_id: productId, event_type: "purchase" })
  })
  if (m.coupon_id) await step("coupon use", () => recordCouponUse(admin, m.coupon_id, m.coupon_holder))
  /* Stripe's balance is mirrored in seller_ledger; an Airwallex creator's balance is Airwallex's own
     (their wallet), so nothing is mirrored for them: the payment's fee record says it succeeded. */
  if (paid.provider === "stripe") {
    await step("ledger", () => recordSale(admin, { creatorId, orderId: order.id, total, fee: feeCents, destinationPaymentId: facts.destinationPaymentId }))
    await step("stripe processing fee", async () => {
      if (!facts.chargeId) return
      const { processingFeeFromChargeId, persistOrderStripeEconomics } = await import("@/lib/payments/stripe/reconcile-processing-fee")
      const econ = await processingFeeFromChargeId(facts.chargeId)
      if (econ) await persistOrderStripeEconomics(admin, order.id, econ)
    })
  } else {
    await step("fee record", () => markFeeRecord(paid.paymentId, { status: "succeeded" }))
  }

  await step("emails", async () => {
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
          currency: "usd",
          buyer_email: buyerEmail,
          buyer_first_name: m.buyer_first_name || null,
          buyer_last_name: m.buyer_last_name || null,
          payment_method: facts.paymentMethod,
          card_brand: facts.cardBrand,
          card_last4: facts.cardLast4,
          variant_name: variantName,
          stripe_payment_intent_id: paid.provider === "stripe" ? paid.paymentId : null,
          provider_payment_id: paid.provider === "stripe" ? null : paid.paymentId,
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
    })
  })

  /* The creator's purchase automations. Only the caller that made the order
     gets here, and the engine enters each flow once per order in any case. */
  if (buyerEmail) {
    await step("email flows", () =>
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
  await step("notify", () =>
    raiseSaleEvents(admin, {
      creatorId,
      purchase: { orderId: order.id, amountCents: total, lineCount: 1 },
      lines: [{ orderId: order.id, productId, productTitle: m.product_title || null, amountCents: total, feeCents }],
      currency: paid.currency.toLowerCase() || "usd",
      buyerEmail: buyerEmail || null,
      buyerCountry: row.buyer_country,
      correlationId: paid.paymentId,
    }),
  )

  await step("push", async () => {
    const { data: creator } = await admin.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
    if (!creator?.user_id) return
    const { notifySale } = await import("@/lib/push/notifications")
    await notifySale(creator.user_id, { productName: m.product_title || "A product", amountCents: total, orderId: order.id, productId })
  })

  return { ok: true, created: true, orderId: order.id, receiptToken: order.receipt_token, sessionFingerprint: order.session_fingerprint ?? null, amountCents: total }
}

function sameSecret(expected: string | null | undefined, given: string | null | undefined): boolean {
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
    const { data: profile } = await admin.from("profiles").select("id").eq("email", g.email.toLowerCase()).maybeSingle()
    if (profile) {
      buyerId = profile.id
      await admin.from("orders").update({ buyer_id: buyerId }).eq("id", g.orderId)
    }
  }
  if (!buyerId) return
  let q = admin.from("entitlements").select("id").eq("buyer_id", buyerId).eq("product_id", g.productId)
  q = g.variantId ? q.eq("variant_id", g.variantId) : q.is("variant_id", null)
  const { data: owned } = await q.maybeSingle()
  if (!owned) {
    await admin.from("entitlements").insert({
      buyer_id: buyerId,
      creator_id: g.creatorId,
      product_id: g.productId,
      variant_id: g.variantId,
      community_access: false,
    })
  }
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
  s: { creatorId: string; orderId: string; total: number; fee: number; destinationPaymentId: string | null },
) {
  if (s.total <= 0) return
  const net = s.total - s.fee

  /* Held until Stripe says the money is available on the seller's side. */
  let holdUntil: Date | null = null
  if (s.destinationPaymentId) {
    try {
      const { data: seller } = await admin.from("creators").select("stripe_account_id").eq("id", s.creatorId).maybeSingle()
      if (seller?.stripe_account_id) {
        const charge = await stripe.charges.retrieve(s.destinationPaymentId, { expand: ["balance_transaction"] }, { stripeAccount: seller.stripe_account_id })
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

  /* Once per order, in one locked step in the database (lib/payments/ledger): the
     webhook's Checkout Session path writes the same key, so a sale is never counted twice. */
  const posted = await postLedger(admin, {
    creatorId: s.creatorId,
    key: `sale:${s.orderId}`,
    op: "sale",
    amountCents: net,
    event: {
      event_type: "sale",
      amount_cents: s.total,
      net_seller_cents: net,
      fee_cents: s.fee,
      currency: "usd",
      order_id: s.orderId,
      hold_until: holdUntil.toISOString(),
      description: `Sale: $${(s.total / 100).toFixed(2)} (net $${(net / 100).toFixed(2)})`,
      add_lifetime_earnings: s.total,
      add_lifetime_fees: s.fee,
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
      lifetime_earnings: (ledger.lifetime_earnings || 0) + s.total,
      lifetime_fees: (ledger.lifetime_fees || 0) + s.fee,
      negative_balance: negative,
    })
    .eq("creator_id", s.creatorId)
  await admin.from("ledger_events").insert({
    creator_id: s.creatorId,
    event_type: "sale",
    amount_cents: s.total,
    net_seller_cents: net,
    fee_cents: s.fee,
    currency: "usd",
    pending_delta: pending,
    order_id: s.orderId,
    hold_until: holdUntil.toISOString(),
    description: `Sale: $${(s.total / 100).toFixed(2)} (net $${(net / 100).toFixed(2)})`,
  })
}
