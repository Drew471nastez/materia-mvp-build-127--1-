/**
 * ===========================================================================
 *  THE SIZE CHART A PRODUCT PAGE SHOWS, READ FOR THAT PRODUCT
 * ===========================================================================
 * One read for every product page, whoever draws it: Storelib's own product
 * section (lib/products/product-section-data.ts, live and in the builder's
 * canvas), an imported Shopify theme's page (through the page facts,
 * lib/storelib-theme/compat/product-facts-server.ts, and every product card
 * a section features, lib/website-builder/product-extras.ts) and the
 * OnePage's product sheet. So switching the product shown always switches
 * the chart with it.
 *
 * WHICH CHART, first that applies (round 13):
 *
 *   1. the product's own    the chart chosen in the product editor
 *                           (product_size_charts)
 *   2. its collection's     a chart set for a collection the product is in
 *                           (size_charts.collection_ids; a hand picked
 *                           collection by its items, a smart one by its rules)
 *   3. its category's       a chart set for the product's category
 *                           (size_charts.categories, "T-Shirts")
 *   4. none                 the size guide block's own table, if it has one
 *
 * Two charts for the same collection or category: the first by name, so the
 * answer never changes between two reads.
 *
 * A chart is read only when it is the same store's as the product, so a row
 * pointing across stores draws nothing. Before SQL part 283 has run neither
 * table exists, and before part 309 there are no collection or category
 * charts: the page simply has fewer charts, never an error.
 *
 * Takes the server's client from its caller, and imports nothing that is
 * server only, so the tests can hand it a stand-in.
 */
import { inSmartCollection, readRules, type RuleProduct } from "@/lib/physical/collections"
import { readSizeChart, type SizeChart } from "./model"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Where a product's chart came from: its own choice, a collection it is in, or its category. */
export type SizeChartSource = "product" | "collection" | "category"

/** A chart as a visitor is handed it: its content and where it came from, never its id. */
export type ShownSizeChart = SizeChart & { source?: SizeChartSource }

/** What the resolver needs to know about a product: its id, and its category when the caller has it. */
export interface ChartProduct {
  id: string
  category?: string | null
}

interface ChartRow {
  id: string
  name: string
  collection_ids?: string[] | null
  categories?: string[] | null
  [k: string]: unknown
}

const CHART_COLUMNS = "id, name, unit, columns, rows, notes, image_url"
const RULE_COLUMNS = `${CHART_COLUMNS}, collection_ids, categories`
const RULE_PRODUCT_COLUMNS = "id, title, type, tags, vendor, price_cents, compare_at_price_cents:compare_at_cents, weight_grams, created_at, category"

const norm = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "")

function shown(row: Record<string, unknown> | null | undefined, source: SizeChartSource): ShownSizeChart | null {
  if (!row) return null
  const read = readSizeChart(row)
  if (!read) return null
  /* No id on what a visitor is handed: it is the chart's content, nothing else. */
  const { id: _id, ...chart } = read
  return { ...chart, source }
}

/** The store's charts that are set for a collection or a category (part 309), or none. */
export async function ruleCharts(db: Db, creatorId: string): Promise<ChartRow[]> {
  try {
    const { data, error } = await db.from("size_charts").select(RULE_COLUMNS).eq("creator_id", creatorId).order("name", { ascending: true }).limit(200)
    if (error || !Array.isArray(data)) return []
    return (data as ChartRow[]).filter((c) => (c.collection_ids?.length ?? 0) > 0 || (c.categories?.length ?? 0) > 0)
  } catch {
    return []
  }
}

