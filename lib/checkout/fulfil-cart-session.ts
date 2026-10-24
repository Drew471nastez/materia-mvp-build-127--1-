import "server-only"

/**
 * ===========================================================================
 *  A PAID BASKET BECOMES PURCHASES, EXACTLY ONCE, EVEN IF THE TAB CLOSES
 * ===========================================================================
 * A basket is paid on Stripe's own Checkout page, and two things report that
 * it was:
 *
 *   the buyer's browser   /api/checkout/cart/complete, Checkout's success_url;
 *   Stripe itself         the checkout.session.completed webhook.
 *
 * Only the browser used to write the orders, so a buyer who paid and closed
 * the tab before the redirect had been charged and had nothing. Both call
 * this now, and whichever comes first writes the basket.
 *
 * ONCE, UNDER A RACE. Each line's receipt token is an HMAC of the session id
 * and the line's place in the basket, and the orders table holds receipt
 * tokens UNIQUE (and, from run-now part 190, each (stripe_session_id,
 * receipt_token) pair once: orders_stripe_session_line_key). Two callers writing at once therefore write each line once:
 * the second insert of a line fails with 23505 and counts as "exists". The
 * session fingerprint is derived the same way, so whichever caller wrote an
 * order, the browser's cookie matches it.
 *
 * WHAT HAPPENS ONCE PER BASKET (the buyer's email, the customer, the seller's
 * ledger, the sale notification) is done by the caller that wrote the FIRST
 * line. What happens once per line (the entitlement, the sales count, the
 * seller's email for that product) is done by the caller that wrote that line.
 *
 * A RETRY FILLS GAPS. Lines that exist are skipped and the missing ones are
 * written, so the webhook answering 500 on a failed line and Stripe retrying
 * it completes a basket rather than duplicating one.
 */

import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { sendBuyerDownloadEmail, sendSellerNotificationEmail, resolveSellerEmail, triggerEmailFlows } from "@/lib/email"
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { randomBytes } from "node:crypto"
import { unpackItems, packedTotalCents, apportionFee, lineTotalCents, type PackedItem } from "./cart-items"
import { fulfilCartLine, recordCartCustomer, type FulfilContext, type FulfilledLine } from "./fulfil-cart-item"
import { isMissingColumn, recordCouponUse } from "./coupons"
import { ORIGIN_METADATA_KEY, decodeOrigin, orderOriginFrom } from "@/lib/orders/order-source"
import { attributionFromMetadata } from "@/lib/attribution/server"
import { paymentFacts, recordSale, sameSecret } from "./fulfil-payment"
import { cartFingerprint, cartReceiptToken } from "./cart-tokens"
import { businessFromMetadata, businessFromStripe, type BusinessDetails } from "./business"
import { invoiceFilename, invoiceForOrder, renderInvoicePdf, type OrderRow } from "./invoice"
import { raiseSaleEvents } from "@/lib/orders/sale-events"
import { SALE_HOLDER_KEY } from "./sales-limit"
import { SOLD_OUT_REASON, refundOverLimit } from "./sold-out-refund"
import { verifiedAccountForEmail } from "@/lib/orders/attach-guest-orders"
import { noteFromMetadata } from "./site-checkout"

type Db = FulfilContext["admin"]

export type CartFulfilment =
  | { ok: true; created: boolean; receiptToken: string; sessionFingerprint: string; complete: boolean; creatorId: string }
  | { ok: false; status: number; reason: "not_found" | "unpaid" | "unreadable" | "failed" }

export function isCartSession(session: Pick<Stripe.Checkout.Session, "metadata" | "mode">): boolean {
  return session.mode === "payment" && session.metadata?.cart === "1"
}

