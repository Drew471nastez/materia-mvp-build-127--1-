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

export const SIZE_CHART_SQL_PART = 283
/** The most charts one store keeps: more than any clothing shop has cuts. */
export const MAX_SIZE_CHARTS = 200

export const missingTable = (e: { code?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204" || e.code === "42703")
const NOT_READY = `Size charts need a database update. Run SQL part ${SIZE_CHART_SQL_PART} in Supabase, then try again.`

export interface SizeChartView extends SizeChart {
  id: string
  /** How many of the store's products use it. */
  productCount: number
  updatedAt: string | null
}

export type Failure = { ok: false; error: string; status: number }

function view(r: Record<string, unknown>, productCount: number): SizeChartView | null {
  const chart = readSizeChart(r)
  if (!chart || typeof r.id !== "string") return null
  return { ...chart, id: r.id, productCount, updatedAt: typeof r.updated_at === "string" ? r.updated_at : null }
}

export async function listSizeCharts(db: Db, creatorId: string): Promise<{ ready: boolean; charts: SizeChartView[] }> {
  const { data, error } = await db.from("size_charts").select("id, name, unit, columns, rows, notes, image_url, updated_at").eq("creator_id", creatorId).order("name", { ascending: true }).limit(MAX_SIZE_CHARTS)
  if (error) return { ready: !missingTable(error), charts: [] }
  const { data: links } = await db.from("product_size_charts").select("size_chart_id").eq("creator_id", creatorId).limit(5000)
  const counts = new Map<string, number>()
  for (const l of (links ?? []) as { size_chart_id: string }[]) counts.set(l.size_chart_id, (counts.get(l.size_chart_id) ?? 0) + 1)
  const charts = ((data ?? []) as Record<string, unknown>[]).map((r) => view(r, counts.get(String(r.id)) ?? 0)).filter((c): c is SizeChartView => c !== null)
  return { ready: true, charts }
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
  const row = { name: c.name, unit: c.unit, columns: c.columns, rows: c.rows, notes: c.notes || null, image_url: c.imageUrl }
  if (id) {
    if (!isUuid(id)) return { ok: false, error: "Not found.", status: 404 }
    const { data, error } = await db.from("size_charts").update(row).eq("id", id).eq("creator_id", creatorId).select("id").maybeSingle()
    if (error) return failure(error)
    if (!data) return { ok: false, error: "Not found.", status: 404 }
    return { ok: true, id }
  }
  const { count, error: countError } = await db.from("size_charts").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
  if (countError) return failure(countError)
  if ((count ?? 0) >= MAX_SIZE_CHARTS) return { ok: false, error: `A store can keep up to ${MAX_SIZE_CHARTS} size charts.`, status: 400 }
  const { data, error } = await db.from("size_charts").insert({ ...row, creator_id: creatorId }).select("id").single()
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

/** The chart one of this store's products uses, or null. */
export async function productSizeChartId(db: Db, creatorId: string, productId: string): Promise<{ ready: boolean; chartId: string | null }> {
  if (!isUuid(productId)) return { ready: true, chartId: null }
  const { data, error } = await db.from("product_size_charts").select("size_chart_id").eq("product_id", productId).eq("creator_id", creatorId).maybeSingle()
  if (error) return { ready: !missingTable(error), chartId: null }
  return { ready: true, chartId: (data?.size_chart_id as string | undefined) ?? null }
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
