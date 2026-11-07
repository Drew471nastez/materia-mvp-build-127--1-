import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { listCollections } from "@/lib/physical/collections-server"
import { translationsChanged } from "@/lib/markets/translate-queue"
import { sizeChartsChanged } from "../../size-charts/changed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  ONE PRODUCT'S COLLECTIONS, FROM ITS EDITOR (round 24)
 * ===========================================================================
 * The owner: "when I'm adding a product or edit a product, I can select in
 * which collection to add it". GET ?productId= lists the store's collections
 * with whether the product is in each; PUT { productId, collectionIds } puts
 * it in exactly those of the store's manual collections and takes it out of
 * the rest, each at the end of its list when it is new there. PUT
 * { productId, add, remove } changes only those (round AK): the editor
 * sends the pills it changed, so a tab opened before the product was added
 * to a collection elsewhere does not take it out again. A smart
 * collection is listed (it holds the product by its rules, said as `smart`)
 * and never written: its rules decide.
 *
 * The store's own product and collections only (shopCaller).
 */
type Row = { id: string; title: string; kind: "manual" | "smart"; member: boolean }

export async function GET(request: Request) {
  const c = await shopCaller("products", { read: true })
  if (c instanceof NextResponse) return c
  const productId = new URL(request.url).searchParams.get("productId")
  const collections = await listCollections(c.db, c.creatorId)
  const rows: Row[] = collections.map((col) => ({ id: col.id, title: col.title, kind: col.kind, member: isUuid(productId) ? col.productIds.includes(productId) : false }))
  return physicalJson({ collections: rows })
}

export async function PUT(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const productId = body?.productId
  const changes = Array.isArray(body?.add) || Array.isArray(body?.remove)
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
  if (!isUuid(productId) || (!changes && !Array.isArray(body?.collectionIds))) return physicalJson({ error: "Bad request." }, 400)
  const { data: product } = await c.db.from("products").select("id").eq("id", productId).eq("creator_id", c.creatorId).maybeSingle()
  if (!product) return physicalJson({ error: "This product was not found." }, 404)
  const { data: manual } = await c.db.from("product_collections").select("id").eq("creator_id", c.creatorId).eq("kind", "manual").limit(500)
  const own = new Set(((manual ?? []) as { id: string }[]).map((r) => r.id))
  const { data: items } = own.size ? await c.db.from("product_collection_items").select("collection_id, position").in("collection_id", [...own]) : { data: [] }
  const rows = (items ?? []) as { collection_id: string; position: number | null }[]
  const { data: mine, error: mineError } = own.size ? await c.db.from("product_collection_items").select("collection_id").eq("product_id", productId).in("collection_id", [...own]) : { data: [], error: null }
  /* Never a change worked out from a read that failed: it would take the product out of what it could not see. */
  if (mineError) return physicalJson({ error: "The collections were not saved. Try again." }, 503)
  const inNow = new Set(((mine ?? []) as { collection_id: string }[]).map((r) => r.collection_id))
  /* Changes only: what is saved now, with those put in and taken out. */
  const out = new Set(ids(body!.remove))
  const wanted = changes ? new Set([...inNow, ...ids(body!.add)].filter((id) => own.has(id) && !out.has(id))) : new Set(ids(body!.collectionIds).filter((id) => own.has(id)))
  const add = [...wanted].filter((id) => !inNow.has(id))
  const remove = [...inNow].filter((id) => !wanted.has(id))
  if (remove.length) {
    const { error } = await c.db.from("product_collection_items").delete().eq("product_id", productId).in("collection_id", remove)
    if (error) return physicalJson({ error: "The collections were not saved." }, 500)
  }
  if (add.length) {
    const last = (id: string) => rows.filter((r) => r.collection_id === id).reduce((n, r) => Math.max(n, Number(r.position) || 0), -1)
    const { error } = await c.db.from("product_collection_items").insert(add.map((id) => ({ collection_id: id, product_id: productId, position: last(id) + 1 })))
    if (error) return physicalJson({ error: "The collections were not saved." }, 500)
  }
  if (add.length || remove.length) {
    translationsChanged(c.creatorId)
    await sizeChartsChanged(c.creatorId)
  }
  /* The manual collections it is in now, so the editor shows what is saved. */
  return physicalJson({ ok: true, added: add.length, removed: remove.length, member: [...wanted] })
}