export async function fulfilCartSession(
  admin: Db,
  sessionId: string,
  opts: { baseUrl: string; request?: Request; viewerId?: string | null },
): Promise<CartFulfilment> {
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { ok: false, status: 400, reason: "not_found" }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent", "payment_intent.latest_charge", "payment_intent.latest_charge.transfer"],
    })
  } catch {
    return { ok: false, status: 404, reason: "not_found" }
  }
  if (!isCartSession(session)) return { ok: false, status: 400, reason: "unreadable" }
  if (session.payment_status !== "paid") return { ok: false, status: 409, reason: "unpaid" }

  const metadata = (session.metadata ?? {}) as Record<string, string>
  const items = unpackItems(metadata)
  const creatorId = metadata.creator_id || ""
  if (items.length === 0 || !creatorId) {
    console.error("[cart] paid session with no readable basket:", sessionId)
    return { ok: false, status: 422, reason: "unreadable" }
  }

  const pi = session.payment_intent && typeof session.payment_intent === "object" ? (session.payment_intent as Stripe.PaymentIntent) : null
  const paymentIntentId = pi?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : null)
  const facts = pi ? paymentFacts(pi) : null
  const recordedFee = Number.parseInt(metadata.platform_fee_cents || "0", 10) || 0
  const feeTotal = pi?.application_fee_amount ?? facts?.applicationFeeCents ?? recordedFee
  const paidTotal = session.amount_total ?? packedTotalCents(items)

  const buyerEmail = (metadata.buyer_email || session.customer_details?.email || "").toLowerCase().trim() || null
  let buyerId = metadata.buyer_id || opts.viewerId || null
  if (!buyerId && buyerEmail) {
    /* A confirmed address only (lib/orders/attach-guest-orders.ts verifiedAccountForEmail). */
    const account = await verifiedAccountForEmail(admin, buyerEmail)
    if (account) buyerId = account
  }
  const name = (session.customer_details?.name ?? "").trim()
  const firstName = name ? name.split(/\s+/)[0] : null
  const lastName = name && name.includes(" ") ? name.slice(name.indexOf(" ") + 1) : null

  const sessionFingerprint = cartFingerprint(sessionId)
  let device: FulfilContext["device"] = { country: null, countryCode: null, deviceType: null, os: null, browser: null }
  if (opts.request) {
    const { collectOrderDeviceInfo } = await import("@/lib/device-info")
    const { deviceInfo, geoInfo } = collectOrderDeviceInfo(opts.request)
    device = {
      country: geoInfo.country || null,
      countryCode: geoInfo.countryCode || null,
      deviceType: deviceInfo.deviceType || null,
      os: deviceInfo.os || null,
      browser: deviceInfo.browser || null,
    }
  }

  const ctx: FulfilContext = {
    admin,
    sessionId,
    paymentIntentId,
    currency: session.currency || pi?.currency || null,
    creatorId,
    buyerId,
    buyerEmail,
    buyerFirstName: firstName,
    buyerLastName: lastName,
    receiptTokenFor: (index) => cartReceiptToken(sessionId, index),
    sessionFingerprint,
    paymentMethod: facts?.paymentMethod ?? "card",
    cardBrand: facts?.cardBrand ?? null,
    cardLast4: facts?.cardLast4 ?? null,
    device,
    origin: orderOriginFrom(metadata),
    /* What the cart route checked and put on the session (lib/attribution). */
    attribution: attributionFromMetadata(metadata, { source: "website", origin: orderOriginFrom(metadata) }),
    feeAudit: {
      planUsed: metadata.plan_used || null,
      pricingTier: metadata.pricing_tier || null,
      feeRuleVersion: metadata.fee_rule_version || null,
    },
    /* Settings › Taxes, as the cart route charged it (each line's share is on the line, `cart_tax`). */
    tax: metadata.tax_cents ? { included: metadata.tax_included === "true", country: /^[A-Z]{2}$/.test(metadata.tax_country || "") ? metadata.tax_country : null, label: metadata.tax_label || null } : null,
    saleHolder: metadata[SALE_HOLDER_KEY] || null,
  }

  const written = await writeBasket(admin, ctx, items, {
    paidTotal,
    feeTotal,
    destinationPaymentId: facts?.destinationPaymentId ?? null,
    baseUrl: opts.baseUrl,
    couponId: metadata.coupon_id || null,
    couponHolder: metadata.coupon_holder || null,
    couponCode: metadata.coupon_code || null,
    /* The company, when the buyer ticked Stripe's "purchasing as a business". */
    business: businessFromStripe(session.customer_details),
  })
  if (!written.receiptToken) return { ok: false, status: 500, reason: "failed" }
  return { ok: true, created: written.created, receiptToken: written.receiptToken, sessionFingerprint, complete: written.complete, creatorId }
}

