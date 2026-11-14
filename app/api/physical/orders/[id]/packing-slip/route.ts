import { NextResponse } from "next/server"
import { isUuid, physicalCaller } from "@/lib/physical/auth"
import { checkoutOfOrderRow, loadOrder } from "@/lib/physical/orders-server"
import { packingSlipHtml, paperAsked, slipContact, slipLines, slipPaper } from "@/lib/physical/packing-slip"
import { packingSlipFilename, renderPackingSlipPdf } from "@/lib/physical/packing-slip-pdf"
import { storeIdentity } from "@/lib/store/identity-server"
import { creatorTimeZone } from "@/lib/account/time-zone"
import { getServerTt } from "@/lib/i18n/server"
import { returnAddressOf } from "@/lib/physical/jobs-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  ONE ORDER'S PACKING SLIP, AS A PAGE TO PRINT
 * ===========================================================================
 * GET /api/physical/orders/<checkout or line id>/packing-slip[?f=<shipment>|?loc=<location>][&paper=a4|letter][&prices=1][&format=pdf]
 *
 * format=pdf: the same slip as a PDF (lib/physical/packing-slip-pdf.ts), which
 * the app on a phone hands to the share sheet rather than leaving the order
 * for a page (round 23).
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
  /* Where a return goes, printed on the slip as the return email says it: the store's own address when it ships from one. The store's whole identity (round 51): its website, email and phone go under its name. */
  const [store, zone, { tt, language }, returnAddress] = await Promise.all([storeIdentity(c.db, c.creatorId).catch(() => null), creatorTimeZone(c.db, c.creatorId), getServerTt(), returnAddressOf(c.db, c.creatorId).catch(() => null)])
  const lines = slipLines(order, { shipmentId, locationId: isUuid(loc) ? loc : null })
  /* Numbered among the parcels that still stand: after a cancelled first shipment the second read "Package 3 of 2". */
  const liveShipments = order.shipments.filter((s) => s.status !== "cancelled")
  const shipmentIndex = shipmentId ? liveShipments.findIndex((s) => s.id === shipmentId) : -1
  /* A shipment that is not this order's is not found, never the whole order's slip under its name. */
  if (shipmentId && !order.shipments.some((s) => s.id === shipmentId)) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } })
  /* A4 or Letter, prices or none: the bar's links are this same page with the one thing changed. */
  const paper = paperAsked(url.searchParams.get("paper"))
  const withPrices = url.searchParams.get("prices") === "1"
  const linkTo = (change: Record<string, string | null>) => {
    const q = new URLSearchParams(url.searchParams)
    for (const [k, v] of Object.entries(change)) {
      if (v === null) q.delete(k)
      else q.set(k, v)
    }
    return `${url.pathname}?${q.toString()}`
  }
  const whole = !shipmentId && !isUuid(loc)
  if (url.searchParams.get("format") === "pdf") {
    const pdf = await renderPackingSlipPdf(order, lines, { name: store?.name || "Storelib", logoUrl: null, returnAddress, contact: slipContact(store) }, {
      tt,
      lang: language,
      timeZone: zone,
      paper: slipPaper(paper, request.headers.get("accept-language")),
      shipmentLabel: shipmentIndex >= 0 ? tt("Package {n} of {total}", { n: shipmentIndex + 1, total: liveShipments.length || 1 }) : null,
    })
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${packingSlipFilename(order)}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    })
  }
  const html = packingSlipHtml(order, lines, { name: store?.name || "Storelib", logoUrl: store?.logoUrl ?? null, returnAddress, contact: slipContact(store) }, {
    tt,
    lang: language,
    timeZone: zone,
    paper,
    paperShown: slipPaper(paper, request.headers.get("accept-language")),
    prices: withPrices ? { currency: order.currency, totals: whole ? order : null } : null,
    controls: { a4: linkTo({ paper: "a4" }), letter: linkTo({ paper: "letter" }), prices: linkTo({ prices: withPrices ? null : "1" }) },
    /* The Orders page opens an order by one of its lines. */
    back: `/app/orders?order=${encodeURIComponent(order.lines[0]?.orderId ?? order.id)}`,
    shipmentLabel: shipmentIndex >= 0 ? tt("Package {n} of {total}", { n: shipmentIndex + 1, total: liveShipments.length || 1 }) : null,
  })
  return new NextResponse(html, { status: 200, headers: HEADERS })
}
