import "server-only"

/**
 * ===========================================================================
 *  A PHYSICAL ORDER: READ, FULFILLED, TRACKED, CANCELLED, RETURNED
 * ===========================================================================
 * One commerce_checkouts row is one order to the merchant; its lines are
 * the orders rows it wrote. What has shipped is proven by fulfillment
 * items and what came back by return items, so the order's fulfilment and
 * return status are recomputed from them after every change (./status.ts)
 * and stored on the checkout for lists and filters.
 *
 * Money stays where it was: a refund is the existing per-line Stripe refund
 * (app/api/stripe/refund), which already keeps the seller's balance, the
 * buyer's emails and the notifications right. This file reads what it did.
 */

import type { Db } from "./auth"
import { addOrderEvent, orderEvents, type OrderEvent } from "./events-server"
import { applyInventory } from "./inventory-server"
import { queueCancelledEmail, queueOrderUpdatedEmail, queueRefundEmail, queueReturnEmail, queueShipmentEmail, releaseHeldJobs } from "./jobs-server"
import { HOLD, HOLD_RELEASED, holdOf, holdReason, holdReasonLabel } from "./fulfilment-state"
import { addressLines, readAddress } from "./address"
import { canMoveShipment, fulfillmentStatusOf, mergeItemQuantities, refundReleasesStock, returnStatusOf, returnableQuantities, trackingUrl, unfulfilledQuantities, type LineProgress } from "./status"
import { readMethod, sellerNextStep } from "./fulfillment"
import { CANCEL_DECLINED, CANCEL_REQUESTED, CANCELLED_BY_BUYER, FORWARDED, buyerCancelState, cleanCancelReason, openCancelRequest } from "./buyer-cancel"
import { normaliseTrackingNumber } from "./carriers"
import { trackingAvailable, trackingNumberChanged } from "./tracking/accounts-server"
import { cleanNote } from "./notes"
import { lineProperties } from "./cart-link"
import { CREATOR_LINK_SECONDS, hasUploads } from "@/lib/cart-uploads/rules"
import { cartAttributes } from "@/lib/checkout/site-checkout"
import type { DeliveryMethod, FulfillmentMethod, FulfillmentStatus, PaymentStatus, PickupReady, ReturnStatus, ShipmentStatus } from "./types"
import { acceptedReason, reasonLabel } from "@/lib/store/reasons"
import { reasonsFor } from "@/lib/store/reasons-server"
import { COD_PAYMENT_METHOD, COD_PROVIDER, paymentStateOf, type PaymentState } from "./cash-on-delivery"
import { currencyCode, formatMinor } from "@/lib/markets/money"

export interface OrderLine {
  orderId: string
  productId: string | null
  variantId: string | null
  title: string
  variantName: string | null
  sku: string | null
  imageUrl: string | null
  type: string
  quantity: number
  unitCents: number
  discountCents: number
  amountCents: number
  refundedCents: number
  requiresShipping: boolean
  locationId: string | null
  /** Who sends it: the seller, a warehouse, a supplier or a print partner. */
  fulfillmentMethod: FulfillmentMethod | null
  fulfilled: number
  returned: number
  receiptToken: string | null
  /** The buyer's words for this line from an imported theme's product form (`properties[Engraving]`), or null. */
  properties?: Record<string, string> | null
  /** The store's offers in this line's discount, each by the name the checkout showed (the snapshot's `offers`), or null. */
  offers?: { title: string; savedCents: number }[] | null
  /**
   * The buyer's pictures this line's properties name (lib/cart-uploads), this store's own only, each with a link
   * that lasts an hour (to show and to download). Absent: none.
   */
  files?: { property: string; id: string; name: string; type: string; bytes: number; width: number | null; height: number | null; url: string | null; downloadUrl: string | null }[]
}

export interface Shipment {
  id: string
  status: ShipmentStatus
  locationId: string | null
  provider: string
  carrier: string | null
  service: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  shippedAt: string | null
  deliveredAt: string | null
  createdAt: string
  items: { orderId: string; quantity: number }[]
  /** Tracked and never marked delivered 60 days after shipping (SQL part 164; ./unconfirmed-delivery-server.ts). */
  unconfirmedAt?: string | null
  /** The carrier's estimated delivery (fulfillments.estimated_delivery_at, courier tracking part 160): a never delivered parcel's return window counts from it when it comes first (./status returnWindow). */
  estimatedDeliveryAt?: string | null
  events: { status: string; message: string | null; occurredAt: string }[]
  /** The carrier's own scans, newest first (lib/physical/tracking): kept apart from the shipment's status changes above. */
  checkpoints?: { at: string; status: string; message: string; location: string | null }[]
  /**
   * Courier tracking (lib/physical/tracking, part 160): `mode` auto when Storelib follows this parcel
   * with the carrier, paused when the seller stopped that for it, off when no tracking is set up yet.
   */
  tracking?: { mode: "auto" | "paused" | "off"; status: string | null; estimatedDelivery: string | null; checkedAt: string | null; providerName: string | null; error: string | null }
}

export interface ReturnRecord {
  id: string
  status: string
  reason: string
  method: string
  requestedBy: string
  customerNote: string | null
  merchantNote: string | null
  carrier: string | null
  trackingNumber: string | null
  refundedCents: number
  createdAt: string
  /** The reason as it read when asked (part 109), so a reason renamed later still reads as it did. */
  reasonLabel?: string | null
  receivedAt?: string | null
  closedAt?: string | null
  items: { id: string; orderId: string; quantity: number; restock: boolean; restockedQuantity: number; condition: string | null }[]
}

export interface PhysicalOrder {
  id: string
  creatorId: string
  status: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  returnStatus: ReturnStatus
  currency: string
  buyerEmail: string | null
  buyerName: string | null
  buyerPhone: string | null
  itemsSubtotalCents: number
  discountCents: number
  shippingCents: number
  shippingDiscountCents: number
  taxCents: number
  taxIncluded: boolean
  /** "VAT 19%", as the checkout named the tax (lib/tax/rules taxLabel); "Tax" for an order from before. */
  taxLabel: string
  totalCents: number
  refundedCents: number
  platformFeeCents: number
  /**
   * How it was paid, or is to be (lib/physical/cash-on-delivery.ts): by card,
   * free with a code, or in cash on delivery, still to collect or collected.
   */
  payment: PaymentState
  /** When the seller marked the cash received. Null for every order not paid in cash, and for one still to collect. */
  cashCollectedAt: string | null
  couponCode: string | null
  address: Record<string, any> | null
  /** `kind` local: the seller brings it (lib/physical/local-delivery.ts), with their note. */
  delivery: { name: string; priceCents: number; minDays: number | null; maxDays: number | null; kind?: "ship" | "local"; note?: string | null } | null
  deliveryMethod: DeliveryMethod
  pickup: { locationId: string | null; name: string; address: string[]; instructions: string | null; ready: PickupReady; hours?: string | null } | null
  processingAt: string | null
  deliveredAt: string | null
  buyerNote: string | null
  /** An imported theme's cart attributes (SQL part 164): a gift message, a delivery date. Empty when none. */
  cartAttributes: Record<string, string>
  merchantNote: string | null
  receiptToken: string
  paidAt: string | null
  createdAt: string
  cancelledAt: string | null
  lines: OrderLine[]
  shipments: Shipment[]
  returns: ReturnRecord[]
  events: OrderEvent[]
}

function paymentStatusOf(total: number, refunded: number, stored: PaymentStatus): PaymentStatus {
  if (stored !== "paid" && stored !== "refunded" && stored !== "partially_refunded") return stored
  if (refunded <= 0) return "paid"
  return refunded >= total ? "refunded" : "partially_refunded"
}

/** A line snapshot's `offers` (lib/physical/checkout-server snapshotLine), read leniently: each with a name and what it saved, or null for none. */
export function offersOfSnapshot(raw: unknown): { title: string; savedCents: number }[] | null {
  if (!Array.isArray(raw)) return null
  const out = raw
    .map((o) => ({ title: typeof o?.title === "string" ? o.title.slice(0, 120) : "", savedCents: Math.max(0, Math.round(Number(o?.saved_cents ?? o?.savedCents) || 0)) }))
    .filter((o) => o.title && o.savedCents > 0)
    .slice(0, 10)
  return out.length ? out : null
}

