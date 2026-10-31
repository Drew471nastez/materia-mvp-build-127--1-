import "server-only"

/**
 * ===========================================================================
 *  ONE LINE OF A BASKET, TURNED INTO A PURCHASE
 * ===========================================================================
 * A single-product checkout writes an order, an entitlement, a customer, a
 * subscriber, a sales count and an analytics row, all inline in
 * app/api/checkout/complete. A basket needs the same writes once per line,
 * so they are here rather than copied into a loop.
 *
 * This deliberately does NOT touch the existing single-product route. That
 * path takes real money today and rewriting it to share this would put every
 * purchase on the platform behind a change that only the cart needed.
 *
 * IDEMPOTENT PER LINE, UNDER A RACE. A line's receipt token is derived from
 * its session and its place in the basket (lib/checkout/fulfil-cart-session),
 * and the orders table holds receipt tokens UNIQUE. So when the buyer's
 * return and Stripe's webhook write the same basket at once, the second
 * insert of each line fails with 23505 and is reported as "exists", never
 * as a second order. A retry after a partial failure writes only what is
 * missing.
 */
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { recordCheckoutContact } from "@/lib/contacts/checkout-contact"
import { tagOrderSource, type OrderOrigin } from "@/lib/orders/order-source"
import { recordContactAttribution, recordOrderAttribution, type Attribution } from "@/lib/attribution/server"
import { recordCustomer } from "./fulfil-payment"
import { lineTotalCents, type PackedOffer } from "./cart-items"
import { claimSale, releaseSale } from "./sales-limit"
import { SOLD_OUT_REASON, markSoldOut } from "./sold-out-refund"
import type { Followups } from "./followups"
import { ensureEntitlement } from "./entitlement-grant"

export interface FulfilLineInput {
  productId: string
  variantId: string | null
  quantity: number
  /** Unit price before any code, in cents. */
  priceCents: number
  /** What a code took off the whole line, in cents. */
  discountCents?: number
  /** The line's tax (Settings › Taxes): inside its price when prices include tax, else charged on top. */
  taxCents?: number
  /** The store's offers inside `discountCents` and the line's properties (lib/checkout/cart-items PackedItem), kept on the order line. */
  offers?: PackedOffer[]
  properties?: Record<string, string>
}

export interface FulfilContext {
  admin: any
  /** The Stripe Checkout Session, or for a basket a code made free, `free_` and a random id: what groups its lines. */
  sessionId: string
  paymentIntentId: string | null
  /** "stripe", or "free" for a basket a code took to $0. */
  provider?: "stripe" | "free" | "cod"
  creatorId: string
  buyerId: string | null
  buyerEmail: string | null
  buyerFirstName: string | null
  buyerLastName: string | null
  /** The line's receipt token, from its place in the basket. */
  receiptTokenFor: (index: number) => string
  sessionFingerprint: string | null
  paymentMethod: string | null
  cardBrand: string | null
  cardLast4: string | null
  device: {
    country: string | null
    countryCode: string | null
    deviceType: string | null
    os: string | null
    browser: string | null
  }
  /** Which website, and where its visit came from (lib/orders/order-source). */
  origin?: OrderOrigin | null
  /** First and last touch and the property, the same on every line (lib/attribution). */
  attribution?: Attribution | null
  feeAudit?: { planUsed: string | null; pricingTier: string | null; feeRuleVersion: string | null }
  /** The basket's tax, as the cart route charged it: whether it was inside the prices, and where. */
  tax?: { included: boolean; country: string | null; label?: string | null } | null
  /** Who held the basket's copies under a product's sales limit when the payment started (lib/checkout/sales-limit). */
  saleHolder?: string | null
  /** What Stripe charged in (the session's or the PaymentIntent's currency), kept on each order line. */
  currency?: string | null
}

export interface FulfilledLine {
  orderId: string
  productId: string
  receiptToken: string
  amountCents: number
  /** Paid for after the product's last copy had gone: written, not fulfilled, and refunded by the basket (lib/checkout/sold-out-refund). */
  soldOut?: boolean
}

/** "exists": another caller wrote this line; its order id, when it could be read, lets a retry finish its follow-ups (./followups.ts). */
export type LineOutcome = { status: "created"; line: FulfilledLine } | { status: "exists"; orderId: string | null; amountCents?: number; soldOut?: boolean } | { status: "failed" }

/** A download line's snapshot: its properties and its offers, in the shape a shipped line's snapshot has them; null when it has neither. */
export function lineSnapshot(line: Pick<FulfilLineInput, "offers" | "properties" | "discountCents">): Record<string, unknown> | null {
  const properties = line.properties && Object.keys(line.properties).length ? line.properties : null
  let left = Math.max(0, Math.round(line.discountCents ?? 0))
  const offers = (line.offers ?? []).flatMap((o) => {
    const saved = Math.min(left, Math.max(0, Math.round(o.savedCents)))
    if (saved <= 0) return []
    left -= saved
    return [{ offer_id: o.offerId, title: (o.title || "Offer").slice(0, 120), kind: o.kind, saved_cents: saved, ...(o.tier !== undefined ? { tier: o.tier } : {}) }]
  })
  if (!properties && offers.length === 0) return null
  return { ...(properties ? { properties } : {}), ...(offers.length ? { offers } : {}) }
}

