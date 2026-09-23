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
import { v4 as uuidv4 } from "uuid"
import { tagOrderSource } from "@/lib/orders/order-source"
import { recordCustomer } from "./fulfil-payment"

export interface FulfilLineInput {
  productId: string
  variantId: string | null
  quantity: number
  /** Unit price as charged, in cents. */
  priceCents: number
}

export interface FulfilContext {
  admin: any
  sessionId: string
  paymentIntentId: string | null
  creatorId: string
  buyerId: string | null
  buyerEmail: string | null
  buyerFirstName: string | null
  buyerLastName: string | null
  /** The line's receipt token, from its place in the basket. */
  receiptTokenFor: (index: number) => string
  sessionFingerprint: string | null
  paymentMethod: string
  cardBrand: string | null
  cardLast4: string | null
  device: {
    country: string | null
    countryCode: string | null
    deviceType: string | null
    os: string | null
    browser: string | null
  }
}

export interface FulfilledLine {
  orderId: string
  productId: string
  receiptToken: string
  amountCents: number
}

export type LineOutcome = { status: "created"; line: FulfilledLine } | { status: "exists" } | { status: "failed" }

export async function fulfilCartLine(ctx: FulfilContext, line: FulfilLineInput, index: number, feeCents: number): Promise<LineOutcome> {
  const amountCents = line.priceCents * line.quantity
  const receiptToken = ctx.receiptTokenFor(index)

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
      currency: "usd",
      provider: "stripe",
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

  if (error?.code === "23505") return { status: "exists" }
  if (error || !order) {
    console.error("[checkout/cart] order insert failed for product", line.productId, error?.code, error?.message)
    return { status: "failed" }
  }
  /* A basket is only ever filled on a creator's website. */
  await tagOrderSource(ctx.admin, order.id, "website")

  if (ctx.buyerId) {
    let q = ctx.admin
      .from("entitlements")
      .select("id")
      .eq("buyer_id", ctx.buyerId)
      .eq("product_id", line.productId)
    q = line.variantId ? q.eq("variant_id", line.variantId) : q.is("variant_id", null)
    const { data: existing } = await q.maybeSingle()

    if (!existing) {
      await ctx.admin.from("entitlements").insert({
        buyer_id: ctx.buyerId,
        creator_id: ctx.creatorId,
        product_id: line.productId,
        variant_id: line.variantId,
        community_access: false,
      })
    }
  }

  await ctx.admin.rpc("increment_product_sales", { p_product_id: line.productId })
  await ctx.admin.from("analytics_events").insert({
    creator_id: ctx.creatorId,
    product_id: line.productId,
    event_type: "purchase",
  })

  return { status: "created", line: { orderId: order.id, productId: line.productId, receiptToken: order.receipt_token, amountCents } }
}

/**
 * The buyer's standing with this seller, which is about the basket rather
 * than about any one line in it, so it happens once per checkout.
 */
export async function recordCartCustomer(ctx: FulfilContext, basketTotalCents: number, firstOrderId: string | null) {
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

  const { data: existing } = await ctx.admin
    .from("subscribers")
    .select("id, status")
    .eq("creator_id", ctx.creatorId)
    .eq("email", email)
    .maybeSingle()

  if (!existing) {
    await ctx.admin.from("subscribers").insert({
      email,
      name: `${ctx.buyerFirstName ?? ""} ${ctx.buyerLastName ?? ""}`.trim() || null,
      source: "checkout",
      source_id: firstOrderId,
      creator_id: ctx.creatorId,
      status: "subscribed",
      is_active: true,
      subscribed_at: new Date().toISOString(),
      consent_text: "Subscribed via cart checkout",
      consent_timestamp: new Date().toISOString(),
      unsubscribe_token: uuidv4(),
    })
  } else if (existing.status === "unsubscribed") {
    await ctx.admin
      .from("subscribers")
      .update({ status: "subscribed", is_active: true, subscribed_at: new Date().toISOString(), unsubscribed_at: null })
      .eq("id", existing.id)
  }
}
