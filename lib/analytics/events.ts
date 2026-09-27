/**
 * ===========================================================================
 *  THE ANALYTICS EVENTS, AS THE DATABASE KEEPS THEM
 * ===========================================================================
 * One pipeline records every visit to a creator's pages: the creator page,
 * the OnePage and each website built in the website builder. This module is
 * the contract between what is recorded (lib/analytics/collect.ts, the
 * trackers) and what reads it (the reports, the rollups). It holds no server
 * code, so a page, a route and a test can all import it.
 *
 * docs/analytics/events.md says the same in prose, with the SQL.
 *
 * THE EVENT NAMES ARE THE STORED ONES. A page view is `view`: the name every
 * report, SQL function and admin view has read since the table existed, and
 * it has always meant "a page was opened". Renaming it would have split one
 * series into two on the day this shipped. A product view is a `view` whose
 * `product_id` is set, as it always was.
 */

/** Where an event happened. The server decides it (lib/analytics/property.ts); a page never names it. */
export const PROPERTY_TYPES = ["creator_page", "onepage", "website"] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export function isPropertyType(v: unknown): v is PropertyType {
  return typeof v === "string" && (PROPERTY_TYPES as readonly string[]).includes(v)
}

/**
 * The event types this pipeline writes, by what they mean.
 *
 *   view               one real page navigation (a full load or a client
 *                      side route change), deduped per visitor, property
 *                      and path for 30 minutes
 *   link_click         a link out of the page: a OnePage link block, or an
 *                      outbound link on the creator page or a website
 *   buy_click          Buy pressed, once per visit and product
 *   checkout_start     the checkout opened, once per visit and product
 *   checkout_complete  the checkout finished (allowed, not sent by any page today)
 *   download           a download started (allowed, not sent by any page today)
 *   purchase           written by the checkout when an order is paid. An
 *                      analytics marker only: money and order counts come
 *                      from `orders`, never from this table.
 */
export const EVENT = {
  pageView: "view",
  linkClick: "link_click",
  buyClick: "buy_click",
  checkoutStart: "checkout_start",
  checkoutComplete: "checkout_complete",
  download: "download",
  purchase: "purchase",
} as const
export type AnalyticsEventType = (typeof EVENT)[keyof typeof EVENT]

/**
 * Names older code wrote and nothing writes now. No report has ever counted
 * them (every reader asks for `view`), so reading them now would move old
 * numbers. They stay in the table, unread.
 */
export const LEGACY_EVENT_TYPES = ["store_view", "product_view", "session_start", "add_to_cart"] as const

/** Every value the database's check allows (supabase/sql/run-now part 61). */
export const ALLOWED_EVENT_TYPES = [...Object.values(EVENT), ...LEGACY_EVENT_TYPES] as const

/** A visit ends after this long without a page; the same number as lib/analytics-utils sl_asid and lib/analytics/anon-visit. */
export const SESSION_TIMEOUT_MS = 30 * 60_000
/** A second view of the same path by the same visitor on the same property inside this window is the same view. */
export const PAGE_VIEW_REPEAT_MS = 30 * 60_000

/** The longest path kept. */
export const PATH_MAX = 300
/** The longest link destination kept. */
export const LINK_URL_MAX = 500

/**
 * A page's path as it is stored: no scheme or host, no query, no hash,
 * lower case, runs of slashes made one, no trailing slash, "/" for the front
 * page, and at most 300 characters. Given a full address or a path.
 *
 * Plain string steps rather than `new URL`, because the SQL backfill and the
 * rollups do the same steps (part 61) and the two must agree to the letter.
 */
export function normalizePath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  let p = raw.trim()
  if (!p) return null
  p = p.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, "")
  p = p.split("#")[0].split("?")[0].toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "")
  if (!p) return "/"
  if (!p.startsWith("/")) p = `/${p}`
  return p.slice(0, PATH_MAX)
}

/**
 * A link's destination as it is stored: scheme, host and path. No query and
 * no hash, which is where a link carries somebody's token or address; and for
 * mailto: and tel: only the scheme, never the address or the number.
 */
export function normalizeLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.trim()
  if (!s || s.length > 4000) return null
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s)?.[1]?.toLowerCase()
  if (scheme === "mailto" || scheme === "tel" || scheme === "sms") return `${scheme}:`
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  return `${url.protocol}//${url.host.toLowerCase()}${url.pathname}`.slice(0, LINK_URL_MAX)
}

