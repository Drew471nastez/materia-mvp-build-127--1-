import "server-only"

/**
 * ===========================================================================
 *  A PHYSICAL CHECKOUT, FROM "PAY" TO ORDERS, EXACTLY ONCE
 * ===========================================================================
 * START (POST /api/physical/checkout). The cart, the code, the address and
 * the delivery option are priced again here (./checkout-pricing-server.ts).
 * A commerce_checkouts row records exactly what is being bought and for how
 * much, the stock is held for it in one transaction (physical_reserve: all
 * lines or none, so two buyers can never both get the last one), and a
 * Stripe Checkout page is made for that total, with the delivery as its
 * shipping line and the tax as its own line. A destination charge, like
 * the basket's: the shop is paid, Storelib keeps its fee.
 *
 *   Same client key twice (a double click, a retry): the same checkout, and
 *   its still open Stripe page, are returned. Nothing is held twice.
 *
 * COMPLETE (the buyer's return and the webhook, whichever comes first).
 * The checkout flips to paid once, by a conditional update; whoever flips
 * it owns what happens once per order (the customer, the code's use, the
 * seller's balance, the emails, forwarding to a supplier). Each line is an
 * ordinary orders row with a receipt token derived from the Stripe session
 * and its place, unique in the table, so the two callers write each line
 * once. The held stock becomes sold (physical_mark_sold), which also takes
 * it again if the hold had expired before the payment landed.
 *
 * EXPIRE. A Stripe page that expires, or a hold nobody paid for, gives its
 * stock back (physical_release, and the cron's physical_expire_holds).
 *
 * The order rows carry the whole charge between them: each line's amount
 * is its price less its code discount, plus its share of delivery and of
 * added tax. Refunds, revenue and the seller's ledger all read those rows,
 * so they add up to what Stripe took without a special case.
 */

import { randomBytes } from "node:crypto"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { MIN_CHARGE_CENTS } from "@/lib/checkout/pricing"
import { apportionFee, chargeUnits } from "@/lib/checkout/cart-items"
import { cartFingerprint, cartReceiptToken } from "@/lib/checkout/cart-tokens"
import { holdCouponUse, holderForEmail, needsHold, releaseCouponHold } from "@/lib/checkout/coupon-holds"
import { recordCouponUse } from "@/lib/checkout/coupons"
import { paymentFacts, recordSale } from "@/lib/checkout/fulfil-payment"
import { recordCartCustomer, type FulfilContext } from "@/lib/checkout/fulfil-cart-item"
import { calculatePlatformFeeForCheckout } from "@/lib/billing/platform-fee-server"
import { platformChargeCurrency } from "@/lib/payments/fees/currency-rules"
import { tagOrderSource, type OrderOrigin } from "@/lib/orders/order-source"
import { recordOrderAttribution, type Attribution } from "@/lib/attribution/server"
import { raiseSaleEvents } from "@/lib/orders/sale-events"
import { resolveSellerEmail, sendSellerNotificationEmail } from "@/lib/email"
import type { Db } from "./auth"
import { priceCheckout, quoteCheckout, readItems, type PricedCheckout } from "./checkout-pricing-server"
import { readAddress } from "./address"
import { addOrderEvent } from "./events-server"
import { queueOrderConfirmation, queueForwarding } from "./jobs-server"
import type { Address, PricedLine } from "./types"

export const HOLD_MINUTES = 35
const STRIPE_PAGE_MINUTES = 31

export interface StartInput {
  shopId: string | null
  items: unknown
  couponCode: unknown
  email: unknown
  name?: unknown
  phone?: unknown
  address: unknown
  deliveryOptionId: unknown
  buyerNote?: unknown
  clientKey: unknown
  origin: OrderOrigin | null
  attribution: Attribution | null
  buyerId: string | null
  platformOrigin: string
  /** Where the buyer goes back to if they leave Stripe's page. */
  backUrl: string
}

export type StartResult =
  | { ok: true; url: string; checkoutId: string; free: boolean }
  | { ok: false; status: number; error: string; field?: string; stock?: { title: string; available: number }[] }

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : ""
}

