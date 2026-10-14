/**
 * ===========================================================================
 *  AN ORDER, AS KLAVIYO AND OMNISEND READ IT
 * ===========================================================================
 * One shape for every Storelib sale (a physical order from
 * commerce_checkouts, or a download, course or membership bought on its
 * own from `orders`), and from it the exact bodies each provider documents:
 *
 *   Klaviyo   POST /api/events, metrics Placed Order, Ordered Product (one
 *             per line), Fulfilled Order, Canceled Order, Refunded Order
 *             and Started Checkout, with the properties of Klaviyo's guide
 *             "Integrate an ecommerce platform without a pre-built Klaviyo
 *             integration": OrderId, ItemNames, DiscountCode, DiscountValue,
 *             Items[] (ProductID, SKU, ProductName, Quantity, ItemPrice,
 *             RowTotal, ProductURL, ImageURL), ShippingAddress, Reason;
 *             `value`, `value_currency`, `time`, and a `unique_id` so a
 *             retried call is recorded once.
 *   Omnisend  POST /api/events, the recommended events placed order, paid
 *             for order, order fulfilled, order canceled and order refunded,
 *             eventVersion v2, origin api, with their documented properties
 *             (orderID, orderNumber, currency, totalPrice, lineItems[] ...).
 *
 * Pure: no database, no network. lib/integrations/marketing/sync-server.ts
 * reads the order and sends what these return.
 */

import { v5 as uuidv5 } from "uuid"
import { decimalsOf } from "@/lib/payments/money"
import { nameParts } from "./http"

export type MarketingEvent = "placed" | "fulfilled" | "cancelled" | "refunded" | "started"

export interface MarketingLine {
  lineId: string
  productId: string | null
  variantId: string | null
  sku: string | null
  title: string
  variantName: string | null
  quantity: number
  /** Each, in the currency's smallest unit. */
  unitCents: number
  discountCents: number
  /** The line, quantity times each, before the order's discounts. */
  rowCents: number
  imageUrl: string | null
  productUrl: string | null
  kind: string
}

export interface MarketingAddress {
  name: string | null
  line1: string | null
  line2: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  country: string | null
  phone: string | null
}

export interface MarketingOrder {
  /** Storelib's id: the checkout for a physical order, the order row for a download. */
  id: string
  number: string
  email: string
  name: string | null
  phone: string | null
  currency: string
  totalCents: number
  subtotalCents: number
  discountCents: number
  discountCode: string | null
  shippingCents: number
  taxCents: number
  refundedCents: number
  createdAt: string
  paidAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  /** Storelib's words: paid, partially_refunded, refunded, cancelled, pending. */
  paymentStatus: string
  /** unfulfilled, processing, partially_fulfilled, fulfilled, delivered, cancelled, not_required. */
  fulfillmentStatus: string
  shippingMethod: string | null
  address: MarketingAddress | null
  tracking: { carrier: string | null; number: string | null; url: string | null } | null
  orderUrl: string | null
  /** A download, course or membership with nothing to ship. */
  digital: boolean
  lines: MarketingLine[]
}

/** An amount in the smallest unit, in the major unit both providers read: 1234 USD is 12.34, 1234 JPY is 1234. */
export function major(minor: number, currency: string): number {
  const d = decimalsOf(currency || "USD")
  return Math.round(Number(minor || 0)) / 10 ** d
}

/* ── Klaviyo ───────────────────────────────────────────────────────────── */

export const KLAVIYO_METRIC: Record<MarketingEvent, string> = {
  placed: "Placed Order",
  fulfilled: "Fulfilled Order",
  /* Klaviyo's guide spells this metric "Canceled Order"; its CLV reads that name. */
  cancelled: "Canceled Order",
  refunded: "Refunded Order",
  started: "Started Checkout",
}
export const KLAVIYO_ORDERED_PRODUCT = "Ordered Product"

export interface KlaviyoEventInput {
  metric: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  properties: Record<string, unknown>
  time: string
  value: number
  currency: string
  uniqueId: string
  /** A past order sent on connect: recorded, never starting a flow. */
  backfill: boolean
}

