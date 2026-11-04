import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { countOrdersWithin, readOneOrder, readOrdersListing } from "@/lib/orders/paged"
import { listingAskFrom, spanFrom } from "@/lib/orders/listing-params"
import { isOrderId } from "@/lib/orders/owned"
import { isTimeZone } from "@/lib/orders/time-zone"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/app/orders/list: what the Orders page draws, a page at a time
 * (lib/orders/paged.ts), for the store the signed-in account owns or works
 * in with Orders in its role.
 *
 *   ?view, q, source, product, fulfillment, sort, page, ws, we, ps, pe, tz
 *        one page of the list, its figures and its tabs
 *        (lib/orders/listing-params)
 *   ?one=<order or row id>
 *        that order alone, numbered: an order opened from a link that is
 *        not on the page the list shows
 *   ?count=1&ws&we
 *        how many orders were placed between the two: Export's By date
 */
export async function GET(request: Request) {
  const c = await shopCaller("orders", { read: true })
  if (c instanceof NextResponse) return c
  const params = new URL(request.url).searchParams

  try {
    const one = params.get("one")
    if (one !== null) {
      if (!isOrderId(one)) return physicalJson({ error: "This order was not found." }, 404)
      const order = await readOneOrder(c.db, c.creatorId, one)
      if (!order) return physicalJson({ error: "This order was not found." }, 404)
      return physicalJson(order)
    }

    if (params.get("count") === "1") {
      const window = spanFrom(params, "ws", "we")
      if (!window) return physicalJson({ error: "Choose the dates again." }, 400)
      return physicalJson({ count: await countOrdersWithin(c.db, c.creatorId, window) })
    }

    const ask = listingAskFrom(params)
    if (!ask) return physicalJson({ error: "Choose the dates again." }, 400)
    if (!isTimeZone(ask.timeZone)) ask.timeZone = "UTC"
    if (ask.open && !isOrderId(ask.open)) ask.open = null
    const { products: _products, ...listing } = await readOrdersListing(c.db, c.creatorId, ask)
    return physicalJson(listing)
  } catch (error) {
    console.error("[orders/list] not read:", error instanceof Error ? error.message : "unknown")
    return physicalJson({ error: "Orders could not be loaded. Try again." }, 500)
  }
}
