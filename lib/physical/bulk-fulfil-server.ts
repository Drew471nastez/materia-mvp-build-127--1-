import "server-only"

/**
 * ===========================================================================
 *  MARK MANY ORDERS FULFILLED: FROM THE ORDERS LIST, OR FROM A TRACKING CSV
 * ===========================================================================
 * Each order goes through the same fulfilParcels as its own Fulfill button
 * (./orders-server.ts), one order at a time, with its own idempotency key:
 * every order is all or nothing on its own, and one that can't be fulfilled
 * never stops the others. The answer says, order by order, what happened.
 *
 * Refused, with the reason, before anything is written: an order that ships
 * nothing (downloads, courses), one already fulfilled, cancelled, refunded,
 * with a return open, a buyer's cancel request waiting, a pickup (marked
 * ready from the order), or one whose items leave from more than one place
 * or partner (a tracking number belongs to one parcel). A carrier named without
 * its tracking number is refused, as on the order's own Fulfill (./carriers.ts
 * trackingRuleProblem). Nothing here touches
 * the payment or marks anything delivered.
 */
import type { Db } from "./auth"
import { fulfilParcels, loadOrder, checkoutOfOrderRow, type ParcelInput, type PhysicalOrder } from "./orders-server"
import { openCancelRequest } from "./buyer-cancel"
import { carrierOf, trackingRuleProblem } from "./carriers"
import { guessCarrier } from "./status"
import { BULK_MAX_ORDERS, orderRefOf, readTrackingCsv, type ImportRow } from "./bulk-fulfil"
import { sellerOrderNumbers } from "@/lib/orders/order-number-server"

/** An order as the bulk sheet lists it: what is left to ship, and why it can't be, when it can't. */
export interface BulkOrderView {
  /** The id it was asked for by (an order row's id from the Orders list, or a checkout's). */
  id: string
  checkoutId: string | null
  number: string
  buyerName: string | null
  /** The shipping country (ISO), so its usual carriers come first in the picker. */
  country: string | null
  /** Its items still to ship. */
  lines: { orderId: string; title: string; variantName: string | null; sku: string | null; open: number; imageUrl: string | null }[]
  /** Why it is left out; null when it can be fulfilled. */
  refused: string | null
}

export interface BulkResult {
  id: string
  checkoutId: string | null
  number: string
  ok: boolean
  error: string | null
  /** Units shipped by this press. */
  units: number
  parcels: number
}

const PARTNER_METHODS = new Set(["dropship", "print_on_demand"])

/** Why this order can't be marked fulfilled in bulk, or null. */
export function bulkRefusal(order: PhysicalOrder, opts: { wholeOrder: boolean } = { wholeOrder: true }): string | null {
  const ships = order.lines.filter((l) => l.requiresShipping)
  if (ships.length === 0) return "Nothing in this order ships."
  if (order.cancelledAt) return "This order was cancelled."
  if (order.status === "refunded") return "This order was refunded."
  if (order.status !== "paid" && order.status !== "partially_refunded") return "Only a paid order can be fulfilled."
  if (order.returnStatus !== "none" || order.returns.some((r) => ["requested", "approved", "in_transit"].includes(r.status))) return "This order has a return. Fulfil it from the order."
  if (openCancelRequest(order)) return "The buyer asked to cancel this order. Answer them from the order first."
  const open = ships.filter((l) => l.quantity - l.fulfilled > 0)
  if (open.length === 0) return "Already fulfilled."
  if (order.deliveryMethod === "pickup") return "A pickup order is marked ready from the order."
  if (open.some((l) => PARTNER_METHODS.has(l.fulfillmentMethod ?? "self"))) return "A partner ships this order."
  if (opts.wholeOrder && new Set(open.map((l) => l.locationId ?? "")).size > 1) return "Its items ship from more than one place. Fulfil it from the order."
  return null
}