/** The POST /api/events body for one event. */
export function klaviyoEventBody(e: KlaviyoEventInput): Record<string, unknown> {
  const profile: Record<string, unknown> = { email: e.email }
  if (e.firstName) profile.first_name = e.firstName
  if (e.lastName) profile.last_name = e.lastName
  /* E.164 only: Klaviyo refuses the event for a phone it can't read. */
  if (e.phone && /^\+[1-9]\d{7,14}$/.test(e.phone.replace(/[\s()-]/g, ""))) profile.phone_number = e.phone.replace(/[\s()-]/g, "")
  return {
    data: {
      type: "event",
      attributes: {
        properties: e.properties,
        time: e.time,
        value: e.value,
        value_currency: e.currency,
        unique_id: e.uniqueId,
        ...(e.backfill ? { backfill: true } : {}),
        metric: { data: { type: "metric", attributes: { name: e.metric } } },
        profile: { data: { type: "profile", attributes: profile } },
      },
    },
  }
}

function klaviyoAddress(a: MarketingAddress | null): Record<string, unknown> | undefined {
  if (!a || !a.line1) return undefined
  const n = nameParts(a.name)
  const out: Record<string, unknown> = { FirstName: n.first ?? "", LastName: n.last ?? "", Address1: a.line1, City: a.city ?? "", Zip: a.postalCode ?? "" }
  if (a.line2) out.Address2 = a.line2
  if (a.region) out.RegionCode = a.region
  if (a.country) out.CountryCode = a.country
  if (a.phone) out.Phone = a.phone
  return out
}

function klaviyoItems(o: MarketingOrder) {
  return o.lines.map((l) => ({
    ProductID: l.productId ?? l.lineId,
    SKU: l.sku ?? "",
    ProductName: l.variantName ? `${l.title} (${l.variantName})` : l.title,
    Quantity: l.quantity,
    ItemPrice: major(l.unitCents, o.currency),
    RowTotal: major(l.rowCents, o.currency),
    ProductURL: l.productUrl ?? "",
    ImageURL: l.imageUrl ?? "",
    Categories: [l.kind === "physical" ? "Physical" : "Digital"],
  }))
}

/** The order's own properties, as Placed Order, Fulfilled Order, Canceled Order and Refunded Order carry them. */
export function klaviyoOrderProperties(o: MarketingOrder): Record<string, unknown> {
  const items = klaviyoItems(o)
  const props: Record<string, unknown> = {
    OrderId: o.id,
    OrderNumber: o.number,
    Categories: [...new Set(items.flatMap((i) => i.Categories))],
    ItemNames: o.lines.map((l) => l.title),
    Items: items,
    DiscountValue: major(o.discountCents, o.currency),
    ShippingValue: major(o.shippingCents, o.currency),
    TaxValue: major(o.taxCents, o.currency),
  }
  if (o.discountCode) props.DiscountCode = o.discountCode
  const ship = klaviyoAddress(o.address)
  if (ship) props.ShippingAddress = ship
  if (o.orderUrl) props.OrderStatusURL = o.orderUrl
  return props
}

/** Every Klaviyo event one Storelib event makes: Placed Order and an Ordered Product per line, or the one event. */
export function klaviyoEventsFor(o: MarketingOrder, event: MarketingEvent, opts: { backfill: boolean; now: string; checkoutUrl?: string | null }): KlaviyoEventInput[] {
  const n = nameParts(o.name)
  const base = { email: o.email, firstName: n.first, lastName: n.last, phone: o.phone, currency: o.currency.toUpperCase(), backfill: opts.backfill }
  const total = major(o.totalCents, o.currency)
  if (event === "placed") {
    const time = o.paidAt ?? o.createdAt
    const placed: KlaviyoEventInput = { ...base, metric: KLAVIYO_METRIC.placed, properties: klaviyoOrderProperties(o), time, value: total, uniqueId: o.id }
    const lines = o.lines.map<KlaviyoEventInput>((l) => ({
      ...base,
      metric: KLAVIYO_ORDERED_PRODUCT,
      properties: {
        OrderId: o.id,
        ProductID: l.productId ?? l.lineId,
        SKU: l.sku ?? "",
        ProductName: l.variantName ? `${l.title} (${l.variantName})` : l.title,
        Quantity: l.quantity,
        ProductURL: l.productUrl ?? "",
        ImageURL: l.imageUrl ?? "",
        Categories: [l.kind === "physical" ? "Physical" : "Digital"],
      },
      time,
      value: major(l.rowCents, o.currency),
      uniqueId: `${o.id}:${l.lineId}`,
    }))
    return [placed, ...lines]
  }
  if (event === "started") {
    return [
      {
        ...base,
        metric: KLAVIYO_METRIC.started,
        properties: { ...(opts.checkoutUrl ? { CheckoutURL: opts.checkoutUrl } : {}), ItemNames: o.lines.map((l) => l.title), Items: klaviyoItems(o), Categories: [...new Set(klaviyoItems(o).flatMap((i) => i.Categories))] },
        time: o.createdAt,
        value: total,
        uniqueId: `${o.id}:started`,
      },
    ]
  }
  const props = klaviyoOrderProperties(o)
  if (event === "fulfilled") {
    if (o.tracking?.number) props.Tracking = { Carrier: o.tracking.carrier ?? "", TrackingNumber: o.tracking.number, TrackingURL: o.tracking.url ?? "" }
    return [{ ...base, metric: KLAVIYO_METRIC.fulfilled, properties: props, time: opts.now, value: total, uniqueId: o.id }]
  }
  if (event === "cancelled") {
    props.Reason = o.cancelReason ?? ""
    return [{ ...base, metric: KLAVIYO_METRIC.cancelled, properties: props, time: o.cancelledAt ?? opts.now, value: total, uniqueId: o.id }]
  }
  /* Refunded in full: the order's own unique_id, so Klaviyo's CLV takes it off that order. A part refund is its own event. */
  const full = o.refundedCents >= o.totalCents
  props.Reason = o.cancelReason ?? ""
  props.RefundedValue = major(o.refundedCents, o.currency)
  return [{ ...base, metric: KLAVIYO_METRIC.refunded, properties: props, time: opts.now, value: major(o.refundedCents, o.currency), uniqueId: full ? o.id : `${o.id}:refund:${o.refundedCents}` }]
}

