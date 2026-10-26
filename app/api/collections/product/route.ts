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
 * the rest, each at the end of its list when it is new there. A smart
 * collection is listed (it holds the product by its rules, said as `smart`)
 * and never written: its rules decide.
 *
 * The store's own product and collections only (shopCaller).
 */
type Row = { id: string; title: string; kind: "manual" | "smart"; member: boolean }

export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const productId = new URL(request.url).searchParams.get("productId")
  const collections = await listCollections(c.db, c.creatorId)
  const rows: Row[] = collections.map((col) => ({ id: col.id, title: col.title, kind: col.kind, member: isUuid(productId) ? col.productIds.includes(productId) : false }))
  return physicalJson({ collections: rows })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const productId = body?.productId
  if (!isUuid(productId) || !Array.isArray(body?.collectionIds)) return physicalJson({ error: "Bad request." }, 400)
  const { data: product } = await c.db.from("products").select("id").eq("id", productId).eq("creator_id", c.creatorId).maybeSingle()
  if (!product) return physicalJson({ error: "This product was not found." }, 404)
  const { data: manual } = await c.db.from("product_collections").select("id").eq("creator_id", c.creatorId).eq("kind", "manual").limit(500)
  const own = new Set(((manual ?? []) as { id: string }[]).map((r) => r.id))
  const wanted = new Set((body!.collectionIds as unknown[]).filter((x): x is string => typeof x === "string" && own.has(x)))
  const { data: items } = own.size ? await c.db.from("product_collection_items").select("collection_id, position").in("collection_id", [...own]) : { data: [] }
  const rows = (items ?? []) as { collection_id: string; position: number | null }[]
  const { data: mine } = own.size ? await c.db.from("product_collection_items").select("collection_id").eq("product_id", productId).in("collection_id", [...own]) : { data: [] }
  const inNow = new Set(((mine ?? []) as { collection_id: string }[]).map((r) => r.collection_id))
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
  return physicalJson({ ok: true, added: add.length, removed: remove.length })
}
