import "server-only"

/**
 * ===========================================================================
 *  SIZE CHARTS, FOR THE STORE'S OWNER
 * ===========================================================================
 * The store's charts (`size_charts`) and which one each product uses
 * (`product_size_charts`, one row per product that has one). Every read and
 * write here is filtered by the creator id the route found for the signed
 * in owner (lib/physical/auth physicalCaller): a chart id or a product id
 * from another store is "not found", never touched.
 *
 * Before SQL part 283 has run the tables are not there. Reads then say
 * `ready: false` with an empty list, so the product editor and Products ›
 * Size charts open as usual and say what is missing; writes answer with the
 * part to run.
 */
import type { Db } from "@/lib/physical/auth"
import { isUuid } from "@/lib/physical/auth"
import { checkSizeChart, readSizeChart, type SizeChart } from "./model"
import { sizeChartForProduct, type SizeChartSource } from "./storefront"

export const SIZE_CHART_SQL_PART = 283
/** Round 13: a chart set for collections and categories (size_charts.collection_ids, categories). */
export const SIZE_CHART_RULES_SQL_PART = 309
/** The most collections, and the most categories, one chart is set for. */
export const MAX_CHART_RULES = 50
/** The most charts one store keeps: more than any clothing shop has cuts. */
export const MAX_SIZE_CHARTS = 200