export async function fulfilCartLine(ctx: FulfilContext, line: FulfilLineInput, index: number, feeCents: number): Promise<LineOutcome> {
  /* What this line was charged: its price, less what a code took off it,
     and its tax when that was added on top (the basket's Tax line), so the
     rows add up to what Stripe took, as a physical checkout's rows do. */
  const taxCents = Math.max(0, Math.round(line.taxCents ?? 0))
  const amountCents = lineTotalCents(line) + (ctx.tax?.included ? 0 : taxCents)
  const receiptToken = ctx.receiptTokenFor(index)
  /* LIMIT SALES: the copy held when the payment started, taken again and kept while the order is written (lib/checkout/sales-limit). Only a limited product is asked about. */
  const saleHolder = ctx.saleHolder || `p:${ctx.sessionId}`
  const withinLimit = await claimSale(ctx.admin, line.productId, saleHolder, line.quantity)

  const { data: order, error } = await ctx.admin
    .from("orders")
    .insert({
      buyer_id: ctx.buyerId,
      buyer_first_name: ctx.buyerFirstName,
      buyer_last_name: ctx.buyerLastName,
      buyer_email: ctx.buyerEmail,
      product_id: line.productId,
      amount_cents: amountCents,
      tip_cents: 0,
      fee_cents: feeCents,
      application_fee_cents: feeCents,
      plan_used: ctx.feeAudit?.planUsed ?? null,
      pricing_tier: ctx.feeAudit?.pricingTier ?? null,
      fee_rule_version: ctx.feeAudit?.feeRuleVersion ?? null,
      currency: (ctx.currency || "usd").toLowerCase(),
      provider: ctx.provider ?? "stripe",
      status: "completed",
      stripe_session_id: ctx.sessionId,
      stripe_payment_intent_id: ctx.paymentIntentId,
      session_fingerprint: ctx.sessionFingerprint,
      receipt_token: receiptToken,
      allowed_fingerprints: ctx.sessionFingerprint ? [ctx.sessionFingerprint] : [],
      payment_method: ctx.paymentMethod,
      card_brand: ctx.cardBrand,
      card_last4: ctx.cardLast4,
      buyer_country: ctx.device.country,
      buyer_country_code: ctx.device.countryCode,
      buyer_device_type: ctx.device.deviceType,
      buyer_os: ctx.device.os,
      buyer_browser: ctx.device.browser,
      variant_id: line.variantId,
    })
    .select("id, receipt_token")
    .single()

  /* The order counts the copy now, or another caller's does, or there is none: the place goes either way. */
  await releaseSale(ctx.admin, line.productId, saleHolder)
  if (error?.code === "23505") {
    const { data: theirs } = await ctx.admin.from("orders").select("id, amount_cents, refund_reason").eq("receipt_token", receiptToken).limit(1)
    const row = Array.isArray(theirs) ? (theirs[0] as { id?: string; amount_cents?: number | null; refund_reason?: string | null } | undefined) : undefined
    return { status: "exists", orderId: row?.id ? String(row.id) : null, amountCents: Number(row?.amount_cents) || amountCents, soldOut: row?.refund_reason === SOLD_OUT_REASON }
  }
  if (error || !order) {
    console.error("[checkout/cart] order insert failed for product", line.productId, error?.code, error?.message)
    return { status: "failed" }
  }
  /*
    WHICH OFFERS SAVED WHAT ON THIS LINE, AND ITS PROPERTIES, as a shipped
    cart's order line keeps them (lib/physical/checkout-server: the
    snapshot's `offers` and `properties`), so the receipt, the emails, the
    admin's order, the export and the offers page's Sold count read a
    download basket the same way. Its own write: an order is never lost to it.
  */
  const snapshot = lineSnapshot(line)
  if (snapshot) {
    const { error: snapError } = await ctx.admin.from("orders").update({ product_snapshot: snapshot }).eq("id", order.id)
    if (snapError) console.warn("[checkout/cart] offers and properties not kept on the order:", snapError.code)
  }
  /* Several copies on one line are several of a limited run (product_copies_sold): kept on the order on its own, so a database without the column (part 78) loses only this. */
  if (line.quantity > 1) {
    const { error: qtyError } = await ctx.admin.from("orders").update({ quantity: line.quantity }).eq("id", order.id)
    if (qtyError) console.warn("[checkout/cart] quantity not kept on the order:", qtyError.code)
  }
  /* Settings › Taxes: the line's tax on its order, for the receipt and reports. Its
     own writes after the order exists, so a database without SQL part 110
     (tax_cents) or 129 (tax_included) only loses the record, never the order. */
  if (taxCents > 0) {
    const country = ctx.tax?.country && /^[A-Z]{2}$/.test(ctx.tax.country) ? ctx.tax.country : null
    const { error: taxError } = await ctx.admin.from("orders").update({ tax_cents: Math.min(taxCents, amountCents), tax_country: country }).eq("id", order.id)
    if (taxError) console.warn("[checkout/cart] tax not kept on the order:", taxError.code)
    else if (ctx.tax?.included) {
      const { error: inError } = await ctx.admin.from("orders").update({ tax_included: true }).eq("id", order.id)
      if (inError) console.warn("[checkout/cart] tax_included not kept:", inError.code)
    }
    /* "VAT 19%", as the checkout named it, for the receipt and the PDF (SQL part 153): its own write, so an older database loses only the words. */
    if (!taxError && ctx.tax?.label) {
      const { error: labelError } = await ctx.admin.from("orders").update({ tax_label: String(ctx.tax.label).slice(0, 80) }).eq("id", order.id)
      if (labelError) console.warn("[checkout/cart] tax_label not kept:", labelError.code)
    }
  }
  /* Over the limit: a record of the money, refunded by the basket, never a purchase (no library entry, no sales count). */
  if (!withinLimit) {
    console.warn("[checkout/cart] over the sales limit:", line.productId, order.id)
    await markSoldOut(ctx.admin, order.id)
    return { status: "created", line: { orderId: order.id, productId: line.productId, receiptToken: order.receipt_token, amountCents, soldOut: true } }
  }

  return { status: "created", line: { orderId: order.id, productId: line.productId, receiptToken: order.receipt_token, amountCents } }
}

