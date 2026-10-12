import { NextResponse } from "next/server"
import { sellerOrderNumber } from "@/lib/orders/order-number-server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadLocations } from "@/lib/physical/config-server"
import { addNote, cancelOrder, checkoutOfOrderRow, declineBuyerCancel, fulfilItems, loadOrder, markProcessing, moveReturn, noteRefund, openReturn, saveNote, updateAddress, updateShipment } from "@/lib/physical/orders-server"
import { rateLimit } from "@/lib/api/rate-limit"
import { recordActivity } from "@/lib/activity/log-server"
import { orderNumberOf } from "@/lib/receipts/rules"
import { setTrackingAuto } from "@/lib/physical/tracking/accounts-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** One physical order, by its id or by any of its line's order ids (the Orders list opens lines). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller("orders")
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  let order = await loadOrder(c.db, { creatorId: c.creatorId, checkoutId: id })
  if (!order) {
    const checkoutId = await checkoutOfOrderRow(c.db, c.creatorId, id)
    order = checkoutId ? await loadOrder(c.db, { creatorId: c.creatorId, checkoutId }) : null
  }
  if (!order) return physicalJson({ error: "Not found." }, 404)
  return physicalJson({ order, locations: await loadLocations(c.db, c.creatorId) })
}

/**
 * What the merchant does to an order, one action per call:
 *   processing  mark the order as being prepared (or back to unfulfilled)
 *   fulfil      ship some or all items, with tracking (ready for pickup when collected)
 *   shipment    move a shipment on (in transit, delivered, cancelled) or fix its tracking
 *   tracking_auto  pause or resume the carrier's automatic updates on one shipment
 *   address     change the shipping address before anything shipped (same country); the buyer is emailed
 *   cancel      cancel before anything shipped, stock back
 *   cancel_decline  keep an order the buyer asked to cancel (lib/physical/buyer-cancel.ts)
 *   note        the private note (the older single note on the order)
 *   comment     a note on the order's timeline, for the shop alone
 *   return      open a return for some items
 *   return_move approve, decline, receive (restock), close a return
 *   refunded    after the existing refund route refunded lines: catch up
 */
const ORDER_ACTIVITY: Record<string, string> = { address: "order.address_changed", comment: "order.note", processing: "order.processing", fulfil: "order.fulfilled", shipment: "order.shipment", tracking_auto: "order.shipment", cancel: "order.cancelled", cancel_decline: "order.cancel_declined", return: "order.return_opened", return_move: "order.return_updated", refunded: "order.refunded" }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller("orders")
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  /*
    Per shop, counted in Postgres (lib/api/rate-limit). Far above a busy day
    of packing (a few hundred orders shipped in an afternoon) and far below a
    script: each action can email the buyer, so it must not be a way to mail
    somebody without end. Notes have a tighter one of their own.
  */
  const limited =
    (await rateLimit({ bucket: "physical-order-write", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 240, seconds: 600 }, { limit: 3000, seconds: 86400 }], message: "That is a lot of changes at once. Wait a minute and try again." })) ??
    (body.action === "comment" ? await rateLimit({ bucket: "physical-order-note", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 30, seconds: 300 }, { limit: 400, seconds: 86400 }], message: "That is a lot of notes at once. Wait a minute and try again." }) : null)
  if (limited) return limited
  const items = Array.isArray(body.items) ? (body.items as { orderId: string; quantity: number; restock?: boolean }[]).filter((i) => isUuid(i?.orderId)) : []

  let result
  switch (body.action) {
    case "processing":
      result = await markProcessing(c.db, c.creatorId, id, body.on !== false)
      break
    case "fulfil":
      result = await fulfilItems(c.db, c.creatorId, id, { items, carrier: body.carrier, trackingNumber: body.trackingNumber, trackingUrl: body.trackingUrl, notifyBuyer: body.notifyBuyer !== false, key: body.key, locationId: body.locationId })
      break
    case "shipment":
      if (!isUuid(body.fulfillmentId)) return physicalJson({ error: "Not found." }, 404)
      result = await updateShipment(c.db, c.creatorId, body.fulfillmentId, {
        ...("status" in body ? { status: body.status } : {}),
        ...("carrier" in body ? { carrier: body.carrier } : {}),
        ...("trackingNumber" in body ? { trackingNumber: body.trackingNumber } : {}),
        ...("trackingUrl" in body ? { trackingUrl: body.trackingUrl } : {}),
        notifyBuyer: body.notifyBuyer !== false,
      })
      break
    case "tracking_auto": {
      /* Pause or resume courier tracking on one shipment (lib/physical/tracking); the seller's own statuses keep working either way. */
      if (!isUuid(body.fulfillmentId)) return physicalJson({ error: "Not found." }, 404)
      const set = await setTrackingAuto(c.db, c.creatorId, body.fulfillmentId, body.on !== false)
      if (!set.ok) return physicalJson({ error: set.error }, 400)
      const fresh = await loadOrder(c.db, { creatorId: c.creatorId, checkoutId: id })
      result = fresh ? { ok: true as const, order: fresh } : { ok: false as const, error: "Order not found.", status: 404 }
      break
    }
    case "cancel":
      result = await cancelOrder(c.db, c.creatorId, id, body.reason)
      break
    case "address":
      result = await updateAddress(c.db, c.creatorId, id, { address: body.address, notifyBuyer: body.notifyBuyer !== false })
      break
    case "cancel_decline":
      result = await declineBuyerCancel(c.db, c.creatorId, id, body.note)
      break
    case "note": {
      const saved = await saveNote(c.db, c.creatorId, id, body.note)
      return saved.ok ? physicalJson({ ok: true }) : physicalJson({ error: "The note could not be saved." }, 500)
    }
    case "comment":
      result = await addNote(c.db, c.creatorId, id, body.text, body.key)
      break
    case "return":
      result = await openReturn(c.db, id, { creatorId: c.creatorId, by: "creator", items, reason: body.reason, method: body.method, note: body.note })
      break
    case "return_move":
      if (!isUuid(body.returnId)) return physicalJson({ error: "Not found." }, 404)
      result = await moveReturn(c.db, c.creatorId, body.returnId, {
        status: body.status,
        note: body.note,
        carrier: body.carrier,
        trackingNumber: body.trackingNumber,
        restock: body.restock && typeof body.restock === "object" ? (body.restock as Record<string, boolean>) : undefined,
      })
      break
    case "refunded":
      result = await noteRefund(c.db, c.creatorId, id, isUuid(body.returnId) ? body.returnId : null)
      break
    default:
      return physicalJson({ error: "Unknown action." }, 400)
  }
  if (result.ok === false) return physicalJson({ error: result.error }, result.status ?? 400)
  await recordActivity(c.db, c, { action: ORDER_ACTIVITY[String(body.action)], subjectType: "order", subjectId: id, subjectLabel: (await sellerOrderNumber(c.db, c.creatorId, { orderId: id, checkoutId: id })) ?? `#${orderNumberOf(id)}` })
  return physicalJson({ order: result.order })
}
