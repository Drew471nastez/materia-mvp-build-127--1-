import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadLocations } from "@/lib/physical/config-server"
import { cancelOrder, checkoutOfOrderRow, fulfilItems, loadOrder, moveReturn, noteRefund, openReturn, saveNote, updateShipment } from "@/lib/physical/orders-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** One physical order, by its id or by any of its line's order ids (the Orders list opens lines). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
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
 *   fulfil      ship some or all items, with tracking
 *   shipment    move a shipment on (in transit, delivered, cancelled) or fix its tracking
 *   cancel      cancel before anything shipped, stock back
 *   note        the private note
 *   return      open a return for some items
 *   return_move approve, decline, receive (restock), close a return
 *   refunded    after the existing refund route refunded lines: catch up
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const items = Array.isArray(body.items) ? (body.items as { orderId: string; quantity: number; restock?: boolean }[]).filter((i) => isUuid(i?.orderId)) : []

  let result
  switch (body.action) {
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
    case "cancel":
      result = await cancelOrder(c.db, c.creatorId, id, body.reason)
      break
    case "note": {
      const saved = await saveNote(c.db, c.creatorId, id, body.note)
      return saved.ok ? physicalJson({ ok: true }) : physicalJson({ error: "The note could not be saved." }, 500)
    }
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
  return physicalJson({ order: result.order })
}