/* ── Omnisend ──────────────────────────────────────────────────────────── */

export const OMNISEND_EVENT: Record<Exclude<MarketingEvent, "started"> | "paid", string> = {
  placed: "placed order",
  paid: "paid for order",
  fulfilled: "order fulfilled",
  cancelled: "order canceled",
  refunded: "order refunded",
}

/* Stable eventIDs: the same Storelib event is always the same id, which Omnisend uses to count a past event once. */
const EVENT_NAMESPACE = "6f1c1f0e-3b8e-5b7a-9f4e-2a1d5c0b7e31"
export function omnisendEventId(key: string): string {
  return uuidv5(key, EVENT_NAMESPACE)
}

export function omnisendPaymentStatus(s: string): string {
  if (s === "paid") return "paid"
  if (s === "partially_refunded") return "partiallyRefunded"
  if (s === "refunded") return "refunded"
  if (s === "cancelled" || s === "expired" || s === "failed" || s === "voided") return "voided"
  return "awaitingPayment"
}

export function omnisendFulfillmentStatus(s: string): string {
  if (s === "fulfilled") return "fulfilled"
  if (s === "delivered") return "delivered"
  if (s === "processing" || s === "partially_fulfilled") return "inProgress"
  /* Nothing to ship (a download): delivered the moment it was paid. */
  if (s === "not_required") return "fulfilled"
  return "unfulfilled"
}

function omnisendLines(o: MarketingOrder, lines: MarketingLine[]) {
  return lines.map((l) => {
    const item: Record<string, unknown> = {
      productID: l.productId ?? l.lineId,
      productTitle: l.title,
      productPrice: major(l.unitCents, o.currency),
      productQuantity: l.quantity,
    }
    if (l.discountCents) item.productDiscount = major(l.discountCents, o.currency)
    if (l.sku) item.productSKU = l.sku
    if (l.variantId) item.productVariantID = l.variantId
    if (l.variantName) item.productVariantTitle = `${l.title} - ${l.variantName}`
    if (l.imageUrl) item.productImageURL = l.imageUrl
    if (l.productUrl) item.productURL = l.productUrl
    return item
  })
}

function omnisendAddress(a: MarketingAddress | null): Record<string, unknown> | undefined {
  if (!a || !a.line1) return undefined
  const n = nameParts(a.name)
  const out: Record<string, unknown> = { address1: a.line1, city: a.city ?? "", zip: a.postalCode ?? "", country: a.country ?? "" }
  if (a.line2) out.address2 = a.line2
  if (n.first) out.firstName = n.first
  if (n.last) out.lastName = n.last
  if (a.region) out.state = a.region
  if (a.phone) out.phone = a.phone
  return out
}

export interface OmnisendEventBody {
  eventName: string
  eventID: string
  eventVersion: string
  origin: "api"
  eventTime: string
  contact: Record<string, unknown>
  properties: Record<string, unknown>
}

