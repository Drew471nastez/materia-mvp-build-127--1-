import "server-only"

/**
 * ===========================================================================
 *  ORDERS OUT TO SHIPSTATION, SHIPMENTS BACK TO THE BUYER
 * ===========================================================================
 * With ShipStation connected (Settings › Integrations), Storelib is one of
 * the seller's stores there:
 *
 *   paid          a shipstation_push job (queued from the paid order's
 *                 steps, lib/physical/checkout-server.ts) creates the order
 *                 in ShipStation: the items the seller ships themselves
 *                 (not the ones a print partner or supplier sends), by SKU,
 *                 with weights, prices, the delivery the buyer chose and
 *                 their address. Its orderKey is the order's 32 hex digits,
 *                 so sending it again updates the same ShipStation order.
 *   changed       a cancellation or a new address on the order
 *                 (lib/physical/events-server.ts, order.cancelled and
 *                 order.address_changed) sends the order again: cancelled,
 *                 or with the new address
 *   shipped       the seller buys and prints the label in ShipStation.
 *                 ShipStation posts SHIP_NOTIFY to Storelib's address for the
 *                 store (app/api/integrations/shipstation/[token]); the
 *                 body only names a resource_url, which is read from
 *                 ShipStation's own API with the seller's key. Each shipment
 *                 with a tracking number ships its items on the order with
 *                 the carrier and number (orders-server fulfilItems: stock,
 *                 status, timeline, the buyer's shipping email), and is then
 *                 followed by carrier tracking like any other shipment.
 *                 A shipment voided in ShipStation cancels the one it made.
 *   backstop      shipstation_sync jobs read the order's shipments on a
 *                 timer: every few hours when ShipStation would not take the
 *                 webhook, twice a day as a check when it did
 *
 * A ShipStation that is busy or down: the job is tried again with backoff.
 * One that says no: the order's timeline says so, and the card shows it.
 */

import type { Db } from "@/lib/physical/auth"
import { orderNumber } from "@/lib/physical/status"
import { regionCode } from "@/lib/physical/regions"
import { readMethod } from "@/lib/physical/fulfillment"
import { ProviderError, checkoutIdOf, externalIdOf } from "../fulfilment/http"
import { connectedKey, noteSync } from "./connect-server"
import { shipstation, type ShipStationAddress, type ShipStationOrder, type ShipStationShipment } from "./shipstation"

const NAME = "ShipStation"

/* What this file needs from the order engine, handed in (./shipping-deps-server.ts). */
import { propertyText } from "@/lib/cart-uploads/rules"

export interface ShipStationLine {
  orderId: string
  title: string
  variantName: string | null
  sku: string | null
  imageUrl: string | null
  quantity: number
  unitCents: number
  discountCents: number
  fulfilled: number
  requiresShipping: boolean
  fulfillmentMethod: string | null
  /** The buyer's personalization answers (lib/products/personalization), by label. */
  properties?: Record<string, string> | null
}
export interface ShipStationSourceOrder {
  id: string
  status: string
  currency: string
  cancelledAt: string | null
  deliveryMethod: string
  buyerEmail: string | null
  buyerName: string | null
  buyerPhone: string | null
  address: Record<string, any> | null
  shippingCents: number
  taxCents: number
  totalCents: number
  buyerNote: string | null
  createdAt: string
  paidAt: string | null
  delivery: { name: string } | null
  lines: ShipStationLine[]
  shipments: { id: string; status: string; trackingNumber: string | null }[]
}
type Outcome = { ok: true; order: any } | { ok: false; error: string; status?: number }
export interface ShipStationDeps {
  loadOrder: (db: Db, where: { creatorId: string; checkoutId: string }) => Promise<ShipStationSourceOrder | null>
  fulfilItems: (db: Db, creatorId: string, checkoutId: string, input: { items: { orderId: string; quantity: number }[]; carrier?: unknown; trackingNumber?: unknown; notifyBuyer?: boolean; key?: unknown; partner?: { provider: string; name: string } }) => Promise<Outcome>
  updateShipment: (db: Db, creatorId: string, fulfillmentId: string, input: { status?: unknown; notifyBuyer?: boolean; partner?: { name: string } }) => Promise<Outcome>
  addOrderEvent: (db: Db, e: { checkoutId: string; creatorId: string | null; kind: string; message: string; detail?: Record<string, unknown> | null; actor?: "system" | "webhook"; key?: string | null }) => Promise<void>
  enqueue: (db: Db, j: { creatorId: string; kind: "shipstation_push" | "shipstation_sync"; key: string; payload: Record<string, unknown>; runAfter?: Date }) => Promise<void>
  now: () => number
}

