import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { readOffer } from "@/lib/offers/offers"
import { deleteOffer, loadOffers, saveOffer } from "@/lib/offers/offers-server"
import { recordActivity } from "@/lib/activity/log-server"
import { mediaUrl } from "@/lib/storage/media-url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * /app/offers (lib/offers, SQL part 115): the store's upsells and bundles.
 * Only while physical commerce is on in /admin, since they apply in the
 * cart checkout.
 *
 *   GET                       the offers, and the store's products to choose from
 *   POST   { offer }          a new one
 *   PUT    { id, ...offer }   change one (or switch it on or off)
 *   DELETE { id }             remove one
 */
export async function GET() {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const [{ offers, ready }, { data: rows }] = await Promise.all([
    loadOffers(c.db, c.creatorId),
    c.db.from("products").select("id, title, type, status, price_cents, thumbnail_url").eq("creator_id", c.creatorId).neq("status", "archived").order("created_at", { ascending: false }).limit(500),
  ])
  const products = ((rows ?? []) as { id: string; title: string; type: string; status: string; price_cents: number | null; thumbnail_url: string | null }[]).map((p) => ({ id: p.id, title: p.title, type: p.type, published: p.status === "published", priceCents: Math.max(0, Math.round(Number(p.price_cents) || 0)), imageUrl: p.thumbnail_url ? mediaUrl(p.thumbnail_url) : null }))
  return physicalJson({ offers, products, ready })
}

async function write(request: Request, method: "POST" | "PUT" | "DELETE") {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const id = method === "POST" ? null : body.id
  if (method !== "POST" && !isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  if (method === "DELETE") {
    const out = await deleteOffer(c.db, c.creatorId, id as string)
    if (!out.ok) return physicalJson({ error: out.error }, out.status)
    await recordActivity(c.db, c, { action: "offer.removed", subjectType: "offer", subjectId: id as string, subjectLabel: typeof body.title === "string" ? body.title : null })
    return physicalJson({ ok: true })
  }
  const read = readOffer(body)
  if (!read.ok) return physicalJson({ error: read.error }, 400)
  const out = await saveOffer(c.db, c.creatorId, (id as string | null) ?? null, read.offer)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  await recordActivity(c.db, c, { action: method === "POST" ? "offer.added" : "offer.updated", subjectType: "offer", subjectId: out.offer.id, subjectLabel: out.offer.title })
  return physicalJson({ offer: out.offer })
}

export const POST = (request: Request) => write(request, "POST")
export const PUT = (request: Request) => write(request, "PUT")
export const DELETE = (request: Request) => write(request, "DELETE")
