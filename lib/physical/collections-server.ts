import "server-only"

/**
 * Collections, for the owner: manual lists and smart ones by rules. The
 * storefront reads published ones through productsInCollection, which
 * applies the same rules (./collections.ts) to the shop's published products.
 */

import type { Db } from "./auth"
import { COLLECTION_SORTS, inSmartCollection, readRules, slugify, sortProducts, type CollectionRule, type CollectionSort, type RuleProduct } from "./collections"
import { text } from "./config-server"
import { ensureDefaultCollections } from "./default-collections"

export interface CollectionView {
  id: string
  title: string
  slug: string
  description: string | null
  imageUrl: string | null
  kind: "manual" | "smart"
  rules: CollectionRule[]
  match: "all" | "any"
  sort: CollectionSort
  published: boolean
  productIds: string[]
}

function view(r: Record<string, any>, productIds: string[]): CollectionView {
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description ?? null,
    imageUrl: r.image_url ?? null,
    kind: r.kind,
    rules: readRules(r.rules),
    match: r.match === "any" ? "any" : "all",
    sort: (COLLECTION_SORTS as readonly string[]).includes(r.sort) ? r.sort : "manual",
    published: r.published !== false,
    productIds,
  }
}

async function shopProducts(db: Db, creatorId: string, publishedOnly: boolean): Promise<(RuleProduct & { sales: number })[]> {
  let q = db.from("products").select("id, title, type, tags, vendor, price_cents, compare_at_price_cents, inventory_count, weight_grams, created_at, sales_count, status").eq("creator_id", creatorId).limit(2000)
  if (publishedOnly) q = q.eq("status", "published")
  const { data } = await q
  return ((data ?? []) as Record<string, any>[]).map((p) => ({
    id: p.id,
    title: p.title ?? "",
    type: p.type ?? "",
    tags: p.tags ?? [],
    vendor: p.vendor ?? null,
    priceCents: p.price_cents ?? 0,
    compareAtCents: p.compare_at_price_cents ?? null,
    inventory: p.inventory_count ?? null,
    weightGrams: p.weight_grams ?? null,
    createdAt: p.created_at,
    sales: p.sales_count ?? 0,
  }))
}

export async function listCollections(db: Db, creatorId: string, fresh = false): Promise<CollectionView[]> {
  const { data } = await db.from("product_collections").select("*").eq("creator_id", creatorId).order("created_at", { ascending: true }).limit(200)
  const rows = (data ?? []) as Record<string, any>[]
  /* A store with none gets All products and Home page, once (./default-collections.ts). */
  if (rows.length === 0) return !fresh && (await ensureDefaultCollections(creatorId)) ? listCollections(db, creatorId, true) : []
  const { data: items } = await db.from("product_collection_items").select("collection_id, product_id, position").in("collection_id", rows.map((r) => r.id)).order("position")
  const products = rows.some((r) => r.kind === "smart") ? await shopProducts(db, creatorId, false) : []
  return rows.map((r) => {
    if (r.kind === "smart") {
      const rules = readRules(r.rules)
      return view(r, products.filter((p) => inSmartCollection(rules, r.match, p)).map((p) => p.id))
    }
    return view(r, ((items ?? []) as { collection_id: string; product_id: string }[]).filter((i) => i.collection_id === r.id).map((i) => i.product_id))
  })
}