/** The POST /api/events body for one Omnisend order event. */
export function omnisendOrderEvent(o: MarketingOrder, name: keyof typeof OMNISEND_EVENT, opts: { key: string; time: string }): OmnisendEventBody {
  const n = nameParts(o.name)
  const contact: Record<string, unknown> = { email: o.email }
  if (n.first) contact.firstName = n.first
  if (n.last) contact.lastName = n.last
  const properties: Record<string, unknown> = {
    orderID: o.id,
    orderNumber: o.number,
    currency: o.currency.toUpperCase(),
    totalPrice: major(o.totalCents, o.currency),
    subTotalPrice: major(o.subtotalCents, o.currency),
    totalDiscount: major(o.discountCents, o.currency),
    totalTax: major(o.taxCents, o.currency),
    shippingPrice: major(o.shippingCents, o.currency),
    createdAt: o.createdAt,
    paymentStatus: omnisendPaymentStatus(o.paymentStatus),
    fulfillmentStatus: omnisendFulfillmentStatus(o.fulfillmentStatus),
    lineItems: omnisendLines(o, o.lines),
  }
  if (o.discountCode) properties.discounts = [{ code: o.discountCode, amount: major(o.discountCents, o.currency), type: "fixedAmount" }]
  if (o.orderUrl) properties.orderStatusURL = o.orderUrl
  if (o.shippingMethod) properties.shippingMethod = o.shippingMethod
  const ship = omnisendAddress(o.address)
  if (ship) properties.shippingAddress = ship
  if (name === "fulfilled" && o.tracking?.number) properties.tracking = { code: o.tracking.number, courierTitle: o.tracking.carrier ?? "", courierURL: o.tracking.url ?? "" }
  if (name === "cancelled") properties.cancelReason = o.cancelReason ?? ""
  if (name === "refunded") {
    properties.totalRefundedAmount = major(o.refundedCents, o.currency)
    if (o.refundedCents >= o.totalCents) properties.refundedLineItems = omnisendLines(o, o.lines)
  }
  return { eventName: OMNISEND_EVENT[name], eventID: omnisendEventId(opts.key), eventVersion: "v2", origin: "api", eventTime: opts.time, contact, properties }
}

/** The Omnisend events one Storelib event makes: a sale is placed and paid at once; the others are one each. Started Checkout has no Omnisend order event. */
export function omnisendEventsFor(o: MarketingOrder, event: MarketingEvent, opts: { creatorId: string; now: string }): OmnisendEventBody[] {
  const k = (n: string, extra = "") => `omnisend:${opts.creatorId}:${n}:${o.id}${extra}`
  if (event === "placed") {
    const t = o.paidAt ?? o.createdAt
    return [omnisendOrderEvent(o, "placed", { key: k("placed"), time: o.createdAt }), omnisendOrderEvent(o, "paid", { key: k("paid"), time: t })]
  }
  if (event === "fulfilled") return [omnisendOrderEvent(o, "fulfilled", { key: k("fulfilled"), time: opts.now })]
  if (event === "cancelled") return [omnisendOrderEvent(o, "cancelled", { key: k("cancelled"), time: o.cancelledAt ?? opts.now })]
  if (event === "refunded") return [omnisendOrderEvent(o, "refunded", { key: k("refunded", `:${o.refundedCents}`), time: opts.now })]
  return []
}