export async function loadOrder(db: Db, where: { creatorId: string; checkoutId: string } | { receiptToken: string }): Promise<PhysicalOrder | null> {
  let q = db.from("commerce_checkouts").select("*")
  q = "receiptToken" in where ? q.eq("receipt_token", where.receiptToken) : q.eq("id", where.checkoutId).eq("creator_id", where.creatorId)
  const { data: co } = await q.maybeSingle()
  if (!co) return null
  const [{ data: orders }, { data: fulfillments }, { data: returns }] = await Promise.all([
    db.from("orders").select("*").eq("checkout_id", co.id).order("created_at", { ascending: true }),
    db.from("fulfillments").select("*").eq("checkout_id", co.id).order("created_at", { ascending: true }),
    db.from("commerce_returns").select("*").eq("checkout_id", co.id).order("created_at", { ascending: true }),
  ])
  const fIds = ((fulfillments ?? []) as { id: string }[]).map((f) => f.id)
  const rIds = ((returns ?? []) as { id: string }[]).map((r) => r.id)
  const [{ data: fItems }, { data: fEvents }, { data: rItems }] = await Promise.all([
    fIds.length ? db.from("fulfillment_items").select("fulfillment_id, order_id, quantity").in("fulfillment_id", fIds) : Promise.resolve({ data: [] }),
    fIds.length ? db.from("fulfillment_events").select("fulfillment_id, status, message, location, external_id, occurred_at").in("fulfillment_id", fIds).order("occurred_at", { ascending: false }) : Promise.resolve({ data: [] }),
    rIds.length ? db.from("commerce_return_items").select("id, return_id, order_id, quantity, restock, restocked_quantity, condition").in("return_id", rIds) : Promise.resolve({ data: [] }),
  ])
  const liveF = new Set(((fulfillments ?? []) as { id: string; status: string }[]).filter((f) => f.status !== "cancelled").map((f) => f.id))
  const fulfilledOf = new Map<string, number>()
  for (const i of (fItems ?? []) as { fulfillment_id: string; order_id: string; quantity: number }[]) {
    if (liveF.has(i.fulfillment_id)) fulfilledOf.set(i.order_id, (fulfilledOf.get(i.order_id) ?? 0) + i.quantity)
  }
  const doneReturns = new Set(((returns ?? []) as { id: string; status: string }[]).filter((r) => r.status === "received" || r.status === "completed").map((r) => r.id))
  const returnedOf = new Map<string, number>()
  for (const i of (rItems ?? []) as { return_id: string; order_id: string; quantity: number }[]) {
    if (doneReturns.has(i.return_id)) returnedOf.set(i.order_id, (returnedOf.get(i.order_id) ?? 0) + i.quantity)
  }
  const snapLines = (Array.isArray(co.lines) ? co.lines : []) as Record<string, any>[]
  const lines: OrderLine[] = ((orders ?? []) as Record<string, any>[]).map((o, i) => {
    const s = o.product_snapshot ?? snapLines[i] ?? {}
    return {
      orderId: o.id,
      productId: o.product_id,
      variantId: o.variant_id,
      title: s.title ?? "Item",
      variantName: s.variant_name ?? null,
      sku: s.sku ?? null,
      imageUrl: s.image_url ?? null,
      type: s.type ?? "physical",
      quantity: o.quantity ?? 1,
      unitCents: o.unit_price_cents ?? s.unit_cents ?? 0,
      discountCents: s.discount_cents ?? 0,
      amountCents: o.amount_cents ?? 0,
      refundedCents: o.refund_amount_cents ?? 0,
      requiresShipping: o.requires_shipping ?? false,
      locationId: o.fulfillment_location_id ?? null,
      fulfillmentMethod: readMethod(o.fulfillment_method ?? s.fulfillment_method),
      fulfilled: fulfilledOf.get(o.id) ?? 0,
      returned: returnedOf.get(o.id) ?? 0,
      receiptToken: o.receipt_token ?? null,
      properties: lineProperties(s.properties) ?? null,
      offers: offersOfSnapshot(s.offers),
    }
  })
  /* The buyer's pictures on the lines, this order's store's own (an id of another store's upload is not found), each with an hour's link. */
  if (lines.some((l) => hasUploads(l.properties))) {
    const { filesOfLine, idsOfLines, orderFiles } = await import("@/lib/cart-uploads/store")
    const files = await orderFiles(db as never, { creatorId: co.creator_id, ids: idsOfLines(lines), seconds: CREATOR_LINK_SECONDS })
    for (const l of lines) {
      const mine = filesOfLine(l.properties, files)
      if (mine.length) l.files = mine
    }
  }
  const refunded = lines.reduce((n, l) => n + l.refundedCents, 0)
  const eventsByF = new Map<string, Shipment["events"]>()
  const checkpointsByF = new Map<string, NonNullable<Shipment["checkpoints"]>>()
  for (const e of (fEvents ?? []) as { fulfillment_id: string; status: string; message: string | null; location?: string | null; external_id?: string | null; occurred_at: string }[]) {
    /* A carrier's scan (lib/physical/tracking): its own list, never read as a status change. */
    if (typeof e.external_id === "string" && e.external_id.startsWith("trk:")) {
      const cps = checkpointsByF.get(e.fulfillment_id) ?? []
      cps.push({ at: e.occurred_at, status: e.status, message: e.message ?? "", location: e.location ?? null })
      checkpointsByF.set(e.fulfillment_id, cps)
      continue
    }
    const list = eventsByF.get(e.fulfillment_id) ?? []
    list.push({ status: e.status, message: e.message, occurredAt: e.occurred_at })
    eventsByF.set(e.fulfillment_id, list)
  }
  const itemsByF = new Map<string, { orderId: string; quantity: number }[]>()
  for (const i of (fItems ?? []) as { fulfillment_id: string; order_id: string; quantity: number }[]) {
    const list = itemsByF.get(i.fulfillment_id) ?? []
    list.push({ orderId: i.order_id, quantity: i.quantity })
    itemsByF.set(i.fulfillment_id, list)
  }
  const tracked = ((fulfillments ?? []) as Record<string, any>[]).some((f) => f.tracking_number && f.provider !== "pickup")
  const follow = tracked ? await trackingAvailable(db, co.creator_id).catch(() => ({ on: false, providerName: null })) : { on: false, providerName: null }
  const itemsByR = new Map<string, ReturnRecord["items"]>()
  for (const i of (rItems ?? []) as Record<string, any>[]) {
    const list = itemsByR.get(i.return_id) ?? []
    list.push({ id: i.id, orderId: i.order_id, quantity: i.quantity, restock: i.restock, restockedQuantity: i.restocked_quantity, condition: i.condition })
    itemsByR.set(i.return_id, list)
  }
  return {
    id: co.id,
    creatorId: co.creator_id,
    status: paymentStatusOf(co.total_cents, refunded, co.status),
    fulfillmentStatus: co.fulfillment_status,
    returnStatus: co.return_status,
    currency: co.currency,
    buyerEmail: co.buyer_email,
    buyerName: co.buyer_name,
    buyerPhone: co.buyer_phone,
    itemsSubtotalCents: co.items_subtotal_cents,
    discountCents: co.discount_cents,
    shippingCents: co.shipping_cents,
    shippingDiscountCents: co.shipping_discount_cents,
    taxCents: co.tax_cents,
    taxIncluded: !!co.shipping_rate?.tax_included,
    taxLabel: typeof co.shipping_rate?.tax_label === "string" && co.shipping_rate.tax_label.trim() ? co.shipping_rate.tax_label.trim().slice(0, 80) : "Tax",
    totalCents: co.total_cents,
    refundedCents: refunded,
    platformFeeCents: co.platform_fee_cents,
    payment: paymentStateOf(co.provider, co.cod_collected_at ?? null),
    cashCollectedAt: co.provider === COD_PROVIDER ? (co.cod_collected_at ?? null) : null,
    couponCode: co.coupon_code,
    address: co.shipping_address,
    delivery: co.shipping_rate?.name
      ? { name: co.shipping_rate.name, priceCents: co.shipping_rate.price_cents ?? 0, minDays: co.shipping_rate.min_days ?? null, maxDays: co.shipping_rate.max_days ?? null, kind: co.shipping_rate.kind === "local" ? "local" : "ship", note: co.shipping_rate.local_note ?? null }
      : null,
    deliveryMethod: co.delivery_method === "pickup" ? "pickup" : co.delivery_method === "none" ? "none" : "ship",
    pickup:
      co.delivery_method === "pickup" && co.pickup
        ? { locationId: co.pickup_location_id ?? null, name: co.pickup.name, address: Array.isArray(co.pickup.address) ? co.pickup.address : [], instructions: co.pickup.instructions ?? null, ready: co.pickup.ready ?? "24h", hours: co.pickup.hours ?? null }
        : null,
    processingAt: co.processing_at ?? null,
    deliveredAt: co.delivered_at ?? null,
    buyerNote: co.buyer_note,
    cartAttributes: cartAttributes(co.cart_attributes) ?? {},
    merchantNote: co.merchant_note,
    receiptToken: co.receipt_token,
    paidAt: co.paid_at,
    createdAt: co.created_at,
    cancelledAt: co.cancelled_at,
    lines,
    shipments: ((fulfillments ?? []) as Record<string, any>[]).map((f) => ({
      id: f.id,
      status: f.status,
      locationId: f.location_id,
      provider: f.provider,
      carrier: f.carrier,
      service: f.service,
      trackingNumber: f.tracking_number,
      /* A shipment saved before its carrier had a link still gets one when the carrier is known now. */
      trackingUrl: f.tracking_url ?? trackingUrl(f.carrier, f.tracking_number),
      shippedAt: f.shipped_at,
      deliveredAt: f.delivered_at,
      createdAt: f.created_at,
      items: itemsByF.get(f.id) ?? [],
      events: eventsByF.get(f.id) ?? [],
      checkpoints: checkpointsByF.get(f.id) ?? [],
      tracking:
        f.tracking_number && f.provider !== "pickup"
          ? {
              mode: !follow.on ? "off" : f.tracking_auto === false ? "paused" : "auto",
              status: typeof f.tracking_status === "string" ? f.tracking_status : null,
              estimatedDelivery: f.status === "delivered" ? null : (f.estimated_delivery_at ?? null),
              checkedAt: f.tracking_checked_at ?? null,
              providerName: follow.providerName,
              error: typeof f.tracking_error === "string" ? f.tracking_error : null,
            }
          : undefined,
      unconfirmedAt: f.delivery_unconfirmed_at ?? null,
      estimatedDeliveryAt: f.estimated_delivery_at ?? null,
    })),
    returns: ((returns ?? []) as Record<string, any>[]).map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      method: r.method,
      requestedBy: r.requested_by,
      customerNote: r.customer_note,
      merchantNote: r.merchant_note,
      carrier: r.carrier,
      trackingNumber: r.tracking_number,
      refundedCents: r.refunded_cents,
      createdAt: r.created_at,
      reasonLabel: r.reason_label ?? null,
      receivedAt: r.received_at ?? null,
      closedAt: r.closed_at ?? null,
      items: itemsByR.get(r.id) ?? [],
    })),
    events: "receiptToken" in where ? [] : await orderEvents(db, co.id),
  }
}

