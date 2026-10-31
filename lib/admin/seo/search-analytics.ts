import "server-only"

import { GoogleError, accessToken, type ServiceAccount } from "./google"

/**
 * ===========================================================================
 *  GOOGLE SEARCH CONSOLE: CLICKS, IMPRESSIONS, CTR AND POSITION, 28 DAYS
 * ===========================================================================
 * The Search Analytics API
 * (developers.google.com/webmaster-tools/v1/searchanalytics/query), with
 * the same service account and the same read only scope the URL Inspection
 * calls use (google.ts, webmasters.readonly). Three questions per property:
 * the totals, the top pages and the top queries, search type `web`.
 *
 * AI OVERVIEWS AND AI MODE. Google counts a page shown in AI Overviews or AI
 * Mode in the Web search type (developers.google.com/search/docs/appearance/
 * ai-features, "reported on in the Performance report, within the Web
 * search type"). Since June 2026 Search Console also has a Search
 * Generative AI performance report (impressions only), in the Search
 * Console interface. The API's search types are web, image, video, news,
 * googleNews and discover, with no generative AI type or dimension (API
 * reference, checked October 2026). So nothing here can split AI traffic
 * out, and the console says so and links to the report.
 *
 * Kept in memory for 30 minutes per server: the console refreshes every
 * minute and Google's figures move once a day.
 */

export const SEARCH_ANALYTICS_URL = (siteUrl: string) => `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`

export interface SearchRow {
  key: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchPerformance {
  property: string
  startDate: string
  endDate: string
  totals: Omit<SearchRow, "key"> | null
  pages: SearchRow[]
  queries: SearchRow[]
  readAt: string
  error: string | null
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** The 28 days ending yesterday, Pacific time (Google's day), as YYYY-MM-DD. */
export function last28Days(now = new Date()): { startDate: string; endDate: string } {
  const pacific = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
  const today = Date.parse(`${pacific}T00:00:00Z`)
  const day = 86_400_000
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  return { startDate: iso(today - 28 * day), endDate: iso(today - day) }
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

export function parseSearchRows(json: unknown): SearchRow[] {
  const rows = (json as { rows?: unknown[] })?.rows
  if (!Array.isArray(rows)) return []
  return rows.map((r) => {
    const x = r as { keys?: unknown[]; clicks?: unknown; impressions?: unknown; ctr?: unknown; position?: unknown }
    return { key: String(x.keys?.[0] ?? ""), clicks: n(x.clicks), impressions: n(x.impressions), ctr: n(x.ctr), position: n(x.position) }
  })
}

/** The request body for one question: totals (no dimension), or the top 25 by page or by query. */
export function searchBody(range: { startDate: string; endDate: string }, dimension: "page" | "query" | null) {
  return { ...range, type: "web", dataState: "final", ...(dimension ? { dimensions: [dimension], rowLimit: 25 } : {}) }
}

async function ask(token: string, property: string, body: object, fetchImpl: Fetch): Promise<SearchRow[]> {
  const res = await fetchImpl(SEARCH_ANALYTICS_URL(property), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const said = String((json as { error?: { message?: unknown } })?.error?.message ?? "").slice(0, 160)
    if (res.status === 403) throw new GoogleError(`The service account is not a user on ${property} in Search Console.`, 403)
    throw new GoogleError(`Google answered ${res.status}${said ? `: ${said}` : "."}`, res.status)
  }
  return parseSearchRows(json)
}

const held = new Map<string, { until: number; value: SearchPerformance }>()
const HOLD_MS = 30 * 60 * 1000

export async function searchPerformance(account: ServiceAccount, property: string, fetchImpl: Fetch = fetch, now = new Date()): Promise<SearchPerformance> {
  const kept = held.get(property)
  if (kept && kept.until > Date.now()) return kept.value
  const range = last28Days(now)
  const base: SearchPerformance = { property, ...range, totals: null, pages: [], queries: [], readAt: new Date().toISOString(), error: null }
  try {
    const token = await accessToken(account, fetchImpl)
    const [totals, pages, queries] = await Promise.all([
      ask(token, property, searchBody(range, null), fetchImpl),
      ask(token, property, searchBody(range, "page"), fetchImpl),
      ask(token, property, searchBody(range, "query"), fetchImpl),
    ])
    const t = totals[0]
    const value: SearchPerformance = { ...base, totals: t ? { clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: t.position } : { clicks: 0, impressions: 0, ctr: 0, position: 0 }, pages, queries }
    held.set(property, { until: Date.now() + HOLD_MS, value })
    return value
  } catch (e) {
    /* A refusal is said, and not held, so the next look asks again. */
    return { ...base, error: e instanceof Error ? e.message.slice(0, 200) : "Google did not answer." }
  }
}

/** For a test. */
export function forgetSearchPerformance() {
  held.clear()
}