export async function saveCollection(db: Db, creatorId: string, id: string | null, body: Record<string, unknown>): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = text(body.title, 120)
  if (!title) return { ok: false, error: "Give the collection a title." }
  const slug = slugify(typeof body.slug === "string" && body.slug.trim() ? body.slug : title) || "collection"
  const kind = body.kind === "smart" ? "smart" : "manual"
  const rules = readRules(body.rules)
  if (kind === "smart" && rules.length === 0) return { ok: false, error: "Add at least one condition." }
  const row = {
    creator_id: creatorId,
    title,
    slug,
    description: typeof body.description === "string" ? body.description.slice(0, 5000) : null,
    image_url: typeof body.imageUrl === "string" && /^https:\/\//.test(body.imageUrl) ? body.imageUrl.slice(0, 2048) : null,
    kind,
    rules: kind === "smart" ? rules : [],
    match: body.match === "any" ? "any" : "all",
    sort: (COLLECTION_SORTS as readonly string[]).includes(String(body.sort)) ? body.sort : "manual",
    published: body.published !== false,
    updated_at: new Date().toISOString(),
  }
  let collectionId = id
  if (id) {
    const { error } = await db.from("product_collections").update(row).eq("id", id).eq("creator_id", creatorId)
    if (error) return { ok: false, error: error.code === "23505" ? "Another collection uses that address." : "The collection could not be saved." }
  } else {
    const { data, error } = await db.from("product_collections").insert(row).select("id").single()
    if (error || !data) return { ok: false, error: error?.code === "23505" ? "Another collection uses that address." : "The collection could not be saved." }
    collectionId = data.id
  }
  if (kind === "manual" && Array.isArray(body.productIds)) {
    const wanted = [...new Set(body.productIds.filter((x): x is string => typeof x === "string"))].slice(0, 1000)
    const { data: owned } = wanted.length ? await db.from("products").select("id").eq("creator_id", creatorId).in("id", wanted) : { data: [] }
    const ok = new Set(((owned ?? []) as { id: string }[]).map((p) => p.id))
    await db.from("product_collection_items").delete().eq("collection_id", collectionId)
    const rows = wanted.filter((p) => ok.has(p)).map((p, i) => ({ collection_id: collectionId, product_id: p, position: i }))
    if (rows.length) await db.from("product_collection_items").insert(rows)
  }
  return { ok: true, id: collectionId! }
}

export async function deleteCollection(db: Db, creatorId: string, id: string): Promise<boolean> {
  const { error } = await db.from("product_collections").delete().eq("id", id).eq("creator_id", creatorId)
  return !error
}

/** A published collection's products, in its order, for the storefront. */
export async function productsInCollection(db: Db, creatorId: string, slug: string): Promise<{ collection: CollectionView; productIds: string[] } | null> {
  const { data: r } = await db.from("product_collections").select("*").eq("creator_id", creatorId).eq("slug", slug).eq("published", true).maybeSingle()
  if (!r) return null
  const products = await shopProducts(db, creatorId, true)
  let list: (RuleProduct & { sales: number; position?: number })[]
  if (r.kind === "smart") {
    const rules = readRules(r.rules)
    list = products.filter((p) => inSmartCollection(rules, r.match, p))
  } else {
    const { data: items } = await db.from("product_collection_items").select("product_id, position").eq("collection_id", r.id)
    const pos = new Map(((items ?? []) as { product_id: string; position: number }[]).map((i) => [i.product_id, i.position]))
    list = products.filter((p) => pos.has(p.id)).map((p) => ({ ...p, position: pos.get(p.id) }))
  }
  const sorted = sortProducts(list, (COLLECTION_SORTS as readonly string[]).includes(r.sort) ? r.sort : "manual")
  return { collection: view(r, sorted.map((p) => p.id)), productIds: sorted.map((p) => p.id) }
}

/**
 * A product as the collection editor needs it: what the picker shows (the
 * picture, the name, the kind, whether it is on sale) and what a rule reads
 * (tags, vendor, prices, stock, weight), so the editor can say which
 * products a smart collection catches while its rules are being written.
 */
export interface CollectionProduct {
  id: string
  title: string
  thumbnail_url: string | null
  type: string
  status: string
  price_cents: number
  tags?: string[] | null
  vendor?: string | null
  compare_at_price_cents?: number | null
  inventory_count?: number | null
  weight_grams?: number | null
}

const PICKER_COLUMNS = "id, title, thumbnail_url, type, status, price_cents"
const RULE_COLUMNS = `${PICKER_COLUMNS}, tags, vendor, compare_at_price_cents, inventory_count, weight_grams`

/**
 * The shop's collections and its products, for /app/products/collections
 * (read on the server, so the page lands whole) and for GET /api/collections.
 * A database without the rule columns yet still lists the products.
 */
export async function collectionsArea(db: Db, creatorId: string): Promise<{ collections: CollectionView[]; products: CollectionProduct[] }> {
  const products = (columns: string) =>
    db.from("products").select(columns).eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(1000)
  const [collections, rich] = await Promise.all([listCollections(db, creatorId), products(RULE_COLUMNS)])
  const rows = rich.error ? (await products(PICKER_COLUMNS)).data : rich.data
  return { collections, products: (rows ?? []) as CollectionProduct[] }
}