export function progressOf(order: Pick<PhysicalOrder, "lines">): LineProgress[] {
  return order.lines.map((l) => ({ orderId: l.orderId, quantity: l.quantity, requiresShipping: l.requiresShipping, fulfilled: l.fulfilled, returned: l.returned }))
}

/** The stored statuses, recomputed from what the rows prove. */
async function restate(db: Db, creatorId: string, checkoutId: string): Promise<PhysicalOrder | null> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return null
  const progress = progressOf(order)
  const live = order.shipments.filter((sh) => sh.status !== "cancelled")
  const fulfillment = fulfillmentStatusOf(progress, !!order.cancelledAt, { processing: !!order.processingAt, allDelivered: live.length > 0 && live.every((sh) => sh.status === "delivered") })
  const openReturns = order.returns.filter((r) => ["requested", "approved", "in_transit"].includes(r.status)).length
  const ret = order.returns.some((r) => r.status === "requested") && !order.returns.some((r) => r.status === "received" || r.status === "completed") ? "requested" : returnStatusOf(progress, openReturns)
  const patch: Record<string, unknown> = { fulfillment_status: fulfillment, return_status: ret, updated_at: new Date().toISOString() }
  /*
    When the last parcel it needed left (Analytics' time to ship reads it), from the shipments
    themselves: the same on every restate, so a tracking fix, a return or a refund later never
    moves it. It used to be "now" at each of those.
  */
  if (fulfillment === "fulfilled" || fulfillment === "delivered") patch.fulfilled_at = live.map((sh) => sh.shippedAt ?? sh.createdAt).filter((t): t is string => !!t).sort().pop() ?? new Date().toISOString()
  /* When the last parcel arrived: the carrier's own time when it said (lib/physical/tracking), else now. */
  if (fulfillment === "delivered" && !order.deliveredAt) patch.delivered_at = live.map((sh) => sh.deliveredAt).filter((t): t is string => !!t).sort().pop() ?? new Date().toISOString()
  if (order.status === "refunded" || order.status === "partially_refunded") {
    patch.status = order.status
    patch.refunded_cents = order.refundedCents
  }
  await db.from("commerce_checkouts").update(patch).eq("id", checkoutId).eq("creator_id", creatorId)
  return { ...order, fulfillmentStatus: fulfillment, returnStatus: ret as ReturnStatus }
}

type Outcome = { ok: true; order: PhysicalOrder } | { ok: false; error: string; status?: number }

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const v = value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max)
  return v || null
}

/* ── fulfil ───────────────────────────────────────────────────────────── */

/** One parcel of a fulfilment: its items and how it travels. */
export interface ParcelInput {
  items: { orderId: string; quantity: number }[]
  carrier?: unknown
  trackingNumber?: unknown
  trackingUrl?: unknown
  locationId?: unknown
}

/** At most this many parcels in one press of Fulfill. */
export const MAX_PARCELS = 20

export async function fulfilItems(
  db: Db,
  creatorId: string,
  checkoutId: string,
  input: {
    items: { orderId: string; quantity: number }[]
    carrier?: unknown
    trackingNumber?: unknown
    trackingUrl?: unknown
    notifyBuyer?: boolean
    key?: unknown
    locationId?: unknown
    /** Shipped by a partner who told us (lib/physical/partner-server.ts): their provider and name, on the shipment and the timeline. */
    partner?: { provider: string; name: string }
  },
): Promise<Outcome> {
  return fulfilParcels(db, creatorId, checkoutId, {
    parcels: [{ items: input.items, carrier: input.carrier, trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl, locationId: input.locationId }],
    notifyBuyer: input.notifyBuyer,
    key: input.key,
    partner: input.partner,
  })
}

/**
 * Ship items in one or more parcels at once, each its own fulfillments row
 * with its own carrier and tracking. All of them or none: every parcel is
 * checked before anything is written, and a row that fails to save takes the
 * ones saved before it with it, before any stock moves. Stock is taken once
 * per unit (physical_fulfill per parcel, keyed per parcel and line).
 *
 * One parcel is exactly the single fulfilment it always was, keyed
 * `fulfil:<checkout>:<key>`. Several are keyed `fulfil:<checkout>:<key>:<n>`,
 * so pressing the same Fulfill again finds them all and writes nothing. The
 * buyer gets one email for the batch, naming every parcel.
 */
export async function fulfilParcels(
  db: Db,
  creatorId: string,
  checkoutId: string,
  input: { parcels: ParcelInput[]; notifyBuyer?: boolean; key?: unknown; partner?: { provider: string; name: string } },
): Promise<Outcome> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (order.status !== "paid" && order.status !== "partially_refunded") return { ok: false, error: order.status === "refunded" ? "This order was refunded." : "Only a paid order can be fulfilled." }
  if (order.cancelledAt) return { ok: false, error: "This order was cancelled." }
  /* Held by the shop (./fulfilment-state.ts): nothing ships until it is released. A partner that already shipped it said so, and that stands. */
  const hold = input.partner ? null : holdOf(order.events)
  if (hold) return { ok: false, error: `This order is on hold (${hold.label}). Release the hold to fulfil it.`, status: 409 }
  if (input.parcels.length === 0) return { ok: false, error: "Choose at least one item to fulfil." }
  if (input.parcels.length > MAX_PARCELS) return { ok: false, error: `At most ${MAX_PARCELS} parcels at once.` }
  const multi = input.parcels.length > 1
  const pickup = order.deliveryMethod === "pickup"
  if (multi && pickup) return { ok: false, error: "A pickup order is handed over in one go." }
  const open = unfulfilledQuantities(progressOf(order))
  const say = (n: number, e: string) => (multi ? `Parcel ${n + 1}: ${e}` : e)
  const key = cleanText(input.key, 120)
  const keyOf = (n: number) => (key ? (multi ? `fulfil:${checkoutId}:${key}:${n + 1}` : `fulfil:${checkoutId}:${key}`) : null)
  /* Pressed again: the parcels already saved under these keys are neither checked nor saved twice. */
  const saved = new Set<string>()
  if (multi && key) {
    const { data: had } = await db.from("fulfillments").select("idempotency_key").eq("checkout_id", checkoutId).in("idempotency_key", input.parcels.map((_, n) => keyOf(n)))
    for (const r of (had ?? []) as { idempotency_key: string }[]) saved.add(r.idempotency_key)
    if (saved.size === input.parcels.length) return { ok: true, order }
  }

  type Clean = { items: { orderId: string; quantity: number }[]; carrier: string | null; tracking: string | null; url: string | null; locationId: string | null; key: string | null }
  const todo: Clean[] = []
  for (const [n, p] of input.parcels.entries()) {
    if (saved.has(keyOf(n) ?? "")) continue
    const items = mergeItemQuantities((Array.isArray(p.items) ? p.items : []).map((i) => ({ orderId: i.orderId, quantity: i.quantity })))
    if (items.length === 0) return { ok: false, error: multi ? `Parcel ${n + 1} has no items.` : "Choose at least one item to fulfil." }
    for (const i of items) {
      const left = open.get(i.orderId)
      if (left === undefined) return { ok: false, error: say(n, "That item is not part of this order.") }
      if (i.quantity > left) return { ok: false, error: say(n, `Only ${left} left to fulfil on that item.`) }
    }
    const carrier = pickup ? null : cleanText(p.carrier, 40)
    const tracking = pickup ? null : normaliseTrackingNumber(cleanText(p.trackingNumber, 80))
    if (tracking && !/^[A-Za-z0-9-]{4,60}$/.test(tracking)) return { ok: false, error: say(n, "Check the tracking number.") }
    let url = pickup ? null : cleanText(p.trackingUrl, 500)
    if (url && !/^https:\/\/[^\s"'<>]+$/.test(url)) return { ok: false, error: say(n, "The tracking link must start with https://.") }
    /* The shipping country picks a carrier's own national tracking page where it runs one (DPD in Romania). */
    url = url ?? trackingUrl(carrier, tracking, typeof order.address?.country === "string" ? order.address.country : null)
    const firstLine = order.lines.find((l) => l.orderId === items[0].orderId)
    /* Where it ships from: one of the chosen lines' own locations, never an id taken on trust from the request. */
    const ownLocations = new Set(items.map((i) => order.lines.find((l) => l.orderId === i.orderId)?.locationId).filter((x): x is string => !!x))
    const asked = typeof p.locationId === "string" && ownLocations.has(p.locationId) ? p.locationId : null
    const locationId = pickup ? (order.pickup?.locationId ?? firstLine?.locationId ?? null) : (asked ?? firstLine?.locationId ?? null)
    todo.push({ items, carrier, tracking, url, locationId, key: keyOf(n) })
  }
  /* Together, the parcels can't ship more of a line than is left on it. */
  if (multi) {
    const asked = new Map<string, number>()
    for (const t of todo) for (const i of t.items) asked.set(i.orderId, (asked.get(i.orderId) ?? 0) + i.quantity)
    for (const [orderId, n] of asked) {
      const left = open.get(orderId) ?? 0
      if (n > left) return { ok: false, error: `The parcels add up to more than the ${left} left on ${order.lines.find((l) => l.orderId === orderId)?.title ?? "that item"}.` }
    }
  }

  const now = new Date().toISOString()
  const made: { id: string; parcel: (typeof todo)[number] }[] = []
  const undo = async () => {
    const ids = made.map((m) => m.id)
    if (ids.length === 0) return
    await db.from("fulfillment_items").delete().in("fulfillment_id", ids)
    await db.from("fulfillments").delete().in("id", ids)
  }
  for (const t of todo) {
    const { data: f, error } = await db
      .from("fulfillments")
      .insert({
        checkout_id: checkoutId,
        creator_id: creatorId,
        location_id: t.locationId,
        status: "shipped",
        provider: pickup ? "pickup" : (input.partner?.provider ?? "manual"),
        carrier: t.carrier,
        tracking_number: t.tracking,
        tracking_url: t.url,
        notify_buyer: input.notifyBuyer !== false,
        idempotency_key: t.key,
        shipped_at: now,
      })
      .select("id")
      .single()
    if (error?.code === "23505") {
      /* The same press, saved a moment ago by another request: that one stands, this one leaves nothing behind. */
      await undo()
      const fresh = await loadOrder(db, { creatorId, checkoutId })
      return fresh ? { ok: true, order: fresh } : { ok: false, error: "Order not found." }
    }
    if (error || !f) {
      await undo()
      return { ok: false, error: "The fulfillment could not be saved." }
    }
    const { error: itemsError } = await db.from("fulfillment_items").insert(t.items.map((i) => ({ fulfillment_id: f.id, order_id: i.orderId, quantity: i.quantity })))
    if (itemsError) {
      await db.from("fulfillments").delete().eq("id", f.id)
      await undo()
      return { ok: false, error: "The fulfillment could not be saved." }
    }
    made.push({ id: f.id, parcel: t })
  }

  for (const [n, { id, parcel: t }] of made.entries()) {
    await db.rpc("physical_fulfill", { p_fulfillment: id })
    await db.from("fulfillment_events").insert({ fulfillment_id: id, status: "shipped", message: pickup ? "Ready for pickup" : t.tracking ? `${t.carrier ?? "Carrier"} ${t.tracking}` : "Marked as shipped", source: input.partner ? "provider" : "manual" })
    const count = t.items.reduce((m, i) => m + i.quantity, 0)
    const parcelNote = made.length > 1 ? ` (parcel ${n + 1} of ${made.length})` : ""
    await addOrderEvent(db, {
      checkoutId,
      creatorId,
      kind: "fulfillment.created",
      message: pickup
        ? `${count} ${count === 1 ? "item" : "items"} ready for pickup`
        : `${count} ${count === 1 ? "item" : "items"} shipped${input.partner ? ` by ${input.partner.name}` : ""}${t.tracking ? `, ${t.carrier ?? "tracking"} ${t.tracking}` : ""}${parcelNote}`,
      actor: input.partner ? "webhook" : "creator",
      key: `fulfilled:${id}`,
    })
  }
  /* One email for the batch, keyed by its first parcel as a single parcel's always was. */
  if (input.notifyBuyer !== false) await queueShipmentEmail(db, checkoutId, creatorId, made[0].id, "shipped", undefined, made.length > 1 ? made.map((m) => m.id) : undefined)
  const updated = await restate(db, creatorId, checkoutId)
  return updated ? { ok: true, order: updated } : { ok: false, error: "Order not found." }
}

/**
 * Why a shipment can't be cancelled because of a return, or null. Cancelling it takes its items off
 * what was fulfilled; a return (asked, approved, on its way, received or complete) counts on them
 * having gone out, and a received one put them back on the shelf already.
 */
async function shipmentInReturn(db: Db, creatorId: string, checkoutId: string, fulfillmentId: string): Promise<string | null> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  const shipment = order?.shipments.find((s) => s.id === fulfillmentId)
  if (!order || !shipment) return null
  const live = order.returns.filter((r) => r.status !== "rejected" && r.status !== "cancelled")
  for (const item of shipment.items) {
    const line = order.lines.find((l) => l.orderId === item.orderId)
    const inReturns = live.reduce((n, r) => n + r.items.filter((i) => i.orderId === item.orderId).reduce((m, i) => m + i.quantity, 0), 0)
    if (line && inReturns > 0 && line.fulfilled - item.quantity < inReturns) return "Items in this shipment are in a return. Close the return first, or keep the shipment."
  }
  return null
}