/** The lines ShipStation ships: physical, shipped by the seller (not a print partner, supplier or warehouse that has its own way). */
export function shipStationLines(order: Pick<ShipStationSourceOrder, "lines">): ShipStationLine[] {
  return order.lines.filter((l) => l.requiresShipping && (readMethod(l.fulfillmentMethod) ?? "self") === "self")
}

const dollars = (cents: number) => Math.round(cents) / 100

function addressOf(a: Record<string, any> | null, order: ShipStationSourceOrder): ShipStationAddress {
  const country = String(a?.country ?? "").toUpperCase()
  return {
    name: String(a?.name ?? order.buyerName ?? "").trim() || "Customer",
    company: a?.company ? String(a.company) : null,
    street1: String(a?.line1 ?? ""),
    street2: a?.line2 ? String(a.line2) : null,
    city: String(a?.city ?? ""),
    state: regionCode(country, a?.region) ?? (a?.region ? String(a.region) : null),
    postalCode: a?.postalCode ? String(a.postalCode) : null,
    country,
    phone: a?.phone ? String(a.phone) : order.buyerPhone,
    residential: null,
  }
}

/** The Storelib order as ShipStation's createorder takes it. Pure. */
export function shipStationOrderFor(order: ShipStationSourceOrder, grams: Map<string, number>): ShipStationOrder | null {
  const lines = shipStationLines(order)
  if (lines.length === 0 || !order.address?.line1) return null
  const shipTo = addressOf(order.address, order)
  const total = lines.reduce((n, l) => n + (grams.get(l.orderId) ?? 0) * l.quantity, 0)
  return {
    orderNumber: orderNumber(order.id).replace(/^#/, ""),
    orderKey: externalIdOf(order.id),
    orderDate: order.createdAt,
    paymentDate: order.paidAt,
    orderStatus: order.cancelledAt ? "cancelled" : "awaiting_shipment",
    customerEmail: order.buyerEmail,
    customerUsername: order.buyerEmail,
    billTo: { ...shipTo },
    shipTo,
    items: lines.map((l) => ({
      lineItemKey: externalIdOf(l.orderId),
      sku: l.sku,
      name: l.variantName ? `${l.title} (${l.variantName})` : l.title,
      imageUrl: l.imageUrl && /^https:\/\//.test(l.imageUrl) ? l.imageUrl : null,
      quantity: l.quantity,
      unitPrice: dollars(Math.max(0, l.unitCents - (l.quantity > 0 ? l.discountCents / l.quantity : 0))),
      weight: (grams.get(l.orderId) ?? 0) > 0 ? { value: grams.get(l.orderId)!, units: "grams" } : null,
      /* The variant, then the buyer's personalization answers (a photo by its file name: the store downloads it from the order), as ShipStation's item options. */
      options: [...(l.variantName ? [{ name: "Variant", value: l.variantName }] : []), ...Object.entries(l.properties ?? {}).filter(([k, v]) => k.trim() && !k.startsWith("_") && typeof v === "string" && v.trim()).map(([name, value]) => ({ name: name.slice(0, 100), value: propertyText(String(value)).slice(0, 250) }))],
    })),
    amountPaid: dollars(order.totalCents),
    taxAmount: dollars(order.taxCents),
    shippingAmount: dollars(order.shippingCents),
    customerNotes: order.buyerNote,
    requestedShippingService: order.delivery?.name ?? null,
    weight: total > 0 ? { value: total, units: "grams" } : null,
    advancedOptions: { customField1: order.id, source: "Storelib" },
  }
}

async function lineGrams(db: Db, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (ids.length === 0) return out
  const { data } = await db.from("orders").select("id, product_snapshot").in("id", ids)
  for (const r of (data ?? []) as { id: string; product_snapshot: Record<string, any> | null }[]) {
    const g = Number(r.product_snapshot?.weight_grams)
    if (g > 0) out.set(r.id, Math.round(g))
  }
  return out
}

const sentKey = (checkoutId: string) => `shipstation_sent:${checkoutId}`

/** Is ShipStation connected for this store? One read, for the paid steps and the order's changes to decide whether to queue anything. */
export async function shipStationConnected(db: Db, creatorId: string): Promise<boolean> {
  const { data } = await db.from("commerce_integrations").select("status").eq("creator_id", creatorId).eq("provider", "shipstation").maybeSingle()
  return data?.status === "connected"
}

/** Queued from a paid order, a cancellation or a new address. Nothing when ShipStation is not connected. */
export async function queueShipStation(db: Db, checkoutId: string, creatorId: string, reason: "paid" | "cancelled" | "address", deps: Pick<ShipStationDeps, "enqueue">, version = ""): Promise<void> {
  if (!(await shipStationConnected(db, creatorId))) return
  await deps.enqueue(db, { creatorId, kind: "shipstation_push", key: `shipstation:${reason}:${checkoutId}${version ? `:${version}` : ""}`.slice(0, 200), payload: { checkoutId, creatorId, reason } })
}

/** The shipstation_push job. Throws only for what is worth trying again. */
export async function pushToShipStation(db: Db, payload: Record<string, any>, deps: ShipStationDeps): Promise<void> {
  const checkoutId = String(payload.checkoutId ?? "")
  const creatorId = String(payload.creatorId ?? "")
  const reason = payload.reason === "cancelled" || payload.reason === "address" ? payload.reason : "paid"
  const cred = await connectedKey(db, creatorId, "shipstation")
  if (!cred) return
  const order = await deps.loadOrder(db, { creatorId, checkoutId })
  if (!order || order.deliveryMethod === "pickup") return
  const { data: sent } = await db.from("commerce_order_events").select("id, detail").eq("idempotency_key", sentKey(checkoutId)).maybeSingle()
  /* A change to an order ShipStation never had: nothing to update there. A paid order sent before: only a change sends it again. */
  if (reason !== "paid" && !sent) return
  if (reason === "paid" && (sent || order.cancelledAt || (order.status !== "paid" && order.status !== "partially_refunded"))) return
  const body = shipStationOrderFor(order, await lineGrams(db, shipStationLines(order).map((l) => l.orderId)))
  if (!body) return

  let made: { orderId: string }
  try {
    made = await shipstation.upsertOrder(cred.key, body)
  } catch (e) {
    if (e instanceof ProviderError && !e.retry) {
      await noteSync(db, cred.id, { ok: false, error: e.message })
      await deps.addOrderEvent(db, { checkoutId, creatorId, kind: "fulfillment.manual_needed", message: `${e.message.slice(0, 200)} ${reason === "paid" ? "The order is not in ShipStation: ship it from Storelib." : "ShipStation was not updated: change it there too."}`, key: `shipstation_refused:${checkoutId}:${reason}:${e.status}` })
      return
    }
    throw e
  }
  await noteSync(db, cred.id, reason === "paid" ? { ok: true, bump: "orders_sent" } : { ok: true })
  if (reason === "paid") {
    await deps.addOrderEvent(db, { checkoutId, creatorId, kind: "fulfillment.forwarded", message: "Order sent to ShipStation. Print its label there; the tracking comes back here.", detail: { provider: "shipstation", provider_order_id: made.orderId }, key: sentKey(checkoutId) })
    await scheduleSync(db, { creatorId, checkoutId, orderId: made.orderId, round: 1, webhooks: cred.config.webhooks === "on" }, deps)
  } else {
    await deps.addOrderEvent(db, {
      checkoutId,
      creatorId,
      kind: "integration.updated",
      message: reason === "cancelled" ? "Cancelled in ShipStation too." : "ShipStation has the new address.",
      detail: { provider: "shipstation", provider_order_id: made.orderId },
      key: `shipstation_${reason}:${checkoutId}:${deps.now()}`.slice(0, 200),
    })
  }
}

/* ── shipments, back ────────────────────────────────────────────────────── */

export const SYNC_ROUNDS = 40
/** Every 3 hours when ShipStation can't tell us; every 12 as a check when it can. About three weeks either way at most. */
export function syncDelayMs(round: number, webhooks: boolean): number {
  return (webhooks ? 12 : round <= 4 ? 3 : 6) * 3600_000
}

async function scheduleSync(db: Db, p: { creatorId: string; checkoutId: string; orderId: string; round: number; webhooks: boolean }, deps: ShipStationDeps): Promise<void> {
  if (p.round > SYNC_ROUNDS || (p.webhooks && p.round > 6)) return
  await deps.enqueue(db, {
    creatorId: p.creatorId,
    kind: "shipstation_sync",
    key: `shipstation_sync:${p.checkoutId}:${p.round}`,
    payload: { checkoutId: p.checkoutId, creatorId: p.creatorId, orderId: p.orderId, round: p.round },
    runAfter: new Date(deps.now() + syncDelayMs(p.round, p.webhooks)),
  })
}

/**
 * ShipStation's shipments for one Storelib order, applied: a new one ships
 * its items (or the seller's open items, when ShipStation didn't list them)
 * with its carrier and number; one voided there cancels the shipment it
 * made. True when everything ShipStation ships for the order has shipped.
 */
export async function applyShipments(db: Db, ctx: { creatorId: string; checkoutId: string }, shipments: ShipStationShipment[], deps: ShipStationDeps): Promise<{ shipped: number; done: boolean }> {
  const first = await deps.loadOrder(db, ctx)
  if (!first) return { shipped: 0, done: true }
  let order: ShipStationSourceOrder = first
  let shipped = 0
  for (const s of shipments) {
    if (!s.trackingNumber) continue
    const existing = order.shipments.find((x) => x.status !== "cancelled" && (x.trackingNumber ?? "").toUpperCase() === s.trackingNumber!.toUpperCase())
    if (s.voided) {
      if (existing && (existing.status === "shipped" || existing.status === "pending" || existing.status === "submitted")) {
        const moved = await deps.updateShipment(db, ctx.creatorId, existing.id, { status: "cancelled", notifyBuyer: false, partner: { name: NAME } })
        if (moved.ok && moved.order) order = moved.order as ShipStationSourceOrder
      }
      continue
    }
    if (existing) continue
    const open = new Map(shipStationLines(order).map((l) => [l.orderId, Math.max(0, l.quantity - l.fulfilled)]))
    const listed = (s.items ?? [])
      .map((i) => ({ orderId: checkoutIdOf(i.lineItemKey) ?? "", quantity: Math.min(i.quantity, open.get(checkoutIdOf(i.lineItemKey) ?? "") ?? 0) }))
      .filter((i) => i.orderId && i.quantity > 0)
    /* Every open item only when ShipStation named none. A shipment that names items already shipped (a second label for a lost parcel) ships nothing more: it used to mark the rest of the order shipped. */
    const items = (s.items ?? []).length ? listed : [...open.entries()].map(([orderId, quantity]) => ({ orderId, quantity })).filter((i) => i.quantity > 0)
    if (items.length === 0) continue
    const r = await deps.fulfilItems(db, ctx.creatorId, ctx.checkoutId, { items, carrier: s.carrier, trackingNumber: s.trackingNumber, notifyBuyer: true, key: `shipstation:${s.shipmentId}`, partner: { provider: "shipstation", name: NAME } })
    if (r.ok) {
      if (r.order) order = r.order as ShipStationSourceOrder
      shipped++
    }
  }
  const done = (order.cancelledAt !== null || shipStationLines(order).every((l) => l.fulfilled >= l.quantity))
  return { shipped, done }
}

/** The shipstation_sync job. Throws only for what is worth trying again. */
export async function syncShipStation(db: Db, payload: Record<string, any>, deps: ShipStationDeps): Promise<void> {
  const creatorId = String(payload.creatorId ?? "")
  const checkoutId = String(payload.checkoutId ?? "")
  const cred = await connectedKey(db, creatorId, "shipstation")
  /* Disconnected since: nothing to read with, and the order's timeline already says it went there. */
  if (!cred) return
  const shipments = await shipstation.shipmentsFor(cred.key, String(payload.orderId ?? ""))
  const { done } = await applyShipments(db, { creatorId, checkoutId }, shipments, deps)
  await noteSync(db, cred.id, { ok: true })
  if (!done) await scheduleSync(db, { creatorId, checkoutId, orderId: String(payload.orderId), round: Number(payload.round ?? 1) + 1, webhooks: cred.config.webhooks === "on" }, deps)
}

/**
 * SHIP_NOTIFY, after the address token was checked (the route). The body
 * names a resource_url and nothing else is believed: the shipments are read
 * from ShipStation's own API with the seller's key, and each is applied to
 * the Storelib order its orderKey names, when that order is this store's.
 */
export async function handleShipNotify(db: Db, input: { creatorId: string; raw: string }, deps: ShipStationDeps): Promise<{ status: number; body: Record<string, unknown> }> {
  const cred = await connectedKey(db, input.creatorId, "shipstation")
  if (!cred) return { status: 410, body: { error: "Not connected." } }
  let body: any
  try {
    body = JSON.parse(input.raw)
  } catch {
    return { status: 400, body: { error: "The body is not JSON." } }
  }
  if (body?.resource_type !== "SHIP_NOTIFY" || typeof body?.resource_url !== "string") return { status: 200, body: { ok: true, ignored: true } }
  let shipments: ShipStationShipment[]
  try {
    shipments = await shipstation.readResource(cred.key, withItems(body.resource_url))
  } catch (e) {
    /* ShipStation sends again what was not answered 2xx: worth it when it was busy, not when the key is gone. */
    if (e instanceof ProviderError && !e.retry) {
      await noteSync(db, cred.id, { ok: false, error: e.message })
      return { status: 200, body: { ok: true, ignored: true } }
    }
    return { status: 503, body: { error: "Try again." } }
  }
  let shipped = 0
  const byOrder = new Map<string, ShipStationShipment[]>()
  for (const s of shipments) {
    const checkoutId = checkoutIdOf(s.orderKey)
    if (!checkoutId) continue
    byOrder.set(checkoutId, [...(byOrder.get(checkoutId) ?? []), s])
  }
  for (const [checkoutId, list] of byOrder) {
    const { data: co } = await db.from("commerce_checkouts").select("id").eq("id", checkoutId).eq("creator_id", input.creatorId).maybeSingle()
    if (!co) continue
    shipped += (await applyShipments(db, { creatorId: input.creatorId, checkoutId }, list, deps)).shipped
  }
  await noteSync(db, cred.id, { ok: true })
  return { status: 200, body: { ok: true, shipped } }
}

/** The resource with each shipment's items, so a split order ships only what is in that box. */
export function withItems(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set("includeShipmentItems", "True")
    return u.toString()
  } catch {
    return url
  }
}
