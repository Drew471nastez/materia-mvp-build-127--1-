/**
 * ===========================================================================
 *  GET /api/v1/analytics: A STORE'S FIGURES FOR OTHER TOOLS
 * ===========================================================================
 *   GET /api/v1/analytics?from=2026-10-01&to=2026-10-28
 *       &tz=Europe/Bucharest        days in this time zone (default UTC)
 *       &format=json|csv            json (default) has everything
 *       &report=daily|products|pages   which table a CSV holds (default daily)
 *   Authorization: Bearer sla_…     a read only key (Analytics › Send to)
 *
 * Per day: visitors (distinct visitor ids that day), page views, orders (a
 * purchase, however many lines) and revenue less refunds, per currency.
 * Over the period: the same totals, the top 20 products by revenue and the
 * top 20 pages by views. Counted the way Analytics counts: page views as
 * recorded (robots, the owner and repeats already left out), sales (completed or refunded, lib/analytics/commerce)
 * only, an admin's test sale never (lib/analytics/test-sales). At most 366
 * days; past MAX_EVENT_ROWS page views the answer says `truncated`.
 *
 * aggregate() is pure, for the tests; readExport() reads the rows.
 */
import { isTestSale } from "@/lib/analytics/test-sales"
import { guardFormula } from "@/lib/csv/formula-guard"
import { currencyCode, major } from "./providers"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const MAX_DAYS = 366
export const MAX_EVENT_ROWS = 200_000
const PAGE = 1000