/**
 * What one written line needs after it: where it came from, the buyer's
 * library entry and the product's sales count. Run by the caller that wrote
 * the line, and by a retry for what that caller did not finish
 * (./followups.ts): the library entry is checked first, the count is
 * claimed once. A line over the sales limit gets its tags only.
 */
export async function cartLineFollowups(ctx: FulfilContext, f: Followups, line: { orderId: string; productId: string; variantId: string | null; soldOut?: boolean }): Promise<void> {
  /* A basket is only ever filled on a creator's website. */
  await f.idempotent("source", () => tagOrderSource(ctx.admin, line.orderId, "website", ctx.origin))
  await f.idempotent("attribution", () => recordOrderAttribution(ctx.admin, line.orderId, ctx.attribution))
  if (line.soldOut) return
  await f.idempotent("entitlement", () => cartEntitlement(ctx, line))
  await f.once("sales count", async () => {
    await ctx.admin.rpc("increment_product_sales", { p_product_id: line.productId })
    await ctx.admin.from("analytics_events").insert({
      creator_id: ctx.creatorId,
      product_id: line.productId,
      event_type: "purchase",
    })
  })
}

async function cartEntitlement(ctx: FulfilContext, line: { orderId: string; productId: string; variantId: string | null }): Promise<void> {
  if (ctx.buyerId) {
    /* Throws when the entry could not be read or written: the follow-up is recorded failed and the sweep runs it again (lib/checkout/entitlement-grant). */
    await ensureEntitlement(ctx.admin, { buyerId: ctx.buyerId, creatorId: ctx.creatorId, productId: line.productId, variantId: line.variantId })
  }
}

/**
 * The buyer's standing with this seller, which is about the basket rather
 * than about any one line in it, so it happens once per checkout.
 */
/** `basis` is "ticked" when the buyer ticked the news box on a checkout that has one (the physical checkout, Settings › Checkout). */
export async function recordCartCustomer(ctx: FulfilContext, basketTotalCents: number, firstOrderId: string | null, firstProductId?: string | null, basis: "ticked" | "none" = "none") {
  if (!ctx.buyerEmail || !ctx.creatorId) return
  const email = ctx.buyerEmail.toLowerCase().trim()

  /* Added to the buyer's history, not written over it. */
  await recordCustomer(ctx.admin, {
    creatorId: ctx.creatorId,
    email,
    first: ctx.buyerFirstName ?? undefined,
    last: ctx.buyerLastName ?? undefined,
    total: basketTotalCents,
  })

  /* Stripe's hosted page asks nothing about news, so a basket's buyer is a
     customer contact, never subscribed on their behalf, and somebody who
     unsubscribed stays that way (lib/contacts/checkout-contact). This used
     to subscribe every buyer and put unsubscribed ones back on the list. */
  await recordCheckoutContact(ctx.admin, {
    creatorId: ctx.creatorId,
    email,
    name: `${ctx.buyerFirstName ?? ""} ${ctx.buyerLastName ?? ""}`.trim(),
    orderId: firstOrderId,
    basis,
    bought: true,
    source: contactSourceOfOrder(ctx.origin, firstProductId),
  })
  await recordContactAttribution(ctx.admin, ctx.creatorId, email, ctx.attribution)
}