/**
 * ===========================================================================
 *  A BASKET PAID ON THE WEBSITE'S OWN CHECKOUT
 * ===========================================================================
 * The checkout a website serves at its own address (app/checkout/site) takes
 * the card in Storelib's own form (Stripe's Payment Element), so a basket is
 * a PaymentIntent there, not a Checkout Session. Its metadata carries the
 * same packed lines, code and fee as a session's (app/api/checkout/site), and
 * it is written by the same writeBasket, with the PaymentIntent's id as what
 * groups its lines: the buyer's browser (with the client secret only that
 * page holds) and the payment_intent.succeeded webhook, whichever comes
 * first, each line once.
 */
export function isCartIntent(pi: Pick<Stripe.PaymentIntent, "metadata">): boolean {
  return pi.metadata?.cart === "1" && pi.metadata?.site_basket === "1"
}

export async function fulfilCartPayment(
  admin: Db,
  paymentIntentId: string,
  opts: { baseUrl: string; request?: Request; clientSecret?: string | null },
): Promise<CartFulfilment> {
  if (typeof paymentIntentId !== "string" || !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return { ok: false, status: 400, reason: "not_found" }
  let pi: Stripe.PaymentIntent
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge", "latest_charge.transfer"] })
  } catch (e) {
    const code = (e as { statusCode?: number; type?: string })?.statusCode
    if (code === 404 || (e as { type?: string })?.type === "StripeInvalidRequestError") return { ok: false, status: 404, reason: "not_found" }
    return { ok: false, status: 503, reason: "failed" }
  }
  /* From a browser: the secret only the page that paid holds (an id alone travels in addresses). */
  if (opts.clientSecret !== undefined && !sameSecret(pi.client_secret, opts.clientSecret)) return { ok: false, status: 404, reason: "not_found" }
  if (!isCartIntent(pi)) return { ok: false, status: 400, reason: "unreadable" }
  if (pi.status !== "succeeded") return { ok: false, status: 409, reason: "unpaid" }

  const metadata = (pi.metadata ?? {}) as Record<string, string>
  const items = unpackItems(metadata)
  const creatorId = metadata.creator_id || ""
  if (items.length === 0 || !creatorId) {
    console.error("[cart] paid basket with no readable lines:", paymentIntentId)
    return { ok: false, status: 422, reason: "unreadable" }
  }
  const facts = paymentFacts(pi)
  const recordedFee = Number.parseInt(metadata.platform_fee_cents || "0", 10) || 0
  const feeTotal = pi.application_fee_amount ?? facts?.applicationFeeCents ?? recordedFee
  const paidTotal = pi.amount_received || pi.amount || packedTotalCents(items)

  const buyerEmail = (metadata.buyer_email || "").toLowerCase().trim() || null
  let buyerId = metadata.buyer_id || null
  if (!buyerId && buyerEmail) {
    /* A confirmed address only (lib/orders/attach-guest-orders.ts verifiedAccountForEmail). */
    const account = await verifiedAccountForEmail(admin, buyerEmail)
    if (account) buyerId = account
  }
  const sessionId = pi.id
  const sessionFingerprint = cartFingerprint(sessionId)
  let device: FulfilContext["device"] = {
    country: metadata.buyer_country || null,
    countryCode: metadata.buyer_country_code || null,
    deviceType: metadata.buyer_device_type || null,
    os: metadata.buyer_os || null,
    browser: metadata.buyer_browser || null,
  }
  if (opts.request && !device.country) {
    const { collectOrderDeviceInfo } = await import("@/lib/device-info")
    const { deviceInfo, geoInfo } = collectOrderDeviceInfo(opts.request)
    device = { country: geoInfo.country || null, countryCode: geoInfo.countryCode || null, deviceType: deviceInfo.deviceType || null, os: deviceInfo.os || null, browser: deviceInfo.browser || null }
  }
  const ctx: FulfilContext = {
    admin,
    sessionId,
    paymentIntentId: pi.id,
    currency: pi.currency || null,
    creatorId,
    buyerId,
    buyerEmail,
    buyerFirstName: metadata.buyer_first_name || null,
    buyerLastName: metadata.buyer_last_name || null,
    receiptTokenFor: (index) => cartReceiptToken(sessionId, index),
    sessionFingerprint,
    paymentMethod: facts?.paymentMethod ?? "card",
    cardBrand: facts?.cardBrand ?? null,
    cardLast4: facts?.cardLast4 ?? null,
    device,
    origin: orderOriginFrom(metadata),
    attribution: attributionFromMetadata(metadata, { source: "website", origin: orderOriginFrom(metadata) }),
    feeAudit: { planUsed: metadata.plan_used || null, pricingTier: metadata.pricing_tier || null, feeRuleVersion: metadata.fee_rule_version || null },
    /* Settings › Taxes, as the website's checkout charged it (each line's share is on the line, `cart_tax`). */
    tax: metadata.tax_cents ? { included: metadata.tax_included === "true", country: /^[A-Z]{2}$/.test(metadata.tax_country || "") ? metadata.tax_country : null, label: metadata.tax_label || null } : null,
    saleHolder: metadata[SALE_HOLDER_KEY] || null,
  }
  const written = await writeBasket(admin, ctx, items, {
    paidTotal,
    feeTotal,
    destinationPaymentId: facts?.destinationPaymentId ?? null,
    baseUrl: opts.baseUrl,
    couponId: metadata.coupon_id || null,
    couponHolder: metadata.coupon_holder || null,
    couponCode: metadata.coupon_code || null,
    business: businessFromMetadata(metadata),
    /* The buyer's note, as the website's checkout put it on the payment (lib/checkout/site-checkout noteToMetadata). */
    buyerNote: noteFromMetadata(metadata),
    /* Only when the store showed the box and the buyer ticked it: the route writes "true" for nothing else. */
    consent: metadata.email_opt_in === "true" ? "ticked" : "none",
    /* The website's own address (app/api/checkout/site wrote the request's host, a website of this shop), so the emailed receipt opens there. */
    buyerBaseUrl: /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(metadata.site_origin || "") ? metadata.site_origin : null,
    /* The language the checkout was in (the order's origin, lib/orders/order-source.ts): the receipt email is written in it. */
    buyerLang: decodeOrigin(metadata[ORIGIN_METADATA_KEY])?.lang ?? null,
  })
  if (!written.receiptToken) return { ok: false, status: 500, reason: "failed" }
  return { ok: true, created: written.created, receiptToken: written.receiptToken, sessionFingerprint, complete: written.complete, creatorId }
}