export async function updateShipment(
  db: Db,
  creatorId: string,
  fulfillmentId: string,
  input: {
    status?: unknown
    carrier?: unknown
    trackingNumber?: unknown
    trackingUrl?: unknown
    notifyBuyer?: boolean
    partner?: { name: string }
    /** Courier tracking (lib/physical/tracking): what went wrong, for the Delivery issue email, and when the carrier says it arrived. */
    problem?: string | null
    deliveredAt?: string | null
  },
): Promise<Outcome> {
  const { data: f } = await db.from("fulfillments").select("*").eq("id", fulfillmentId).eq("creator_id", creatorId).maybeSingle()
  if (!f) return { ok: false, error: "Shipment not found.", status: 404 }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const trackingChanged = "trackingNumber" in input || "carrier" in input || "trackingUrl" in input
  if (trackingChanged) {
    const carrier = "carrier" in input ? cleanText(input.carrier, 40) : f.carrier
    const tracking = "trackingNumber" in input ? normaliseTrackingNumber(cleanText(input.trackingNumber, 80)) : f.tracking_number
    if (tracking && !/^[A-Za-z0-9-]{4,60}$/.test(tracking)) return { ok: false, error: "Check the tracking number." }
    let url = "trackingUrl" in input ? cleanText(input.trackingUrl, 500) : null
    if (url && !/^https:\/\/[^\s"'<>]+$/.test(url)) return { ok: false, error: "The tracking link must start with https://." }
    /* The shipping country, for a carrier's own national tracking page (DPD in Romania). */
    let country: string | null = null
    if (!url && tracking && f.checkout_id) {
      const { data: co } = await db.from("commerce_checkouts").select("shipping_address").eq("id", f.checkout_id).maybeSingle()
      country = typeof co?.shipping_address?.country === "string" ? co.shipping_address.country : null
    }
    url = url ?? trackingUrl(carrier, tracking, country) ?? (tracking === f.tracking_number ? f.tracking_url : null)
    Object.assign(patch, { carrier, tracking_number: tracking, tracking_url: url })
  }
  const to = typeof input.status === "string" ? (input.status as ShipmentStatus) : null
  if (to === "cancelled" && canMoveShipment(f.status, to)) {
    /*
      Its items go back to unfulfilled and back on the shelf. Not while they are in a return (open, or
      received and restocked): the return already brings them back, and both would put them on the shelf.
    */
    const refused = await shipmentInReturn(db, creatorId, f.checkout_id, fulfillmentId)
    if (refused) return { ok: false, error: refused }
  }
  if (to) {
    if (!canMoveShipment(f.status, to)) return { ok: false, error: "A shipment can't go back to that status." }
    patch.status = to
    if (to === "delivered") {
      const said = typeof input.deliveredAt === "string" ? Date.parse(input.deliveredAt) : NaN
      patch.delivered_at = Number.isFinite(said) && said <= Date.now() ? new Date(said).toISOString() : new Date().toISOString()
    }
    if (to === "cancelled") patch.cancelled_at = new Date().toISOString()
  }
  const { error } = await db.from("fulfillments").update(patch).eq("id", fulfillmentId).eq("creator_id", creatorId)
  if (error) return { ok: false, error: "The shipment could not be updated." }

  if (to === "cancelled") {
    /* The items are to ship again: back on the shelf and committed to this order. */
    const { data: items } = await db.from("fulfillment_items").select("order_id, quantity").eq("fulfillment_id", fulfillmentId)
    for (const i of (items ?? []) as { order_id: string; quantity: number }[]) {
      const { data: moved } = await db.from("inventory_movements").select("variant_id, location_id").eq("idempotency_key", `fulfill:${fulfillmentId}:${i.order_id}`).maybeSingle()
      if (!moved?.variant_id || !moved.location_id) continue
      /*
        Held for this order again the way checkout held it: the reservation physical_fulfill counted as
        fulfilled owes these units again. Without that, cancelling the order (or refunding it in full)
        afterwards released nothing, since physical_cancel_unfulfilled only lets go of what a
        reservation still owes, and the units stayed committed for good. An order with no open
        reservation (cancelled since, or sold without one) gets the units back on the shelf only.
      */
      const { data: held } = await db
        .from("inventory_reservations")
        .select("id, fulfilled_quantity")
        .eq("checkout_id", f.checkout_id)
        .eq("variant_id", moved.variant_id)
        .eq("location_id", moved.location_id)
        .in("status", ["sold", "fulfilled"])
        .order("fulfilled_quantity", { ascending: false })
        .limit(1)
        .maybeSingle()
      const res = held as { id: string; fulfilled_quantity: number } | null
      const back = res ? Math.max(0, Math.min(i.quantity, Number(res.fulfilled_quantity) || 0)) : 0
      const done = await applyInventory(db, { creatorId, variantId: moved.variant_id, locationId: moved.location_id, onHand: i.quantity, committed: back, reason: "correction", refType: "fulfillment", refId: fulfillmentId, key: `unfulfill:${fulfillmentId}:${i.order_id}`, note: "Shipment cancelled" })
      /* Once: a repeat of the same movement (its key) changes neither the shelf nor the reservation. */
      if (res && back > 0 && done.ok && done.applied) {
        await db.from("inventory_reservations").update({ fulfilled_quantity: Number(res.fulfilled_quantity) - back, status: "sold", updated_at: new Date().toISOString() }).eq("id", res.id)
      }
    }
  }
  if (to || trackingChanged) {
    await db.from("fulfillment_events").insert({ fulfillment_id: fulfillmentId, status: to ?? f.status, message: to ? (input.partner ? `From ${input.partner.name}` : null) : "Tracking updated", source: input.partner ? "provider" : "manual" })
    await addOrderEvent(db, {
      checkoutId: f.checkout_id,
      creatorId,
      kind: to ? `fulfillment.${to}` : "fulfillment.tracking",
      message:
        to === "delivered"
          ? f.provider === "pickup"
            ? "Picked up by the buyer"
            : input.partner
              ? `Delivered, from ${input.partner.name}`
              : "Marked as delivered"
          : to === "cancelled"
            ? "Shipment cancelled, items back to unfulfilled"
            : to === "failed" && input.problem
              ? `Delivery problem: ${String(input.problem).slice(0, 200)}`
              : to
                ? `Shipment ${to.replace(/_/g, " ")}`
              : "Tracking updated",
      actor: input.partner ? "webhook" : "creator",
      ...(to === "failed" && (input.notifyBuyer === false || input.problem) ? { detail: { ...(input.notifyBuyer === false ? { notifyBuyer: false } : {}), ...(input.problem ? { problem: String(input.problem).slice(0, 200) } : {}) } } : {}),
    })
  }
  /* A new number is followed again from the start (lib/physical/tracking). Quiet before part 160. */
  if (trackingChanged && patch.tracking_number !== f.tracking_number) await trackingNumberChanged(db, fulfillmentId).catch(() => undefined)
  if (input.notifyBuyer !== false && f.notify_buyer !== false) {
    if (to === "delivered" || to === "out_for_delivery") await queueShipmentEmail(db, f.checkout_id, creatorId, fulfillmentId, to)
    /*
      A failed delivery (Delivery issue) is not queued here: the
      "fulfillment.failed" entry above queues it, with the seller's own email,
      in one place (events-server, jobs-server queueDeliveryProblem), once per
      time it fails. Unticked notify rides along on that entry's detail.
    */
    /* A delivered parcel whose number is corrected afterwards: the record is fixed, the buyer, who has it already, is not told it is "on the way". */
    else if (trackingChanged && !to && f.status !== "delivered" && patch.tracking_number && patch.tracking_number !== f.tracking_number) {
      /* A first number on a shipment sent without one reads as "on the way"; a changed one says it changed. */
      await queueShipmentEmail(db, f.checkout_id, creatorId, fulfillmentId, f.tracking_number ? "tracking" : "shipped", `email:tracking:${fulfillmentId}:${patch.tracking_number}`)
    }
  }
  const updated = await restate(db, creatorId, f.checkout_id)
  return updated ? { ok: true, order: updated } : { ok: false, error: "Order not found." }
}

/**
 * Processing: the seller has started on the order (packing it, or waiting on
 * a partner). On or off; it only shows while nothing has shipped yet.
 */
export async function markProcessing(db: Db, creatorId: string, checkoutId: string, on: boolean): Promise<Outcome> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (order.cancelledAt) return { ok: false, error: "This order was cancelled." }
  if (order.status !== "paid" && order.status !== "partially_refunded") return { ok: false, error: "Only a paid order can be processed." }
  if (on === !!order.processingAt) return { ok: true, order }
  const now = new Date().toISOString()
  await db.from("commerce_checkouts").update({ processing_at: on ? now : null, updated_at: now }).eq("id", checkoutId).eq("creator_id", creatorId)
  await addOrderEvent(db, { checkoutId, creatorId, kind: on ? "order.processing" : "order.unprocessing", message: on ? "Marked as processing" : "Back to unfulfilled", actor: "creator" })
  const updated = await restate(db, creatorId, checkoutId)
  return updated ? { ok: true, order: updated } : { ok: false, error: "Order not found." }
}

/**
 * CHANGE THE SHIPPING ADDRESS, before anything has shipped: the buyer wrote
 * to say they mistyped it, as Shopify's "Edit shipping address". In the
 * same country only: the shipping price and the tax were worked out for
 * that country at checkout, and a new one could change both. Checked like
 * the checkout checks it (./address readAddress), kept on the order, put on
 * its timeline with the old address, and the buyer is emailed the new one
 * (Order updated), unless the store unticks that.
 */
export async function updateAddress(db: Db, creatorId: string, checkoutId: string, input: { address: unknown; notifyBuyer?: boolean }): Promise<Outcome> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (order.cancelledAt) return { ok: false, error: "This order was cancelled." }
  if (order.deliveryMethod === "pickup") return { ok: false, error: "This order is picked up, so it has no shipping address." }
  if (!order.lines.some((l) => l.requiresShipping)) return { ok: false, error: "Nothing in this order ships." }
  if (order.shipments.some((x) => x.status !== "cancelled")) return { ok: false, error: "Part of this order has shipped, so its address can't change here. Contact the carrier to redirect it." }
  const read = readAddress(input.address, { nameFields: "last_only", company: "optional", phone: "optional", address2: "optional" })
  if (read.ok === false) return { ok: false, error: read.error }
  const before = (order.address ?? {}) as Record<string, unknown>
  const from = typeof before.country === "string" ? before.country.toUpperCase() : null
  if (from && read.address.country !== from) return { ok: false, error: "Keep the same country: shipping and tax were worked out for it at checkout. To send it abroad, cancel and refund the order and ask the buyer to order again." }
  const was = addressLines(before as never).join(", ")
  const now = addressLines(read.address).join(", ")
  if (was === now) return { ok: true, order }
  const at = new Date().toISOString()
  const { error } = await db.from("commerce_checkouts").update({ shipping_address: read.address, updated_at: at }).eq("id", checkoutId).eq("creator_id", creatorId)
  if (error) return { ok: false, error: "The address could not be saved." }
  await addOrderEvent(db, {
    checkoutId,
    creatorId,
    kind: "order.address_changed",
    message: "Shipping address changed",
    detail: { from: was.slice(0, 500), to: now.slice(0, 500) },
    actor: "creator",
  })
  if (input.notifyBuyer !== false) await queueOrderUpdatedEmail(db, checkoutId, creatorId, now.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 120))
  const updated = await restate(db, creatorId, checkoutId)
  return updated ? { ok: true, order: updated } : { ok: false, error: "Order not found." }
}