/** A line as it is kept on the checkout: enough to write its order and show it, nothing a buyer could change. */
function snapshotLine(l: PricedLine) {
  return {
    product_id: l.productId,
    variant_id: l.variantId,
    title: l.title.slice(0, 200),
    variant_name: l.variantName,
    sku: l.sku,
    image_url: l.imageUrl,
    type: l.type,
    quantity: l.quantity,
    unit_cents: l.unitCents,
    discount_cents: l.discountCents,
    requires_shipping: l.requiresShipping,
    taxable: l.taxable,
    weight_grams: l.weightGrams,
    location_id: l.locationId,
    track_inventory: l.trackInventory,
    inventory_policy: l.inventoryPolicy,
  }
}
export type LineSnapshot = ReturnType<typeof snapshotLine>

export async function startCheckout(db: Db, input: StartInput): Promise<StartResult> {
  const email = clean(input.email, 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, status: 400, error: "Enter your email address.", field: "email" }
  const clientKey = clean(input.clientKey, 120)
  if (clientKey.length < 8) return { ok: false, status: 400, error: "Refresh the page and try again." }

  const items = readItems(input.items)
  const priced = await priceCheckout(db, { items, couponCode: input.couponCode, buyerId: input.buyerId, buyerEmail: email, shopId: input.shopId })
  if (priced.ok === false) return { ok: false, status: priced.status, error: priced.error }
  if (priced.stockIssues.length) {
    return {
      ok: false,
      status: 409,
      error: priced.stockIssues.length === 1 ? `${priced.stockIssues[0].title} has only ${priced.stockIssues[0].available} left.` : "Some items no longer have enough stock.",
      stock: priced.stockIssues.map((s) => ({ title: s.title, available: s.available })),
    }
  }
  if (priced.lines.length === 0) return { ok: false, status: 400, error: priced.dropped.length ? `${priced.dropped[0]} can't be bought right now.` : "Your cart is empty." }

  let address: Address | null = null
  if (priced.requiresShipping) {
    const read = readAddress(input.address)
    if (read.ok === false) return { ok: false, status: 400, error: read.error, field: read.field }
    address = read.address
  }
  const q = await quoteCheckout(db, priced, address, input.deliveryOptionId)
  if (priced.requiresShipping) {
    if (q.quote.ok === false) return { ok: false, status: 400, error: q.quote.error, field: "country" }
    if (!q.option) return { ok: false, status: 400, error: "This shop doesn't deliver to that country yet.", field: "country" }
    if (typeof input.deliveryOptionId === "string" && q.option.id !== input.deliveryOptionId) {
      return { ok: false, status: 409, error: "Delivery prices changed. Check the delivery option and pay again." }
    }
  }
  const totals = q.totals

  const { data: creator } = await db
    .from("creators")
    .select("id, user_id, display_name, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled")
    .eq("id", priced.creatorId)
    .maybeSingle()
  if (!creator) return { ok: false, status: 404, error: "Shop not found." }

  const free = totals.totalCents === 0
  if (!free && totals.totalCents < MIN_CHARGE_CENTS) return { ok: false, status: 400, error: "The smallest card payment is $0.50." }
  if (
    !free &&
    (!creator.stripe_account_id ||
      !String(creator.stripe_account_id).startsWith("acct_") ||
      creator.charges_enabled === false ||
      creator.payouts_enabled === false ||
      creator.stripe_onboarding_status !== "connected")
  ) {
    return { ok: false, status: 400, error: "This shop can't take payments yet. Please contact the seller." }
  }

  /* The same press again: the checkout it made, and its page while it is open. */
  const { data: existing } = await db
    .from("commerce_checkouts")
    .select("id, status, stripe_session_id, total_cents, expires_at")
    .eq("creator_id", priced.creatorId)
    .eq("client_key", clientKey)
    .maybeSingle()
  if (existing) {
    if (existing.status === "paid") return { ok: false, status: 409, error: "This order has already been paid." }
    if (existing.status === "pending" && existing.stripe_session_id && existing.total_cents === totals.totalCents) {
      try {
        const s = await stripe.checkout.sessions.retrieve(existing.stripe_session_id)
        if (s.status === "open" && s.url) return { ok: true, url: s.url, checkoutId: existing.id, free: false }
      } catch {
        /* Made again below under a new key. */
      }
    }
    return { ok: false, status: 409, error: "Refresh the page and try again." }
  }

  const chargeCurrency = platformChargeCurrency()
  let fee: Awaited<ReturnType<typeof calculatePlatformFeeForCheckout>> | null = null
  if (!free) {
    try {
      fee = await calculatePlatformFeeForCheckout(totals.totalCents, priced.creatorId, db, chargeCurrency)
    } catch {
      return { ok: false, status: 400, error: "This currency is not available for checkout yet." }
    }
  }

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000)
  const receiptToken = randomBytes(24).toString("base64url")
  const option = q.option
  const { data: checkout, error: insertError } = await db
    .from("commerce_checkouts")
    .insert({
      creator_id: priced.creatorId,
      buyer_id: input.buyerId,
      buyer_email: email,
      buyer_name: clean(input.name, 200) || address?.name || null,
      buyer_phone: clean(input.phone, 40) || address?.phone || null,
      status: "pending",
      fulfillment_status: priced.requiresShipping ? "unfulfilled" : "not_required",
      currency: chargeCurrency.toUpperCase(),
      items_subtotal_cents: totals.itemsSubtotalCents,
      discount_cents: totals.discountCents,
      shipping_cents: totals.shippingCents,
      shipping_discount_cents: totals.shippingDiscountCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
      platform_fee_cents: fee?.platformFeeCents ?? 0,
      shipping_address: address,
      shipping_rate: option
        ? { id: option.id, name: option.name, price_cents: option.priceCents, min_days: option.minDays, max_days: option.maxDays, rate_ids: option.rateIds, tax_rate_bps: totals.taxRateBps, tax_included: totals.taxIncluded }
        : { tax_rate_bps: totals.taxRateBps, tax_included: totals.taxIncluded },
      lines: priced.lines.map(snapshotLine),
      coupon_id: priced.coupon?.id ?? null,
      coupon_code: priced.coupon?.code ?? null,
      provider: free ? "free" : "stripe",
      client_key: clientKey,
      receipt_token: receiptToken,
      origin: input.origin,
      attribution: input.attribution,
      buyer_note: clean(input.buyerNote, 1000) || null,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single()
  if (insertError || !checkout) {
    if (insertError?.code === "23505") return { ok: false, status: 409, error: "Refresh the page and try again." }
    console.error("[physical] checkout insert failed:", insertError?.code)
    return { ok: false, status: insertError?.code === "42P01" ? 503 : 500, error: insertError?.code === "42P01" ? "This shop is not ready to sell physical products yet." : "Could not start the checkout." }
  }
  const checkoutId = checkout.id as string

  /* The stock, all lines or none. */
  const holds = priced.lines
    .filter((l) => l.type === "physical" && l.trackInventory && l.variantId && l.locationId)
    .map((l) => ({ variant_id: l.variantId, location_id: l.locationId, quantity: l.quantity, oversell: l.inventoryPolicy === "continue" }))
  if (holds.length) {
    const { error: holdError } = await db.rpc("physical_reserve", { p_checkout: checkoutId, p_lines: holds, p_expires: expiresAt.toISOString() })
    if (holdError) {
      await db.from("commerce_checkouts").update({ status: "failed", cancel_reason: "Out of stock", updated_at: new Date().toISOString() }).eq("id", checkoutId)
      const m = /^out_of_stock:([0-9a-f-]{36}):(\d+)/.exec(holdError.message ?? "")
      if (m) {
        const line = priced.lines.find((l) => l.variantId === m[1])
        const title = line ? (line.variantName ? `${line.title}, ${line.variantName}` : line.title) : "An item"
        return { ok: false, status: 409, error: `${title} has only ${m[2]} left.`, stock: [{ title, available: Number(m[2]) }] }
      }
      console.error("[physical] hold failed:", holdError.code)
      return { ok: false, status: 500, error: "Could not hold the stock. Try again in a moment." }
    }
  }

  /* A code with a use limit keeps a place while the page is open. */
  let holder: string | null = null
  if (priced.coupon && needsHold(priced.coupon)) {
    holder = holderForEmail(email)
    if (!(await holdCouponUse(db, priced.coupon.id, holder))) {
      await releaseCheckout(db, checkoutId, "cancelled", "Code used up")
      return { ok: false, status: 400, error: "That code has been used up." }
    }
    await db.from("commerce_checkouts").update({ coupon_holder: holder }).eq("id", checkoutId)
  }

  if (free) {
    const done = await completeCheckout(db, { checkoutId, sessionId: `free_${randomBytes(18).toString("base64url")}`, paymentIntentId: null, facts: null, baseUrl: input.platformOrigin })
    if (!done.ok) return { ok: false, status: 500, error: "The order could not be saved. Try again in a moment." }
    return { ok: true, url: `${input.platformOrigin}/checkout/physical/order/${encodeURIComponent(receiptToken)}`, checkoutId, free: true }
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priced.lines.flatMap((l) =>
    chargeUnits({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, priceCents: l.unitCents, discountCents: l.discountCents }).map((part) => ({
      quantity: part.quantity,
      price_data: {
        currency: chargeCurrency,
        unit_amount: part.unitCents,
        product_data: {
          name: (l.variantName ? `${l.title} (${l.variantName})` : l.title).slice(0, 250),
          ...(l.discountCents > 0 && priced.coupon ? { description: `$${(l.discountCents / 100).toFixed(2)} off with ${priced.coupon.code}` } : {}),
          ...(l.imageUrl && /^https:\/\//.test(l.imageUrl) ? { images: [l.imageUrl] } : {}),
        },
      },
    })),
  )
  if (totals.taxCents > 0 && !totals.taxIncluded) {
    lineItems.push({ quantity: 1, price_data: { currency: chargeCurrency, unit_amount: totals.taxCents, product_data: { name: "Tax" } } })
  }
  const shippingPaid = totals.shippingCents - totals.shippingDiscountCents

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: lineItems,
    customer_email: email,
    expires_at: Math.floor(Date.now() / 1000) + STRIPE_PAGE_MINUTES * 60,
    ...(option
      ? {
          shipping_options: [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: shippingPaid, currency: chargeCurrency },
                display_name: (shippingPaid === 0 && totals.shippingDiscountCents > 0 ? `${option.name} (free with ${priced.coupon?.code ?? "your code"})` : option.name).slice(0, 100),
                ...(option.minDays !== null || option.maxDays !== null
                  ? {
                      delivery_estimate: {
                        ...(option.minDays !== null ? { minimum: { unit: "business_day" as const, value: Math.max(1, option.minDays) } } : {}),
                        ...(option.maxDays !== null ? { maximum: { unit: "business_day" as const, value: Math.max(1, option.maxDays) } } : {}),
                      },
                    }
                  : {}),
              },
            },
          ],
        }
      : {}),
    payment_intent_data: {
      application_fee_amount: fee!.platformFeeCents,
      transfer_data: { destination: creator.stripe_account_id },
      metadata: { physical_checkout_id: checkoutId, creator_id: priced.creatorId },
      ...(address
        ? {
            shipping: {
              name: address.name,
              phone: address.phone ?? undefined,
              address: { line1: address.line1, line2: address.line2 ?? undefined, city: address.city, state: address.region ?? undefined, postal_code: address.postalCode ?? undefined, country: address.country },
            },
          }
        : {}),
    },
    success_url: `${input.platformOrigin}/api/physical/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: input.backUrl,
    metadata: {
      physical_checkout_id: checkoutId,
      creator_id: priced.creatorId,
      platform_fee_cents: String(fee!.platformFeeCents),
      plan_used: fee!.planId,
      pricing_tier: fee!.pricingTier ?? "standard",
      fee_rule_version: fee!.feeRuleVersion ?? "",
    },
  }
  try {
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `physical-checkout:${checkoutId}` })
    await db.from("commerce_checkouts").update({ stripe_session_id: session.id, updated_at: new Date().toISOString() }).eq("id", checkoutId)
    await addOrderEvent(db, { checkoutId, creatorId: priced.creatorId, kind: "checkout.started", message: "Checkout started", actor: "buyer", key: `started:${checkoutId}` })
    return { ok: true, url: session.url!, checkoutId, free: false }
  } catch (e) {
    console.error("[physical] Stripe page could not be made:", (e as { code?: string })?.code ?? "")
    await releaseCheckout(db, checkoutId, "failed", "Payment page could not be opened")
    if (holder && priced.coupon) await releaseCouponHold(db, priced.coupon.id, holder)
    return { ok: false, status: 500, error: "Could not start the payment. Try again in a moment." }
  }
}

/** The stock held for a checkout goes back, and the checkout is closed. */
export async function releaseCheckout(db: Db, checkoutId: string, status: "expired" | "failed" | "cancelled", reason: string): Promise<void> {
  await db.rpc("physical_release", { p_checkout: checkoutId, p_reason: status })
  await db
    .from("commerce_checkouts")
    .update({ status, cancel_reason: reason.slice(0, 300), updated_at: new Date().toISOString() })
    .eq("id", checkoutId)
    .eq("status", "pending")
}

/** A Stripe page that expired unpaid. */
export async function expireCheckoutSession(db: Db, session: Pick<Stripe.Checkout.Session, "id" | "metadata">): Promise<void> {
  const checkoutId = session.metadata?.physical_checkout_id
  if (!checkoutId) return
  const { data: c } = await db.from("commerce_checkouts").select("id, status, coupon_id, coupon_holder, stripe_session_id").eq("id", checkoutId).maybeSingle()
  if (!c || c.status !== "pending" || (c.stripe_session_id && c.stripe_session_id !== session.id)) return
  await releaseCheckout(db, checkoutId, "expired", "Payment page expired")
  if (c.coupon_id && c.coupon_holder) await releaseCouponHold(db, c.coupon_id, c.coupon_holder)
}

export function isPhysicalSession(session: Pick<Stripe.Checkout.Session, "metadata" | "mode">): boolean {
  return session.mode === "payment" && typeof session.metadata?.physical_checkout_id === "string" && /^[0-9a-f-]{36}$/i.test(session.metadata.physical_checkout_id)
}

export type CompleteResult =
  | { ok: true; receiptToken: string; sessionFingerprint: string; checkoutId: string; complete: boolean }
  | { ok: false; status: number; reason: "not_found" | "unpaid" | "failed" }

/** From a Stripe session id: the buyer's return and the webhook both come here. */
export async function completeStripeSession(db: Db, sessionId: string, baseUrl: string): Promise<CompleteResult> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { ok: false, status: 400, reason: "not_found" }
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent", "payment_intent.latest_charge"] })
  } catch {
    return { ok: false, status: 404, reason: "not_found" }
  }
  if (!isPhysicalSession(session)) return { ok: false, status: 400, reason: "not_found" }
  if (session.payment_status !== "paid") return { ok: false, status: 409, reason: "unpaid" }
  const pi = session.payment_intent && typeof session.payment_intent === "object" ? (session.payment_intent as Stripe.PaymentIntent) : null
  return completeCheckout(db, {
    checkoutId: session.metadata!.physical_checkout_id,
    sessionId,
    paymentIntentId: pi?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : null),
    facts: pi ? paymentFacts(pi) : null,
    paidTotal: session.amount_total ?? null,
    baseUrl,
    buyerName: session.customer_details?.name ?? null,
  })
}

/**
 * The paid (or free) checkout becomes orders. Safe to call any number of
 * times from any number of places: each line is written once, and what
 * happens once per order is done by the caller that marked it paid.
 */
export async function completeCheckout(
  db: Db,
  c: {
    checkoutId: string
    sessionId: string
    paymentIntentId: string | null
    facts: ReturnType<typeof paymentFacts> | null
    paidTotal?: number | null
    baseUrl: string
    buyerName?: string | null
  },
): Promise<CompleteResult> {
  const { data: co } = await db.from("commerce_checkouts").select("*").eq("id", c.checkoutId).maybeSingle()
  if (!co) return { ok: false, status: 404, reason: "not_found" }
  const lines = (Array.isArray(co.lines) ? co.lines : []) as LineSnapshot[]
  if (lines.length === 0) return { ok: false, status: 422, reason: "failed" }
  const now = new Date().toISOString()
  const fee = c.facts?.applicationFeeCents ?? co.platform_fee_cents ?? 0

  /* Paid, once: the caller whose update changes the row owns the once-per-order work. */
  const { data: flipped } = await db
    .from("commerce_checkouts")
    .update({
      status: "paid",
      paid_at: now,
      stripe_payment_intent_id: c.paymentIntentId,
      stripe_session_id: c.sessionId.startsWith("cs_") ? c.sessionId : co.stripe_session_id,
      session_fingerprint: cartFingerprint(c.sessionId),
      platform_fee_cents: fee,
      updated_at: now,
    })
    .eq("id", c.checkoutId)
    .in("status", ["pending", "expired", "failed"])
    .select("id")
  const owns = Array.isArray(flipped) && flipped.length > 0
  if (!owns && co.status !== "paid") return { ok: false, status: 409, reason: "failed" }
  const sessionId = owns ? c.sessionId : (co.stripe_session_id ?? c.sessionId)
  const fingerprint = cartFingerprint(sessionId)

  if (owns) {
    const { data: sold } = await db.rpc("physical_mark_sold", { p_checkout: c.checkoutId })
    const again = Number((sold as { recommitted?: number } | null)?.recommitted ?? 0)
    await addOrderEvent(db, {
      checkoutId: c.checkoutId,
      creatorId: co.creator_id,
      kind: "payment.paid",
      message: co.provider === "free" ? "Order placed with a code, nothing to pay" : `Payment of ${money(co.total_cents, co.currency)} received`,
      actor: co.provider === "free" ? "buyer" : "webhook",
      key: `paid:${c.checkoutId}`,
    })
    if (again > 0) {
      await addOrderEvent(db, {
        checkoutId: c.checkoutId,
        creatorId: co.creator_id,
        kind: "inventory.recommitted",
        message: "Paid after the stock hold expired. The stock was taken again; check it is still there.",
        key: `recommitted:${c.checkoutId}`,
      })
    }
  }

  /* The lines: price less discount, plus a share of delivery and of added tax. */
  const shippingPaid = Math.max(0, co.shipping_cents - co.shipping_discount_cents)
  const taxIncluded = !!co.shipping_rate?.tax_included
  const addedTax = taxIncluded ? 0 : co.tax_cents
  const itemNet = lines.map((l) => Math.max(0, l.unit_cents * l.quantity - l.discount_cents))
  const shipShares = apportionFee(shippingPaid, lines.map((l, i) => (l.requires_shipping ? Math.max(1, itemNet[i]) : 0)))
  const taxShares = apportionFee(addedTax, lines.map((l, i) => (l.taxable ? Math.max(1, itemNet[i]) : 0)))
  const amounts = lines.map((_, i) => itemNet[i] + (shipShares[i] ?? 0) + (taxShares[i] ?? 0))
  const fees = apportionFee(fee, amounts)
  const origin = (co.origin ?? null) as OrderOrigin | null
  const name = (co.buyer_name || c.buyerName || "").trim()
  const firstName = name ? name.split(/\s+/)[0] : null
  const lastName = name && name.includes(" ") ? name.slice(name.indexOf(" ") + 1) : null

  const created: { index: number; orderId: string; productId: string; amountCents: number }[] = []
  let failed = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const receiptToken = cartReceiptToken(sessionId, i)
    const { data: order, error } = await db
      .from("orders")
      .insert({
        buyer_id: co.buyer_id,
        buyer_first_name: firstName,
        buyer_last_name: lastName,
        buyer_email: co.buyer_email,
        product_id: l.product_id,
        variant_id: l.variant_id,
        amount_cents: amounts[i],
        tip_cents: 0,
        fee_cents: fees[i] ?? 0,
        application_fee_cents: fees[i] ?? 0,
        currency: String(co.currency || "USD").toLowerCase(),
        provider: co.provider === "free" ? "free" : "stripe",
        status: "completed",
        stripe_session_id: sessionId,
        stripe_payment_intent_id: c.paymentIntentId ?? co.stripe_payment_intent_id,
        session_fingerprint: fingerprint,
        receipt_token: receiptToken,
        allowed_fingerprints: [fingerprint],
        payment_method: c.facts?.paymentMethod ?? (co.provider === "free" ? null : "card"),
        card_brand: c.facts?.cardBrand ?? null,
        card_last4: c.facts?.cardLast4 ?? null,
        buyer_country: co.shipping_address?.country ?? null,
        buyer_country_code: co.shipping_address?.country ?? null,
        checkout_id: c.checkoutId,
        quantity: l.quantity,
        unit_price_cents: l.unit_cents,
        shipping_cents: shipShares[i] ?? 0,
        requires_shipping: l.requires_shipping,
        fulfillment_location_id: l.location_id,
        product_snapshot: {
          title: l.title,
          variant_name: l.variant_name,
          sku: l.sku,
          image_url: l.image_url,
          type: l.type,
          unit_cents: l.unit_cents,
          discount_cents: l.discount_cents,
          tax_cents: taxShares[i] ?? 0,
          weight_grams: l.weight_grams,
        },
      })
      .select("id")
      .single()
    if (error?.code === "23505") continue
    if (error || !order) {
      failed++
      console.error("[physical] order line insert failed:", error?.code)
      continue
    }
    created.push({ index: i, orderId: order.id, productId: l.product_id, amountCents: amounts[i] })
    await tagOrderSource(db, order.id, "website", origin)
    await recordOrderAttribution(db, order.id, (co.attribution ?? null) as Attribution | null)
    /* A download in the same cart is the buyer's to keep, as in any basket. */
    if (l.type !== "physical" && co.buyer_id) {
      let q = db.from("entitlements").select("id").eq("buyer_id", co.buyer_id).eq("product_id", l.product_id)
      q = l.variant_id ? q.eq("variant_id", l.variant_id) : q.is("variant_id", null)
      const { data: has } = await q.maybeSingle()
      if (!has) await db.from("entitlements").insert({ buyer_id: co.buyer_id, creator_id: co.creator_id, product_id: l.product_id, variant_id: l.variant_id, community_access: false })
    }
    await db.rpc("increment_product_sales", { p_product_id: l.product_id })
    await db.from("analytics_events").insert({ creator_id: co.creator_id, product_id: l.product_id, event_type: "purchase" })
  }

  const { data: firstOrder } = await db.from("orders").select("id").eq("receipt_token", cartReceiptToken(sessionId, 0)).maybeSingle()
  const firstOrderId: string | null = firstOrder?.id ?? created[0]?.orderId ?? null

  if (owns && firstOrderId) {
    await onceForOrder(db, {
      co,
      created,
      lines,
      firstOrderId,
      sessionId,
      fingerprint,
      paidTotal: c.paidTotal ?? co.total_cents,
      fee,
      destinationPaymentId: c.facts?.destinationPaymentId ?? null,
      baseUrl: c.baseUrl,
      firstName,
      lastName,
      origin,
    })
  }
  return { ok: true, receiptToken: co.receipt_token, sessionFingerprint: fingerprint, checkoutId: c.checkoutId, complete: failed === 0 }
}

function money(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency || "USD").toUpperCase() }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

async function onceForOrder(
  db: Db,
  s: {
    co: Record<string, any>
    created: { index: number; orderId: string; productId: string; amountCents: number }[]
    lines: LineSnapshot[]
    firstOrderId: string
    sessionId: string
    fingerprint: string
    paidTotal: number
    fee: number
    destinationPaymentId: string | null
    baseUrl: string
    firstName: string | null
    lastName: string | null
    origin: OrderOrigin | null
  },
): Promise<void> {
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      console.error(`[physical] ${name} failed for checkout ${s.co.id}:`, e instanceof Error ? e.message : e)
    }
  }
  const co = s.co
  const ctx: FulfilContext = {
    admin: db,
    sessionId: s.sessionId,
    paymentIntentId: co.stripe_payment_intent_id ?? null,
    provider: co.provider === "free" ? "free" : "stripe",
    creatorId: co.creator_id,
    buyerId: co.buyer_id,
    buyerEmail: co.buyer_email,
    buyerFirstName: s.firstName,
    buyerLastName: s.lastName,
    receiptTokenFor: (i) => cartReceiptToken(s.sessionId, i),
    sessionFingerprint: s.fingerprint,
    paymentMethod: null,
    cardBrand: null,
    cardLast4: null,
    device: { country: co.shipping_address?.country ?? null, countryCode: co.shipping_address?.country ?? null, deviceType: null, os: null, browser: null },
    origin: s.origin,
    attribution: co.attribution ?? null,
  }
  await step("customer", () => recordCartCustomer(ctx, s.paidTotal, s.firstOrderId, s.lines[0]?.product_id ?? null))
  if (co.coupon_id) await step("coupon use", () => recordCouponUse(db, co.coupon_id, co.coupon_holder))
  await step("ledger", () => recordSale(db, { creatorId: co.creator_id, orderId: s.firstOrderId, total: s.paidTotal, fee: s.fee, destinationPaymentId: s.destinationPaymentId }))
  await step("order email", () => queueOrderConfirmation(db, co.id, co.creator_id))
  await step("forwarding", () => queueForwarding(db, co.id, co.creator_id))
  await step("notify", () =>
    raiseSaleEvents(db, {
      creatorId: co.creator_id,
      purchase: { orderId: s.firstOrderId, amountCents: s.paidTotal, lineCount: s.lines.length },
      lines: s.created.map((l) => ({ orderId: l.orderId, productId: l.productId, productTitle: s.lines[l.index]?.title ?? null, amountCents: l.amountCents })),
      buyerEmail: co.buyer_email ?? null,
      buyerCountry: co.shipping_address?.country ?? null,
      correlationId: s.sessionId,
    }),
  )
  await step("push", async () => {
    const { data: creator } = await db.from("creators").select("user_id").eq("id", co.creator_id).maybeSingle()
    if (!creator?.user_id) return
    const { notifySale } = await import("@/lib/push/notifications")
    await notifySale(creator.user_id, {
      productName: s.lines.length > 1 ? `${s.lines.length} items` : s.lines[0]?.title ?? "An order",
      amountCents: s.paidTotal,
      orderId: s.firstOrderId,
      productId: s.lines[0]?.product_id,
    })
  })
  const first = s.created.find((l) => l.index === 0) ?? s.created[0]
  if (first) {
    await step("seller email", async () => {
      const sellerEmail = await resolveSellerEmail(db, co.creator_id)
      await sendSellerNotificationEmail(db, {
        orderId: first.orderId,
        creatorId: co.creator_id,
        sellerEmail,
        productTitle: s.lines[first.index]?.title ?? "An order",
        buyerFirstName: s.firstName ?? "",
        buyerLastName: s.lastName ?? "",
        buyerEmail: co.buyer_email ?? "",
        amountCents: first.amountCents,
        feeCents: 0,
        baseUrl: s.baseUrl,
        sale: {
          couponCode: co.coupon_code ?? null,
          lines: s.created.map((l) => ({ orderId: l.orderId, quantity: s.lines[l.index]?.quantity ?? null, discountCents: s.lines[l.index]?.discount_cents ?? 0 })),
        },
      })
    })
  }
}

export type { PricedCheckout }