/**
 * The lines of a paid (or code-free) basket, each written once, and what
 * happens once per basket done by whoever wrote its first line.
 */
async function writeBasket(
  admin: Db,
  ctx: FulfilContext,
  items: PackedItem[],
  s: {
    paidTotal: number
    feeTotal: number
    destinationPaymentId: string | null
    baseUrl: string
    couponId: string | null
    couponHolder: string | null
    couponCode?: string | null
    business?: BusinessDetails | null
    /** What the buyer wrote for the shop (the website's checkout): kept on every line of the order. */
    buyerNote?: string | null
    /** "ticked": the buyer ticked the news box on a checkout that has one (app/checkout/site). Stripe's own page has none. */
    consent?: "ticked" | "none"
    /** Where the buyer's receipt link points: the website the checkout was on, when it was one. The seller's links stay on Storelib. */
    buyerBaseUrl?: string | null
    /** The language the checkout was in, for the buyer's receipt email. */
    buyerLang?: string | null
  },
): Promise<{ created: boolean; receiptToken: string | null; complete: boolean }> {
  /* The fee, apportioned once for the whole basket over what each line was
     charged, so the parts provably sum to what Stripe took, whichever caller
     writes which line. */
  const fees = apportionFee(s.feeTotal, items.map(lineTotalCents))

  const created: (FulfilledLine & { index: number })[] = []
  let failed = 0
  for (let i = 0; i < items.length; i++) {
    const outcome = await fulfilCartLine(ctx, items[i], i, fees[i] ?? 0)
    if (outcome.status === "created") created.push({ ...outcome.line, index: i })
    else if (outcome.status === "failed") failed++
  }

  /* The receipt the buyer lands on: the basket's first line, whoever wrote it. */
  const firstToken = ctx.receiptTokenFor(0)
  const { data: firstOrder } = await admin.from("orders").select("id, receipt_token").eq("receipt_token", firstToken).maybeSingle()
  const receiptToken = firstOrder?.receipt_token ?? created[0]?.receiptToken ?? null
  if (!receiptToken) return { created: false, receiptToken: null, complete: false }

  const ownsBasket = created.some((l) => l.index === 0)
  if (created.length > 0) {
    await sideEffects(admin, {
      ctx,
      created,
      ownsBasket,
      paidTotal: s.paidTotal,
      feeTotal: s.feeTotal,
      destinationPaymentId: s.destinationPaymentId,
      baseUrl: s.baseUrl,
      firstOrderId: firstOrder?.id ?? created[0].orderId,
      receiptToken,
      couponId: s.couponId,
      couponHolder: s.couponHolder,
      couponCode: s.couponCode ?? null,
      business: s.business ?? null,
      buyerNote: s.buyerNote ?? null,
      consent: s.consent ?? "none",
      buyerBaseUrl: s.buyerBaseUrl ?? null,
      buyerLang: s.buyerLang ?? null,
      items,
    })
  }

  /*
    LIMIT SALES: a line paid for after its product's last copy had gone was
    written (the money is on the payment) but not fulfilled, and is refunded
    here, after the basket's sale is on the seller's ledger so the refund
    comes off it (lib/checkout/sold-out-refund). A line written over the
    limit by an earlier call whose refund did not go through is found by its
    reason and tried again, under the same key, so once.
  */
  const owed = await soldOutOwed(admin, items.map((_, i) => ctx.receiptTokenFor(i)), created)
  for (const line of owed) {
    try {
      await refundOverLimit(admin, { orderId: line.orderId, productId: line.productId, creatorId: ctx.creatorId, amountCents: line.amountCents, provider: ctx.provider ?? "stripe", paymentId: ctx.paymentIntentId })
    } catch (e) {
      console.error("[cart] sold out refund failed for order", line.orderId, e instanceof Error ? e.message : e)
      failed++
    }
  }
  return { created: created.length > 0, receiptToken, complete: failed === 0 }
}