export interface ExportQuery {
  from: string
  to: string
  timeZone: string
  format: "json" | "csv"
  report: "daily" | "products" | "pages"
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

function validZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The day a moment falls on in a time zone, as YYYY-MM-DD. */
export function dayIn(iso: string, timeZone: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ""
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

export function parseExportQuery(params: URLSearchParams, now = Date.now()): { ok: true; q: ExportQuery } | { ok: false; error: string } {
  const tz = params.get("tz")?.trim() || "UTC"
  if (!validZone(tz)) return { ok: false, error: "tz must be an IANA time zone, such as Europe/London." }
  const today = dayIn(new Date(now).toISOString(), tz)
  const to = params.get("to")?.trim() || today
  const fromDefault = dayIn(new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 86_400_000).toISOString(), "UTC")
  const from = params.get("from")?.trim() || fromDefault
  if (!DAY.test(from) || !DAY.test(to) || !Number.isFinite(Date.parse(`${from}T00:00:00Z`)) || !Number.isFinite(Date.parse(`${to}T00:00:00Z`))) return { ok: false, error: "from and to are days, written YYYY-MM-DD." }
  if (from > to) return { ok: false, error: "from must be on or before to." }
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  if (days > MAX_DAYS) return { ok: false, error: `Ask for at most ${MAX_DAYS} days at a time.` }
  const format = (params.get("format") ?? "json").toLowerCase()
  if (format !== "json" && format !== "csv") return { ok: false, error: "format is json or csv." }
  const report = (params.get("report") ?? "daily").toLowerCase()
  if (report !== "daily" && report !== "products" && report !== "pages") return { ok: false, error: "report is daily, products or pages." }
  return { ok: true, q: { from, to, timeZone: tz, format, report } }
}

/** Every day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

/** The window to read, in UTC, wide enough for any time zone; rows are then placed on their own day. */
function utcWindow(q: ExportQuery): { start: string; end: string } {
  return { start: new Date(Date.parse(`${q.from}T00:00:00Z`) - 14 * 3_600_000).toISOString(), end: new Date(Date.parse(`${q.to}T00:00:00Z`) + 38 * 3_600_000).toISOString() }
}

export interface ViewRow {
  created_at: string
  visitor_id: string | null
  path: string | null
  property_type: string | null
}

export interface OrderRow {
  id: string
  product_id: string | null
  amount_cents: number | null
  refund_amount_cents?: number | null
  quantity?: number | null
  currency: string | null
  created_at: string
  checkout_id?: string | null
  stripe_session_id?: string | null
  source_detail?: unknown
  product?: { title?: string | null } | null
}

type Money = Record<string, number>
const addMoney = (m: Money, currency: string, cents: number) => {
  m[currency] = (m[currency] ?? 0) + cents
}
const asMajor = (m: Money): Record<string, number> => Object.fromEntries(Object.entries(m).sort().map(([c, v]) => [c, major(v, c)]))

export interface ExportAnswer {
  from: string
  to: string
  timezone: string
  truncated: boolean
  totals: { visitors: number; views: number; orders: number; revenue: Record<string, number> }
  daily: { date: string; visitors: number; views: number; orders: number; revenue: Record<string, number> }[]
  top_products: { product_id: string; title: string | null; orders: number; units: number; revenue: Record<string, number> }[]
  top_pages: { path: string; property: string | null; views: number; visitors: number }[]
}

export function aggregate(q: ExportQuery, views: ViewRow[], orders: OrderRow[], truncated = false): ExportAnswer {
  const days = daysBetween(q.from, q.to)
  const inRange = new Set(days)
  const byDay = new Map(days.map((d) => [d, { views: 0, visitors: new Set<string>(), purchases: new Set<string>(), revenue: {} as Money }]))
  const allVisitors = new Set<string>()
  const pages = new Map<string, { path: string; property: string | null; views: number; visitors: Set<string> }>()
  let viewCount = 0
  for (const v of views) {
    const d = dayIn(v.created_at, q.timeZone)
    const day = inRange.has(d) ? byDay.get(d) : undefined
    if (!day) continue
    day.views++
    viewCount++
    if (v.visitor_id) {
      day.visitors.add(v.visitor_id)
      allVisitors.add(v.visitor_id)
    }
    const path = v.path || "/"
    const k = `${v.property_type ?? ""}|${path}`
    const p = pages.get(k) ?? { path, property: v.property_type, views: 0, visitors: new Set<string>() }
    p.views++
    if (v.visitor_id) p.visitors.add(v.visitor_id)
    pages.set(k, p)
  }
  const purchases = new Set<string>()
  const revenue: Money = {}
  const products = new Map<string, { title: string | null; purchases: Set<string>; units: number; revenue: Money }>()
  for (const o of orders) {
    if (isTestSale(o)) continue
    const d = dayIn(o.created_at, q.timeZone)
    const day = inRange.has(d) ? byDay.get(d) : undefined
    if (!day) continue
    const currency = currencyCode(o.currency) ?? "USD"
    const net = Math.max(0, (Number(o.amount_cents) || 0) - (Number(o.refund_amount_cents) || 0))
    const purchase = o.checkout_id || o.stripe_session_id || o.id
    day.purchases.add(purchase)
    purchases.add(purchase)
    addMoney(day.revenue, currency, net)
    addMoney(revenue, currency, net)
    if (o.product_id) {
      const p = products.get(o.product_id) ?? { title: o.product?.title ?? null, purchases: new Set<string>(), units: 0, revenue: {} }
      p.purchases.add(purchase)
      p.units += Math.max(1, Number(o.quantity) || 1)
      addMoney(p.revenue, currency, net)
      products.set(o.product_id, p)
    }
  }
  const total = (m: Money) => Object.values(m).reduce((n, v) => n + v, 0)
  return {
    from: q.from,
    to: q.to,
    timezone: q.timeZone,
    truncated,
    totals: { visitors: allVisitors.size, views: viewCount, orders: purchases.size, revenue: asMajor(revenue) },
    daily: days.map((date) => {
      const d = byDay.get(date)!
      return { date, visitors: d.visitors.size, views: d.views, orders: d.purchases.size, revenue: asMajor(d.revenue) }
    }),
    top_products: [...products.entries()]
      .sort((a, b) => total(b[1].revenue) - total(a[1].revenue) || b[1].units - a[1].units)
      .slice(0, 20)
      .map(([id, p]) => ({ product_id: id, title: p.title, orders: p.purchases.size, units: p.units, revenue: asMajor(p.revenue) })),
    top_pages: [...pages.values()]
      .sort((a, b) => b.views - a.views || a.path.localeCompare(b.path))
      .slice(0, 20)
      .map((p) => ({ path: p.path, property: p.property, views: p.views, visitors: p.visitors.size })),
  }
}

/* ── CSV ───────────────────────────────────────────────────────────────── */

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v)
  const g = guardFormula(s)
  return /[",\n\r]/.test(g) ? `"${g.replace(/"/g, '""')}"` : g
}

export function exportCsv(a: ExportAnswer, report: ExportQuery["report"]): string {
  const currencies = [...new Set([...a.daily.flatMap((d) => Object.keys(d.revenue)), ...a.top_products.flatMap((p) => Object.keys(p.revenue))])].sort()
  const money = (m: Record<string, number>) => currencies.map((c) => m[c] ?? 0)
  const rows: unknown[][] = []
  if (report === "products") {
    rows.push(["product_id", "title", "orders", "units", ...currencies.map((c) => `revenue_${c.toLowerCase()}`)])
    for (const p of a.top_products) rows.push([p.product_id, p.title, p.orders, p.units, ...money(p.revenue)])
  } else if (report === "pages") {
    rows.push(["path", "property", "views", "visitors"])
    for (const p of a.top_pages) rows.push([p.path, p.property, p.views, p.visitors])
  } else {
    rows.push(["date", "visitors", "views", "orders", ...currencies.map((c) => `revenue_${c.toLowerCase()}`)])
    for (const d of a.daily) rows.push([d.date, d.visitors, d.views, d.orders, ...money(d.revenue)])
  }
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"
}

/* ── reading ───────────────────────────────────────────────────────────── */

async function pages<T>(read: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>, max: number): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []
  for (let at = 0; at < max; at += PAGE) {
    const { data, error } = await read(at, at + PAGE - 1)
    if (error || !Array.isArray(data)) break
    rows.push(...data)
    if (data.length < PAGE) return { rows, truncated: false }
  }
  return { rows, truncated: rows.length >= max }
}

export async function readExport(db: Db, creatorId: string, q: ExportQuery): Promise<ExportAnswer> {
  const w = utcWindow(q)
  const [views, orders] = await Promise.all([
    pages<ViewRow>(
      (a, b) => db.from("analytics_events").select("created_at, visitor_id, path, property_type").eq("creator_id", creatorId).eq("event_type", "view").gte("created_at", w.start).lt("created_at", w.end).order("created_at", { ascending: true }).range(a, b),
      MAX_EVENT_ROWS,
    ),
    pages<OrderRow>(
      (a, b) =>
        db
          .from("orders")
          .select("id, product_id, amount_cents, refund_amount_cents, quantity, currency, created_at, checkout_id, stripe_session_id, source_detail, product:products(title)")
          .eq("creator_id", creatorId)
          .in("status", ["completed", "refunded", "partially_refunded"])
          .gte("created_at", w.start)
          .lt("created_at", w.end)
          .order("created_at", { ascending: true })
          .range(a, b),
      50_000,
    ),
  ])
  return aggregate(q, views.rows, orders.rows, views.truncated || orders.truncated)
}
