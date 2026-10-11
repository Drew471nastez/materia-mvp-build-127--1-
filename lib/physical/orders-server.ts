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
import { queueCancelledEmail, queueOrderUpdatedEmail, queueRefundEmail, queueReturnEmail, queueShipmentEmail } from "./jobs-server"
import { addressLines, readAddress } from "./address"
import { canMoveShipment, fulfillmentStatusOf, mergeItemQuantities, refundReleasesStock, returnStatusOf, returnableQuantities, trackingUrl, unfulfilledQuantities, type LineProgress } from "./status"
import { readMethod, sellerNextStep } from "./fulfillment"
import { normaliseTrackingNumber } from "./carriers"
import { cleanNote } from "./notes"
import type { DeliveryMethod, FulfillmentMethod, FulfillmentStatus, PaymentStatus, PickupReady, ReturnStatus, ShipmentStatus } from "./types"
import { acceptedReason, reasonLabel } from "@/lib/store/reasons"
import { reasonsFor } from "@/lib/store/reasons-server"

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
  events: { status: string; message: string | null; occurredAt: string }[]
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
  couponCode: string | null
  address: Record<string, any> | null
  /** `kind` local: the seller brings it (lib/physical/local-delivery.ts), with their note. */
  delivery: { name: string; priceCents: number; minDays: number | null; maxDays: number | null; kind?: "ship" | "local"; note?: string | null } | null
  deliveryMethod: DeliveryMethod
  pickup: { locationId: string | null; name: string; address: string[]; instructions: string | null; ready: PickupReady; hours?: string | null } | null
  processingAt: string | null
  deliveredAt: string | null
  buyerNote: string | null
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
    fIds.length ? db.from("fulfillment_events").select("fulfillment_id, status, message, occurred_at").in("fulfillment_id", fIds).order("occurred_at", { ascending: false }) : Promise.resolve({ data: [] }),
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
    }
  })
  const refunded = lines.reduce((n, l) => n + l.refundedCents, 0)
  const eventsByF = new Map<string, Shipment["events"]>()
  for (const e of (fEvents ?? []) as { fulfillment_id: string; status: string; message: string | null; occurred_at: string }[]) {
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
  if (fulfillment === "fulfilled") patch.fulfilled_at = new Date().toISOString()
  if (fulfillment === "delivered" && !order.deliveredAt) patch.delivered_at = new Date().toISOString()
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
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (order.status !== "paid" && order.status !== "partially_refunded") return { ok: false, error: order.status === "refunded" ? "This order was refunded." : "Only a paid order can be fulfilled." }
  if (order.cancelledAt) return { ok: false, error: "This order was cancelled." }
  const open = unfulfilledQuantities(progressOf(order))
  const items = mergeItemQuantities(input.items.map((i) => ({ orderId: i.orderId, quantity: i.quantity })))
  if (items.length === 0) return { ok: false, error: "Choose at least one item to fulfil." }
  for (const i of items) {
    const left = open.get(i.orderId)
    if (left === undefined) return { ok: false, error: "That item is not part of this order." }
    if (i.quantity > left) return { ok: false, error: `Only ${left} left to fulfil on that item.` }
  }
  const pickup = order.deliveryMethod === "pickup"
  const carrier = pickup ? null : cleanText(input.carrier, 40)
  const tracking = pickup ? null : normaliseTrackingNumber(cleanText(input.trackingNumber, 80))
  if (tracking && !/^[A-Za-z0-9-]{4,60}$/.test(tracking)) return { ok: false, error: "Check the tracking number." }
  let url = pickup ? null : cleanText(input.trackingUrl, 500)
  if (url && !/^https:\/\/[^\s"'<>]+$/.test(url)) return { ok: false, error: "The tracking link must start with https://." }
  url = url ?? trackingUrl(carrier, tracking)
  const key = cleanText(input.key, 120)
  const firstLine = order.lines.find((l) => l.orderId === items[0].orderId)
  /* Where it ships from: one of the chosen lines' own locations, never an id taken on trust from the request. */
  const ownLocations = new Set(items.map((i) => order.lines.find((l) => l.orderId === i.orderId)?.locationId).filter((x): x is string => !!x))
  const asked = typeof input.locationId === "string" && ownLocations.has(input.locationId) ? input.locationId : null
  const locationId = pickup ? (order.pickup?.locationId ?? firstLine?.locationId ?? null) : (asked ?? firstLine?.locationId ?? null)

  const now = new Date().toISOString()
  const { data: f, error } = await db
    .from("fulfillments")
    .insert({
      checkout_id: checkoutId,
      creator_id: creatorId,
      location_id: locationId,
      status: "shipped",
      provider: pickup ? "pickup" : (input.partner?.provider ?? "manual"),
      carrier,
      tracking_number: tracking,
      tracking_url: url,
      notify_buyer: input.notifyBuyer !== false,
      idempotency_key: key ? `fulfil:${checkoutId}:${key}` : null,
      shipped_at: now,
    })
    .select("id")
    .single()
  if (error?.code === "23505") {
    const fresh = await loadOrder(db, { creatorId, checkoutId })
    return fresh ? { ok: true, order: fresh } : { ok: false, error: "Order not found." }
  }
  if (error || !f) return { ok: false, error: "The fulfillment could not be saved." }
  const { error: itemsError } = await db.from("fulfillment_items").insert(items.map((i) => ({ fulfillment_id: f.id, order_id: i.orderId, quantity: i.quantity })))
  if (itemsError) {
    await db.from("fulfillments").delete().eq("id", f.id)
    return { ok: false, error: "The fulfillment could not be saved." }
  }
  await db.rpc("physical_fulfill", { p_fulfillment: f.id })
  await db.from("fulfillment_events").insert({ fulfillment_id: f.id, status: "shipped", message: pickup ? "Ready for pickup" : tracking ? `${carrier ?? "Carrier"} ${tracking}` : "Marked as shipped", source: input.partner ? "provider" : "manual" })
  const count = items.reduce((n, i) => n + i.quantity, 0)
  await addOrderEvent(db, {
    checkoutId,
    creatorId,
    kind: "fulfillment.created",
    message: pickup
      ? `${count} ${count === 1 ? "item" : "items"} ready for pickup`
      : `${count} ${count === 1 ? "item" : "items"} shipped${input.partner ? ` by ${input.partner.name}` : ""}${tracking ? `, ${carrier ?? "tracking"} ${tracking}` : ""}`,
    actor: input.partner ? "webhook" : "creator",
    key: `fulfilled:${f.id}`,
  })
  if (input.notifyBuyer !== false) await queueShipmentEmail(db, checkoutId, creatorId, f.id, "shipped")
  const updated = await restate(db, creatorId, checkoutId)
  return updated ? { ok: true, order: updated } : { ok: false, error: "Order not found." }
}

export async function updateShipment(
  db: Db,
  creatorId: string,
  fulfillmentId: string,
  input: { status?: unknown; carrier?: unknown; trackingNumber?: unknown; trackingUrl?: unknown; notifyBuyer?: boolean; partner?: { name: string } },
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
    url = url ?? trackingUrl(carrier, tracking) ?? (tracking === f.tracking_number ? f.tracking_url : null)
    Object.assign(patch, { carrier, tracking_number: tracking, tracking_url: url })
  }
  const to = typeof input.status === "string" ? (input.status as ShipmentStatus) : null
  if (to) {
    if (!canMoveShipment(f.status, to)) return { ok: false, error: "A shipment can't go back to that status." }
    patch.status = to
    if (to === "delivered") patch.delivered_at = new Date().toISOString()
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
      await applyInventory(db, { creatorId, variantId: moved.variant_id, locationId: moved.location_id, onHand: i.quantity, committed: i.quantity, reason: "correction", refType: "fulfillment", refId: fulfillmentId, key: `unfulfill:${fulfillmentId}:${i.order_id}`, note: "Shipment cancelled" })
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
            : "Marked as delivered"
          : to === "cancelled"
            ? "Shipment cancelled, items back to unfulfilled"
            : to
              ? `Shipment ${to.replace(/_/g, " ")}`
              : "Tracking updated",
      actor: input.partner ? "webhook" : "creator",
      ...(to === "failed" && input.notifyBuyer === false ? { detail: { notifyBuyer: false } } : {}),
    })
  }
  if (input.notifyBuyer !== false && f.notify_buyer !== false) {
    if (to === "delivered" || to === "out_for_delivery") await queueShipmentEmail(db, f.checkout_id, creatorId, fulfillmentId, to)
    /*
      A failed delivery (Delivery issue) is not queued here: the
      "fulfillment.failed" entry above queues it, with the seller's own email,
      in one place (events-server, jobs-server queueDeliveryProblem), once per
      time it fails. Unticked notify rides along on that entry's detail.
    */
    else if (trackingChanged && !to && patch.tracking_number && patch.tracking_number !== f.tracking_number) {
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

/** Nothing shipped yet: the order is cancelled and its stock goes back. Money is refunded separately. */
export async function cancelOrder(db: Db, creatorId: string, checkoutId: string, reason: unknown): Promise<Outcome> {
  const order = await loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (order.cancelledAt) return { ok: true, order }
  if (order.shipments.some((s) => s.status !== "cancelled")) return { ok: false, error: "Part of this order has shipped. Cancel the shipment first, or start a return." }
  await db.rpc("physical_cancel_unfulfilled", { p_checkout: checkoutId })
  const now = new Date().toISOString()
  await db.from("commerce_checkouts").update({ cancelled_at: now, cancel_reason: cleanText(reason, 300) ?? "Cancelled by the shop", fulfillment_status: order.lines.some((l) => l.requiresShipping) ? "cancelled" : "not_required", updated_at: now }).eq("id", checkoutId).eq("creator_id", creatorId)
  await addOrderEvent(db, { checkoutId, creatorId, kind: "order.cancelled", message: `Order cancelled${cleanText(reason, 300) ? `: ${cleanText(reason, 300)}` : ""}. Stock released.`, actor: "creator", key: `cancelled:${checkoutId}` })
  await queueCancelledEmail(db, checkoutId, creatorId)
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
    message: `${updated.refundedCents >= updated.totalCents ? "Refunded in full" : "Partly refunded"}: ${(updated.refundedCents / 100).toFixed(2)} ${updated.currency}`,
    actor: "creator",
    key: `refund_total:${checkoutId}:${updated.refundedCents}`,
  })
  if (updated.refundedCents > before.refundedCents) await queueRefundEmail(db, checkoutId, creatorId, updated.refundedCents, updated.refundedCents - before.refundedCents)
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
      message: `${updated.refundedCents >= updated.totalCents ? "Refunded in full" : "Partly refunded"}: ${(updated.refundedCents / 100).toFixed(2)} ${updated.currency}`,
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