/** The lines over the limit this call wrote, and any an earlier call wrote whose refund is still owed. */
async function soldOutOwed(admin: Db, tokens: string[], created: FulfilledLine[]): Promise<{ orderId: string; productId: string; amountCents: number }[]> {
  const out = new Map<string, { orderId: string; productId: string; amountCents: number }>()
  for (const l of created) if (l.soldOut) out.set(l.orderId, { orderId: l.orderId, productId: l.productId, amountCents: l.amountCents })
  try {
    const { data } = await admin.from("orders").select("id, product_id, amount_cents").in("receipt_token", tokens).eq("refund_reason", SOLD_OUT_REASON).eq("status", "completed")
    for (const r of (data ?? []) as { id: string; product_id: string; amount_cents: number | null }[]) {
      if (!out.has(r.id)) out.set(r.id, { orderId: r.id, productId: r.product_id, amountCents: r.amount_cents ?? 0 })
    }
  } catch {
    /* only the retry of an earlier failure is lost */
  }
  return [...out.values()]
}

/**
 * ===========================================================================
 *  A BASKET A CODE MADE FREE
 * ===========================================================================
 * The free route for a basket, as /api/checkout/process is for one product:
 * nothing goes to Stripe, the lines are written straight away by the same
 * writeBasket as a paid basket, with provider "free" and a session id of
 * their own (`free_`), which is what groups a basket's lines for its
 * receipt, the orders list and a later claim. The route has already priced
 * the basket to $0 on the server.
 */
