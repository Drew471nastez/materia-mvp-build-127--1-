import { NextResponse } from "next/server"
import { isUuid, physicalCaller } from "@/lib/physical/auth"
import { checkoutOfOrderRow, loadOrder } from "@/lib/physical/orders-server"
import { packingSlipHtml, slipLines } from "@/lib/physical/packing-slip"
import { storeIdentity } from "@/lib/store/identity-server"
import { creatorTimeZone } from "@/lib/account/time-zone"
import { getServerTt } from "@/lib/i18n/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  ONE ORDER'S PACKING SLIP, AS A PAGE TO PRINT
 * ===========================================================================
 * GET /api/physical/orders/<checkout or line id>/packing-slip[?f=<shipment>|?loc=<location>]
 *
 * A whole HTML page (lib/physical/packing-slip.ts), the shop's own order only
 * (physicalCaller: the owner, or a team member whose role has orders). On a
 * computer the Orders page prints it from a frame without leaving the order;
 * on a phone it is opened as a page with Back and Print. It used to be built
 * in a window.open from the menu, which a phone's pop-up rule blocks when the
 * menu's sheet has closed first, and which drew nothing at all then.
 *
 * May be framed by Storelib's own pages only (frame-ancestors 'self'), which a
 * browser honours over the X-Frame-Options: DENY every path is sent with.
 */
const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "Referrer-Policy": "no-referrer",
}

const page = (message: string, status: number) =>
  new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Packing slip</title></head><body style="font:15px/1.5 system-ui,sans-serif;color:#1a1a2e;padding:32px">${message.replace(/</g, "&lt;")}</body></html>`, { status, headers: HEADERS })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller("orders")
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return page("This order was not found.", 404)
  let order = await loadOrder(c.db, { creatorId: c.creatorId, checkoutId: id })
  if (!order) {
    const checkoutId = await checkoutOfOrderRow(c.db, c.creatorId, id)
    order = checkoutId ? await loadOrder(c.db, { creatorId: c.creatorId, checkoutId }) : null
  }
  if (!order) return page("This order was not found.", 404)

  const url = new URL(request.url)
  const f = url.searchParams.get("f")
  const loc = url.searchParams.get("loc")
  const shipmentId = isUuid(f) ? f : null
  const [store, zone, { tt, language }] = await Promise.all([storeIdentity(c.db, c.creatorId, { logoOnly: true }).catch(() => null), creatorTimeZone(c.db, c.creatorId), getServerTt()])
  const lines = slipLines(order, { shipmentId, locationId: isUuid(loc) ? loc : null })
  const shipmentIndex = shipmentId ? order.shipments.findIndex((s) => s.id === shipmentId) : -1
  const html = packingSlipHtml(order, lines, { name: store?.name || "Storelib", logoUrl: store?.logoUrl ?? null }, {
    tt,
    lang: language,
    timeZone: zone,
    /* The Orders page opens an order by one of its lines. */
    back: `/app/orders?order=${encodeURIComponent(order.lines[0]?.orderId ?? order.id)}`,
    shipmentLabel: shipmentIndex >= 0 ? tt("Package {n} of {total}", { n: shipmentIndex + 1, total: order.shipments.filter((s) => s.status !== "cancelled").length || 1 }) : null,
  })
  return new NextResponse(html, { status: 200, headers: HEADERS })
}