/** Nothing shipped yet: the order is cancelled and its stock goes back. Money is refunded separately. `by` the buyer (./buyer-cancel-server.ts): the seller is emailed. */
export async function cancelOrder(db: Db, creatorId: string, checkoutId: string, reason: unknown, by: "creator" | "buyer" = "creator"): Promise<Outcome> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (order.cancelledAt) return { ok: true, order }
  if (order.shipments.some((s) => s.status !== "cancelled")) return { ok: false, error: "Part of this order has shipped. Cancel the shipment first, or start a return." }
  await db.rpc("physical_cancel_unfulfilled", { p_checkout: checkoutId })
  const now = new Date().toISOString()
  /* Cash on delivery not collected: no money ever moved, so its lines stop being a sale. "failed" is what every figure already leaves out (lib/orders/order-view isSale, the analytics SQL), and the order reads Voided (paymentOf). A card order is cancelled and then refunded instead. */
  if (order.payment === "cod_due") await db.from("orders").update({ status: "failed" }).eq("checkout_id", checkoutId).eq("payment_method", COD_PAYMENT_METHOD)
  await db.from("commerce_checkouts").update({ cancelled_at: now, cancel_reason: cleanText(reason, 300) ?? (by === "buyer" ? CANCELLED_BY_BUYER : "Cancelled by the shop"), fulfillment_status: order.lines.some((l) => l.requiresShipping) ? "cancelled" : "not_required", updated_at: now }).eq("id", checkoutId).eq("creator_id", creatorId)
  await addOrderEvent(db, { checkoutId, creatorId, kind: "order.cancelled", message: `${by === "buyer" ? "The buyer cancelled this order" : "Order cancelled"}${cleanText(reason, 300) ? `: ${cleanText(reason, 300)}` : ""}. Stock released.`, actor: by, key: `cancelled:${checkoutId}` })
  await queueCancelledEmail(db, checkoutId, creatorId)
  const fresh = await loadOrder(db, { creatorId, checkoutId })
  return fresh ? { ok: true, order: fresh } : { ok: false, error: "Order not found." }
}

/**
 * HOLD FULFILLMENT, as Shopify has it: the shop keeps an unfulfilled order from being shipped, labelled or sent to a
 * partner, with a reason and an optional note. Released, whatever was held back goes (jobs-server releaseHeldJobs).
 */
export async function holdOrder(db: Db, creatorId: string, checkoutId: string, input: { reason: unknown; note: unknown }): Promise<Outcome> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (order.cancelledAt) return { ok: false, error: "This order was cancelled." }
  if (!order.lines.some((l) => l.requiresShipping && l.quantity - l.fulfilled > 0)) return { ok: false, error: "Nothing on this order is left to fulfil." }
  if (holdOf(order.events)) return { ok: true, order }
  const reason = holdReason(input.reason) ?? "other"
  const note = cleanText(input.note, 200)
  await addOrderEvent(db, { checkoutId, creatorId, kind: HOLD, message: `Fulfillment on hold: ${holdReasonLabel(reason)}${note ? `. ${note}` : ""}`, detail: { reason, ...(note ? { note } : {}) }, actor: "creator", key: `hold:${checkoutId}:${Date.now()}` })
  const fresh = await loadOrder(db, { creatorId, checkoutId })
  return fresh ? { ok: true, order: fresh } : { ok: false, error: "Order not found." }
}