export async function fulfilFreeCart(
  admin: Db,
  b: {
    creatorId: string
    items: PackedItem[]
    buyerId: string | null
    buyerEmail: string
    buyerFirstName: string
    buyerLastName: string | null
    origin: FulfilContext["origin"]
    attribution?: FulfilContext["attribution"]
    /** The code that made it free; null for a cart that is free on its own (app/checkout/site). */
    couponId: string | null
    couponHolder: string | null
    baseUrl: string
    request?: Request
    /** The news box, ticked, on a checkout that shows it (app/checkout/site). */
    consent?: "ticked" | "none"
    /** Who holds the copies of limited products the route took for this basket (lib/checkout/sales-limit). */
    saleHolder?: string | null
    /** The store's own currency (lib/store/selling-currency): a free order is still written in it. */
    currency?: string | null
    /** What the buyer wrote for the shop at the website's checkout. */
    buyerNote?: string | null
  },
): Promise<{ ok: true; receiptToken: string; sessionFingerprint: string; complete: boolean } | { ok: false }> {
  const sessionId = `free_${randomBytes(18).toString("base64url")}`
  let device: FulfilContext["device"] = { country: null, countryCode: null, deviceType: null, os: null, browser: null }
  if (b.request) {
    const { collectOrderDeviceInfo } = await import("@/lib/device-info")
    const { deviceInfo, geoInfo } = collectOrderDeviceInfo(b.request)
    device = {
      country: geoInfo.country || null,
      countryCode: geoInfo.countryCode || null,
      deviceType: deviceInfo.deviceType || null,
      os: deviceInfo.os || null,
      browser: deviceInfo.browser || null,
    }
  }
  const sessionFingerprint = cartFingerprint(sessionId)
  const ctx: FulfilContext = {
    admin,
    sessionId,
    paymentIntentId: null,
    provider: "free",
    creatorId: b.creatorId,
    buyerId: b.buyerId,
    buyerEmail: b.buyerEmail.toLowerCase().trim(),
    buyerFirstName: b.buyerFirstName,
    buyerLastName: b.buyerLastName,
    receiptTokenFor: (index) => cartReceiptToken(sessionId, index),
    sessionFingerprint,
    paymentMethod: null,
    cardBrand: null,
    cardLast4: null,
    device,
    origin: b.origin,
    attribution: b.attribution ?? null,
    saleHolder: b.saleHolder ?? null,
    currency: b.currency ?? null,
  }
  const written = await writeBasket(admin, ctx, b.items, {
    paidTotal: 0,
    feeTotal: 0,
    destinationPaymentId: null,
    baseUrl: b.baseUrl,
    couponId: b.couponId,
    couponHolder: b.couponHolder,
    consent: b.consent ?? "none",
    buyerNote: b.buyerNote ?? null,
  })
  if (!written.receiptToken) return { ok: false }
  return { ok: true, receiptToken: written.receiptToken, sessionFingerprint, complete: written.complete }
}

