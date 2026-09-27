import "server-only"

/**
 * The rows behind the bar above the website's cover, read for one creator
 * and one period. The counting is lib/website-builder/site-performance.ts.
 *
 * WHO. The creator and the live install come from the caller, which found
 * them from the signed in user, never from the request. The speed figures
 * are read with the USER'S client, so the table's own policy decides what
 * comes back (supabase/sql/RUN_SITE_VITALS.sql): a creator can only ever
 * read their own sites.
 *
 * HOW MUCH. Only the columns a visit needs, only views that did not land on
 * storelib.com itself, a page at a time up to a ceiling that is reported if
 * it is hit (the count is then shown as a floor, never as a guess).
 *
 * A read that fails leaves its cell empty with a dash. It never becomes a
 * zero.
 */

import { getMainDomain } from "@/lib/url-helpers"
import type { ViewRow } from "@/lib/analytics/reports"
import type { OrderRow } from "@/lib/orders/order-view"
import { addDays, todayIn, type RangeValue } from "@/lib/date-range/range"
import { trafficFigures, type PerformanceAnswer, type WebsitePerformance } from "./site-performance"
import { periodFromParams, type Span } from "./site-period"
import { vitalsFromRows, type SummaryRow, type VitalsState } from "./web-vitals"

const PAGE = 1000
const CEILING = 100_000

type Query = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }

async function readAll<T>(page: (from: number, to: number) => Query): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []
  for (let from = 0; from < CEILING; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

/** A read that failed is null, and says so in the log. Never a zero. */
async function orNull<T>(what: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch (e) {
    console.warn(`[website performance] ${what} not read:`, (e as Error).message)
    return null
  }
}

export async function readWebsitePerformance(input: {
  admin: Client
  user: Client
  creatorId: string
  installId: string
  period: RangeValue
  span: Span
  previous: Span | null
  timeZone: string
}): Promise<WebsitePerformance> {
  const { admin, user, creatorId, installId, span, previous, timeZone } = input
  const main = getMainDomain().toLowerCase().replace(/^www\./, "")
  const from = new Date(previous ? Math.min(previous.start, span.start) : span.start).toISOString()
  const to = new Date(span.end).toISOString()

  type Row = ViewRow & { property_type?: string | null }
  const readViews = (columns: string) => readAll<Row>((a, b) =>
    admin
      .from("analytics_events")
      .select(columns)
      .eq("creator_id", creatorId)
      .eq("event_type", "view")
      .gte("created_at", from)
      .lt("created_at", to)
      /* storelib.com itself is not the website. The count applies the full
         rule again (channelOfUrl); this only keeps the read small. */
      .not("page_url", "ilike", `%//${main}/%`)
      .not("page_url", "ilike", `%//www.${main}/%`)
      .order("created_at", { ascending: true })
      .range(a, b),
  )
  const viewsRead = orNull("visits", async () => {
    let read: { rows: Row[]; truncated: boolean }
    try {
      read = await readViews("id, session_id, visitor_id, created_at, page_url, property_type")
    } catch (e) {
      /* A database before part 61 has no property_type, and no OnePage views to leave out. */
      if (!/column|PGRST204/i.test((e as Error).message)) throw e
      read = await readViews("id, session_id, visitor_id, created_at, page_url")
    }
    /* A OnePage on a connected domain is not the website: it is counted in the OnePage's own view. */
    return { rows: read.rows.filter((r) => r.property_type !== "onepage"), truncated: read.truncated }
  })

  const ordersRead = orNull("orders", async () => {
    const { data: products, error } = await admin.from("products").select("id").eq("creator_id", creatorId)
    if (error) throw new Error(error.message)
    const ids = ((products ?? []) as { id: string }[]).map((p) => p.id)
    const rows: OrderRow[] = []
    let truncated = false
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const read = await readAll<OrderRow>((a, b) =>
        admin
          .from("orders")
          .select("*")
          .in("product_id", chunk)
          .gte("created_at", from)
          .lt("created_at", to)
          .order("created_at", { ascending: true })
          .range(a, b),
      )
      rows.push(...read.rows)
      truncated ||= read.truncated
    }
    return { rows, truncated }
  })

  const vitalsRead = readVitals(user, installId, input.period, timeZone)

  const [views, orders, vitals] = await Promise.all([viewsRead, ordersRead, vitalsRead])
  const traffic = trafficFigures({
    views: views?.rows ?? null,
    orders: orders?.rows ?? null,
    span,
    previous,
    timeZone,
    mainDomain: main,
  })
  return { ...traffic, truncated: !!views?.truncated || !!orders?.truncated, vitals }
}

/**
 * The 75th percentiles for the period's days. The table keeps whole UTC days
 * (no time of day is stored), so the period's first and last days are read
 * whole: at most a few hours either side of the creator's own midnight.
 */
async function readVitals(user: Client, installId: string, period: RangeValue, timeZone: string): Promise<VitalsState> {
  try {
    const today = todayIn("UTC", Date.now())
    const { data, error } = await user.rpc("site_vitals_summary", {
      p_install: installId,
      p_from: period.start,
      /* A period that ends today on the creator's clock may already be
         tomorrow in UTC. */
      p_to: period.end >= todayIn(timeZone, Date.now()) ? addDays(today, 1) : period.end,
    })
    if (error) return { kind: "unavailable" }
    return { kind: "ready", metrics: vitalsFromRows((data ?? []) as SummaryRow[]) }
  } catch {
    return { kind: "unavailable" }
  }
}

/**
 * The bar's whole answer for the creator's live website, or null when
 * nothing is live. The one entry point the page and the route share, so the
 * first paint and a change of period are counted the same way.
 */
export async function websitePerformanceFor(input: {
  admin: Client
  user: Client
  creatorId: string
  params: URLSearchParams
  timeZone: string
  now?: number
}): Promise<PerformanceAnswer | null> {
  const { admin, user, creatorId, timeZone } = input
  const { data: live } = await admin
    .from("store_theme_installs")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()
  const installId = (live as { id?: string } | null)?.id
  if (!installId) return null
  const { period, span, previous } = periodFromParams(input.params, timeZone, input.now ?? Date.now())
  const figures = await readWebsitePerformance({ admin, user, creatorId, installId, period, span, previous, timeZone })
  return { period, timeZone, figures }
}