export const missingTable = (e: { code?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204" || e.code === "42703")
const NOT_READY = `Size charts need a database update. Run SQL part ${SIZE_CHART_SQL_PART} in Supabase, then try again.`

export interface SizeChartView extends SizeChart {
  id: string
  /** How many of the store's products use it. */
  productCount: number
  updatedAt: string | null
  /** The store's collections it is also shown for (part 309), by id. */
  collectionIds: string[]
  /** The categories it is also shown for (part 309), as the product editor files them. */
  categories: string[]
}

/** What a chart can be set for: the store's collections, and the categories its products are filed under. */
export interface SizeChartTargets {
  collections: { id: string; title: string }[]
  categories: string[]
}

export type Failure = { ok: false; error: string; status: number }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [])

function view(r: Record<string, unknown>, productCount: number): SizeChartView | null {
  const chart = readSizeChart(r)
  if (!chart || typeof r.id !== "string") return null
  return { ...chart, id: r.id, productCount, updatedAt: typeof r.updated_at === "string" ? r.updated_at : null, collectionIds: strings(r.collection_ids), categories: strings(r.categories) }
}

const LIST_COLUMNS = "id, name, unit, columns, rows, notes, image_url, updated_at"

/** The collection ids and categories a seller sent, kept to this store's collections, trimmed and without repeats. */
export function readRules(body: Record<string, unknown>, collections: ReadonlySet<string>): { collectionIds: string[]; categories: string[] } {
  const collectionIds = [...new Set(strings(body.collectionIds).filter((id) => isUuid(id) && collections.has(id)))].slice(0, MAX_CHART_RULES)
  const seen = new Set<string>()
  const categories: string[] = []
  for (const c of strings(body.categories)) {
    const name = c.replace(/\s+/g, " ").trim().slice(0, 80)
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    categories.push(name)
  }
  return { collectionIds, categories: categories.slice(0, MAX_CHART_RULES) }
}

/** The store's collections, and the categories its products are filed under, for the chart editor's "Also show it on". */
export async function sizeChartTargets(db: Db, creatorId: string): Promise<SizeChartTargets> {
  const [cols, cats] = await Promise.all([
    Promise.resolve(db.from("product_collections").select("id, title").eq("creator_id", creatorId).order("title", { ascending: true }).limit(500)).then((r: { data?: unknown; error?: unknown }) => (r.error ? [] : ((r.data ?? []) as { id: string; title: string | null }[])), () => []),
    Promise.resolve(db.from("products").select("category, status").eq("creator_id", creatorId).limit(2000)).then((r: { data?: unknown; error?: unknown }) => (r.error ? [] : ((r.data ?? []) as { category?: string | null; status?: string | null }[]).filter((p) => p.status !== "deleted" && p.status !== "archived")), () => []),
  ])
  const categories = new Map<string, string>()
  for (const r of cats) {
    const c = typeof r.category === "string" ? r.category.trim() : ""
    if (c && !categories.has(c.toLowerCase())) categories.set(c.toLowerCase(), c)
  }
  return {
    collections: cols.filter((c) => typeof c.id === "string").map((c) => ({ id: c.id, title: (c.title ?? "").trim() || "Untitled" })),
    categories: [...categories.values()].sort((a, b) => a.localeCompare(b)),
  }
}

export async function listSizeCharts(db: Db, creatorId: string): Promise<{ ready: boolean; rules: boolean; charts: SizeChartView[]; targets: SizeChartTargets }> {
  const read = (cols: string) => db.from("size_charts").select(cols).eq("creator_id", creatorId).order("name", { ascending: true }).limit(MAX_SIZE_CHARTS)
  /* With what each chart is set for (part 309); without it on a database that has not run that part. */
  let { data, error } = await read(`${LIST_COLUMNS}, collection_ids, categories`)
  let rules = !error
  if (error && missingTable(error)) {
    ;({ data, error } = await read(LIST_COLUMNS))
    rules = false
  }
  const targets = await sizeChartTargets(db, creatorId)
  if (error) return { ready: !missingTable(error), rules: false, charts: [], targets }
  const { data: links } = await db.from("product_size_charts").select("size_chart_id").eq("creator_id", creatorId).limit(5000)
  const counts = new Map<string, number>()
  for (const l of (links ?? []) as { size_chart_id: string }[]) counts.set(l.size_chart_id, (counts.get(l.size_chart_id) ?? 0) + 1)
  const charts = ((data ?? []) as Record<string, unknown>[]).map((r) => view(r, counts.get(String(r.id)) ?? 0)).filter((c): c is SizeChartView => c !== null)
  return { ready: true, rules, charts, targets }
}

function failure(error: { code?: string } | null | undefined, fallback = "That could not be saved. Try again in a moment."): Failure {
  if (missingTable(error)) return { ok: false, error: NOT_READY, status: 503 }
  if (error?.code === "23514") return { ok: false, error: "One of the values is too long.", status: 400 }
  return { ok: false, error: fallback, status: 500 }
}

/** Creates a chart (`id` null) or replaces one of this store's. */
export async function saveSizeChart(db: Db, creatorId: string, id: string | null, body: Record<string, unknown>): Promise<{ ok: true; id: string } | Failure> {
  const checked = checkSizeChart(body)
  if (checked.ok === false) return { ok: false, error: checked.error, status: 400 }
  const c = checked.chart
  const base = { name: c.name, unit: c.unit, columns: c.columns, rows: c.rows, notes: c.notes || null, image_url: c.imageUrl }
  /* What else it is shown for (part 309), only when the seller sent it, and only this store's collections. */
  const sentRules = Array.isArray(body.collectionIds) || Array.isArray(body.categories)
  let row: Record<string, unknown> = base
  if (sentRules) {
    const { data: own } = await db.from("product_collections").select("id").eq("creator_id", creatorId).limit(500)
    const rules = readRules(body, new Set(((own ?? []) as { id: string }[]).map((r) => r.id)))
    row = { ...base, collection_ids: rules.collectionIds, categories: rules.categories }
  }
  /* A database without part 309's columns: the chart saves without them, unless the seller set some, which then need the part. */
  const columnMissing = (e: { code?: string } | null | undefined) => !!e && (e.code === "42703" || e.code === "PGRST204")
  const wantsRules = (Array.isArray(row.collection_ids) && (row.collection_ids as unknown[]).length > 0) || (Array.isArray(row.categories) && (row.categories as unknown[]).length > 0)
  const RULES_NOT_READY: Failure = { ok: false, error: `Showing a chart for collections and categories needs a database update. Run SQL part ${SIZE_CHART_RULES_SQL_PART} in Supabase, then try again.`, status: 503 }
  if (id) {
    if (!isUuid(id)) return { ok: false, error: "Not found.", status: 404 }
    let { data, error } = await db.from("size_charts").update(row).eq("id", id).eq("creator_id", creatorId).select("id").maybeSingle()
    if (error && sentRules && columnMissing(error)) {
      if (wantsRules) return RULES_NOT_READY
      ;({ data, error } = await db.from("size_charts").update(base).eq("id", id).eq("creator_id", creatorId).select("id").maybeSingle())
    }
    if (error) return failure(error)
    if (!data) return { ok: false, error: "Not found.", status: 404 }
    return { ok: true, id }
  }
  const { count, error: countError } = await db.from("size_charts").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
  if (countError) return failure(countError)
  if ((count ?? 0) >= MAX_SIZE_CHARTS) return { ok: false, error: `A store can keep up to ${MAX_SIZE_CHARTS} size charts.`, status: 400 }
  let { data, error } = await db.from("size_charts").insert({ ...row, creator_id: creatorId }).select("id").single()
  if (error && sentRules && columnMissing(error)) {
    if (wantsRules) return RULES_NOT_READY
    ;({ data, error } = await db.from("size_charts").insert({ ...base, creator_id: creatorId }).select("id").single())
  }
  if (error || !data) return failure(error)
  return { ok: true, id: String(data.id) }
}

/** Deletes one of this store's charts; the products that used it are left with none (the links go with it). */
export async function deleteSizeChart(db: Db, creatorId: string, id: string): Promise<{ ok: true } | Failure> {
  if (!isUuid(id)) return { ok: false, error: "Not found.", status: 404 }
  const { data, error } = await db.from("size_charts").delete().eq("id", id).eq("creator_id", creatorId).select("id")
  if (error) return failure(error, "That could not be deleted. Try again in a moment.")
  if (!Array.isArray(data) || data.length === 0) return { ok: false, error: "Not found.", status: 404 }
  return { ok: true }
}

/**
 * The chart one of this store's products uses, or null; and with none of its
 * own, the chart it shows anyway from a collection or its category (round
 * 13), so the product editor can say so.
 */
export async function productSizeChartId(db: Db, creatorId: string, productId: string): Promise<{ ready: boolean; chartId: string | null; inherited: { name: string; source: SizeChartSource } | null }> {
  if (!isUuid(productId)) return { ready: true, chartId: null, inherited: null }
  const { data, error } = await db.from("product_size_charts").select("size_chart_id").eq("product_id", productId).eq("creator_id", creatorId).maybeSingle()
  if (error) return { ready: !missingTable(error), chartId: null, inherited: null }
  const chartId = (data?.size_chart_id as string | undefined) ?? null
  if (chartId) return { ready: true, chartId, inherited: null }
  const shown = await sizeChartForProduct(db, productId, creatorId)
  return { ready: true, chartId: null, inherited: shown && shown.source && shown.source !== "product" ? { name: shown.name, source: shown.source } : null }
}

/**
 * Gives a product a chart, or takes it away (`chartId` null). Both must be
 * this store's: the product is looked up by its id and the creator, and so
 * is the chart, before the link is written.
 */
export async function setProductSizeChart(db: Db, creatorId: string, productId: unknown, chartId: unknown): Promise<{ ok: true; chartId: string | null } | Failure> {
  if (!isUuid(productId)) return { ok: false, error: "Not found.", status: 404 }
  if (chartId !== null && !isUuid(chartId)) return { ok: false, error: "Choose a size chart.", status: 400 }
  const chosen = chartId === null ? null : String(chartId)
  const { data: product } = await db.from("products").select("id").eq("id", productId).eq("creator_id", creatorId).maybeSingle()
  if (!product) return { ok: false, error: "Not found.", status: 404 }
  if (chosen === null) {
    const { error } = await db.from("product_size_charts").delete().eq("product_id", productId).eq("creator_id", creatorId)
    /* Nothing to take away on a database without the table: the product has no chart either way. */
    if (error && !missingTable(error)) return failure(error)
    return { ok: true, chartId: null }
  }
  const { data: chart, error: chartError } = await db.from("size_charts").select("id").eq("id", chosen).eq("creator_id", creatorId).maybeSingle()
  if (chartError) return failure(chartError)
  if (!chart) return { ok: false, error: "That size chart is gone. Choose another.", status: 404 }
  const { error } = await db.from("product_size_charts").upsert({ product_id: productId, size_chart_id: chosen, creator_id: creatorId }, { onConflict: "product_id" })
  if (error) return failure(error)
  return { ok: true, chartId: chosen }
}
