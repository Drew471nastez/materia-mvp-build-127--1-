/**
 * ===========================================================================
 *  THE CREATOR'S COLLECTIONS, AS A WEBSITE SHOWS THEM
 * ===========================================================================
 * A `collection_picker`, a `collection_list` and the collections page read
 * the creator's collections from Products › Collections. This is the one
 * read behind all three, on the server, by creator id:
 *
 *   ONE CREATOR'S. Every query is filtered by the site owner's creator id,
 *   so a setting holding somebody else's collection id finds nothing, the
 *   same as a deleted one.
 *
 *   PUBLISHED ONLY, for a visitor: an unpublished collection is not on the
 *   site, and neither is a draft product inside a published one. The
 *   builder asks for every collection (`published: false`) so the picker
 *   can name the hidden ones, and still only draws published products.
 *
 *   NEVER THROWS. No table yet, no rows, a read that failed: the answer is
 *   no collections, and every setting that names one draws empty.
 *
 * The rules a smart collection is made of are the same ones the dashboard
 * and the discount check use (lib/physical/collections.ts), so a product is
 * in a collection here exactly when it is in it everywhere else.
 */
import "server-only"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"

import { COLLECTION_SORTS, inSmartCollection, readRules, sortProducts, type CollectionSort, type RuleProduct } from "@/lib/physical/collections"
import type { StorefrontCollection } from "@/lib/storelib-theme/types"
import { plainText } from "@/lib/storelib-theme/values"
import { toCard } from "./shop-products"
import { offChannel } from "@/lib/store/channel-filter"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Most collections a site reads. The dashboard keeps 200; a page has no use for more than this. */
export const MAX_SITE_COLLECTIONS = 60
/** Products each collection carries to a template. */
export const COLLECTION_PRODUCTS = 12

export interface CollectionChoice {
  id: string
  title: string
  /** The picture the picker shows beside it, or "". */
  image: string
  /** Whether a visitor sees it. */
  published: boolean
  products_count: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const httpsOrPath = (v: unknown) => (typeof v === "string" && /^(https:\/\/|\/(?![/\\]))/i.test(v.trim()) ? v.trim() : "")

/**
 * The creator's collections, each with its published products in its own
 * order. `ids` narrows the read to the collections a page names.
 */
export async function siteCollections(
  db: Db,
  creatorId: string,
  opts: { ids?: string[]; published?: boolean; fresh?: boolean } = {},
): Promise<{ collections: Record<string, StorefrontCollection>; choices: CollectionChoice[] }> {
  const empty = { collections: {}, choices: [] }
  /* The builder (every collection, not a visitor's read) gives a store with none its two defaults, once (lib/physical/default-collections.ts). */
  const seed = async () => {
    if (opts.published !== false || opts.ids || opts.fresh) return empty
    const { ensureDefaultCollections } = await import("@/lib/physical/default-collections")
    return (await ensureDefaultCollections(creatorId)) ? siteCollections(db, creatorId, { ...opts, fresh: true }) : empty
  }
  if (!creatorId || !UUID.test(creatorId)) return empty
  const publishedOnly = opts.published !== false
  const ids = opts.ids?.filter((i) => UUID.test(i)).slice(0, MAX_SITE_COLLECTIONS)
  if (ids && ids.length === 0) return empty
  try {
    let q = db
      .from("product_collections")
      .select("id, title, slug, description, image_url, kind, rules, match, sort, published, created_at")
      .eq("creator_id", creatorId)
    if (publishedOnly) q = q.eq("published", true)
    if (ids) q = q.in("id", ids)
    const { data: rows, error } = await q.order("created_at", { ascending: true }).limit(MAX_SITE_COLLECTIONS)
    if (error || !Array.isArray(rows)) return empty
    if (rows.length === 0) return seed()

    const manualIds = (rows as Record<string, any>[]).filter((r) => r.kind !== "smart").map((r) => r.id)
    const { data: items } = manualIds.length
      ? await db.from("product_collection_items").select("collection_id, product_id, position").in("collection_id", manualIds)
      : { data: [] }

    /*
      The shop's published products: every one when a smart collection has
      rules to test, only the listed ones otherwise. `*` because the columns
      a rule reads (tags, vendor, stock, weight) arrived with physical
      commerce, and naming one a database does not have yet fails the read.
    */
    const smart = (rows as Record<string, any>[]).some((r) => r.kind === "smart")
    const listed = [...new Set(((items ?? []) as { product_id: string }[]).map((i) => i.product_id))].slice(0, 2000)
    let pq = db.from("products").select("*").eq("creator_id", creatorId).eq("status", "published")
    if (!smart) pq = listed.length ? pq.in("id", listed) : null
    const [{ data: productRows }, offStore, store] = await Promise.all([pq ? pq.limit(2000) : Promise.resolve({ data: [] }), offChannel(db, creatorId, "storefront"), readStoreCurrency(db, creatorId)])
    /* Settings › Sales channels: a product taken off the Online store is in none of its collections. */
    const products = ((productRows ?? []) as Record<string, any>[]).filter((p) => !offStore.has(String(p.id))).map((p) => ({
      row: p,
      rule: {
        id: String(p.id),
        title: p.title ?? "",
        type: p.type ?? "",
        tags: Array.isArray(p.tags) ? p.tags : [],
        vendor: p.vendor ?? null,
        priceCents: p.price_cents ?? 0,
        compareAtCents: p.compare_at_price_cents ?? p.compare_at_cents ?? null,
        inventory: p.inventory_count ?? null,
        weightGrams: p.weight_grams ?? null,
        createdAt: p.created_at,
        category: typeof p.category === "string" ? p.category : null,
        sales: p.sales_count ?? 0,
      } satisfies RuleProduct & { sales: number },
    }))
    const byId = new Map(products.map((p) => [p.rule.id, p]))

    const collections: Record<string, StorefrontCollection> = {}
    const choices: CollectionChoice[] = []
    for (const r of rows as Record<string, any>[]) {
      let members: (RuleProduct & { sales: number; position?: number })[]
      if (r.kind === "smart") {
        const rules = readRules(r.rules)
        members = products.filter((p) => inSmartCollection(rules, r.match === "any" ? "any" : "all", p.rule)).map((p) => p.rule)
      } else {
        members = ((items ?? []) as { collection_id: string; product_id: string; position: number }[])
          .filter((i) => i.collection_id === r.id && byId.has(i.product_id))
          .map((i) => ({ ...byId.get(i.product_id)!.rule, position: i.position }))
      }
      const sort: CollectionSort = (COLLECTION_SORTS as readonly string[]).includes(r.sort) ? r.sort : "manual"
      const sorted = sortProducts(members, sort)
      const cards = sorted.slice(0, COLLECTION_PRODUCTS).map((p) => toCard(byId.get(p.id)!.row as never, [], [], store.currency))
      const image = httpsOrPath(r.image_url) || cards[0]?.settings.image || ""
      const handle = String(r.slug ?? "")
      const id = String(r.id).toLowerCase()
      choices.push({ id, title: String(r.title ?? ""), image, published: r.published !== false, products_count: sorted.length })
      if (r.published === false) continue
      collections[id] = {
        id,
        title: String(r.title ?? ""),
        handle,
        description: plainText(String(r.description ?? "")).slice(0, 2000),
        image,
        url: `/collections/${handle}`,
        products_count: sorted.length,
        products: cards,
      }
    }
    return { collections, choices }
  } catch {
    return empty
  }
}