async function sideEffects(
  admin: Db,
  s: {
    ctx: FulfilContext
    created: (FulfilledLine & { index: number })[]
    ownsBasket: boolean
    paidTotal: number
    feeTotal: number
    destinationPaymentId: string | null
    baseUrl: string
    firstOrderId: string
    receiptToken: string
    couponId: string | null
    couponHolder: string | null
    couponCode: string | null
    business: BusinessDetails | null
    buyerNote?: string | null
    consent?: "ticked" | "none"
    buyerBaseUrl?: string | null
    buyerLang?: string | null
    items: PackedItem[]
  },
) {
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      console.error(`[cart] ${name} failed for session ${s.ctx.sessionId}:`, e instanceof Error ? e.message : e)
    }
  }
  const { ctx } = s
  const ids = [...new Set(s.created.map((l) => l.productId))]
  const { data: rows } = await admin.from("products").select("id, title").in("id", ids)
  const titles = new Map<string, string>((rows ?? []).map((r: { id: string; title: string }) => [r.id, r.title]))
  const sellerEmail = await resolveSellerEmail(admin, ctx.creatorId)

  /* The company on every line this caller wrote (part 35; a database
     without the column refuses this write alone). */
  const business = s.business
  if (business) {
    await step("business details", async () => {
      const { error } = await admin.from("orders").update({ business_details: business }).in("id", s.created.map((l) => l.orderId))
      if (error) throw new Error(`${error.code ?? ""} ${error.message ?? ""}`.trim())
    })
  }
  /*
    THE BUYER'S NOTE on every line this caller wrote, for the order page and
    the seller's email below (SQL part 285). A database
    without the column refuses this write alone and says nothing: the
    seller's email still carries the note (sale.buyerNote).
  */
  const buyerNote = s.buyerNote
  if (buyerNote) {
    await step("buyer note", async () => {
      const { error } = await admin.from("orders").update({ buyer_note: buyerNote }).in("id", s.created.map((l) => l.orderId))
      if (error && !isMissingColumn(error, "buyer_note")) throw new Error(`${error.code ?? ""} ${error.message ?? ""}`.trim())
    })
  }

  if (s.ownsBasket) {
    await step("customer", () => recordCartCustomer(ctx, s.paidTotal, s.firstOrderId, s.created[0]?.productId ?? null, s.consent ?? "none"))
    if (ctx.buyerEmail) {
      const buyerEmail = ctx.buyerEmail
      const source = contactSourceOfOrder(ctx.origin)
      /* One basket is one purchase to the creator's automations: one thank
         you, not one per product. Keyed by the basket's first order. */
      const names = [...new Set(s.created.map((l) => titles.get(l.productId)).filter((t): t is string => Boolean(t)))]
      await step("email flows", () =>
        triggerEmailFlows(admin, {
          triggerType: "purchase",
          creatorId: ctx.creatorId,
          recipientEmail: buyerEmail,
          recipientName: ctx.buyerFirstName ?? undefined,
          productTitle: names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0],
          productId: s.created[0].productId,
          productIds: s.created.map((l) => l.productId),
          orderId: s.firstOrderId,
          source,
        }),
      )
    }
    /* The code's use, once for the basket: only the caller that wrote its
       first line gets here, and that line is written once. */
    if (s.couponId) await step("coupon use", () => recordCouponUse(admin, s.couponId, s.couponHolder))
    /* The seller's balance, once for the one payment, against the first line. */
    await step("ledger", () =>
      recordSale(admin, { creatorId: ctx.creatorId, orderId: s.firstOrderId, total: s.paidTotal, fee: s.feeTotal, destinationPaymentId: s.destinationPaymentId, currency: ctx.currency }),
    )
    /* ONE receipt email for the basket: the sender reads every line of this
       session and lists them with one total. */
    if (ctx.buyerEmail) {
      const first = s.created.find((l) => l.index === 0)!
      const attachments = s.paidTotal > 0 ? await basketPdf(admin, ctx.sessionId, s) : undefined
      await step("buyer email", () =>
        sendBuyerDownloadEmail(admin, {
          attachments,
          orderId: first.orderId,
          creatorId: ctx.creatorId,
          buyerEmail: ctx.buyerEmail as string,
          buyerFirstName: ctx.buyerFirstName ?? "",
          productTitle: titles.get(first.productId) ?? "Your purchase",
          receiptToken: s.receiptToken,
          sellerReplyTo: sellerEmail,
          baseUrl: s.baseUrl,
          receiptBaseUrl: s.buyerBaseUrl ?? null,
          lang: s.buyerLang ?? null,
          amountCents: s.paidTotal,
        }),
      )
    }
    await step("push", async () => {
      const { data: creator } = await admin.from("creators").select("user_id").eq("id", ctx.creatorId).maybeSingle()
      if (!creator?.user_id) return
      const { notifySale } = await import("@/lib/push/notifications")
      await notifySale(creator.user_id, {
        productName: s.created.length > 1 ? `${s.created.length} products` : titles.get(s.created[0].productId) ?? "A product",
        amountCents: s.paidTotal,
        orderId: s.firstOrderId,
        productId: s.created[0].productId,
      })
    })
  }

  /* The notification engine: the purchase once, from the caller that owns
     the basket, and a sale for each line this caller wrote, as the seller's
     emails below are (lib/orders/sale-events.ts). */
  await step("notify", () =>
    raiseSaleEvents(admin, {
      creatorId: ctx.creatorId,
      purchase: s.ownsBasket ? { orderId: s.firstOrderId, amountCents: s.paidTotal, lineCount: s.created.length } : null,
      lines: s.created.map((l) => ({ orderId: l.orderId, productId: l.productId, productTitle: titles.get(l.productId) ?? null, amountCents: l.amountCents })),
      buyerEmail: ctx.buyerEmail ?? null,
      buyerCountry: ctx.device?.country ?? null,
      correlationId: ctx.sessionId,
    }),
  )

  /* The seller hears about the order once: the first call lists every line
     of the basket and marks them all told, so the calls for the other lines
     find them sent (lib/email.tsx sendSellerNotificationEmail). A line
     another caller wrote after that email is sent on its own call. */
  const saleLines = s.created.map((l) => ({
    orderId: l.orderId,
    quantity: s.items[l.index]?.quantity ?? null,
    discountCents: s.items[l.index]?.discountCents ?? 0,
  }))
  for (const line of s.created) {
    await step("seller email", () =>
      sendSellerNotificationEmail(admin, {
        orderId: line.orderId,
        creatorId: ctx.creatorId,
        sellerEmail,
        productTitle: titles.get(line.productId) ?? "Your purchase",
        buyerFirstName: ctx.buyerFirstName ?? "",
        buyerLastName: ctx.buyerLastName ?? "",
        buyerEmail: ctx.buyerEmail ?? "",
        amountCents: line.amountCents,
        feeCents: 0,
        baseUrl: s.baseUrl,
        sale: { couponCode: s.couponCode, lines: saleLines, buyerNote: s.buyerNote ?? null },
      }),
    )
  }
}