/* ── reading Storelib's orders into the one shape ─────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/** A physical order as lib/physical/orders-server.ts loadOrder returns it. */
export function fromPhysicalOrder(o: Any, extra: { orderUrl: string | null; cancelReason: string | null; productUrl?: (productId: string | null) => string | null }): MarketingOrder | null {
  const email = String(o?.buyerEmail ?? "").trim().toLowerCase()
  if (!email) return null
  const lines: MarketingLine[] = (Array.isArray(o.lines) ? o.lines : []).map((l: Any) => ({
    lineId: String(l.orderId),
    productId: l.productId ?? null,
    variantId: l.variantId ?? null,
    sku: l.sku ?? null,
    title: String(l.title ?? "Item").slice(0, 200),
    variantName: l.variantName ?? null,
    quantity: Number(l.quantity ?? 1),
    unitCents: Number(l.unitCents ?? 0),
    discountCents: Number(l.discountCents ?? 0),
    rowCents: Number(l.unitCents ?? 0) * Number(l.quantity ?? 1),
    imageUrl: typeof l.imageUrl === "string" && /^https:\/\//.test(l.imageUrl) ? l.imageUrl : null,
    productUrl: extra.productUrl ? extra.productUrl(l.productId ?? null) : null,
    kind: String(l.type ?? "physical"),
  }))
  const shipped = (Array.isArray(o.shipments) ? o.shipments : []).filter((s: Any) => s.status !== "cancelled" && s.trackingNumber)
  const last = shipped[shipped.length - 1]
  const a = o.address ?? null
  return {
    id: String(o.id),
    number: o.id ? `#${String(o.id).replace(/-/g, "").slice(0, 8).toUpperCase()}` : "",
    email,
    name: o.buyerName ?? a?.name ?? null,
    phone: o.buyerPhone ?? null,
    currency: String(o.currency ?? "usd").toUpperCase(),
    totalCents: Number(o.totalCents ?? 0),
    subtotalCents: Number(o.itemsSubtotalCents ?? 0),
    discountCents: Number(o.discountCents ?? 0),
    discountCode: o.couponCode ?? null,
    shippingCents: Math.max(0, Number(o.shippingCents ?? 0) - Number(o.shippingDiscountCents ?? 0)),
    taxCents: Number(o.taxCents ?? 0),
    refundedCents: Number(o.refundedCents ?? 0),
    createdAt: o.createdAt,
    paidAt: o.paidAt ?? null,
    cancelledAt: o.cancelledAt ?? null,
    cancelReason: extra.cancelReason,
    paymentStatus: String(o.status ?? "paid"),
    fulfillmentStatus: String(o.fulfillmentStatus ?? "unfulfilled"),
    shippingMethod: o.delivery?.name ?? (o.deliveryMethod === "pickup" ? "Pickup" : null),
    address: a ? { name: a.name ?? o.buyerName ?? null, line1: a.line1 ?? null, line2: a.line2 ?? null, city: a.city ?? null, region: a.region ?? null, postalCode: a.postalCode ?? null, country: a.country ?? null, phone: a.phone ?? null } : null,
    tracking: last ? { carrier: last.carrier ?? null, number: last.trackingNumber ?? null, url: last.trackingUrl ?? null } : null,
    orderUrl: extra.orderUrl,
    digital: lines.length > 0 && lines.every((l) => l.kind !== "physical"),
    lines,
  }
}

/** A download, course or membership bought on its own (an `orders` row with no checkout). */
export function fromDigitalOrder(row: Any, product: { title?: string | null; image_url?: string | null } | null, extra: { productUrl: string | null }): MarketingOrder | null {
  const email = String(row?.buyer_email ?? "").trim().toLowerCase()
  if (!email || !row?.id) return null
  const cents = Number(row.amount_cents ?? 0)
  const refunded = Number(row.refund_amount_cents ?? (row.status === "refunded" ? cents : 0))
  const currency = String(row.currency ?? "usd").toUpperCase()
  const name = [row.buyer_first_name, row.buyer_last_name].filter(Boolean).join(" ").trim() || null
  const title = String(product?.title ?? "Product").slice(0, 200)
  const status = row.status === "refunded" ? (refunded > 0 && refunded < cents ? "partially_refunded" : "refunded") : "paid"
  return {
    id: String(row.id),
    number: `#${String(row.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    email,
    name,
    phone: null,
    currency,
    totalCents: cents,
    subtotalCents: cents,
    discountCents: 0,
    discountCode: null,
    shippingCents: 0,
    taxCents: 0,
    refundedCents: status === "paid" ? 0 : refunded,
    createdAt: row.created_at,
    paidAt: row.created_at,
    cancelledAt: null,
    cancelReason: row.refund_reason ?? null,
    paymentStatus: status,
    fulfillmentStatus: "not_required",
    shippingMethod: null,
    address: null,
    tracking: null,
    orderUrl: null,
    digital: true,
    lines: [
      {
        lineId: String(row.id),
        productId: row.product_id ?? null,
        variantId: row.variant_id ?? null,
        sku: null,
        title,
        variantName: row.variant_name ?? null,
        quantity: 1,
        unitCents: cents,
        discountCents: 0,
        rowCents: cents,
        imageUrl: typeof product?.image_url === "string" && /^https:\/\//.test(product.image_url) ? product.image_url : null,
        productUrl: extra.productUrl,
        kind: "digital",
      },
    ],
  }
}
