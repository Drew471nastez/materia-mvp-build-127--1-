import { NextResponse } from "next/server"
import { currencyRefusal } from "@/lib/store/currency-guard"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { readOffer } from "@/lib/offers/offers"
import { deleteOffer, offersArea, reorderOffers, saveOffer } from "@/lib/offers/offers-server"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * /app/offers (lib/offers, SQL parts 116 and 213): the store's upsells and
 * bundles. A store's whatever it sells, so the owner check alone
 * (shopCaller), as collections are: they apply in the basket checkout of
 * downloads as well as the cart checkout of things that ship.
 *
 *   GET                       the offers, and the store's products and collections to choose from
 *   POST   { offer }          a new one
 *   PUT    { id, ...offer }   change one (or switch it on or off)
 *   PATCH  { order: [ids] }   the order they apply in, first first
 *   DELETE { id }             remove one
 *
 * Every write is filtered by the caller's own creator id, and every product
 * and collection an offer names must be theirs (lib/offers/offers-server).
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  return physicalJson(await offersArea(c.db, c.creatorId))
}

async function write(request: Request, method: "POST" | "PUT" | "DELETE" | "PATCH") {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  if (method === "PATCH") {
    const order = Array.isArray(body.order) ? body.order.filter(isUuid).slice(0, 100) : []
    const out = await reorderOffers(c.db, c.creatorId, order as string[])
    if (!out.ok) return physicalJson({ error: out.error }, out.status)
    return physicalJson({ ok: true })
  }
  const id = method === "POST" ? null : body.id
  if (method !== "POST" && !isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  if (method === "DELETE") {
    const out = await deleteOffer(c.db, c.creatorId, id as string)
    if (!out.ok) return physicalJson({ error: out.error }, out.status)
    await recordActivity(c.db, c, { action: "offer.removed", subjectType: "offer", subjectId: id as string, subjectLabel: typeof body.title === "string" ? body.title : null })
    return physicalJson({ ok: true })
  }
  /* A fixed amount or minimum typed before the store's currency was converted is never saved over the converted one (lib/store/currency-guard). */
  const moved = await currencyRefusal(c.db, c.creatorId, body.formCurrency)
  if (moved) return physicalJson({ error: moved, code: "currency_changed" }, 409)
  const read = readOffer(body)
  if (read.ok === false) return physicalJson({ error: (read as { error: string }).error }, 400)
  const out = await saveOffer(c.db, c.creatorId, (id as string | null) ?? null, read.offer)
  if (out.ok === false) return physicalJson({ error: (out as { error: string }).error }, (out as { status: number }).status)
  await recordActivity(c.db, c, { action: method === "POST" ? "offer.added" : "offer.updated", subjectType: "offer", subjectId: out.offer.id, subjectLabel: out.offer.title })
  return physicalJson({ offer: out.offer })
}

export const POST = (request: Request) => write(request, "POST")
export const PUT = (request: Request) => write(request, "PUT")
export const PATCH = (request: Request) => write(request, "PATCH")
export const DELETE = (request: Request) => write(request, "DELETE")