/**
 * The basket's receipt as a PDF for its one email: every line of the
 * payment, read back as written, so its number and figures are the ones a
 * later download from the receipt draws (lib/checkout/invoice.ts). An
 * invoice with the company on it when the buyer gave one. Extra, like the
 * single product's: if it cannot be drawn the email still goes without it.
 */
async function basketPdf(
  admin: Db,
  sessionId: string,
  s: { business: BusinessDetails | null; items: PackedItem[]; couponCode: string | null },
): Promise<{ filename: string; content: Uint8Array; contentType: string }[] | undefined> {
  try {
    const { data: rows } = await admin
      .from("orders")
      .select("*, product:products(title, creator_id)")
      .eq("stripe_session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(50)
    if (!rows || rows.length === 0) return undefined
    const invoice = await invoiceForOrder(admin, rows[0] as OrderRow, {
      basket: rows as OrderRow[],
      items: s.items,
      business: s.business,
      discountCode: s.couponCode,
    })
    if (!invoice) return undefined
    return [{ filename: invoiceFilename(invoice), content: await renderInvoicePdf(invoice), contentType: "application/pdf" }]
  } catch (e) {
    console.error(`[cart] receipt PDF for session ${sessionId} could not be drawn:`, e instanceof Error ? e.message : e)
    return undefined
  }
}
