import "server-only"
import { sellerStatementName } from "@/lib/payments/statement-name-server"

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
import { apportionFee, chargeUnits } from "@/lib/checkout/cart-items"
import { cartFingerprint, cartReceiptToken } from "@/lib/checkout/cart-tokens"
import { holdCouponUse, holderForEmail, needsHold, releaseCouponHold } from "@/lib/checkout/coupon-holds"
import { claimSale, holdBasket, readLimits, releaseSale, releaseSales } from "@/lib/checkout/sales-limit"
import { SOLD_OUT_REASON, markSoldOut, refundOverLimit } from "@/lib/checkout/sold-out-refund"
import { soldOutMessage } from "@/lib/products/sales-limit"
import { recordCouponUse } from "@/lib/checkout/coupons"
import { paymentFacts, recordSale } from "@/lib/checkout/fulfil-payment"
import { recordCartCustomer, type FulfilContext } from "@/lib/checkout/fulfil-cart-item"
import { beginFollowups, resumeFollowups, type Followups } from "@/lib/checkout/followups"
import { calculatePlatformFeeForCheckout } from "@/lib/billing/platform-fee-server"
import { minimumChargeMinor } from "@/lib/store/selling-currency"
import { readStoreCurrency } from "@/lib/store/selling-currency-server"
import { tagOrderSource, type OrderOrigin } from "@/lib/orders/order-source"
import { recordOrderAttribution, type Attribution } from "@/lib/attribution/server"
import { raiseSaleEvents } from "@/lib/orders/sale-events"
import { resolveSellerEmail, sendSellerNotificationEmail } from "@/lib/email"
import type { Db } from "./auth"
import { priceCheckout, quoteCheckout, readItems, type PricedCheckout } from "./checkout-pricing-server"
import { readAddress } from "./address"
import { DEFAULT_CHECKOUT, type CheckoutConfig } from "@/lib/store/checkout-config"
import { businessFromFields, type BusinessDetails } from "@/lib/checkout/business"
import { isPickupOptionId } from "./pickup"
import { addOrderEvent } from "./events-server"
import { enqueueJob, queueLowStockAlerts, queueOrderConfirmation, queueForwarding } from "./jobs-server"
import { queueShipStation } from "@/lib/integrations/shipping/shipstation-server"
import type { Address, PricedLine } from "./types"
import { checkoutReadyForCreator } from "@/lib/payments/service"
import { statementParams } from "@/lib/payments/platform-descriptor"
import { BUYER_UNAVAILABLE } from "@/lib/payments/stripe/readiness"
import { recordCheckoutStart } from "@/lib/automations/abandoned"
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { lineProperties, physicalCheckoutHref } from "./cart-link"
import { hasUploads } from "@/lib/cart-uploads/rules"
import { cartAttributes, orderNote } from "@/lib/checkout/site-checkout"
import { methodsFrom } from "@/lib/checkout/payment-methods"
import { COD_PAYMENT_METHOD, COD_PROVIDER, codClientKey, codRefusal } from "./cash-on-delivery"
import { phoneForStorage } from "@/lib/account/phone"
import { formatMinor } from "@/lib/markets/money"
import { checkoutMarket } from "@/lib/markets/checkout-market-server"
import { convertOrder, offersInMarket } from "@/lib/markets/checkout-charge"

export const HOLD_MINUTES = 35
const STRIPE_PAGE_MINUTES = 31

export interface StartInput {
  /** A website's checkout: the visitor's country, for the market it charges in (lib/markets/checkout-market-server). Absent: the store's own currency. */
  marketCountry?: string | null
  shopId: string | null
  items: unknown
  couponCode: unknown
  email: unknown
  name?: unknown
  phone?: unknown
  address: unknown
  deliveryOptionId: unknown
  buyerNote?: unknown
  /** An imported theme's cart attributes (lib/checkout/site-checkout cartAttributes): kept on the order (SQL part 164). */
  cartAttributes?: unknown
  clientKey: unknown
  origin: OrderOrigin | null
  attribution: Attribution | null
  buyerId: string | null
  platformOrigin: string
  /** Where the buyer goes back to if they leave Stripe's page. */
  backUrl: string
  /** The store's Settings › Checkout (lib/store/checkout-config); what checkout always did when absent. */
  config?: CheckoutConfig
  /** The signed in buyer has confirmed their email address. */
  buyerEmailConfirmed?: boolean
  /** Ticked "Email me with news and offers". Only read when the store shows the box. */
  emailOptIn?: unknown
  /**
   * Stripe's form inside the checkout page (`ui_mode: "embedded"`) under the
   * shop's own bar, rather than Stripe's hosted page. The page then mounts it
   * with `clientSecret`; the session, its metadata and its completion are
   * the same. The shop's name goes over the form (`shopName`).
   */
  embedded?: boolean
  shopName?: string | null
  /**
   * Storelib's own card form (Stripe's Payment Element) on the website's
   * checkout (app/checkout/site): a PaymentIntent for the total, not a
   * Checkout Session, so no Stripe page is ever shown. The same row, the
   * same stock hold, the same completion (completePhysicalIntent).
   */
  intent?: boolean
  /** The ways to pay the form loaded with (lib/checkout/payment-methods). */
  paymentMethods?: unknown
  /**
   * Paid in cash on delivery (lib/physical/cash-on-delivery.ts): the order is
   * written at once, as a free one is, with no card and no fee, and the
   * seller collects the money when it is delivered or picked up.
   */
  cashOnDelivery?: boolean
  /** Signed in to the website's own customer account (lib/site-accounts), which counts as an account here. */
  buyerSignedIn?: boolean
  /** That account's address, proven by its sign in code: what it already owns is left out (lib/checkout/owned). Never a typed email. */
  ownerEmail?: string | null
  /**
   * "Buying for a business", already checked by the caller (lib/checkout/business checkBusiness) and only where the
   * store offers company invoices: kept on the checkout and written on every order line it becomes, as a basket of
   * downloads keeps it, so the invoice and the seller's copy are made out to the company.
   */
  business?: BusinessDetails | null
  /**
   * The browser's cart id for its pictures, as the server keeps it (lib/cart-uploads/sign visitorHash of the
   * `sl_cart_uid` cookie on the website's host). A line naming an uploaded picture is taken only when the picture is
   * this browser's, for this store; without it (any checkout not on the website's host) such a line is refused.
   */
  cartVisitor?: string | null
}

export type StartResult =
  | { ok: true; url: string; checkoutId: string; free: boolean; cod?: boolean; clientSecret?: string | null; paymentIntentId?: string | null; receiptToken?: string | null }
  | { ok: false; status: number; error: string; field?: string; stock?: { title: string; available: number }[] }

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : ""
}

/** A line as it is kept on the checkout: enough to write its order and show it, nothing a buyer could change (but the words a theme's product form asked them for, its properties). */
function snapshotLine(l: PricedLine, properties?: Record<string, string>) {
  return {
    ...(properties ? { properties } : {}),
    /* The offers in discount_cents, each with its part and the name the checkout showed it by: the receipt and the admin say the same. */
    ...(l.offers?.length ? { offers: l.offers.map((o) => ({ offer_id: o.offerId, title: o.title.slice(0, 120), kind: o.kind, saved_cents: o.savedCents, ...(o.tier !== undefined ? { tier: o.tier } : {}) })) } : {}),
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
    fulfillment_method: l.fulfillmentMethod,
  }
}
export type LineSnapshot = ReturnType<typeof snapshotLine>

/** The properties the buyer's cart gave a priced line (the first line of the same product and option that had any). */
function propertiesFor(items: unknown, l: PricedLine): Record<string, string> | undefined {
  if (!Array.isArray(items)) return undefined
  for (const raw of items.slice(0, 50)) {
    const r = raw as { productId?: unknown; variantId?: unknown; properties?: unknown } | null
    if (r?.productId === l.productId && (r.variantId ?? null) === (l.variantId ?? null)) {
      const p = lineProperties(r.properties)
      if (p) return p
    }
  }
  return undefined
}