export async function releaseHold(db: Db, creatorId: string, checkoutId: string): Promise<Outcome> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (!holdOf(order.events)) return { ok: true, order }
  await addOrderEvent(db, { checkoutId, creatorId, kind: HOLD_RELEASED, message: "Hold released", actor: "creator", key: `hold_released:${checkoutId}:${Date.now()}` })
  if (!order.cancelledAt) await releaseHeldJobs(db, creatorId, checkoutId)
  const fresh = await loadOrder(db, { creatorId, checkoutId })
  return fresh ? { ok: true, order: fresh } : { ok: false, error: "Order not found." }
}

/**
 * THE BUYER ASKS TO CANCEL (./buyer-cancel.ts): from their order page, by
 * its token, while the order is still Unfulfilled and the shop takes such
 * requests. One entry on the timeline, keyed by the order, which emails the
 * seller; a second press finds it there and asks nothing again. Nothing is
 * cancelled or refunded here.
 */
export async function requestBuyerCancel(db: Db, receiptToken: string, input: { reason: unknown; enabled: boolean }): Promise<Outcome> {
  const order = await loadOrder(db, { receiptToken })
  if (!order || !order.creatorId) return { ok: false, error: "Order not found.", status: 404 }
  const state = buyerCancelState({ ...order, events: await cancelEvents(db, order.id) }, input.enabled)
  if (state === "requested") return { ok: true, order }
  if (state === "cancelled") return { ok: false, error: "This order is already cancelled." }
  if (state === "declined") return { ok: false, error: "The shop is going ahead with this order. Reply to your order email to ask about it." }
  if (state !== "can_request") return { ok: false, error: input.enabled ? "This order can't be cancelled here any more: the shop has started on it. Reply to your order email to ask." : "This shop doesn't take cancellations here. Reply to your order email to ask." }
  const reason = cleanCancelReason(input.reason)
  await addOrderEvent(db, {
    checkoutId: order.id,
    creatorId: order.creatorId,
    kind: CANCEL_REQUESTED,
    message: `The buyer asked to cancel this order${reason ? `: ${reason}` : ""}`,
    detail: reason ? { reason } : null,
    actor: "buyer",
    key: `cancel_request:${order.id}`,
  })
  const fresh = await loadOrder(db, { receiptToken })
  return fresh ? { ok: true, order: fresh } : { ok: false, error: "Order not found." }
}

/**
 * The cancel request's entries alone, newest first. An order read by its token (the buyer's page) carries no
 * timeline, since the shop's own notes are on it; these two are the buyer's business, so they are read apart,
 * with whether it went to a partner (./buyer-cancel.ts cancelMode).
 */
export async function cancelEvents(db: Db, checkoutId: string): Promise<OrderEvent[]> {
  const { data } = await db
    .from("commerce_order_events")
    .select("id, kind, message, actor, created_at, detail")
    .eq("checkout_id", checkoutId)
    .in("kind", [CANCEL_REQUESTED, CANCEL_DECLINED, FORWARDED])
    .order("created_at", { ascending: false })
    .limit(10)
  return ((data ?? []) as { id: number; kind: string; message: string | null; actor: OrderEvent["actor"]; created_at: string; detail: Record<string, unknown> | null }[]).map((r) => ({ id: r.id, kind: r.kind, message: r.message ?? "", actor: r.actor, createdAt: r.created_at, detail: r.detail }))
}

/** The seller keeps the order the buyer asked to cancel. The buyer's page says the shop is going ahead. */
export async function declineBuyerCancel(db: Db, creatorId: string, checkoutId: string, note: unknown): Promise<Outcome> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (!openCancelRequest(order)) return { ok: true, order }
  const said = cleanText(note, 200)
  await addOrderEvent(db, { checkoutId, creatorId, kind: CANCEL_DECLINED, message: `Kept the order the buyer asked to cancel${said ? `: ${said}` : ""}`, actor: "creator", key: `cancel_declined:${checkoutId}` })
  const fresh = await loadOrder(db, { creatorId, checkoutId })
  return fresh ? { ok: true, order: fresh } : { ok: false, error: "Order not found." }
}

/**
 * A NOTE ON THE TIMELINE, for the shop alone: "called the buyer, sending
 * Monday". An entry like any other on the order's timeline, by the shop, so
 * it sits in the history where it happened. Line breaks are kept; the whole
 * note is in the entry's detail and its first 300 characters in its message
 * (the column's size, part 78). A key from the composer makes a double press
 * one note. What a note may hold is ./notes.ts.
 */
export async function addNote(db: Db, creatorId: string, checkoutId: string, text: unknown, key: unknown): Promise<Outcome> {
  const note = cleanNote(text)
  if (!note) return { ok: false, error: "Write the note first." }
  const { data: co } = await db.from("commerce_checkouts").select("id").eq("id", checkoutId).eq("creator_id", creatorId).maybeSingle()
  if (!co) return { ok: false, error: "Order not found.", status: 404 }
  const k = cleanText(key, 120)
  const { error } = await db.from("commerce_order_events").insert({
    checkout_id: checkoutId,
    creator_id: creatorId,
    kind: "note",
    message: note.length > 300 ? `${note.slice(0, 299)}…` : note,
    detail: { text: note },
    actor: "creator",
    idempotency_key: k ? `note:${checkoutId}:${k}` : null,
  })
  if (error && error.code !== "23505") return { ok: false, error: "The note could not be saved. Try again." }
  const fresh = await loadOrder(db, { creatorId, checkoutId })
  return fresh ? { ok: true, order: fresh } : { ok: false, error: "Order not found." }
}

/**
 * CASH ON DELIVERY, RECEIVED: the seller says the buyer paid in cash. Only
 * for a cash order still to collect and not cancelled; once, however often
 * it is pressed (the update names the empty column). The order reads Paid
 * from then on, and a refund of it is cash given back (app/api/stripe/refund).
 */
export async function markCashCollected(db: Db, creatorId: string, checkoutId: string): Promise<Outcome> {
  const now = new Date().toISOString()
  const { data: changed, error } = await db
    .from("commerce_checkouts")
    .update({ cod_collected_at: now, updated_at: now })
    .eq("id", checkoutId)
    .eq("creator_id", creatorId)
    .eq("provider", COD_PROVIDER)
    .eq("status", "paid")
    .is("cancelled_at", null)
    .is("cod_collected_at", null)
    .select("id, total_cents, currency")
  if (error) return { ok: false, error: "Could not mark it as paid. Try again." }
  const row = Array.isArray(changed) ? (changed[0] as { total_cents?: number; currency?: string } | undefined) : undefined
  if (row) {
    await addOrderEvent(db, {
      checkoutId,
      creatorId,
      kind: "payment.paid",
      /* In the currency's own decimals: ¥2,500, never "25.00 JPY". */
      message: `Cash on delivery received: ${formatMinor(row.total_cents ?? 0, currencyCode(row.currency) ?? "USD", "en")}`,
      actor: "creator",
      key: `cod_collected:${checkoutId}`,
    })
  }
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (!row && order.payment !== "cod_collected") return { ok: false, error: order.cancelledAt ? "This order was cancelled." : "This order isn't paid in cash on delivery.", status: 409 }
  return { ok: true, order }
}

/**
 * CASH ON DELIVERY, REFUSED: the buyer would not pay when the courier came,
 * or the parcel could not be delivered. Nothing was paid, so nothing is
 * refunded. What went out comes back as a return the shop has opened
 * (restocked when it is marked received); what never left is let go as a
 * cancel lets it go; the lines stop being a sale, and the order reads
 * cancelled with the reason. Only for a cash order still to collect.
 * Safe to press twice: a refused order is already cancelled.
 */
export async function refusedOnDelivery(db: Db, creatorId: string, checkoutId: string): Promise<Outcome> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (order.cancelledAt) return { ok: true, order }
  if (order.payment === "cod_collected") return { ok: false, error: "The cash was already collected. Start a return and refund it instead." }
  if (order.payment !== "cod_due") return { ok: false, error: "Only an order paid in cash on delivery can be refused on delivery." }
  /* Everything that went out and isn't already in an open return. */
  const out = returnableQuantities(progressOf(order))
  for (const r of order.returns.filter((x) => ["requested", "approved", "in_transit"].includes(x.status))) {
    for (const i of r.items) out.set(i.orderId, Math.max(0, (out.get(i.orderId) ?? 0) - i.quantity))
  }
  const items = [...out.entries()].filter(([, q]) => q > 0).map(([orderId, quantity]) => ({ orderId, quantity, restock: true }))
  if (items.length) {
    const opened = await openReturn(db, checkoutId, { creatorId, by: "creator", items, method: "ship_back", note: "Refused on delivery" })
    if (opened.ok === false) return opened
  }
  await db.rpc("physical_cancel_unfulfilled", { p_checkout: checkoutId })
  const now = new Date().toISOString()
  /* No money ever moved: the lines stop being a sale, as a cancelled cash order's do. */
  await db.from("orders").update({ status: "failed" }).eq("checkout_id", checkoutId).eq("payment_method", COD_PAYMENT_METHOD)
  await db.from("commerce_checkouts").update({ cancelled_at: now, cancel_reason: "Refused on delivery", updated_at: now }).eq("id", checkoutId).eq("creator_id", creatorId).is("cancelled_at", null)
  await addOrderEvent(db, {
    checkoutId,
    creatorId,
    kind: "order.cancelled",
    message: items.length ? "Refused on delivery. Nothing was paid. What was sent comes back as a return." : "Refused on delivery. Nothing was paid. Stock released.",
    actor: "creator",
    key: `refused:${checkoutId}`,
  })
  await queueCancelledEmail(db, checkoutId, creatorId)
  /* The stored status the list and its filters read: Cancelled, never left at Unfulfilled or Shipped. */
  const fresh = await restate(db, creatorId, checkoutId)
  return fresh ? { ok: true, order: fresh } : { ok: false, error: "Order not found." }
}