/** One row of `analytics_events`, as this pipeline writes it. Every column is documented in docs/analytics/events.md. */
export interface AnalyticsEventRow {
  id?: string
  created_at: string
  creator_id: string
  event_type: AnalyticsEventType | (typeof LEGACY_EVENT_TYPES)[number]
  product_id: string | null
  property_type: PropertyType | null
  property_id: string | null
  path: string | null
  session_id: string | null
  visitor_id: string | null
  link_id?: string | null
  link_url?: string | null
  page_url?: string | null
  referrer?: string | null
  referrer_domain?: string | null
  source_category?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_term?: string | null
  utm_content?: string | null
  device_type?: "desktop" | "mobile" | "tablet" | null
  browser?: string | null
  os?: string | null
  screen_width?: number | null
  screen_height?: number | null
  language?: string | null
  country_code?: string | null
  country_name?: string | null
  city?: string | null
  region?: string | null
}

/* ─── The daily rollup ─────────────────────────────────────────────────── */

/** The rollup table and the functions that keep it (part 61). */
export const ROLLUP = {
  table: "analytics_property_daily",
  daysTable: "analytics_rollup_days",
  refresh: "analytics_refresh_property_day",
} as const

/**
 * One property's day, UTC. Counts are of that day only; `visitors` is the
 * distinct visitors of that day, so adding days gives visitor-days, not
 * unique visitors over the range.
 */
export interface PropertyDailyRow {
  creator_id: string
  property_type: PropertyType
  property_id: string | null
  /** YYYY-MM-DD, a UTC day. */
  day: string
  visitors: number
  sessions: number
  bounces: number
  page_views: number
  product_views: number
  link_clicks: number
  buy_clicks: number
  checkout_starts: number
  /** Sessions by where they came from, by source category. */
  sources: Record<string, number>
  /** Sessions by referring host ("direct" for none). */
  referrers: Record<string, number>
  /** Sessions by utm_campaign, when there was one. */
  campaigns: Record<string, number>
  /** Sessions by device: desktop, mobile, tablet, unknown. */
  devices: Record<string, number>
  /** Sessions by country code ("unknown" for none). */
  countries: Record<string, number>
  /** Page views by path, the day's 200 busiest, the rest under "(other)". */
  paths: Record<string, number>
  /** Sessions by the path they started on, 200 busiest, the rest under "(other)". */
  landing_paths: Record<string, number>
  updated_at?: string
}

const ADDITIVE = ["visitors", "sessions", "bounces", "page_views", "product_views", "link_clicks", "buy_clicks", "checkout_starts"] as const
const MAPS = ["sources", "referrers", "campaigns", "devices", "countries", "paths", "landing_paths"] as const

export type PropertyTotals = Pick<PropertyDailyRow, (typeof ADDITIVE)[number] | (typeof MAPS)[number]> & { days: number }

/**
 * Many days of rollups as one set of totals. Every count adds; the maps add
 * key by key. `visitors` added over days is visitor-days (see above).
 */
export function sumDailyRows(rows: readonly Partial<PropertyDailyRow>[]): PropertyTotals {
  const out = { days: 0 } as PropertyTotals
  for (const k of ADDITIVE) out[k] = 0
  for (const k of MAPS) out[k] = {}
  const days = new Set<string>()
  for (const r of rows) {
    if (r.day) days.add(r.day)
    for (const k of ADDITIVE) out[k] += Number(r[k]) || 0
    for (const k of MAPS) {
      const m = r[k]
      if (!m || typeof m !== "object") continue
      for (const [key, n] of Object.entries(m)) out[k][key] = (out[k][key] ?? 0) + (Number(n) || 0)
    }
  }
  out.days = days.size
  return out
}

/** The first UTC day that is not over yet: rollups hold only days before it. */
export function utcDayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * WHICH DAYS TO READ FROM THE ROLLUP. A day is read from the rollup only when
 * `analytics_rollup_days` says it was rolled up, and never today (UTC); every
 * other day of the range is read from the raw events. `rolled` is the set of
 * days that table holds. Days are YYYY-MM-DD, UTC.
 */
export function splitDays(fromDay: string, toDayExclusive: string, rolled: ReadonlySet<string>, now: number): { rollup: string[]; raw: string[] } {
  const today = utcDayOf(now)
  const rollup: string[] = []
  const raw: string[] = []
  for (let t = Date.parse(`${fromDay}T00:00:00Z`); t < Date.parse(`${toDayExclusive}T00:00:00Z`); t += 86_400_000) {
    const d = utcDayOf(t)
    if (d < today && rolled.has(d)) rollup.push(d)
    else raw.push(d)
  }
  return { rollup, raw }
}