/** Which of `collectionIds` each product is in: hand picked by items, smart by rules applied to the product. */
async function membership(db: Db, creatorId: string, collectionIds: string[], productIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  if (!collectionIds.length || !productIds.length) return out
  const add = (p: string, c: string) => out.set(p, (out.get(p) ?? new Set()).add(c))
  try {
    const { data: cols } = await db.from("product_collections").select("id, kind, rules, match").eq("creator_id", creatorId).in("id", collectionIds)
    const rows = (cols ?? []) as { id: string; kind: string; rules: unknown; match: string }[]
    const manual = rows.filter((r) => r.kind !== "smart").map((r) => r.id)
    if (manual.length) {
      const { data: items } = await db.from("product_collection_items").select("collection_id, product_id").in("collection_id", manual).in("product_id", productIds)
      for (const i of (items ?? []) as { collection_id: string; product_id: string }[]) add(i.product_id, i.collection_id)
    }
    const smart = rows.filter((r) => r.kind === "smart")
    if (smart.length) {
      let { data: ps, error } = await db.from("products").select(RULE_PRODUCT_COLUMNS).eq("creator_id", creatorId).in("id", productIds)
      if (error) ({ data: ps } = await db.from("products").select("id, title, type, price_cents, created_at").eq("creator_id", creatorId).in("id", productIds))
      for (const p of (ps ?? []) as Record<string, any>[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
        const rp: RuleProduct = { id: p.id, title: p.title ?? "", type: p.type ?? "", tags: p.tags ?? [], vendor: p.vendor ?? null, priceCents: p.price_cents ?? 0, compareAtCents: p.compare_at_price_cents ?? null, inventory: null, weightGrams: p.weight_grams ?? null, createdAt: p.created_at, category: p.category ?? null }
        for (const c of smart) if (inSmartCollection(readRules(c.rules), c.match === "any" ? "any" : "all", rp)) add(p.id, c.id)
      }
    }
  } catch {
    /* No collection is known: no collection chart. */
  }
  return out
}

/**
 * The chart each of these products shows, by product id: its own, else its
 * collection's, else its category's. Products with none are left out. One
 * read per table for the whole list, so a shop's cards cost a few queries,
 * not a few per card. Never throws.
 */
export async function sizeChartsForProducts(db: Db, creatorId: string, products: readonly ChartProduct[]): Promise<Map<string, ShownSizeChart>> {
  const out = new Map<string, ShownSizeChart>()
  const ids = [...new Set(products.map((p) => p.id).filter(Boolean))].slice(0, 500)
  if (!creatorId || !ids.length) return out
  try {
    /* 1. The products' own choice. */
    const own = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from("product_size_charts").select("product_id, size_chart_id").eq("creator_id", creatorId).in("product_id", ids.slice(i, i + 100))
      /* No table before part 283: no chart anywhere. */
      if (error) return out
      for (const r of (data ?? []) as { product_id: string; size_chart_id: string }[]) own.set(r.product_id, r.size_chart_id)
    }
    const chartIds = [...new Set(own.values())]
    const byId = new Map<string, Record<string, unknown>>()
    if (chartIds.length) {
      const { data } = await db.from("size_charts").select(CHART_COLUMNS).eq("creator_id", creatorId).in("id", chartIds)
      for (const c of (data ?? []) as Record<string, unknown>[]) byId.set(String(c.id), c)
    }
    for (const [productId, chartId] of own) {
      const chart = shown(byId.get(chartId), "product")
      if (chart) out.set(productId, chart)
    }
    /* 2 and 3. The rest, by the charts set for a collection or a category. */
    const rest = products.filter((p) => ids.includes(p.id) && !out.has(p.id))
    if (!rest.length) return out
    const rules = await ruleCharts(db, creatorId)
    if (!rules.length) return out
    const wanted = [...new Set(rules.flatMap((c) => c.collection_ids ?? []))]
    const inCollections = wanted.length ? await membership(db, creatorId, wanted, rest.map((p) => p.id)) : new Map<string, Set<string>>()
    /* The category, read when the caller did not say it and a chart is set for one. */
    const categories = new Map<string, string>()
    for (const p of rest) if (typeof p.category === "string") categories.set(p.id, p.category)
    const unknown = rest.filter((p) => p.category === undefined).map((p) => p.id)
    if (unknown.length && rules.some((c) => (c.categories?.length ?? 0) > 0)) {
      const { data } = await db.from("products").select("id, category").eq("creator_id", creatorId).in("id", unknown)
      for (const r of (data ?? []) as { id: string; category?: string | null }[]) if (r.category) categories.set(r.id, r.category)
    }
    for (const p of rest) {
      const mine = inCollections.get(p.id)
      const byCollection = mine ? rules.find((c) => (c.collection_ids ?? []).some((id) => mine.has(id))) : undefined
      const cat = norm(categories.get(p.id))
      const byCategory = !byCollection && cat ? rules.find((c) => (c.categories ?? []).some((x) => norm(x) === cat)) : undefined
      const chart = byCollection ? shown(byCollection, "collection") : byCategory ? shown(byCategory, "category") : null
      if (chart) out.set(p.id, chart)
    }
  } catch {
    /* What was found stays; the rest have none. */
  }
  return out
}

