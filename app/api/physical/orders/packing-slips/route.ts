import { NextResponse } from "next/server"
import { isUuid, physicalCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { packingSlipHtml, paperAsked, slipContact, slipLines, slipPaper } from "@/lib/physical/packing-slip"
import { returnAddressOf } from "@/lib/physical/jobs-server"
import { resolveOrder } from "@/lib/physical/bulk-fulfil-server"
import { BULK_MAX_ORDERS } from "@/lib/physical/bulk-fulfil"
import { storeIdentity } from "@/lib/store/identity-server"
import { creatorTimeZone } from "@/lib/account/time-zone"
import { getServerTt } from "@/lib/i18n/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  PACKING SLIPS FOR MANY ORDERS, ONE PAGE TO PRINT
 * ===========================================================================
 * GET /api/physical/orders/packing-slips?ids=<checkout or line id>,...
 *
 * The Orders list's Packing slips for the ticked orders: each order's slip as
 * its own page (lib/physical/packing-slip.ts, the same slip the order's own
 * menu prints), what is still to send on each, one per sheet of paper. An
 * order with nothing left to pack is left out. Same rules as one slip: the
 * shop's own orders only, framed by Storelib's own pages only.
 */
const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "Referrer-Policy": "no-referrer",
}

const page = (message: string, status: number) =>
  new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Packing slips</title></head><body style="font:15px/1.5 system-ui,sans-serif;color:#1a1a2e;padding:32px">${message.replace(/</g, "&lt;")}</body></html>`, { status, headers: HEADERS })

export async function GET(request: Request) {
  const c = await physicalCaller("orders")
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "physical-order-bulk-read", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 600 }, { limit: 1000, seconds: 86400 }], message: "That is a lot at once. Wait a minute and try again." })
  if (limited) return limited
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(isUuid))].slice(0, BULK_MAX_ORDERS)
  if (ids.length === 0) return page("Choose at least one order.", 400)
  /* The same store details and return address as one order's slip (../[id]/packing-slip): every slip in the pile is that slip. */
  const [store, zone, { tt, language }, returnAddress] = await Promise.all([storeIdentity(c.db, c.creatorId).catch(() => null), creatorTimeZone(c.db, c.creatorId), getServerTt(), returnAddressOf(c.db, c.creatorId).catch(() => null)])
  const seen = new Set<string>()
  const slips: string[] = []
  /* The same paper and prices controls as one order's slip, for the whole stack. */
  const url = new URL(request.url)
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
  const controls = { a4: linkTo({ paper: "a4" }), letter: linkTo({ paper: "letter" }), prices: linkTo({ prices: withPrices ? null : "1" }) }
  const paperShown = slipPaper(paper, request.headers.get("accept-language"))
  for (const id of ids) {
    const order = await resolveOrder(c.db, c.creatorId, id)
    if (!order || seen.has(order.id)) continue
    seen.add(order.id)
    const lines = slipLines(order, {})
    /* Nothing left to pack: left out. slipLines answers every line again once all has shipped (a reprint of the whole order), so the pile used to include orders already sent. */
    const left = order.lines.some((l) => l.requiresShipping && l.quantity - l.fulfilled > 0)
    if (!lines.length || order.cancelledAt || !left) continue
    slips.push(packingSlipHtml(order, lines, { name: store?.name || "Storelib", logoUrl: store?.logoUrl ?? null, returnAddress, contact: slipContact(store) }, { tt, lang: language, timeZone: zone, back: "/app/orders", paper, paperShown, controls, prices: withPrices ? { currency: order.currency, totals: null } : null }))
  }
  if (slips.length === 0) return page(tt("None of these orders has anything left to pack."), 404)
  /* One head and bar, then each order's paper, a new sheet each. */
  const head = slips[0].slice(0, slips[0].indexOf("<main"))
  const papers = slips.map((html) => html.slice(html.indexOf("<main"), html.lastIndexOf("</main>") + "</main>".length))
  const title = tt("Packing slips for {count} orders", { count: papers.length })
  const html = `${head.replace(/<title>[^<]*<\/title>/, `<title>${title.replace(/[<&]/g, "")}</title>`).replace("</style>", "@media print{.paper+.paper{break-before:page}}</style>")}${papers.join("\n")}</body></html>`
  return new NextResponse(html, { status: 200, headers: HEADERS })
}