export async function saveNote(db: Db, creatorId: string, checkoutId: string, note: unknown): Promise<{ ok: boolean }> {
  const { error } = await db.from("commerce_checkouts").update({ merchant_note: cleanText(note, 4000), updated_at: new Date().toISOString() }).eq("id", checkoutId).eq("creator_id", creatorId)
  return { ok: !error }
}

/**
 * REFUNDED IN FULL BEFORE ANYTHING SHIPPED: the stock goes back. Without
 * this, a refunded order kept its units committed for ever, and the shop
 * showed them as not available. Only when the whole amount is refunded and
 * no shipment is out: a partial refund, or one after shipping, leaves stock
 * to the return flow, which restocks what comes back. Safe to call twice.
 * The rule is ./status refundReleasesStock, pure, so the tests run it.
 */
async function releaseRefundedStock(db: Db, creatorId: string, order: PhysicalOrder, actor: "creator" | "webhook"): Promise<void> {
  if (!refundReleasesStock(order)) return
  await db.rpc("physical_cancel_unfulfilled", { p_checkout: order.id })
  const now = new Date().toISOString()
  await db.from("commerce_checkouts").update({ cancelled_at: now, cancel_reason: "Refunded in full before it shipped", fulfillment_status: order.lines.some((l) => l.requiresShipping) ? "cancelled" : "not_required", updated_at: now }).eq("id", order.id).eq("creator_id", creatorId).is("cancelled_at", null)
  await addOrderEvent(db, { checkoutId: order.id, creatorId, kind: "order.cancelled", message: "Refunded in full before it shipped. Stock released.", actor, key: `refund_release:${order.id}` })
}

/**
 * The return a refund was for: the one named, else the one return waiting
 * on its money (received, else the only one approved or on its way back).
 * Its refunded total grows by the refund, so "Return complete" says what
 * went back and the order page shows it.
 */
export function returnForRefund(returns: Pick<ReturnRecord, "id" | "status">[], named: string | null): string | null {
  if (named) return returns.some((r) => r.id === named) ? named : null
  const received = returns.filter((r) => r.status === "received")
  if (received.length === 1) return received[0].id
  const waiting = returns.filter((r) => r.status === "received" || r.status === "in_transit" || r.status === "approved")
  return waiting.length === 1 ? waiting[0].id : null
}

async function countRefundOnReturn(db: Db, creatorId: string, returns: ReturnRecord[], named: string | null, amountCents: number): Promise<void> {
  if (!(amountCents > 0)) return
  const id = returnForRefund(returns, named)
  const r = id ? returns.find((x) => x.id === id) : null
  if (!r) return
  await db.from("commerce_returns").update({ refunded_cents: (r.refundedCents ?? 0) + amountCents, updated_at: new Date().toISOString() }).eq("id", r.id).eq("creator_id", creatorId)
}

/** After the existing refund route refunded lines: the order and its timeline catch up. */
export async function noteRefund(db: Db, creatorId: string, checkoutId: string, returnId: string | null): Promise<Outcome> {
  const before = await loadOrder(db, { creatorId, checkoutId })
  if (!before) return { ok: false, error: "Order not found.", status: 404 }
  /*
    What the order had refunded before this refund: the checkout's stored
    total, which restate below moves on. The lines (and so `before`) already
    carry the new refund, since the refund route wrote them first.
  */
  const { data: stored } = await db.from("commerce_checkouts").select("refunded_cents").eq("id", checkoutId).eq("creator_id", creatorId).maybeSingle()
  const storedBefore = Number((stored as { refunded_cents?: number | null } | null)?.refunded_cents ?? before.refundedCents)
  const updated = await restate(db, creatorId, checkoutId)
  if (!updated) return { ok: false, error: "Order not found." }
  if (updated.refundedCents > 0) await addOrderEvent(db, {
    checkoutId,
    creatorId,
    kind: "payment.refunded",
    message: `${updated.refundedCents >= updated.totalCents ? "Refunded in full" : "Partly refunded"}: ${formatMinor(updated.refundedCents, String(updated.currency || "USD"), "en")}`,
    actor: "creator",
    key: `refund_total:${checkoutId}:${updated.refundedCents}`,
  })
  /* Against the stored total: the lines already carry this refund (the refund route wrote them first), so `before` does too and nothing was ever queued. */
  if (updated.refundedCents > storedBefore) await queueRefundEmail(db, checkoutId, creatorId, updated.refundedCents, updated.refundedCents - storedBefore)
  await countRefundOnReturn(db, creatorId, before.returns, returnId, updated.refundedCents - Math.min(storedBefore, before.refundedCents))
  await releaseRefundedStock(db, creatorId, updated, "creator")
  const fresh = await loadOrder(db, { creatorId, checkoutId })
  return fresh ? { ok: true, order: fresh } : { ok: false, error: "Order not found." }
}

/**
 * A REFUND MADE ANYWHERE, ON THE ORDER. Stripe's charge.refunded writes each
 * line's refund (lib/stripe/refund-sync.ts); the order list reads the
 * checkout's own status and refunded total, which only Storelib's own Refund
 * button used to restate. So a refund made in the Stripe dashboard showed on
 * the order page and not in the list. Called by the webhook after the lines
 * are written: every checkout the payment paid for is restated, with one
 * timeline line per new total (the key makes a retried delivery a no-op).
 */
export async function syncCheckoutRefunds(db: Db, paymentIntentId: string): Promise<number> {
  const { data } = await db.from("orders").select("checkout_id").eq("stripe_payment_intent_id", paymentIntentId)
  const ids = [...new Set(((data ?? []) as { checkout_id: string | null }[]).map((r) => r.checkout_id).filter((x): x is string => !!x))]
  let done = 0
  for (const checkoutId of ids) {
    const { data: co } = await db.from("commerce_checkouts").select("creator_id, refunded_cents").eq("id", checkoutId).maybeSingle()
    const creatorId = (co as { creator_id?: string } | null)?.creator_id
    if (!creatorId) continue
    const before = Number((co as { refunded_cents?: number | null }).refunded_cents ?? 0)
    const updated = await restate(db, creatorId, checkoutId)
    if (!updated || updated.refundedCents <= 0) continue
    /* A refund made in Stripe, or one the webhook saw first: counted on the return waiting for it. */
    await countRefundOnReturn(db, creatorId, updated.returns, null, updated.refundedCents - before)
    /* A refund made in Stripe's dashboard reaches the buyer as well; one made with the Refund button was already emailed (same key). */
    if (updated.refundedCents > before) await queueRefundEmail(db, checkoutId, creatorId, updated.refundedCents, updated.refundedCents - before)
    await addOrderEvent(db, {
      checkoutId,
      creatorId,
      kind: "payment.refunded",
      message: `${updated.refundedCents >= updated.totalCents ? "Refunded in full" : "Partly refunded"}: ${formatMinor(updated.refundedCents, String(updated.currency || "USD"), "en")}`,
      actor: "webhook",
      key: `refund_total:${checkoutId}:${updated.refundedCents}`,
    })
    await releaseRefundedStock(db, creatorId, updated, "webhook")
    done++
  }
  return done
}

/* ── returns ──────────────────────────────────────────────────────────── */