export async function startCheckout(db: Db, input: StartInput): Promise<StartResult> {
  const config = input.config ?? DEFAULT_CHECKOUT
  /* Settings › Checkout, checked here as well as on the page: an account first, and a confirmed one. */
  if (config.requireAccount && !input.buyerId && !input.buyerSignedIn) return { ok: false, status: 401, error: "Sign in or create an account to check out.", field: "account" }
  if (config.requireConfirmedEmail && !input.buyerEmailConfirmed) return { ok: false, status: 403, error: "Confirm your email address to check out. We sent you a link when you signed up.", field: "account" }
  const email = clean(input.email, 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, status: 400, error: "Enter your email address.", field: "email" }
  const clientKey = clean(input.clientKey, 120)
  if (clientKey.length < 8) return { ok: false, status: 400, error: "Refresh the page and try again." }
  /*
    PLACE ORDER AGAIN, after an answer that never arrived: the cash order the
    first press placed, found before the cart is priced. Priced first, a press
    that had taken the last units read "only 0 left" for an order already on
    its way.
  */
  if (input.cashOnDelivery === true && input.shopId) {
    const { data: placed } = await db.from("commerce_checkouts").select("id, status, receipt_token").eq("creator_id", input.shopId).eq("client_key", codClientKey(clientKey)).maybeSingle()
    if (placed?.status === "paid" && placed.receipt_token) {
      return { ok: true, url: `${input.platformOrigin}/checkout/physical/order/${encodeURIComponent(placed.receipt_token as string)}`, checkoutId: placed.id as string, free: false, cod: true, receiptToken: placed.receipt_token as string }
    }
  }

  /* THE BUYER'S PICTURES ON THE LINES (lib/cart-uploads): each must be this browser's own upload to this store. One copied from another cart or store stops here. */
  const anyFiles = Array.isArray(input.items) && input.items.slice(0, 50).some((i) => hasUploads(lineProperties((i as { properties?: unknown } | null)?.properties)))
  const fileIds: string[] = []
  if (anyFiles) {
    const { checkLineFiles } = await import("@/lib/cart-uploads/store")
    const files = checkLineFiles(input.items, { creatorId: input.shopId, visitorHash: input.cartVisitor ?? null })
    if (files.ok === false) return { ok: false, status: 409, error: (files as { error: string }).error }
    fileIds.push(...(files as { ids: string[] }).ids)
  }

  const items = readItems(input.items)
  const priced = await priceCheckout(db, { items, couponCode: input.couponCode, buyerId: input.buyerId, buyerEmail: email, ownerEmail: input.ownerEmail ?? null, shopId: input.shopId })
  if (priced.ok === false) return { ok: false, status: priced.status, error: priced.error }
  /* Never paid for without its option: the checkout asks for it on the line. */
  if (priced.needsOption?.length) return { ok: false, status: 409, error: `Choose an option for ${priced.needsOption[0].title}.` }
  if (priced.stockIssues.length) {
    return {
      ok: false,
      status: 409,
      error: priced.stockIssues.length === 1 ? `${priced.stockIssues[0].title} has only ${priced.stockIssues[0].available} left.` : "Some items no longer have enough stock.",
      stock: priced.stockIssues.map((s) => ({ title: s.title, available: s.available })),
    }
  }
  if (priced.lines.length === 0) return { ok: false, status: 400, error: priced.dropped.length ? `${priced.dropped[0]} can't be bought right now.` : "Your cart is empty." }

  /* Picked up: no delivery address, the pickup point is where it is handed over. */
  const wantsPickup = priced.requiresShipping && isPickupOptionId(input.deliveryOptionId)
  let address: Address | null = null
  if (priced.requiresShipping && !wantsPickup) {
    const read = readAddress(input.address, config)
    if (read.ok === false) return { ok: false, status: 400, error: read.error, field: read.field }
    address = read.address
  }
  if (wantsPickup && !clean(input.name, 200)) return { ok: false, status: 400, error: "Enter the name the order is under.", field: "name" }
  if (wantsPickup && config.nameFields === "first_and_last" && !/\S+\s+\S+/.test(clean(input.name, 200))) return { ok: false, status: 400, error: "Enter your first and last name.", field: "name" }
  if (wantsPickup && config.phone === "required" && !clean(input.phone, 40)) return { ok: false, status: 400, error: "Enter a phone number for the pickup.", field: "phone" }
  /* The phone outside an address (a pickup, a thing handed over): kept as E.164 when written with its code, refused when it is not a number at all. */
  const ownPhone = config.phone === "off" ? "" : clean(input.phone, 40)
  if (ownPhone && !phoneForStorage(ownPhone)) return { ok: false, status: 400, error: "Check the phone number.", field: "phone" }
  /* Paying on delivery, in a shop that takes it: its fee is in the total from the start, as the page showed it (Settings › Checkout). */
  const wantsCod = input.cashOnDelivery === true && config.cashOnDelivery
  let q = await quoteCheckout(db, priced, address, input.deliveryOptionId, { codFeeCents: wantsCod ? config.codFeeCents : 0 })
  /* A cart with nothing to pay is placed free, and a fee alone is never charged for it. */
  if (q.totals.codFeeCents > 0 && q.totals.itemsSubtotalCents - q.totals.discountCents + q.totals.shippingCents - q.totals.shippingDiscountCents <= 0) {
    q = await quoteCheckout(db, priced, address, input.deliveryOptionId)
  }
  if (priced.requiresShipping) {
    if (wantsPickup) {
      if (q.option?.kind !== "pickup") return { ok: false, status: 409, error: "Pickup isn't available for everything in your cart any more. Choose shipping instead." }
    } else {
      if (q.quote.ok === false) return { ok: false, status: 400, error: q.quote.error, field: "country" }
      if (!q.option) return { ok: false, status: 400, error: "Shipping isn't available to this address. Try another address or local pickup.", field: "country" }
      if (typeof input.deliveryOptionId === "string" && q.option.id !== input.deliveryOptionId) {
        return { ok: false, status: 409, error: "Delivery prices changed. Check the delivery option and pay again." }
      }
    }
  }
  /*
    A WEBSITE'S CHECKOUT IN THE VISITOR'S MARKET (lib/markets/checkout-market-
    server): the currency its pages showed them, when Storelib can charge it.
    Every line, the delivery and the totals are converted as the page's quote
    converted them (lib/markets/checkout-charge), and the order is kept in it.
  */
  const market = input.marketCountry !== undefined ? await checkoutMarket(priced.creatorId, input.marketCountry, db) : null
  if (market?.charge) {
    const charge = market.charge
    const converted = convertOrder(q.lines, q.totals, charge)
    /* Each offer's part of a line in the market's money too, as the quote converted the saving lines it showed. */
    const lines = converted.lines.map((l, i) => (l.offers?.length ? { ...l, offers: offersInMarket(l.offers, q.lines[i].discountCents, l.discountCents) } : l))
    q = { ...q, lines, totals: converted.totals, option: q.option ? { ...q.option, priceCents: charge.amount(q.option.priceCents) } : q.option }
  }
  const totals = q.totals
  const pickup = q.option?.kind === "pickup" ? (q.option.pickup ?? null) : null

  const { data: creator } = await db
    .from("creators")
    .select("id, user_id, display_name, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled, statement_descriptor")
    .eq("id", priced.creatorId)
    .maybeSingle()
  if (!creator) return { ok: false, status: 404, error: "Shop not found." }

  const free = totals.totalCents === 0
  /* The store's own currency (Settings › Country & Currency): what every price in the cart is in, and what the card is charged in. Read straight from the database, never a cached copy, so a store that has just changed it is never charged in the old one. */
  const ownCurrency = (await readStoreCurrency(db, priced.creatorId)).currency
  /* What the card is charged in: the market's when it charges it, else the store's own. */
  const storeCurrency = market?.charge ? market.chargeCurrency : ownCurrency
  /*
    CASH ON DELIVERY (lib/physical/cash-on-delivery.ts): the shop has it on,
    everything in the cart is delivered or picked up, and there is something
    to pay. No card is asked for, so neither the card minimum nor the
    seller's card payments being ready stand in the way: the money is the
    seller's to collect.
  */
  const cod = input.cashOnDelivery === true && !free
  if (cod) {
    const why = codRefusal({ enabled: config.cashOnDelivery, lines: q.lines, requiresShipping: priced.requiresShipping, totalCents: totals.totalCents, countries: config.codCountries, country: pickup ? null : (address?.country ?? null) })
    if (why) return { ok: false, status: 409, error: why }
  }
  if (!free && !cod && totals.totalCents < minimumChargeMinor(storeCurrency)) return { ok: false, status: 400, error: `The smallest card payment is ${money(minimumChargeMinor(storeCurrency), storeCurrency)}.` }
  /* Storelib's one readiness rule (lib/payments/stripe/readiness); the buyer is told nothing about the seller's verification. */
  if (!free && !cod && (!creator.stripe_account_id || !String(creator.stripe_account_id).startsWith("acct_") || !(await checkoutReadyForCreator(creator.id as string)))) {
    return { ok: false, status: 409, error: BUYER_UNAVAILABLE }
  }
  /* Paid on delivery, its own row: a card checkout for the same cart is let go, so its stock hold does not sit beside this one. */
  const rowKey = cod ? codClientKey(clientKey) : clientKey
  if (cod) {
    const { data: card } = await db.from("commerce_checkouts").select("id, status, stripe_payment_intent_id, stripe_session_id").eq("creator_id", priced.creatorId).eq("client_key", clientKey).maybeSingle()
    if (card?.status === "paid") return { ok: false, status: 409, error: "This order has already been paid." }
    if (card?.status === "pending") {
      /*
        Its card payment is stopped at Stripe first, as Change does (abandonCheckout).
        Let go without that, a card the bank charged a moment ago, whose answer had
        not reached the page, was charged with no order behind it: its webhook finds
        the checkout cancelled. One Stripe will not cancel is left to finish.
      */
      const letGo = card.stripe_payment_intent_id || card.stripe_session_id
        ? await abandonCheckout(db, { shopId: priced.creatorId, clientKey })
        : (await releaseCheckout(db, card.id as string, "cancelled", "Paying in cash on delivery instead"), true)
      if (!letGo) return { ok: false, status: 409, error: "A card payment for this order is still going through. Wait a moment and refresh the page: if it went through, your order is placed." }
    }
  }

  /* The same press again: the checkout it made, and its page while it is open. */
  const { data: existing } = await db
    .from("commerce_checkouts")
    .select("id, status, stripe_session_id, stripe_payment_intent_id, total_cents, currency, expires_at, receipt_token")
    .eq("creator_id", priced.creatorId)
    .eq("client_key", rowKey)
    .maybeSingle()
  /* Place order pressed twice: the order the first press placed. */
  if (existing && cod && existing.status === "paid" && existing.receipt_token) {
    return { ok: true, url: `${input.platformOrigin}/checkout/physical/order/${encodeURIComponent(existing.receipt_token as string)}`, checkoutId: existing.id as string, free: false, cod: true, receiptToken: existing.receipt_token as string }
  }
  if (existing) {
    if (existing.status === "paid") return { ok: false, status: 409, error: "This order has already been paid." }
    /* Reused only while it is still the same amount in the same currency: a store that changed its currency since never takes the old payment. */
    const sameMoney = existing.total_cents === totals.totalCents && String(existing.currency ?? "").toUpperCase() === storeCurrency
    /* The card form's second press (a declined card, a bank's check abandoned): the same payment, while it can still be paid. */
    if (input.intent && existing.status === "pending" && existing.stripe_payment_intent_id && sameMoney && new Date(existing.expires_at).getTime() > Date.now()) {
      try {
        const pi = await stripe.paymentIntents.retrieve(existing.stripe_payment_intent_id)
        if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.status) && pi.client_secret && pi.currency === storeCurrency.toLowerCase() && pi.amount === totals.totalCents) {
          return { ok: true, url: "", clientSecret: pi.client_secret, paymentIntentId: pi.id, checkoutId: existing.id, free: false }
        }
      } catch {
        /* Made again below under a new key. */
      }
    }
    if (existing.status === "pending" && existing.stripe_session_id && sameMoney) {
      try {
        const s = await stripe.checkout.sessions.retrieve(existing.stripe_session_id)
        if (s.status === "open" && (s.url || s.client_secret)) return { ok: true, url: s.url ?? "", clientSecret: s.client_secret ?? null, checkoutId: existing.id, free: false }
      } catch {
        /* Made again below under a new key. */
      }
    }
    return { ok: false, status: 409, error: "Refresh the page and try again." }
  }

  const chargeCurrency = storeCurrency.toLowerCase()
  let fee: Awaited<ReturnType<typeof calculatePlatformFeeForCheckout>> | null = null
  /* No fee on cash on delivery: nothing passes through Storelib to take it from. */
  if (!free && !cod) {
    try {
      fee = await calculatePlatformFeeForCheckout(totals.totalCents, priced.creatorId, db, chargeCurrency)
    } catch {
      return { ok: false, status: 400, error: "This currency is not available for checkout yet." }
    }
  }

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000)
  const receiptToken = randomBytes(24).toString("base64url")
  /* How the tax was worked out, kept so each order line carries its own share of it (completeCheckout taxSharesOf). */
  const taxFacts = { tax_rate_bps: totals.taxRateBps, tax_included: totals.taxIncluded, tax_label: totals.taxLabel, tax_on_shipping: priced.tax.taxOnShipping === true, tax_digital: priced.tax.digital === true, ...(totals.taxCents > 0 && q.taxCountry && /^[A-Z]{2}$/i.test(q.taxCountry) ? { tax_country: q.taxCountry.toUpperCase() } : {}) }
  const option = q.option
  const { data: checkout, error: insertError } = await db
    .from("commerce_checkouts")
    .insert({
      creator_id: priced.creatorId,
      buyer_id: input.buyerId,
      buyer_email: email,
      buyer_name: clean(input.name, 200) || address?.name || null,
      buyer_phone: phoneForStorage(ownPhone) || address?.phone || null,
      status: "pending",
      fulfillment_status: priced.requiresShipping ? "unfulfilled" : "not_required",
      delivery_method: !priced.requiresShipping ? "none" : pickup ? "pickup" : "ship",
      pickup_location_id: pickup?.locationId ?? null,
      pickup: pickup ? { location_id: pickup.locationId, name: pickup.name, address: pickup.address, instructions: pickup.instructions, ready: pickup.ready, hours: pickup.hours ?? null } : null,
      currency: chargeCurrency.toUpperCase(),
      items_subtotal_cents: totals.itemsSubtotalCents,
      discount_cents: totals.discountCents,
      /* Cash on delivery's fee is paid with delivery: in the delivery charge, so every total that adds it up still does, and named in shipping_rate.cod_fee_cents. */
      shipping_cents: totals.shippingCents + totals.codFeeCents,
      shipping_discount_cents: totals.shippingDiscountCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
      platform_fee_cents: fee?.platformFeeCents ?? 0,
      shipping_address: address,
      shipping_rate: option
        ? { id: option.id, name: option.name, kind: option.kind ?? "ship", price_cents: option.priceCents, min_days: option.minDays, max_days: option.maxDays, rate_ids: option.rateIds, ...taxFacts, ...(option.local ? { local_location_id: option.local.locationId, local_note: option.local.note } : {}), ...(totals.codFeeCents > 0 ? { cod_fee_cents: totals.codFeeCents } : {}) }
        : { ...taxFacts, ...(totals.codFeeCents > 0 ? { cod_fee_cents: totals.codFeeCents } : {}) },
      /* Each line with its own properties (a line of its own per set, lib/physical/checkout-pricing-server readItems); a line priced without them takes the cart's first for its option. */
      lines: q.lines.map((l) => snapshotLine(l, l.properties ?? propertiesFor(input.items, l))),
      coupon_id: priced.coupon?.id ?? null,
      coupon_code: priced.coupon?.code ?? null,
      provider: free ? "free" : cod ? COD_PROVIDER : "stripe",
      client_key: rowKey,
      receipt_token: receiptToken,
      origin: input.origin,
      attribution: input.attribution,
      /* Its line breaks kept (orderNote): clean() runs every space together, and a two line gift message read as one. */
      buyer_note: orderNote(input.buyerNote),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single()
  if (insertError || !checkout) {
    if (insertError?.code === "23505") {
      /* Place order pressed twice at once: the other press wrote it first. Its order, when it is placed, rather than an error. */
      if (cod) {
        for (let i = 0; i < 3; i++) {
          const { data: won } = await db.from("commerce_checkouts").select("id, status, receipt_token").eq("creator_id", priced.creatorId).eq("client_key", rowKey).maybeSingle()
          if (won?.status === "paid" && won.receipt_token) {
            return { ok: true, url: `${input.platformOrigin}/checkout/physical/order/${encodeURIComponent(won.receipt_token as string)}`, checkoutId: won.id as string, free: false, cod: true, receiptToken: won.receipt_token as string }
          }
          if (won && won.status !== "pending") break
          await new Promise((r) => setTimeout(r, 400))
        }
      }
      return { ok: false, status: 409, error: "Refresh the page and try again." }
    }
    /* The database has not taken SQL part 174 yet: its provider check refuses "cod". */
    if (cod && insertError?.code === "23514") return { ok: false, status: 503, error: "Cash on delivery isn't available on this shop yet. Pay by card instead." }
    console.error("[physical] checkout insert failed:", insertError?.code)
    return { ok: false, status: insertError?.code === "42P01" ? 503 : 500, error: insertError?.code === "42P01" ? "This shop is not ready to sell physical products yet." : "Could not start the checkout." }
  }
  const checkoutId = checkout.id as string
  /*
    The news box, ticked: kept on the checkout so the paid order records a
    yes (recordCartCustomer, "ticked"). Written apart from the insert, so a
    database without SQL part 109's column only loses the yes, never the
    checkout.
  */
  /* The company the buyer bought for, the same way: a database without SQL part 259's column loses it, never the checkout. Before the order can be placed below (a free or cash order is completed in this same call). */
  const business = input.business ? businessFromFields(input.business) : null
  if (business) {
    const { error: businessError } = await db.from("commerce_checkouts").update({ business_details: business }).eq("id", checkoutId)
    if (businessError) console.warn("[physical] company details not kept on the checkout:", businessError.code)
  }
  /* The pictures this checkout takes, said on their rows (lib/cart-uploads/store claimUploads), so the daily sweep asks how it ended before it removes anything. */
  if (fileIds.length && input.cartVisitor) {
    const { claimUploads } = await import("@/lib/cart-uploads/store")
    await claimUploads(db as never, { creatorId: priced.creatorId, visitorHash: input.cartVisitor, checkoutId, ids: fileIds }).catch(() => undefined)
  }
  /* The cart's attributes, the same way: a database without SQL part 164's column loses them, never the checkout. */
  const attributes = cartAttributes(input.cartAttributes)
  if (attributes) {
    const { error: attrError } = await db.from("commerce_checkouts").update({ cart_attributes: attributes }).eq("id", checkoutId)
    if (attrError) console.warn("[physical] cart attributes not kept:", attrError.code)
  }
  if (config.marketingOptIn && input.emailOptIn === true) {
    const { error: optError } = await db.from("commerce_checkouts").update({ email_opt_in: true }).eq("id", checkoutId)
    if (optError) console.warn("[physical] news consent not kept:", optError.code)
  }

  /* The stock, all lines or none (a pickup holds it at the pickup point). */
  const holds = q.lines
    .filter((l) => l.type === "physical" && l.trackInventory && l.variantId && l.locationId)
    .map((l) => ({ variant_id: l.variantId, location_id: l.locationId, quantity: l.quantity, oversell: l.inventoryPolicy === "continue" }))
  if (holds.length) {
    const { error: holdError } = await db.rpc("physical_reserve", { p_checkout: checkoutId, p_lines: holds, p_expires: expiresAt.toISOString() })
    if (holdError) {
      await db.from("commerce_checkouts").update({ status: "failed", cancel_reason: "Out of stock", updated_at: new Date().toISOString() }).eq("id", checkoutId)
      const m = /^out_of_stock:([0-9a-f-]{36}):(\d+)/.exec(holdError.message ?? "")
      if (m) {
        const line = q.lines.find((l) => l.variantId === m[1])
        const title = line ? (line.variantName ? `${line.title}, ${line.variantName}` : line.title) : "An item"
        return { ok: false, status: 409, error: `${title} has only ${m[2]} left.`, stock: [{ title, available: Number(m[2]) }] }
      }
      console.error("[physical] hold failed:", holdError.code)
      return { ok: false, status: 500, error: "Could not hold the stock. Try again in a moment." }
    }
  }

  /*
    LIMIT SALES: a download in the cart with a sales limit holds its copy
    while the page is open, in one locked step, by the buyer's address
    (lib/checkout/sales-limit). The address is on the checkout, so
    releaseCheckout gives the copy back whenever the checkout closes unpaid.
  */
  const digitalLines = q.lines.filter((l) => l.type !== "physical")
  if (digitalLines.length) {
    const limits = await readLimits(db, digitalLines.map((l) => l.productId))
    if (limits.size) {
      const copies = await holdBasket(db, digitalLines.map((l) => ({ productId: l.productId, quantity: l.quantity, title: l.title })), [...limits.keys()], holderForEmail(email))
      if (copies.ok === false) {
        await releaseCheckout(db, checkoutId, "cancelled", "Sold out")
        return { ok: false, status: 409, error: soldOutMessage(copies.title) }
      }
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

  if (free || cod) {
    const done = await completeCheckout(db, { checkoutId, sessionId: `${cod ? "cod" : "free"}_${randomBytes(18).toString("base64url")}`, paymentIntentId: null, facts: null, baseUrl: input.platformOrigin })
    if (!done.ok) {
      /* A cash order that could not be written lets go of what it held, as an unpaid card checkout does. */
      if (cod) {
        await releaseCheckout(db, checkoutId, "failed", "The order could not be saved")
        /* And the place its code held, so pressing Place order again can take it. */
        if (holder && priced.coupon) await releaseCouponHold(db, priced.coupon.id, holder)
      }
      return { ok: false, status: 500, error: "The order could not be saved. Try again in a moment." }
    }
    return { ok: true, url: `${input.platformOrigin}/checkout/physical/order/${encodeURIComponent(receiptToken)}`, checkoutId, free: !cod, cod, receiptToken }
  }

  if (input.intent) {
    return startPhysicalIntent(db, { checkoutId, priced, totals, address, fee: fee!, creator, chargeCurrency, methods: input.paymentMethods, holder, receiptToken })
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = q.lines.flatMap((l) =>
    chargeUnits({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, priceCents: l.unitCents, discountCents: l.discountCents }).map((part) => ({
      quantity: part.quantity,
      price_data: {
        currency: chargeCurrency,
        unit_amount: part.unitCents,
        product_data: {
          name: (l.variantName ? `${l.title} (${l.variantName})` : l.title).slice(0, 250),
          ...(l.discountCents > 0 ? { description: `${money(l.discountCents, chargeCurrency)} off${priced.coupon ? ` with ${priced.coupon.code}` : priced.offers.length ? `, ${priced.offers.map((o) => o.title).join(", ")}`.slice(0, 200) : ""}` } : {}),
          ...(l.imageUrl && /^https:\/\//.test(l.imageUrl) ? { images: [l.imageUrl] } : {}),
        },
      },
    })),
  )
  if (totals.taxCents > 0 && !totals.taxIncluded) {
    /* Named as Settings › Taxes names it, "VAT 19%", on Stripe's page as on the receipt. */
    lineItems.push({ quantity: 1, price_data: { currency: chargeCurrency, unit_amount: totals.taxCents, product_data: { name: totals.taxLabel || "Tax" } } })
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
                ...(option.kind !== "pickup" && (option.minDays !== null || option.maxDays !== null)
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
      /* Settings › Payments' name on the statement, as the digital and basket checkouts already put it (lib/payments/platform-descriptor). */
      ...statementParams({
        account: String(creator.stripe_account_id),
        descriptor: (await sellerStatementName(db, creator.id as string)) || (creator as { statement_descriptor?: string | null }).statement_descriptor || (creator.display_name as string | null) || "",
        chargesEnabled: creator.charges_enabled as boolean | null,
      }),
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
    /* Inside the checkout page, Stripe sends the whole page on once paid and Back is the page's own; its hosted page keeps a back link. */
    ...(input.embedded
      ? {
          ui_mode: "embedded" as const,
          return_url: `${input.platformOrigin}/api/physical/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
          branding_settings: { display_name: (input.shopName || creator.display_name || "Checkout").slice(0, 100), font_family: "inter" as const, border_style: "rounded" as const, button_color: "#1a1a2e" },
        }
      : {
          success_url: `${input.platformOrigin}/api/physical/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: input.backUrl,
        }),
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
    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.create(params, { idempotencyKey: `physical-checkout:${checkoutId}` })
    } catch (e) {
      /* Two optional parts Stripe may refuse, each dropped on its own (a new key, as the parameters differ):
         the shop's name over the form is a nicety, and a refused statement part sells on Storelib's own line, as the basket does. */
      const said = `${(e as Error)?.message ?? ""} ${(e as { param?: string })?.param ?? ""}`
      const branding = !!params.branding_settings && /branding_settings/i.test(said)
      const statement = !!params.payment_intent_data && /statement_descriptor|on_behalf_of/i.test(said)
      if (!branding && !statement) throw e
      if (branding) delete params.branding_settings
      if (statement && params.payment_intent_data) {
        delete params.payment_intent_data.statement_descriptor_suffix
        delete params.payment_intent_data.on_behalf_of
      }
      session = await stripe.checkout.sessions.create(params, { idempotencyKey: `physical-checkout:${checkoutId}:plain` })
    }
    await db.from("commerce_checkouts").update({ stripe_session_id: session.id, updated_at: new Date().toISOString() }).eq("id", checkoutId)
    await addOrderEvent(db, { checkoutId, creatorId: priced.creatorId, kind: "checkout.started", message: "Checkout started", actor: "buyer", key: `started:${checkoutId}` })
    /*
      Settings › Checkout › Abandoned checkouts: the cart reached Pay with an
      address, written down as the single product checkout writes its own
      (lib/automations/abandoned), one start per Stripe page, with the way
      back to this checkout and its items. The hourly sweep reminds them an
      hour later only if no order came of it and they ticked the news box or
      are on the list. Off, nothing is written.
    */
    if (config.abandonedRecovery) {
      await recordCheckoutStart(db, {
        creatorId: priced.creatorId,
        productId: q.lines[0].productId,
        variantId: q.lines[0].variantId,
        productTitle: q.lines.length > 1 ? `${q.lines[0].title} and ${q.lines.length - 1} more` : q.lines[0].title,
        email,
        firstName: (clean(input.name, 200) || address?.name || "").split(/\s+/)[0] || null,
        paymentIntentId: session.id,
        optedIn: config.marketingOptIn && input.emailOptIn === true,
        source: contactSourceOfOrder(input.origin, q.lines[0].productId),
        returnPath: physicalCheckoutHref(priced.creatorId, q.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })), input.backUrl),
      }).catch(() => false)
    }
    return { ok: true, url: session.url ?? "", clientSecret: session.client_secret ?? null, checkoutId, free: false }
  } catch (e) {
    console.error("[physical] Stripe page could not be made:", (e as { code?: string })?.code ?? "")
    await releaseCheckout(db, checkoutId, "failed", "Payment page could not be opened")
    if (holder && priced.coupon) await releaseCouponHold(db, priced.coupon.id, holder)
    return { ok: false, status: 500, error: "Could not start the payment. Try again in a moment." }
  }
}

/**
 * The payment for a held checkout, made for Storelib's own card form: a
 * destination charge for the server's total, the delivery address on it, and
 * the checkout's id in its metadata (`physical_intent`, so a Checkout
 * Session's own PaymentIntent, which carries the id too, is never completed
 * twice by two routes). Once per checkout, by an idempotency key.
 */
async function startPhysicalIntent(
  db: Db,
  c: {
    checkoutId: string
    priced: Extract<PricedCheckout, { ok: true }>
    totals: { totalCents: number }
    address: Address | null
    fee: Awaited<ReturnType<typeof calculatePlatformFeeForCheckout>>
    creator: Record<string, unknown>
    chargeCurrency: string
    methods: unknown
    holder: string | null
    receiptToken: string
  },
): Promise<StartResult> {
  const account = String(c.creator.stripe_account_id)
  const params: Stripe.PaymentIntentCreateParams = {
    amount: c.totals.totalCents,
    currency: c.chargeCurrency,
    payment_method_types: methodsFrom(c.methods),
    application_fee_amount: c.fee.platformFeeCents,
    transfer_data: { destination: account },
    ...statementParams({
      account,
      descriptor: (c.creator.statement_descriptor as string | null) || (c.creator.display_name as string | null) || "",
      chargesEnabled: c.creator.charges_enabled as boolean | null,
    }),
    metadata: {
      physical_checkout_id: c.checkoutId,
      physical_intent: "1",
      creator_id: c.priced.creatorId,
      platform_fee_cents: String(c.fee.platformFeeCents),
      plan_used: c.fee.planId,
      pricing_tier: c.fee.pricingTier ?? "standard",
      fee_rule_version: c.fee.feeRuleVersion ?? "",
    },
    ...(c.address
      ? {
          shipping: {
            name: c.address.name,
            phone: c.address.phone ?? undefined,
            address: { line1: c.address.line1, line2: c.address.line2 ?? undefined, city: c.address.city, state: c.address.region ?? undefined, postal_code: c.address.postalCode ?? undefined, country: c.address.country },
          },
        }
      : {}),
  }
  try {
    let pi: Stripe.PaymentIntent
    try {
      pi = await stripe.paymentIntents.create(params, { idempotencyKey: `physical-intent:${c.checkoutId}` })
    } catch (e) {
      /* A refused statement part sells on Storelib's own line, as everywhere else (lib/payments/platform-descriptor). */
      const said = `${(e as Error)?.message ?? ""} ${(e as { param?: string })?.param ?? ""}`
      if (!/statement_descriptor|on_behalf_of/i.test(said) || (!params.statement_descriptor_suffix && !params.on_behalf_of)) throw e
      delete params.statement_descriptor_suffix
      delete params.on_behalf_of
      pi = await stripe.paymentIntents.create(params, { idempotencyKey: `physical-intent:${c.checkoutId}:plain` })
    }
    await db.from("commerce_checkouts").update({ stripe_payment_intent_id: pi.id, updated_at: new Date().toISOString() }).eq("id", c.checkoutId)
    await addOrderEvent(db, { checkoutId: c.checkoutId, creatorId: c.priced.creatorId, kind: "checkout.started", message: "Checkout started", actor: "buyer", key: `started:${c.checkoutId}` })
    return { ok: true, url: "", clientSecret: pi.client_secret, paymentIntentId: pi.id, checkoutId: c.checkoutId, free: false, receiptToken: c.receiptToken }
  } catch (e) {
    console.error("[physical] payment could not be made:", (e as { code?: string })?.code ?? "")
    await releaseCheckout(db, c.checkoutId, "failed", "Payment could not be started")
    if (c.holder && c.priced.coupon) await releaseCouponHold(db, c.priced.coupon.id, c.holder)
    return { ok: false, status: 500, error: "Could not start the payment. Try again in a moment." }
  }
}

export function isPhysicalIntent(pi: Pick<Stripe.PaymentIntent, "metadata">): boolean {
  return pi.metadata?.physical_intent === "1" && typeof pi.metadata?.physical_checkout_id === "string" && /^[0-9a-f-]{36}$/i.test(pi.metadata.physical_checkout_id)
}

/**
 * A checkout paid in Storelib's own form becomes orders: from the buyer's
 * browser (with the client secret only that page holds) and from the
 * payment_intent.succeeded webhook, whichever comes first, each line once
 * (completeCheckout). The PaymentIntent's id groups its lines.
 */
export async function completePhysicalIntent(db: Db, paymentIntentId: string, baseUrl: string, clientSecret?: string | null): Promise<CompleteResult> {
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return { ok: false, status: 400, reason: "not_found" }
  let pi: Stripe.PaymentIntent
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge", "latest_charge.transfer"] })
  } catch (e) {
    const code = (e as { statusCode?: number; type?: string })?.statusCode
    if (code === 404 || (e as { type?: string })?.type === "StripeInvalidRequestError") return { ok: false, status: 404, reason: "not_found" }
    return { ok: false, status: 503, reason: "failed" }
  }
  if (clientSecret !== undefined) {
    const { sameSecret } = await import("@/lib/checkout/fulfil-payment")
    if (!sameSecret(pi.client_secret, clientSecret)) return { ok: false, status: 404, reason: "not_found" }
  }
  if (!isPhysicalIntent(pi)) return { ok: false, status: 400, reason: "not_found" }
  if (pi.status !== "succeeded") return { ok: false, status: 409, reason: "unpaid" }
  return completeCheckout(db, {
    checkoutId: pi.metadata.physical_checkout_id,
    sessionId: pi.id,
    paymentIntentId: pi.id,
    facts: paymentFacts(pi),
    paidTotal: pi.amount_received || pi.amount,
    baseUrl,
  })
}

/** The stock held for a checkout goes back, and the checkout is closed. */
export async function releaseCheckout(db: Db, checkoutId: string, status: "expired" | "failed" | "cancelled", reason: string): Promise<void> {
  await db.rpc("physical_release", { p_checkout: checkoutId, p_reason: status })
  await releaseDownloadCopies(db, checkoutId)
  await db
    .from("commerce_checkouts")
    .update({ status, cancel_reason: reason.slice(0, 300), updated_at: new Date().toISOString() })
    .eq("id", checkoutId)
    .eq("status", "pending")
}

/** The copies a checkout's limited downloads held (startCheckout), given back. Never throws. */
async function releaseDownloadCopies(db: Db, checkoutId: string): Promise<void> {
  try {
    const { data: co } = await db.from("commerce_checkouts").select("status, buyer_email, lines").eq("id", checkoutId).maybeSingle()
    if (!co || co.status === "paid" || !co.buyer_email) return
    const ids = ((Array.isArray(co.lines) ? co.lines : []) as LineSnapshot[]).filter((l) => l.type !== "physical").map((l) => l.product_id)
    await releaseSales(db, ids, holderForEmail(String(co.buyer_email)))
  } catch {
    /* they lapse on their own */
  }
}

/**
 * The buyer went back from the payment form to change the address or the
 * delivery: the checkout this tab made (its own random key, which only this
 * tab holds) gives its stock and its code's place back at once, rather than
 * when the form would have expired, so the next press can hold them again.
 * Its Stripe session is expired first, so it can never be paid afterwards;
 * a session Stripe will not expire (paid that very moment) is left alone.
 */
export async function abandonCheckout(db: Db, input: { shopId: string | null; clientKey: unknown }): Promise<boolean> {
  const clientKey = clean(input.clientKey, 120)
  if (!input.shopId || clientKey.length < 8) return false
  const { data: c } = await db.from("commerce_checkouts").select("id, status, stripe_session_id, stripe_payment_intent_id, coupon_id, coupon_holder").eq("creator_id", input.shopId).eq("client_key", clientKey).maybeSingle()
  if (!c || c.status !== "pending") return false
  /* Paid in Storelib's own form: the PaymentIntent is cancelled first, so it can never be paid afterwards; one Stripe will not cancel (paid that very moment) is left alone. */
  if (!c.stripe_session_id && c.stripe_payment_intent_id) {
    let status = ""
    try {
      status = (await stripe.paymentIntents.cancel(c.stripe_payment_intent_id)).status
    } catch {
      try {
        status = (await stripe.paymentIntents.retrieve(c.stripe_payment_intent_id)).status
      } catch {
        return false
      }
    }
    if (status !== "canceled") return false
    await releaseCheckout(db, c.id, "cancelled", "Buyer changed the order")
    if (c.coupon_id && c.coupon_holder) await releaseCouponHold(db, c.coupon_id, c.coupon_holder)
    return true
  }
  if (!c.stripe_session_id) return false
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.expire(c.stripe_session_id)
  } catch {
    try {
      session = await stripe.checkout.sessions.retrieve(c.stripe_session_id)
    } catch {
      return false
    }
  }
  if (session.status !== "expired") return false
  await expireCheckoutSession(db, session)
  return true
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
 * A paid checkout whose order lines were written and whose follow-ups were
 * not finished (lib/checkout/followups.ts), for the sweep: the lines are read
 * again by the session id they were written under, which every line keeps
 * (a Checkout Session, a PaymentIntent, or a free or cash order's own id).
 */
export async function resumePhysicalCheckout(db: Db, checkoutId: string, orderId: string, baseUrl: string): Promise<CompleteResult | null> {
  const { data } = await db.from("orders").select("stripe_session_id, stripe_payment_intent_id").eq("id", orderId).limit(1)
  const row = Array.isArray(data) ? (data[0] as { stripe_session_id?: string | null; stripe_payment_intent_id?: string | null } | undefined) : undefined
  if (!row?.stripe_session_id) return null
  return completeCheckout(db, { checkoutId, sessionId: row.stripe_session_id, paymentIntentId: row.stripe_payment_intent_id ?? null, facts: null, baseUrl })
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
      message: co.provider === "free" ? "Order placed with a code, nothing to pay" : co.provider === COD_PROVIDER ? `Order placed, ${money(co.total_cents, co.currency)} to be paid in cash on delivery` : `Payment of ${money(co.total_cents, co.currency)} received`,
      actor: co.provider === "free" || co.provider === COD_PROVIDER ? "buyer" : "webhook",
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
  const shipWeights = lines.map((l, i) => (l.requires_shipping ? Math.max(1, itemNet[i]) : 0))
  const shipShares = apportionFee(shippingPaid, shipWeights)
  const taxShares = taxSharesOf(addedTax, co, lines, itemNet, shippingPaid, shipWeights)
  const amounts = lines.map((_, i) => itemNet[i] + (shipShares[i] ?? 0) + (taxShares[i] ?? 0))
  /*
    Tax inside the prices (Settings › Taxes, prices include tax) is not added to any amount, but it is still tax the
    order holds: each line keeps its share in its snapshot with tax_included, so Orders shows "Includes VAT 19%" as
    the receipt and the buyer's page do (lib/orders/load-rows.ts reads it). Before this it was not kept anywhere on the
    line and the order's tax row was missing for every store whose prices include tax.
  */
  const includedShares = taxIncluded ? taxSharesOf(Math.max(0, co.tax_cents), co, lines, itemNet, shippingPaid, shipWeights) : []
  const taxLabel = typeof co.shipping_rate?.tax_label === "string" && co.shipping_rate.tax_label.trim() ? co.shipping_rate.tax_label.trim().slice(0, 80) : null
  const fees = apportionFee(fee, amounts)
  const origin = (co.origin ?? null) as OrderOrigin | null
  const name = (co.buyer_name || c.buyerName || "").trim()
  const firstName = name ? name.split(/\s+/)[0] : null
  const lastName = name && name.includes(" ") ? name.slice(name.indexOf(" ") + 1) : null

  const created: { index: number; orderId: string; productId: string; amountCents: number }[] = []
  /* Every line this call follows up (lib/checkout/followups.ts): the ones it wrote, and ones another caller wrote and never finished. */
  const followed: FollowedLine[] = []
  let failed = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const receiptToken = cartReceiptToken(sessionId, i)
    /* LIMIT SALES: a download's copy, held at the start by the buyer's address, taken again while its order is written (lib/checkout/sales-limit). */
    const saleHolder = l.type !== "physical" ? (co.buyer_email ? holderForEmail(String(co.buyer_email)) : `p:${sessionId}`) : null
    const withinLimit = saleHolder ? await claimSale(db, l.product_id, saleHolder, l.quantity) : true
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
        provider: co.provider === "free" ? "free" : co.provider === COD_PROVIDER ? COD_PROVIDER : "stripe",
        status: "completed",
        stripe_session_id: sessionId,
        stripe_payment_intent_id: c.paymentIntentId ?? co.stripe_payment_intent_id,
        session_fingerprint: fingerprint,
        receipt_token: receiptToken,
        allowed_fingerprints: [fingerprint],
        payment_method: c.facts?.paymentMethod ?? (co.provider === "free" ? null : co.provider === COD_PROVIDER ? COD_PAYMENT_METHOD : "card"),
        card_brand: c.facts?.cardBrand ?? null,
        card_last4: c.facts?.cardLast4 ?? null,
        buyer_country: co.shipping_address?.country ?? null,
        buyer_country_code: co.shipping_address?.country ?? null,
        checkout_id: c.checkoutId,
        fulfillment_method: l.type === "physical" ? (l.fulfillment_method ?? "self") : null,
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
          tax_cents: taxIncluded ? (includedShares[i] ?? 0) : (taxShares[i] ?? 0),
          ...(taxIncluded && (includedShares[i] ?? 0) > 0 ? { tax_included: true } : {}),
          ...(taxLabel && ((taxIncluded ? includedShares[i] : taxShares[i]) ?? 0) > 0 ? { tax_label: taxLabel } : {}),
          weight_grams: l.weight_grams,
          /* The buyer's words for this line from an imported theme's product form (an engraving): kept with it. */
          ...(l.properties && typeof l.properties === "object" ? { properties: l.properties } : {}),
          /* Which offers saved what on this line, as the checkout named each saving. */
          ...(Array.isArray(l.offers) && l.offers.length ? { offers: l.offers } : {}),
        },
      })
      .select("id")
      .single()
    if (saleHolder) await releaseSale(db, l.product_id, saleHolder)
    if (error?.code === "23505") {
      /* Another caller wrote this line: what it did not finish after writing it is finished here, never twice. */
      const { data: theirs } = await db.from("orders").select("id, amount_cents, refund_reason").eq("receipt_token", receiptToken).limit(1)
      const row = Array.isArray(theirs) ? (theirs[0] as { id?: string; amount_cents?: number | null; refund_reason?: string | null } | undefined) : undefined
      const f = row?.id ? await resumeFollowups(db, String(row.id), { log: "physical" }) : null
      if (f && row?.id) followed.push({ index: i, orderId: String(row.id), productId: l.product_id, amountCents: Number(row.amount_cents) || amounts[i], soldOut: row.refund_reason === SOLD_OUT_REASON, f })
      continue
    }
    if (error || !order) {
      failed++
      console.error("[physical] order line insert failed:", error?.code)
      continue
    }
    created.push({ index: i, orderId: order.id, productId: l.product_id, amountCents: amounts[i] })
    /* Over the limit: a record of the money, refunded below once the sale is on the ledger, never a purchase. */
    if (!withinLimit) await markSoldOut(db, order.id)
    const f = await beginFollowups(db, order.id, { kind: "physical", ref: c.checkoutId, log: "physical" })
    followed.push({ index: i, orderId: order.id, productId: l.product_id, amountCents: amounts[i], soldOut: !withinLimit, f })
  }

  /* Each line's own follow-ups: its tax on its row, where it came from, and for a download its library entry and the sales count. */
  for (const fl of followed) {
    const i = fl.index
    const l = lines[i]
    const f = fl.f
    /*
      The line's tax on the order's own columns, as the single product and basket checkouts keep theirs, so Settings ›
      Taxes' Tax collected and its CSV count shipped orders too (they read orders.tax_cents). It used to be in the
      snapshot only. Its own writes, so a database without the tax columns (parts 110, 129, 153) loses only these.
    */
    const lineTax = taxIncluded ? (includedShares[i] ?? 0) : (taxShares[i] ?? 0)
    if (lineTax > 0) await f.idempotent("tax", () => keepLineTax(db, fl.orderId, { cents: Math.min(lineTax, Math.max(0, amounts[i])), country: taxCountryOf(co), included: taxIncluded, label: taxLabel }))
    await f.idempotent("source", () => tagOrderSource(db, fl.orderId, "website", origin))
    await f.idempotent("attribution", () => recordOrderAttribution(db, fl.orderId, (co.attribution ?? null) as Attribution | null))
    if (fl.soldOut) continue
    /* A download in the same cart is the buyer's to keep, as in any basket. */
    if (l.type !== "physical" && co.buyer_id) {
      await f.idempotent("entitlement", async () => {
        let q = db.from("entitlements").select("id").eq("buyer_id", co.buyer_id).eq("product_id", l.product_id)
        q = l.variant_id ? q.eq("variant_id", l.variant_id) : q.is("variant_id", null)
        /* Any row is enough: two copies made maybeSingle() error, read as none, and insert a third. */
        const { data: has } = await q.limit(1)
        if (!(Array.isArray(has) && has.length > 0)) await db.from("entitlements").insert({ buyer_id: co.buyer_id, creator_id: co.creator_id, product_id: l.product_id, variant_id: l.variant_id, community_access: false })
      })
    }
    await f.once("sales count", async () => {
      await db.rpc("increment_product_sales", { p_product_id: l.product_id })
      await db.from("analytics_events").insert({ creator_id: co.creator_id, product_id: l.product_id, event_type: "purchase" })
    })
  }

  /*
    THE COMPANY ON EVERY LINE this call wrote, from the checkout (SQL part 259), exactly as a basket of downloads keeps
    it (lib/checkout/fulfil-cart-session.ts, part 36's orders.business_details): the invoice, the receipt and the
    seller's copy of the invoice read it from the order. A database without the column refuses this write alone.
  */
  const company = businessFromFields(co.business_details)
  if (company && followed.length) {
    /* One write for every line this call follows up, recorded on the first of them; writing it again changes nothing. */
    await followed[0].f.idempotent("business details", async () => {
      const { error: companyError } = await db.from("orders").update({ business_details: company }).in("id", followed.map((x) => x.orderId))
      if (companyError) console.warn("[physical] company details not kept on the order:", companyError.code)
    })
  }

  /*
    THE BUYER'S PICTURES BECOME THE ORDER'S (lib/cart-uploads/store attachOrderFiles): copied to the order's own path
    and marked as its, so they stay after the cart is gone. Asked again by every caller and by the daily sweep; a
    picture already the order's is left as it is, and a copy that fails never fails the order.
  */
  if (lines.some((l) => hasUploads(lineProperties((l as { properties?: unknown }).properties)))) {
    const { attachOrderFiles, idsOfLines } = await import("@/lib/cart-uploads/store")
    const done = await attachOrderFiles(db as never, { creatorId: co.creator_id, checkoutId: c.checkoutId, ids: idsOfLines(lines) }).catch(() => ({ attached: 0, failed: 1 }))
    if (done.failed) console.error("[physical] order pictures not all copied; the daily sweep tries again:", c.checkoutId)
  }

  const { data: firstOrder } = await db.from("orders").select("id").eq("receipt_token", cartReceiptToken(sessionId, 0)).maybeSingle()
  const firstOrderId: string | null = firstOrder?.id ?? created[0]?.orderId ?? null

  /* The order's own steps go with its first line: whoever wrote it, or a retry finishing it (lib/checkout/followups.ts). */
  const basket = followed.find((x) => x.index === 0)?.f ?? null
  if (basket && firstOrderId) {
    await onceForOrder(db, basket, {
      co,
      created: followed,
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
  for (const fl of followed) await fl.f.finish()
  /* LIMIT SALES: every line of this checkout written over a download's limit whose refund is still owed, now or from an earlier try (lib/checkout/sold-out-refund). */
  const { data: owed } = await db.from("orders").select("id, product_id, amount_cents").eq("checkout_id", c.checkoutId).eq("refund_reason", SOLD_OUT_REASON).eq("status", "completed")
  for (const o of (owed ?? []) as { id: string; product_id: string; amount_cents: number | null }[]) {
    try {
      await refundOverLimit(db, { orderId: o.id, productId: o.product_id, creatorId: co.creator_id, amountCents: o.amount_cents ?? 0, provider: co.provider === "free" ? "free" : "stripe", paymentId: c.paymentIntentId ?? co.stripe_payment_intent_id ?? null })
    } catch (e) {
      console.error("[physical] sold out refund failed for order", o.id, e instanceof Error ? e.message : e)
      failed++
    }
  }
  return { ok: true, receiptToken: co.receipt_token, sessionFingerprint: fingerprint, checkoutId: c.checkoutId, complete: failed === 0 }
}

/**
 * EACH LINE'S SHARE OF THE TAX, as the tax was charged (lib/physical/totals
 * physicalTotals): the tax on the delivery belongs to the lines that ship,
 * shared as the delivery is, and the tax on the items to the lines that
 * were taxed. A download is taxed only when Settings › Taxes taxes them, so
 * with that off its line carries none: before, every taxable line took a
 * share by its price, and a download's order row (and its receipt, and a
 * refund of it) held part of the mugs' VAT. A checkout from before these
 * facts were kept (no tax_on_shipping) is shared as it always was.
 */
function taxSharesOf(taxCents: number, co: Record<string, any>, lines: LineSnapshot[], itemNet: number[], shippingPaid: number, shipWeights: number[]): number[] {
  const rate = co.shipping_rate ?? {}
  const taxedWeights = lines.map((l, i) => (l.taxable && (l.type === "physical" || rate.tax_digital === true || typeof rate.tax_on_shipping !== "boolean") ? Math.max(1, itemNet[i]) : 0))
  if (taxCents <= 0) return lines.map(() => 0)
  if (typeof rate.tax_on_shipping !== "boolean") return apportionFee(taxCents, taxedWeights)
  const bps = Math.max(0, Number(rate.tax_rate_bps) || 0)
  const included = rate.tax_included === true
  const shipTax = rate.tax_on_shipping && shippingPaid > 0 && bps > 0 && shipWeights.some((w) => w > 0) ? Math.min(taxCents, included ? Math.round(shippingPaid - (shippingPaid * 10_000) / (10_000 + bps)) : Math.round((shippingPaid * bps) / 10_000)) : 0
  const itemTax = taxCents - shipTax
  const items = taxedWeights.some((w) => w > 0) ? apportionFee(itemTax, taxedWeights) : apportionFee(itemTax, shipWeights.some((w) => w > 0) ? shipWeights : lines.map(() => 1))
  const ship = apportionFee(shipTax, shipWeights)
  return lines.map((_, i) => (items[i] ?? 0) + (ship[i] ?? 0))
}

/** In the currency's own minor unit: ¥2500 is "¥2,500", never "¥25". */
function money(cents: number, currency = "USD"): string {
  return formatMinor(cents, String(currency || "USD"), "en-US")
}

type FollowedLine = { index: number; orderId: string; productId: string; amountCents: number; soldOut?: boolean; f: Followups }

async function onceForOrder(
  db: Db,
  f: Followups,
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
  const co = s.co
  const ctx: FulfilContext = {
    admin: db,
    sessionId: s.sessionId,
    paymentIntentId: co.stripe_payment_intent_id ?? null,
    provider: co.provider === "free" ? "free" : co.provider === COD_PROVIDER ? COD_PROVIDER : "stripe",
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
    currency: co.currency ?? null,
    origin: s.origin,
    attribution: co.attribution ?? null,
  }
  await f.once("customer", () => recordCartCustomer(ctx, s.paidTotal, s.firstOrderId, s.lines[0]?.product_id ?? null, co.email_opt_in === true ? "ticked" : "none"))
  if (co.coupon_id) await f.once("coupon use", () => recordCouponUse(db, co.coupon_id, co.coupon_holder))
  /* Cash on delivery never passes through Storelib: nothing goes on the seller's payout balance (lib/physical/cash-on-delivery.ts). */
  if (co.provider !== COD_PROVIDER) await f.idempotent("ledger", () => recordSale(db, { creatorId: co.creator_id, orderId: s.firstOrderId, total: s.paidTotal, fee: s.fee, destinationPaymentId: s.destinationPaymentId, currency: co.currency }))
  await f.idempotent("order email", () => queueOrderConfirmation(db, co.id, co.creator_id))
  await f.idempotent("forwarding", () => queueForwarding(db, co.id, co.creator_id))
  /* ShipStation connected: the items the seller ships go there to be labelled (lib/integrations/shipping/shipstation-server.ts). */
  await f.idempotent("shipstation", () => queueShipStation(db, co.id, co.creator_id, "paid", { enqueue: (d, j) => enqueueJob(d, j) }))
  await f.idempotent("low stock", () => queueLowStockAlerts(db, co.creator_id, s.lines.map((l) => l.variant_id).filter((v): v is string => !!v)))
  await f.idempotent("notify", () =>
    raiseSaleEvents(db, {
      creatorId: co.creator_id,
      purchase: { orderId: s.firstOrderId, amountCents: s.paidTotal, lineCount: s.lines.length },
      lines: s.created.map((l) => ({ orderId: l.orderId, productId: l.productId, productTitle: s.lines[l.index]?.title ?? null, amountCents: l.amountCents })),
      buyerEmail: co.buyer_email ?? null,
      buyerCountry: co.shipping_address?.country ?? null,
      correlationId: s.sessionId,
    }),
  )
  await f.once("push", async () => {
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
    await f.once("seller email", async () => {
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

/** Where an order's tax was worked out: as the checkout kept it, else the delivery address's country. */
export function taxCountryOf(co: { shipping_rate?: { tax_country?: unknown } | null; shipping_address?: { country?: unknown } | null }): string | null {
  const kept = co.shipping_rate?.tax_country
  if (typeof kept === "string" && /^[A-Z]{2}$/i.test(kept)) return kept.toUpperCase()
  const shipped = co.shipping_address?.country
  return typeof shipped === "string" && /^[A-Z]{2}$/i.test(shipped) ? shipped.toUpperCase() : null
}

/** A shipped order line's tax on its order row (tax_cents, tax_country, then tax_included and tax_label), each its own write. */
async function keepLineTax(db: Db, orderId: string, t: { cents: number; country: string | null; included: boolean; label: string | null }): Promise<void> {
  const { error } = await db.from("orders").update({ tax_cents: t.cents, tax_country: t.country }).eq("id", orderId)
  if (error) return void console.warn("[physical] tax not kept on the order:", error.code)
  if (t.included) {
    const { error: inError } = await db.from("orders").update({ tax_included: true }).eq("id", orderId)
    if (inError) console.warn("[physical] tax_included not kept:", inError.code)
  }
  if (t.label) {
    const { error: labelError } = await db.from("orders").update({ tax_label: t.label }).eq("id", orderId)
    if (labelError) console.warn("[physical] tax_label not kept:", labelError.code)
  }
}