/** The chart for one product, or null: none chosen or set for its collection or category, the tables not there yet, or a read that failed. */
export async function sizeChartForProduct(db: Db, productId: string, creatorId?: string | null, opts: { category?: string | null } = {}): Promise<ShownSizeChart | null> {
  if (!productId) return null
  try {
    let owner = creatorId ?? null
    if (!owner) {
      /* Who owns the product, so its chart is read from its own store only. */
      const { data } = await db.from("products").select("creator_id").eq("id", productId).maybeSingle()
      owner = (data?.creator_id as string | undefined) ?? null
    }
    if (!owner) return null
    const found = await sizeChartsForProducts(db, owner, [{ id: productId, ...(opts.category !== undefined ? { category: opts.category } : {}) }])
    return found.get(productId) ?? null
  } catch {
    return null
  }
}

/** The most product links one store's read takes: more than any shop has products with a chart. */
const STORE_LINKS = 5000

/**
 * Every chart this store's products use, by product id: what a featured
 * product, a card or a quick view of an imported theme reads as
 * product.metafields.storelib.size_chart (lib/storelib-theme/compat/
 * objects.ts), the same chart its own page reads above. Both reads are
 * filtered by the store's own creator id, and a link is used only when its
 * chart is the same store's. Empty before SQL part 283, or on a read that
 * failed: never an error.
 */
export async function sizeChartsForStore(db: Db, creatorId: string): Promise<Record<string, SizeChart>> {
  if (!creatorId) return {}
  try {
    const { data: links, error } = await db.from("product_size_charts").select("product_id, size_chart_id").eq("creator_id", creatorId).limit(STORE_LINKS)
    if (error || !Array.isArray(links)) return {}
    if (links.length === 0) {
      /* No product picked one: the charts set for a collection or a category still may apply (round 13). */
      const out: Record<string, SizeChart> = {}
      await withRuleCharts(db, creatorId, out)
      return out
    }
    const chartIds = [...new Set((links as { size_chart_id?: unknown }[]).map((l) => String(l.size_chart_id ?? "")).filter(Boolean))]
    const charts = new Map<string, SizeChart>()
    for (let i = 0; i < chartIds.length; i += 100) {
      const { data, error: chartError } = await db.from("size_charts").select("id, name, unit, columns, rows, notes, image_url").eq("creator_id", creatorId).in("id", chartIds.slice(i, i + 100))
      if (chartError) return {}
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const read = readSizeChart(row)
        if (!read || typeof row.id !== "string") continue
        const { id: _id, ...shown } = read
        charts.set(row.id, shown)
      }
    }
    const out: Record<string, SizeChart> = {}
    for (const l of links as { product_id?: unknown; size_chart_id?: unknown }[]) {
      const chart = charts.get(String(l.size_chart_id ?? ""))
      if (chart && typeof l.product_id === "string") out[l.product_id] = chart
    }
    await withRuleCharts(db, creatorId, out)
    return out
  } catch {
    return {}
  }
}

/**
 * Round 13: the store's published products that ship and have no chart of
 * their own in `out`, given the chart set for one of their collections or
 * their category, as their own page reads it (sizeChartsForProducts). Only
 * read when the store has such a chart (part 309).
 */
async function withRuleCharts(db: Db, creatorId: string, out: Record<string, SizeChart>): Promise<void> {
  try {
    if (!(await ruleCharts(db, creatorId)).length) return
    const { data, error } = await db.from("products").select("id, category").eq("creator_id", creatorId).eq("status", "published").eq("type", "physical").limit(STORE_LINKS)
    if (error || !Array.isArray(data)) return
    const rest = (data as { id: string; category?: string | null }[]).filter((p) => typeof p.id === "string" && !out[p.id]).map((p) => ({ id: p.id, category: p.category ?? null }))
    for (let i = 0; i < rest.length; i += 500) {
      const found = await sizeChartsForProducts(db, creatorId, rest.slice(i, i + 500))
      for (const [id, chart] of found) out[id] = chart
    }
  } catch {
    /* The products' own charts stay. */
  }
}