export async function openReturn(
  db: Db,
  checkoutId: string,
  input: { creatorId: string; by: "creator" | "buyer"; items: { orderId: string; quantity: number; restock?: boolean }[]; reason?: unknown; method?: unknown; note?: unknown },
): Promise<Outcome & { returnId?: string }> {
  const order = await loadOrder(db, { creatorId: input.creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (order.status === "pending" || order.status === "failed" || order.status === "expired" || order.status === "cancelled") return { ok: false, error: "Only a paid order can be returned." }
  const returnable = returnableQuantities(progressOf(order))
  /* Items already in an open return are not offered twice. */
  for (const r of order.returns.filter((x) => ["requested", "approved", "in_transit"].includes(x.status))) {
    for (const i of r.items) returnable.set(i.orderId, Math.max(0, (returnable.get(i.orderId) ?? 0) - i.quantity))
  }
  const items = mergeItemQuantities(input.items.map((i) => ({ orderId: i.orderId, quantity: i.quantity, restock: i.restock !== false })))
  if (items.length === 0) return { ok: false, error: "Choose at least one item to return." }
  for (const i of items) {
    const left = returnable.get(i.orderId) ?? 0
    if (i.quantity > left) return { ok: false, error: left === 0 ? "That item can't be returned." : `Only ${left} of that item can be returned.` }
  }
  /* The store's own return reasons (Settings › Returns and refunds); one not on the list is kept as "other". */
  const reasonList = await reasonsFor(db, input.creatorId, "return")
  const reason = acceptedReason(input.reason, reasonList)
  const method = ["ship_back", "drop_off", "no_return_needed"].includes(String(input.method)) ? String(input.method) : "ship_back"
  const { data: r, error } = await db
    .from("commerce_returns")
    .insert({
      checkout_id: checkoutId,
      creator_id: input.creatorId,
      status: input.by === "creator" ? "approved" : "requested",
      reason,
      method,
      requested_by: input.by,
      customer_note: input.by === "buyer" ? cleanText(input.note, 1000) : null,
      merchant_note: input.by === "creator" ? cleanText(input.note, 1000) : null,
    })
    .select("id")
    .single()
  if (error || !r) return { ok: false, error: "The return could not be saved." }
  /* The label it was asked with, so a reason renamed or removed later still reads as it did. Part 109; without it, nothing. */
  await db.from("commerce_returns").update({ reason_label: reasonLabel(reason, "return", reasonList) }).eq("id", r.id).then(
    () => undefined,
    () => undefined,
  )
  const lineOf = new Map(order.lines.map((l) => [l.orderId, l]))
  const { error: itemsError } = await db.from("commerce_return_items").insert(
    items.map((i) => ({ return_id: r.id, order_id: i.orderId, quantity: i.quantity, restock: i.restock && lineOf.get(i.orderId)?.type === "physical", restock_location_id: lineOf.get(i.orderId)?.locationId ?? null })),
  )
  if (itemsError) {
    await db.from("commerce_returns").delete().eq("id", r.id)
    return { ok: false, error: "The return could not be saved." }
  }
  const count = items.reduce((n, i) => n + i.quantity, 0)
  await addOrderEvent(db, {
    checkoutId,
    creatorId: input.creatorId,
    kind: input.by === "buyer" ? "return.requested" : "return.created",
    message: `${input.by === "buyer" ? "Buyer asked to return" : "Return opened for"} ${count} ${count === 1 ? "item" : "items"}`,
    actor: input.by,
    key: `return:${r.id}`,
  })
  /* Opened by the store, it is approved at once and says so; asked for by the buyer, they hear their request arrived (Return requested). */
  await queueReturnEmail(db, checkoutId, input.creatorId, r.id, input.by === "creator" ? "approved" : "requested")
  const updated = await restate(db, input.creatorId, checkoutId)
  return updated ? { ok: true, order: updated, returnId: r.id } : { ok: false, error: "Order not found." }
}

const RETURN_FLOW: Record<string, string[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["in_transit", "received", "cancelled"],
  in_transit: ["received", "cancelled"],
  received: ["completed"],
}

export async function moveReturn(
  db: Db,
  creatorId: string,
  returnId: string,
  input: { status: unknown; note?: unknown; carrier?: unknown; trackingNumber?: unknown; restock?: Record<string, boolean> },
): Promise<Outcome> {
  const { data: r } = await db.from("commerce_returns").select("*").eq("id", returnId).eq("creator_id", creatorId).maybeSingle()
  if (!r) return { ok: false, error: "Return not found.", status: 404 }
  const to = String(input.status)
  if (!(RETURN_FLOW[r.status] ?? []).includes(to)) return { ok: false, error: "A return can't move to that status from here." }
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: to, updated_at: now }
  if (input.note !== undefined) patch.merchant_note = cleanText(input.note, 1000)
  if (input.carrier !== undefined) patch.carrier = cleanText(input.carrier, 40)
  if (input.trackingNumber !== undefined) patch.tracking_number = cleanText(input.trackingNumber, 60)
  if (to === "received") patch.received_at = now
  if (to === "completed" || to === "rejected" || to === "cancelled") patch.closed_at = now
  const { error } = await db.from("commerce_returns").update(patch).eq("id", returnId).eq("creator_id", creatorId)
  if (error) return { ok: false, error: "The return could not be updated." }

  if (to === "received") {
    /* Back on the shelf, where chosen: each item once (keyed by the item). */
    const { data: items } = await db.from("commerce_return_items").select("id, order_id, quantity, restock, restock_location_id, restocked_quantity").eq("return_id", returnId)
    let restocked = 0
    for (const i of (items ?? []) as Record<string, any>[]) {
      const want = input.restock && i.id in input.restock ? input.restock[i.id] : i.restock
      if (!want || !i.restock_location_id || i.restocked_quantity >= i.quantity) continue
      const { data: o } = await db.from("orders").select("variant_id").eq("id", i.order_id).maybeSingle()
      if (!o?.variant_id) continue
      const done = await applyInventory(db, { creatorId, variantId: o.variant_id, locationId: i.restock_location_id, onHand: i.quantity - i.restocked_quantity, reason: "returned_restock", refType: "return", refId: returnId, key: `restock:${i.id}` })
      if (done.ok) {
        await db.from("commerce_return_items").update({ restocked_quantity: i.quantity }).eq("id", i.id)
        restocked += i.quantity - i.restocked_quantity
      }
    }
    if (restocked > 0) await addOrderEvent(db, { checkoutId: r.checkout_id, creatorId, kind: "return.restocked", message: `${restocked} ${restocked === 1 ? "item" : "items"} back in stock`, actor: "creator", key: `restocked:${returnId}` })
  }
  await addOrderEvent(db, {
    checkoutId: r.checkout_id,
    creatorId,
    kind: `return.${to}`,
    message: to === "approved" ? "Return approved" : to === "rejected" ? "Return declined" : to === "in_transit" ? "Return on its way back" : to === "received" ? "Return received" : to === "completed" ? "Return closed" : "Return cancelled",
    actor: "creator",
    key: `return_${to}:${returnId}`,
  })
  if (to === "approved" || to === "rejected" || to === "received" || to === "completed") await queueReturnEmail(db, r.checkout_id, creatorId, returnId, to)
  const updated = await restate(db, creatorId, r.checkout_id)
  return updated ? { ok: true, order: updated } : { ok: false, error: "Order not found." }
}

/**
 * The next step for the seller on a paid order (lib/physical/fulfillment.ts
 * sellerNextStep): who ships each part and how that place hears of it. For
 * the seller's new order email; null for an order that doesn't ship.
 */
export async function sellerNextStepFor(db: Db, creatorId: string, checkoutId: string): Promise<string | null> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order || !order.lines.some((l) => l.requiresShipping)) return null
  const { data: locs } = await db.from("inventory_locations").select("id, name, forwarding").eq("creator_id", creatorId)
  const byId = new Map(((locs ?? []) as { id: string; name: string; forwarding: string | null }[]).map((l) => [l.id, l]))
  const groups = order.lines
    .filter((l) => l.requiresShipping)
    .map((l) => {
      const at = l.locationId ? byId.get(l.locationId) : undefined
      const method = l.fulfillmentMethod ?? "self"
      const forwarding = (["none", "email", "webhook", "provider"] as const).find((f) => f === at?.forwarding) ?? (method === "self" ? "none" : null)
      return { method, locationName: at?.name ?? null, forwarding }
    })
  return sellerNextStep({ pickup: order.deliveryMethod === "pickup", pickupAt: order.pickup?.name ?? null, local: order.delivery?.kind === "local", groups })
}

/* ── lists ────────────────────────────────────────────────────────────── */

export interface OrderSummary {
  id: string
  status: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  returnStatus: ReturnStatus
  buyerName: string | null
  buyerEmail: string | null
  totalCents: number
  currency: string
  itemCount: number
  country: string | null
  deliveryName: string | null
  paidAt: string | null
  createdAt: string
  firstOrderId: string | null
}

export async function listOrders(
  db: Db,
  creatorId: string,
  opts: { fulfillment?: string | null; limit?: number; before?: string | null } = {},
): Promise<OrderSummary[]> {
  let q = db
    .from("commerce_checkouts")
    .select("id, status, fulfillment_status, return_status, buyer_name, buyer_email, total_cents, currency, lines, shipping_address, shipping_rate, paid_at, created_at, refunded_cents")
    .eq("creator_id", creatorId)
    .in("status", ["paid", "refunded", "partially_refunded"])
    .order("paid_at", { ascending: false })
    .limit(Math.min(200, opts.limit ?? 50))
  if (opts.fulfillment) q = q.eq("fulfillment_status", opts.fulfillment)
  if (opts.before) q = q.lt("paid_at", opts.before)
  const { data } = await q
  const rows = (data ?? []) as Record<string, any>[]
  const firsts = new Map<string, string>()
  if (rows.length) {
    const { data: o } = await db.from("orders").select("id, checkout_id, created_at").in("checkout_id", rows.map((r) => r.id)).order("created_at", { ascending: true })
    for (const r of (o ?? []) as { id: string; checkout_id: string }[]) if (!firsts.has(r.checkout_id)) firsts.set(r.checkout_id, r.id)
  }
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    fulfillmentStatus: r.fulfillment_status,
    returnStatus: r.return_status,
    buyerName: r.buyer_name,
    buyerEmail: r.buyer_email,
    totalCents: r.total_cents,
    currency: r.currency,
    itemCount: ((r.lines ?? []) as { quantity: number }[]).reduce((n, l) => n + (l.quantity ?? 1), 0),
    country: r.shipping_address?.country ?? null,
    deliveryName: r.shipping_rate?.name ?? null,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    firstOrderId: firsts.get(r.id) ?? null,
  }))
}

/** The physical order an orders row belongs to, if any: the Orders page opens it from a line. */
export async function checkoutOfOrderRow(db: Db, creatorId: string, orderId: string): Promise<string | null> {
  const { data } = await db.from("orders").select("checkout_id, products!inner(creator_id)").eq("id", orderId).eq("products.creator_id", creatorId).maybeSingle()
  return data?.checkout_id ?? null
}