async function numbersFor(db: Db, creatorId: string) {
  const n = await sellerOrderNumbers(db, creatorId)
  return (checkoutId: string) => {
    const v = n?.byCheckout.get(checkoutId)
    return v ? `#${v}` : `#${checkoutId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
  }
}

export async function resolveOrder(db: Db, creatorId: string, id: string): Promise<PhysicalOrder | null> {
  const direct = await loadOrder(db, { creatorId, checkoutId: id })
  if (direct) return direct
  const checkoutId = await checkoutOfOrderRow(db, creatorId, id)
  return checkoutId ? loadOrder(db, { creatorId, checkoutId }) : null
}

function viewOf(id: string, order: PhysicalOrder | null, number: (c: string) => string): BulkOrderView {
  if (!order) return { id, checkoutId: null, number: "", buyerName: null, country: null, lines: [], refused: "Not found, or not an order that ships." }
  return {
    id,
    checkoutId: order.id,
    number: number(order.id),
    buyerName: order.buyerName ?? (order.address as Record<string, string> | null)?.name ?? null,
    country: typeof order.address?.country === "string" ? order.address.country : null,
    lines: order.lines
      .filter((l) => l.requiresShipping && l.quantity - l.fulfilled > 0)
      .map((l) => ({ orderId: l.orderId, title: l.title, variantName: l.variantName, sku: l.sku, open: l.quantity - l.fulfilled, imageUrl: l.imageUrl })),
    refused: bulkRefusal(order),
  }
}

/** The selected orders, each with what is left to ship or why it can't be. */
export async function loadBulk(db: Db, creatorId: string, ids: string[]): Promise<BulkOrderView[]> {
  const number = await numbersFor(db, creatorId)
  const out: BulkOrderView[] = []
  const seen = new Set<string>()
  for (const id of ids.slice(0, BULK_MAX_ORDERS)) {
    const order = await resolveOrder(db, creatorId, id)
    /* Two lines of one cart picked in the list are one order here. */
    if (order && seen.has(order.id)) continue
    if (order) seen.add(order.id)
    out.push(viewOf(id, order, number))
  }
  return out
}

/**
 * Mark each order fulfilled with everything it has left, in one parcel with
 * its own carrier and tracking (both optional). Order by order: one refused
 * or failing leaves the rest as they are.
 */
export async function bulkFulfil(
  db: Db,
  creatorId: string,
  input: { orders: { id: string; carrier?: unknown; trackingNumber?: unknown; trackingUrl?: unknown }[]; notifyBuyer: boolean; key: string },
): Promise<BulkResult[]> {
  const number = await numbersFor(db, creatorId)
  const results: BulkResult[] = []
  const seen = new Set<string>()
  for (const entry of input.orders.slice(0, BULK_MAX_ORDERS)) {
    const order = await resolveOrder(db, creatorId, entry.id)
    if (!order) {
      results.push({ id: entry.id, checkoutId: null, number: "", ok: false, error: "Not found, or not an order that ships.", units: 0, parcels: 0 })
      continue
    }
    if (seen.has(order.id)) continue
    seen.add(order.id)
    const base = { id: entry.id, checkoutId: order.id, number: number(order.id) }
    const refused = bulkRefusal(order)
    if (refused) {
      results.push({ ...base, ok: false, error: refused, units: 0, parcels: 0 })
      continue
    }
    /* The tracking number rule, as on the order's own Fulfill: a named carrier comes with its number. */
    const rule = trackingRuleProblem(typeof entry.carrier === "string" ? entry.carrier : null, typeof entry.trackingNumber === "string" ? entry.trackingNumber : null)
    if (rule) {
      results.push({ ...base, ok: false, error: rule, units: 0, parcels: 0 })
      continue
    }
    const items = order.lines.filter((l) => l.requiresShipping && l.quantity - l.fulfilled > 0).map((l) => ({ orderId: l.orderId, quantity: l.quantity - l.fulfilled }))
    const done = await fulfilParcels(db, creatorId, order.id, {
      parcels: [{ items, carrier: entry.carrier, trackingNumber: entry.trackingNumber, trackingUrl: entry.trackingUrl }],
      notifyBuyer: input.notifyBuyer,
      key: `bulk:${input.key}`,
    })
    results.push(done.ok ? { ...base, ok: true, error: null, units: items.reduce((n, i) => n + i.quantity, 0), parcels: 1 } : { ...base, ok: false, error: done.error, units: 0, parcels: 0 })
  }
  return results
}

/* ── A tracking CSV ───────────────────────────────────────────────────── */

export interface PreviewRow extends ImportRow {
  checkoutId: string | null
  number: string | null
  /** What this row ships: the item and how many, or the whole order. */
  ships: string | null
  units: number
}

export interface PreviewOrder {
  checkoutId: string
  number: string
  buyerName: string | null
  parcels: (ParcelInput & { lines: number[]; units: number })[]
  units: number
  /** An error on any of its rows: the whole order waits, so it never ships half of what the file says. */
  blocked: boolean
}

export interface ImportPreview {
  error: string | null
  rows: PreviewRow[]
  orders: PreviewOrder[]
  /** What Import would do: orders, parcels and units fulfilled; rows with an error. */
  counts: { orders: number; parcels: number; units: number; errors: number; rows: number }
}

/** The store's checkouts that might be named by the buyer's reference (its first 8 characters). */
async function checkoutsByReference(db: Db, creatorId: string): Promise<Map<string, string>> {
  const { data } = await db.from("commerce_checkouts").select("id").eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(5000)
  const by = new Map<string, string>()
  for (const r of (data ?? []) as { id: string }[]) by.set(r.id.replace(/-/g, "").slice(0, 8).toLowerCase(), r.id)
  return by
}

/**
 * What a tracking CSV would do, row by row, without writing anything. The
 * same reading Import uses, so Import does exactly what the preview showed.
 */
export async function previewImport(db: Db, creatorId: string, csv: string): Promise<ImportPreview> {
  const read = readTrackingCsv(csv)
  const empty = { orders: 0, parcels: 0, units: 0, errors: 0, rows: 0 }
  if (read.error) return { error: read.error, rows: [], orders: [], counts: empty }
  const numbers = await sellerOrderNumbers(db, creatorId)
  const byNumber = new Map<number, string>()
  for (const [checkout, n] of numbers?.byCheckout ?? []) byNumber.set(n, checkout)
  const needsRef = read.rows.some((r) => orderRefOf(r.order)?.kind === "reference")
  const byRef = needsRef ? await checkoutsByReference(db, creatorId) : new Map<string, string>()
  const label = (checkoutId: string) => {
    const n = numbers?.byCheckout.get(checkoutId)
    return n ? `#${n}` : `#${checkoutId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
  }

  const rows: PreviewRow[] = read.rows.map((r) => ({ ...r, checkoutId: null, number: null, ships: null, units: 0 }))
  const orders = new Map<string, PhysicalOrder | null>()
  for (const r of rows) {
    if (r.error) continue
    const ref = orderRefOf(r.order)
    const checkoutId = !ref ? null : ref.kind === "number" ? (byNumber.get(ref.value) ?? null) : (byRef.get(ref.value) ?? null)
    if (!checkoutId) {
      r.error = "We couldn't find that order."
      continue
    }
    r.checkoutId = checkoutId
    r.number = label(checkoutId)
    if (!orders.has(checkoutId)) orders.set(checkoutId, await loadOrder(db, { creatorId, checkoutId }))
  }

  /* Parcels per order: rows with the same tracking number are one parcel; a row with none is a parcel of its own. */
  type Draft = { checkoutId: string; parcels: Map<string, { carrier: string | null; tracking: string | null; url: string | null; items: Map<string, number>; lines: number[]; whole: boolean }>; left: Map<string, number> }
  const drafts = new Map<string, Draft>()
  for (const r of rows) {
    if (r.error || !r.checkoutId) continue
    const order = orders.get(r.checkoutId)
    if (!order) {
      r.error = "We couldn't find that order."
      continue
    }
    const refused = bulkRefusal(order, { wholeOrder: !r.sku })
    if (refused) {
      r.error = refused
      continue
    }
    const d = drafts.get(r.checkoutId) ?? { checkoutId: r.checkoutId, parcels: new Map(), left: new Map(order.lines.filter((l) => l.requiresShipping).map((l) => [l.orderId, Math.max(0, l.quantity - l.fulfilled)])) }
    drafts.set(r.checkoutId, d)
    const tracking = r.tracking ? r.tracking.replace(/\s+/g, "") : null
    const rule = trackingRuleProblem(r.carrier, tracking)
    if (rule) {
      r.error = rule
      continue
    }
    const known = carrierOf(r.carrier)
    const carrier = known?.name ?? (r.carrier || (tracking ? guessCarrier(tracking) : null) || null)
    const parcelKey = tracking ?? `row:${r.line}`
    const had = d.parcels.get(parcelKey)
    if (had && had.carrier && carrier && had.carrier !== carrier) {
      r.error = `Row ${had.lines[0]} gives this tracking number another carrier.`
      continue
    }
    const open = order.lines.filter((l) => l.requiresShipping && l.quantity - l.fulfilled > 0)
    let wanted: { orderId: string; quantity: number; title: string }[]
    if (r.sku) {
      const line = open.find((l) => (l.sku ?? "").toLowerCase() === r.sku.toLowerCase())
      if (!line) {
        r.error = order.lines.some((l) => (l.sku ?? "").toLowerCase() === r.sku.toLowerCase()) ? "That item has already shipped." : "This order has no item with that SKU."
        continue
      }
      const left = d.left.get(line.orderId) ?? 0
      const q = r.quantity ?? left
      if (q > left || q === 0) {
        r.error = left === 0 ? "Earlier rows already ship all of that item." : `Only ${left} left to ship of that item.`
        continue
      }
      wanted = [{ orderId: line.orderId, quantity: q, title: line.title }]
    } else {
      if (had?.whole) {
        /* The same order and tracking number on two rows without a SKU: one parcel, read once. */
        r.ships = `Same parcel as row ${had.lines[0]}`
        had.lines.push(r.line)
        continue
      }
      if ([...d.parcels.values()].length > 0) {
        r.error = "This order is already in another row. Add a SKU to each row to split it into parcels."
        continue
      }
      if (r.quantity !== null) {
        if (open.length !== 1) {
          r.error = "Add a SKU to say which item the quantity is for."
          continue
        }
        const left = d.left.get(open[0].orderId) ?? 0
        if (r.quantity > left) {
          r.error = `Only ${left} left to ship of that item.`
          continue
        }
        wanted = [{ orderId: open[0].orderId, quantity: r.quantity, title: open[0].title }]
      } else wanted = open.map((l) => ({ orderId: l.orderId, quantity: d.left.get(l.orderId) ?? 0, title: l.title })).filter((w) => w.quantity > 0)
    }
    if (wanted.length === 0) {
      r.error = "Already fulfilled."
      continue
    }
    if ([...d.parcels.values()].some((p) => p.whole)) {
      r.error = "This order is already in another row. Add a SKU to each row to split it into parcels."
      continue
    }
    const parcel = had ?? { carrier, tracking, url: r.trackingUrl || null, items: new Map<string, number>(), lines: [], whole: !r.sku && r.quantity === null }
    for (const w of wanted) {
      parcel.items.set(w.orderId, (parcel.items.get(w.orderId) ?? 0) + w.quantity)
      d.left.set(w.orderId, (d.left.get(w.orderId) ?? 0) - w.quantity)
    }
    parcel.lines.push(r.line)
    if (!parcel.carrier && carrier) parcel.carrier = carrier
    d.parcels.set(parcelKey, parcel)
    r.units = wanted.reduce((n, w) => n + w.quantity, 0)
    r.ships = !r.sku && r.quantity === null ? "Everything left on the order" : `${r.units} × ${wanted[0].title}`
  }

  const blockedOrders = new Set(rows.filter((r) => r.error && r.checkoutId).map((r) => r.checkoutId!))
  const out: PreviewOrder[] = [...drafts.values()].map((d) => {
    const order = orders.get(d.checkoutId)!
    const parcels = [...d.parcels.values()].slice(0, 20).map((p) => ({
      items: [...p.items].map(([orderId, quantity]) => ({ orderId, quantity })),
      carrier: p.carrier,
      trackingNumber: p.tracking,
      trackingUrl: p.url,
      lines: p.lines,
      units: [...p.items.values()].reduce((n, q) => n + q, 0),
    }))
    return { checkoutId: d.checkoutId, number: label(d.checkoutId), buyerName: order.buyerName, parcels, units: parcels.reduce((n, p) => n + p.units, 0), blocked: blockedOrders.has(d.checkoutId) || d.parcels.size > 20 }
  })
  const going = out.filter((o) => !o.blocked)
  return {
    error: null,
    rows,
    orders: out,
    counts: { orders: going.length, parcels: going.reduce((n, o) => n + o.parcels.length, 0), units: going.reduce((n, o) => n + o.units, 0), errors: rows.filter((r) => r.error).length, rows: rows.length },
  }
}

/** Import: the preview's orders without an error, each through fulfilParcels with its own key. */
export async function applyImport(db: Db, creatorId: string, csv: string, opts: { notifyBuyer: boolean; key: string }): Promise<{ preview: ImportPreview; results: BulkResult[] }> {
  const preview = await previewImport(db, creatorId, csv)
  const results: BulkResult[] = []
  for (const o of preview.orders) {
    if (o.blocked) continue
    const done = await fulfilParcels(db, creatorId, o.checkoutId, {
      parcels: o.parcels.map((p) => ({ items: p.items, carrier: p.carrier, trackingNumber: p.trackingNumber, trackingUrl: p.trackingUrl })),
      notifyBuyer: opts.notifyBuyer,
      key: `import:${opts.key}`,
    })
    results.push({ id: o.checkoutId, checkoutId: o.checkoutId, number: o.number, ok: done.ok, error: done.ok ? null : done.error, units: done.ok ? o.units : 0, parcels: done.ok ? o.parcels.length : 0 })
  }
  return { preview, results }
}
