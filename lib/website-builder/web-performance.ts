/**
 * ===========================================================================
 *  HOW FAST A PUBLISHED WEBSITE IS FOR THE PEOPLE WHO VISIT IT
 * ===========================================================================
 * The rules behind Website settings › Performance, in one pure module that
 * the beacon route, the daily rollup, the report and the tests all read:
 *
 *   WHAT IS MEASURED   LCP, INP and CLS (Core Web Vitals), FCP and TTFB, and
 *                      the time a page change inside the site took (`nav`).
 *                      Google's lines between Good, Needs improvement and
 *                      Poor for the first five; `nav` has no standard line,
 *                      so it is shown without a rating.
 *   WHAT ARRIVES       cleanRumBeacon: a path, the kind of view, the viewport
 *                      width, the connection type and the numbers. Nothing
 *                      else in the body is read. The site is never in it: the
 *                      route finds it from the host.
 *   WHAT IS KEPT       one row per page view (RumEvent) for RAW_DAYS days,
 *                      and daily rows per site, device and one dimension
 *                      (page, page type, browser, country) with a histogram
 *                      per metric for ROLLUP_DAYS days. The histograms are
 *                      what make a 75th percentile over 90 days cheap and
 *                      still close to exact (p75FromHistogram).
 *   SAMPLING           every page view is kept until a site has had
 *                      FULL_SAMPLE_UNTIL in a day, then one in ten, then one
 *                      in a hundred. Each kept row carries its weight (1 over
 *                      the rate), so page view counts stay honest and the
 *                      percentiles are weighted the same way.
 *
 * Pure: no DOM, no database. tests/web-performance-v.test.ts holds it.
 */

import { SITE_LANGUAGE_CODES, localeFromPath } from "@/lib/markets/locales"
import { VITAL_THRESHOLDS } from "./web-vitals"

export type PerfMetric = "lcp" | "inp" | "cls" | "fcp" | "ttfb"
/** Every metric a page view can carry: the five rated ones and the page change time. */
export type RumMetric = PerfMetric | "nav"
export type PerfRating = "good" | "needs-improvement" | "poor"
export type PerfDevice = "mobile" | "desktop"
export type PerfRange = "24h" | "7d" | "30d" | "90d"
export type PerfDim = "all" | "path" | "type" | "browser" | "country"

export const PERF_METRICS: PerfMetric[] = ["lcp", "inp", "cls", "fcp", "ttfb"]
export const CORE_METRICS: PerfMetric[] = ["lcp", "inp", "cls"]
export const RUM_METRICS: RumMetric[] = ["lcp", "inp", "cls", "fcp", "ttfb", "nav"]
export const PERF_RANGES: PerfRange[] = ["24h", "7d", "30d", "90d"]
export const PERF_DIMS: PerfDim[] = ["path", "type", "browser", "country"]

/** Google's lines: at or under the first is Good, over the second is Poor. */
export const PERF_THRESHOLDS: Record<PerfMetric, readonly [number, number]> = {
  lcp: VITAL_THRESHOLDS.lcp,
  inp: VITAL_THRESHOLDS.inp,
  cls: VITAL_THRESHOLDS.cls,
  fcp: [1800, 3000],
  ttfb: [800, 1800],
}

/** Fewer page views than this and a 75th percentile is a handful of visits deciding it: "Not enough visits yet". */
export const MIN_SAMPLES = 20
/** A point on the chart needs this many page views behind it, or it is a gap in the line. */
export const MIN_POINT_SAMPLES = 10

/** Raw page views are kept this long; every window up to 30 days is still recomputable from them. */
export const RAW_DAYS = 30
/** Daily rows are kept this long: 13 months, so a 90 day window always has its previous 90 days. */
export const ROLLUP_DAYS = 400
/** The number of rows one day keeps per device for the dimensions that can grow; the rest are "(other)". */
export const MAX_PATHS_PER_DAY = 50
export const MAX_COUNTRIES_PER_DAY = 40
export const OTHER_KEY = "(other)"

/* ── Sampling ──────────────────────────────────────────────────────────── */

/** Every page view of a site's day is kept up to this many. */
export const FULL_SAMPLE_UNTIL = 1000
/** Then one in ten, up to this many page views that day. */
export const MID_SAMPLE_UNTIL = 10_000
export const MID_SAMPLE_RATE = 0.1
/** Past that, one in a hundred. A day of a million views is still about 11,000 rows. */
export const FAR_SAMPLE_RATE = 0.01

/** The rate the `seen`th page view of a site's day is kept at (seen counts from 1). The SQL in part 210 reads the same numbers. */
export function sampleRateFor(seen: number): number {
  if (seen <= FULL_SAMPLE_UNTIL) return 1
  if (seen <= MID_SAMPLE_UNTIL) return MID_SAMPLE_RATE
  return FAR_SAMPLE_RATE
}

/** What one kept page view stands for. */
export function weightFor(rate: number): number {
  return rate > 0 && rate <= 1 ? 1 / rate : 1
}

/** How many kept rows a day of `views` page views leaves, on average. */
export function expectedRowsFor(views: number): number {
  const full = Math.min(views, FULL_SAMPLE_UNTIL)
  const mid = Math.max(0, Math.min(views, MID_SAMPLE_UNTIL) - FULL_SAMPLE_UNTIL) * MID_SAMPLE_RATE
  const far = Math.max(0, views - MID_SAMPLE_UNTIL) * FAR_SAMPLE_RATE
  return full + mid + far
}

/* ── Ratings ───────────────────────────────────────────────────────────── */

export function ratePerf(metric: PerfMetric, value: number): PerfRating {
  const [good, poor] = PERF_THRESHOLDS[metric]
  if (value <= good) return "good"
  if (value <= poor) return "needs-improvement"
  return "poor"
}

/** "2.1 s", "850 ms", "0.04". Times of a second and more in seconds, the way Search Console writes LCP. */
export function formatPerf(metric: RumMetric, value: number): string {
  if (metric === "cls") return value > 0 && value < 0.01 ? "<0.01" : value.toFixed(2)
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`
  return `${Math.round(value)} ms`
}

/** "2.5 s", "200 ms", "0.1". */
export function formatPerfThreshold(metric: PerfMetric, value: number): string {
  if (metric === "cls") return String(value)
  if (value >= 1000) return `${value / 1000} s`
  return `${value} ms`
}

/* ── Histograms ────────────────────────────────────────────────────────── */

/**
 * The upper edge of each bucket. Bucket 0 is [0, edges[0]], bucket i is
 * (edges[i-1], edges[i]]. Every rating line is an edge, so the share of page
 * views in each band is exact, and the buckets are narrow where the lines
 * are, so a percentile interpolated inside one is within a few percent.
 */
const MS_EDGES = [
  25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800,
  2000, 2250, 2500, 2750, 3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 10_000, 12_000, 15_000, 20_000, 30_000, 60_000,
]
const CLS_EDGES = [0, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.125, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10]

export const HISTOGRAM_EDGES: Record<RumMetric, readonly number[]> = {
  lcp: MS_EDGES,
  inp: MS_EDGES,
  fcp: MS_EDGES,
  ttfb: MS_EDGES,
  nav: MS_EDGES,
  cls: CLS_EDGES,
}

/** The largest value each metric can honestly have. Past it is a broken clock, and the value is dropped, never clamped. */
export const MAX_VALUE: Record<RumMetric, number> = { lcp: 60_000, inp: 60_000, fcp: 60_000, ttfb: 60_000, nav: 60_000, cls: 10 }

export function emptyHistogram(metric: RumMetric): number[] {
  return new Array(HISTOGRAM_EDGES[metric].length).fill(0)
}

export function bucketOf(metric: RumMetric, value: number): number {
  const edges = HISTOGRAM_EDGES[metric]
  /* Binary search for the first edge at or above the value. */
  let lo = 0
  let hi = edges.length - 1
  if (value > edges[hi]) return hi
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (value <= edges[mid]) hi = mid
    else lo = mid + 1
  }
  return lo
}

/** Bucket by bucket, a + b. Shorter or missing arrays count as zeros. */
export function addHistograms(a: readonly number[] | null | undefined, b: readonly number[] | null | undefined): number[] {
  const x = a ?? []
  const y = b ?? []
  const n = Math.max(x.length, y.length)
  const out = new Array(n)
  for (let i = 0; i < n; i++) out[i] = (Number(x[i]) || 0) + (Number(y[i]) || 0)
  return out
}

/**
 * The value under which `q` of the weight lies, interpolated in a straight
 * line inside the bucket where it falls. Null for an empty histogram.
 */
export function quantileFromHistogram(metric: RumMetric, h: readonly number[] | null | undefined, q = 0.75): number | null {
  if (!h || h.length === 0) return null
  const edges = HISTOGRAM_EDGES[metric]
  let total = 0
  for (const c of h) total += Number(c) || 0
  if (total <= 0) return null
  const target = q * total
  let before = 0
  for (let i = 0; i < h.length; i++) {
    const c = Number(h[i]) || 0
    if (c <= 0) continue
    if (before + c >= target) {
      const lo = i === 0 ? 0 : edges[i - 1]
      const hi = edges[Math.min(i, edges.length - 1)]
      const at = lo + ((hi - lo) * (target - before)) / c
      return metric === "cls" ? Math.round(at * 10_000) / 10_000 : Math.round(at)
    }
    before += c
  }
  return edges[edges.length - 1]
}

export function p75FromHistogram(metric: RumMetric, h: readonly number[] | null | undefined): number | null {
  return quantileFromHistogram(metric, h, 0.75)
}

/** The exact 75th percentile of raw values, by nearest rank. The test compares the histogram's answer with this. */
export function exactP75(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  return sorted[Math.max(0, Math.ceil(0.75 * sorted.length) - 1)]
}

export interface Bands {
  good: number
  needsImprovement: number
  poor: number
}

/** The share of the weight in each band, from a histogram. Exact, since every line is a bucket edge. Null when empty. */
export function bandsFromHistogram(metric: PerfMetric, h: readonly number[] | null | undefined): Bands | null {
  if (!h || h.length === 0) return null
  const edges = HISTOGRAM_EDGES[metric]
  const [good, poor] = PERF_THRESHOLDS[metric]
  let g = 0
  let n = 0
  let p = 0
  for (let i = 0; i < h.length; i++) {
    const c = Number(h[i]) || 0
    const upper = edges[Math.min(i, edges.length - 1)]
    if (upper <= good) g += c
    else if (upper <= poor) n += c
    else p += c
  }
  const total = g + n + p
  if (total <= 0) return null
  return { good: g / total, needsImprovement: n / total, poor: p / total }
}

/* ── What a page view arrives as ───────────────────────────────────────── */

export type ViewKind = "load" | "soft"
export type Connection = "slow-2g" | "2g" | "3g" | "4g"
const CONNECTIONS = new Set<string>(["slow-2g", "2g", "3g", "4g"])

export interface CleanRumBeacon {
  path: string
  pageType: PageType
  kind: ViewKind
  /** The viewport width in CSS pixels, when the browser said. Only used to tell a phone from a computer. */
  width: number | null
  connection: Connection | null
  lcp: number | null
  inp: number | null
  cls: number | null
  fcp: number | null
  ttfb: number | null
  nav: number | null
}

/** The largest body the route reads. A full beacon is about 150 bytes. */
export const MAX_BEACON_BYTES = 1024

function msValue(v: unknown, metric: RumMetric): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_VALUE[metric]) return null
  return Math.round(v)
}

/**
 * The beacon, checked. A metric that is not a believable number is left
 * out on its own, never clamped to one. A page load needs at least one
 * number; a page change needs its time. Nothing but the listed fields is
 * read, so nothing else can be stored.
 */
export function cleanRumBeacon(raw: unknown): CleanRumBeacon | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const b = raw as Record<string, unknown>
  if (b.v !== 1) return null
  const path = normalizePath(b.p)
  if (path === null) return null
  const kind: ViewKind | null = b.k === "l" ? "load" : b.k === "s" ? "soft" : null
  if (!kind) return null
  const width = typeof b.w === "number" && Number.isFinite(b.w) && b.w >= 120 && b.w <= 10_000 ? Math.round(b.w) : null
  const connection = typeof b.c === "string" && CONNECTIONS.has(b.c) ? (b.c as Connection) : null
  const cls =
    typeof b.cls === "number" && Number.isFinite(b.cls) && b.cls >= 0 && b.cls <= MAX_VALUE.cls ? Math.round(b.cls * 10_000) / 10_000 : null
  const out: CleanRumBeacon = {
    path,
    pageType: pageTypeOf(path),
    kind,
    width,
    connection,
    /* A page change has no load of its own: whatever came with one is not read. */
    lcp: kind === "load" ? msValue(b.lcp, "lcp") : null,
    inp: msValue(b.inp, "inp"),
    cls,
    fcp: kind === "load" ? msValue(b.fcp, "fcp") : null,
    ttfb: kind === "load" ? msValue(b.ttfb, "ttfb") : null,
    nav: kind === "soft" ? msValue(b.nav, "nav") : null,
  }
  /* An INP of 0 is an interaction that answered in the same frame; it is a real value. */
  if (kind === "soft" && out.nav === null) return null
  if (kind === "load" && out.lcp === null && out.inp === null && out.cls === null && out.fcp === null && out.ttfb === null) return null
  return out
}

/* ── The page ──────────────────────────────────────────────────────────── */

const UUIDISH = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/
const SAFE_SEGMENT = /^[a-z0-9._~%-]+$/
const MAX_SEGMENTS = 8
const MAX_PATH = 160

/** A segment that could name a person or an order: replaced, never kept. */
function scrubSegment(s: string): string {
  if (!s) return s
  if (s.includes("@") || s.includes("%40")) return ":id"
  if (UUIDISH.test(s)) return ":id"
  /* An order number, a phone number, a long token. */
  if (/\d{6,}/.test(s)) return ":id"
  if (s.length >= 24 && /\d/.test(s) && /[a-z]/.test(s) && !s.includes("-")) return ":id"
  if (!SAFE_SEGMENT.test(s)) return ":x"
  return s
}

/**
 * The page as it is stored: lower case, no query, no fragment, no trailing
 * slash, ids and anything that could be personal replaced, at most eight
 * segments. Null for anything that is not a path. An account page keeps
 * only that it is one.
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let p = raw.trim()
  if (!p.startsWith("/") || p.startsWith("//") || p.length > 2048) return null
  p = p.split(/[?#]/)[0].toLowerCase()
  const segments = p.split("/").filter(Boolean)
  if (segments.some((s) => s === "." || s === "..")) return null
  if (segments[0] === "api" || segments[0] === "_next") return null
  const clean: string[] = []
  for (const s of segments.slice(0, MAX_SEGMENTS)) clean.push(scrubSegment(s))
  /* Account pages are a visitor's own: which one is enough. */
  const accountAt = clean.findIndex((s, i) => s === "account" && i <= 1)
  if (accountAt >= 0 && clean.length > accountAt + 2) clean.length = accountAt + 2
  let out = "/" + clean.join("/")
  if (out.length > MAX_PATH) out = out.slice(0, MAX_PATH).replace(/\/[^/]*$/, "") || "/"
  return out
}

export type PageType = "home" | "product" | "collection" | "page" | "policy" | "blog" | "search" | "cart" | "account" | "checkout" | "other"
export const PAGE_TYPES: PageType[] = ["home", "product", "collection", "page", "policy", "blog", "search", "cart", "account", "checkout", "other"]

const POLICY_SLUGS = new Set(["refund-policy", "privacy-policy", "terms-of-service", "shipping-policy", "contact-information", "legal-notice", "terms", "privacy"])
const LANGUAGES = SITE_LANGUAGE_CODES as readonly string[]

/** What kind of page a stored path is, on a Storelib theme or an imported Shopify one. A language prefix is looked past. */
export function pageTypeOf(path: string): PageType {
  const rest = localeFromPath(path, LANGUAGES)?.rest ?? path
  const s = rest.split("/").filter(Boolean)
  if (s.length === 0) return "home"
  const [a, b] = s
  if (a === "products") return b ? "product" : "collection"
  if (a === "collections") return s[2] === "products" && s[3] ? "product" : "collection"
  if (a === "search") return "search"
  if (a === "cart") return "cart"
  if (a === "account" || a === "wishlist") return "account"
  if (a === "checkout" || a === "checkouts" || a === "receipt") return "checkout"
  if (a === "policies" || POLICY_SLUGS.has(a)) return "policy"
  if (a === "blogs" || a === "blog") return "blog"
  if (a === "pages") return b && POLICY_SLUGS.has(b) ? "policy" : "page"
  if (s.length === 1) return "page"
  return "other"
}

/* ── The visitor's browser, device and place, without the visitor ─────── */

/**
 * A phone or a computer. The browser's signature decides (a tablet counts
 * as mobile, the way Search Console splits them); a computer's signature on
 * a screen narrower than a phone held sideways is a phone asking for the
 * desktop site.
 */
export function deviceClassFor(parsedDevice: string | null | undefined, width: number | null): PerfDevice {
  if (parsedDevice === "mobile" || parsedDevice === "tablet") return "mobile"
  if (width !== null && width < 600) return "mobile"
  return "desktop"
}

export const BROWSERS = ["Chrome", "Safari", "Edge", "Firefox", "Samsung Internet", "Opera", "Instagram", "Facebook", "TikTok", "Other"] as const
export type BrowserFamily = (typeof BROWSERS)[number]

export function browserFamilyOf(parsedBrowser: string | null | undefined): BrowserFamily {
  return (BROWSERS as readonly string[]).includes(parsedBrowser ?? "") ? (parsedBrowser as BrowserFamily) : "Other"
}

/** The country from the edge's header: two capital letters, never "XX" (unknown) or "T1" (Tor). */
export function countryOf(header: string | null | undefined): string | null {
  const c = (header ?? "").trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(c) || c === "XX" || c === "T1") return null
  return c
}

/* ── One stored page view, and the daily rows made of them ─────────────── */

export interface RumEvent {
  /** ISO time the server stored it. */
  at: string
  path: string
  page_type: string
  device: PerfDevice
  browser: string
  country: string | null
  lcp_ms: number | null
  inp_ms: number | null
  cls: number | null
  fcp_ms: number | null
  ttfb_ms: number | null
  nav_ms: number | null
  /** 1 over the rate it was kept at. */
  weight: number
}

const COLUMN: Record<RumMetric, keyof RumEvent> = {
  lcp: "lcp_ms",
  inp: "inp_ms",
  cls: "cls",
  fcp: "fcp_ms",
  ttfb: "ttfb_ms",
  nav: "nav_ms",
}

/**
 * Page views summed for one device and one key of one dimension: weighted
 * histograms (what the percentiles and bands come from) and the raw sample
 * count per metric (what decides whether there is enough to say anything).
 */
export interface AggRow {
  device: PerfDevice
  dim: PerfDim
  key: string
  /** Page views this stands for (weighted). */
  views: number
  /** Page views actually measured. */
  samples: number
  h: Record<RumMetric, number[]>
  n: Record<RumMetric, number>
}

function emptyAgg(device: PerfDevice, dim: PerfDim, key: string): AggRow {
  const h = {} as Record<RumMetric, number[]>
  const n = {} as Record<RumMetric, number>
  for (const m of RUM_METRICS) {
    h[m] = emptyHistogram(m)
    n[m] = 0
  }
  return { device, dim, key, views: 0, samples: 0, h, n }
}

function addEvent(row: AggRow, e: RumEvent) {
  const w = Number(e.weight) > 0 ? Number(e.weight) : 1
  row.views += w
  row.samples += 1
  for (const m of RUM_METRICS) {
    const v = e[COLUMN[m]]
    if (typeof v !== "number" || !Number.isFinite(v)) continue
    row.h[m][bucketOf(m, v)] += w
    row.n[m] += 1
  }
}

export function aggKey(r: Pick<AggRow, "device" | "dim" | "key">): string {
  return `${r.device}|${r.dim}|${r.key}`
}

/** Two rows of the same device, dimension and key, as one. */
export function mergeAgg(a: AggRow, b: AggRow): AggRow {
  const out = emptyAgg(a.device, a.dim, a.key)
  out.views = a.views + b.views
  out.samples = a.samples + b.samples
  for (const m of RUM_METRICS) {
    out.h[m] = addHistograms(a.h[m], b.h[m])
    out.n[m] = (a.n[m] || 0) + (b.n[m] || 0)
  }
  return out
}

/** Any number of rows, summed by device, dimension and key. */
export function mergeAggs(...lists: AggRow[][]): AggRow[] {
  const by = new Map<string, AggRow>()
  for (const list of lists) {
    for (const r of list) {
      const k = aggKey(r)
      const seen = by.get(k)
      by.set(k, seen ? mergeAgg(seen, r) : mergeAgg(emptyAgg(r.device, r.dim, r.key), r))
    }
  }
  return [...by.values()]
}

/** The rows of both devices for one dimension and key, as one "all devices" row. */
export function bothDevices(rows: AggRow[], dim: PerfDim, key: string): AggRow | null {
  const hits = rows.filter((r) => r.dim === dim && r.key === key)
  if (hits.length === 0) return null
  return hits.reduce((acc, r) => mergeAgg(acc, r), emptyAgg("mobile", dim, key))
}

function keyOf(e: RumEvent, dim: PerfDim): string {
  if (dim === "all") return ""
  if (dim === "path") return e.path
  if (dim === "type") return e.page_type
  if (dim === "browser") return e.browser
  return e.country ?? "??"
}

/**
 * ONE DAY OF PAGE VIEWS, ROLLED UP. A row per device for the whole day, and
 * per device for each page, page type, browser and country. Pages past the
 * day's busiest MAX_PATHS_PER_DAY (and countries past MAX_COUNTRIES_PER_DAY)
 * are summed as "(other)", so a site with a thousand pages still has a
 * bounded day. The same events always give the same rows in the same order:
 * running it twice and replacing the day is the same as running it once.
 */
export function rollupEvents(events: RumEvent[], dims: PerfDim[] = ["all", ...PERF_DIMS]): AggRow[] {
  const by = new Map<string, AggRow>()
  const counts = { path: new Map<string, number>(), country: new Map<string, number>() }
  for (const e of events) {
    for (const dim of ["path", "country"] as const) {
      const k = `${e.device}|${keyOf(e, dim)}`
      counts[dim].set(k, (counts[dim].get(k) ?? 0) + 1)
    }
  }
  const kept = (dim: "path" | "country", cap: number) => {
    const set = new Set<string>()
    for (const device of ["mobile", "desktop"] as const) {
      const ranked = [...counts[dim].entries()]
        .filter(([k]) => k.startsWith(`${device}|`))
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, cap)
      for (const [k] of ranked) set.add(k)
    }
    return set
  }
  const paths = kept("path", MAX_PATHS_PER_DAY)
  const countries = kept("country", MAX_COUNTRIES_PER_DAY)
  for (const e of events) {
    if (e.device !== "mobile" && e.device !== "desktop") continue
    for (const dim of dims) {
      let key = keyOf(e, dim)
      if (dim === "path" && !paths.has(`${e.device}|${key}`)) key = OTHER_KEY
      if (dim === "country" && !countries.has(`${e.device}|${key}`)) key = OTHER_KEY
      const k = `${e.device}|${dim}|${key}`
      let row = by.get(k)
      if (!row) {
        row = emptyAgg(e.device, dim, key)
        by.set(k, row)
      }
      addEvent(row, e)
    }
  }
  return [...by.values()].sort((a, b) => (aggKey(a) < aggKey(b) ? -1 : aggKey(a) > aggKey(b) ? 1 : 0))
}

/** The UTC day an ISO time falls on. */
export function utcDay(iso: string | number): string {
  return new Date(typeof iso === "number" ? iso : Date.parse(iso)).toISOString().slice(0, 10)
}

export function addUtcDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** Whether a raw row from `day` may be deleted on `today`: older than RAW_DAYS, and rolled up (or five days past even that). */
export function rawExpired(day: string, today: string, rolledUp: boolean): boolean {
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000
  return age > RAW_DAYS && (rolledUp || age > RAW_DAYS + 5)
}

export function rollupExpired(day: string, today: string): boolean {
  return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000 > ROLLUP_DAYS
}

/* ── The windows ───────────────────────────────────────────────────────── */

export interface PerfWindow {
  range: PerfRange
  /** ms since epoch, inclusive. */
  start: number
  /** ms since epoch, exclusive. */
  end: number
  previousStart: number
  previousEnd: number
  /** One chart point per hour for 24 hours, per UTC day otherwise. */
  grain: "hour" | "day"
  /** The UTC days the window reads, oldest first (days ranges only). */
  days: string[]
  previousDays: string[]
}

export function rangeFrom(value: unknown): PerfRange {
  return PERF_RANGES.includes(value as PerfRange) ? (value as PerfRange) : "7d"
}

/** "Last 7 days" is today (so far) and the six UTC days before it; the previous period is the seven before those. */
export function windowFor(range: PerfRange, now: number): PerfWindow {
  if (range === "24h") {
    const end = Math.floor(now / 3_600_000) * 3_600_000 + 3_600_000
    const start = end - 24 * 3_600_000
    return { range, start, end, previousStart: start - 24 * 3_600_000, previousEnd: start, grain: "hour", days: [], previousDays: [] }
  }
  const n = range === "7d" ? 7 : range === "30d" ? 30 : 90
  const today = utcDay(now)
  const days: string[] = []
  const previousDays: string[] = []
  for (let i = n - 1; i >= 0; i--) days.push(addUtcDays(today, -i))
  for (let i = 2 * n - 1; i >= n; i--) previousDays.push(addUtcDays(today, -i))
  const start = Date.parse(`${days[0]}T00:00:00Z`)
  const end = Date.parse(`${addUtcDays(today, 1)}T00:00:00Z`)
  return { range, start, end, previousStart: Date.parse(`${previousDays[0]}T00:00:00Z`), previousEnd: start, grain: "day", days, previousDays }
}

/* ── The report ────────────────────────────────────────────────────────── */

export interface MetricFigure {
  /** Null under MIN_SAMPLES: "Not enough visits yet". */
  p75: number | null
  samples: number
  rating: PerfRating | null
  bands: Bands | null
  /** The previous period's p75, under the same rule. */
  previous: number | null
}

export type DeviceView = "all" | PerfDevice
export const DEVICE_VIEWS: DeviceView[] = ["all", "mobile", "desktop"]

export interface Summary {
  views: number
  samples: number
  previousViews: number
  metrics: Record<RumMetric, MetricFigure>
}

export interface SeriesPoint {
  /** ISO start of the hour or day. */
  t: string
  /** p75 per device view and metric; null where the point has too few page views. */
  values: Record<DeviceView, Partial<Record<RumMetric, number | null>>>
  samples: Record<DeviceView, Partial<Record<RumMetric, number>>>
}

export interface BreakdownRow {
  key: string
  views: number
  samples: number
  metrics: Partial<Record<RumMetric, { p75: number | null; samples: number }>>
}

export type Insight =
  | { kind: "worst"; metric: PerfMetric; device: PerfDevice; pageType: PageType | null; p75: number; rating: PerfRating; evidence: LabEvidence | null }
  | { kind: "slower"; metric: PerfMetric; device: DeviceView; from: number; to: number }
  | { kind: "all-good"; device: DeviceView }

/** Something the last lab test found that explains a slow metric, only from what the test actually reported. */
export type LabEvidence =
  | { kind: "largest-file"; url: string; bytes: number }
  | { kind: "image-savings"; bytes: number }
  | { kind: "render-blocking"; ms: number }
  | { kind: "server-response"; ms: number }

export interface PerfReport {
  range: PerfRange
  state: "ready" | "no-data"
  updatedAt: string
  /** The newest page view measured, or null. */
  lastViewAt: string | null
  summary: Record<DeviceView, Summary>
  series: SeriesPoint[]
  breakdowns: Record<Exclude<PerfDim, "all">, Record<DeviceView, BreakdownRow[]>>
  insights: Insight[]
  /** Page views from Safari, which does not report INP, as a share of the window's views. Null when there were none. */
  noInpShare: number | null
  /** True when part of the window could not be read in full: the numbers are a floor, and the page says so. */
  partial: boolean
}

function figure(metric: RumMetric, row: AggRow | null, previous: AggRow | null): MetricFigure {
  const samples = row?.n[metric] ?? 0
  const p75 = row && samples >= MIN_SAMPLES ? p75FromHistogram(metric, row.h[metric]) : null
  const prevSamples = previous?.n[metric] ?? 0
  const prev = previous && prevSamples >= MIN_SAMPLES ? p75FromHistogram(metric, previous.h[metric]) : null
  const rated = metric !== "nav"
  return {
    p75,
    samples,
    rating: rated && p75 !== null ? ratePerf(metric as PerfMetric, p75) : null,
    bands: rated && row && samples >= MIN_SAMPLES ? bandsFromHistogram(metric as PerfMetric, row.h[metric]) : null,
    previous: prev,
  }
}

function rowFor(rows: AggRow[], view: DeviceView, dim: PerfDim, key: string): AggRow | null {
  if (view === "all") return bothDevices(rows, dim, key)
  return rows.find((r) => r.device === view && r.dim === dim && r.key === key) ?? null
}

function summaryFor(current: AggRow[], previous: AggRow[], view: DeviceView): Summary {
  const now = rowFor(current, view, "all", "")
  const before = rowFor(previous, view, "all", "")
  const metrics = {} as Record<RumMetric, MetricFigure>
  for (const m of RUM_METRICS) metrics[m] = figure(m, now, before)
  return { views: Math.round(now?.views ?? 0), samples: now?.samples ?? 0, previousViews: Math.round(before?.views ?? 0), metrics }
}

function breakdownFor(rows: AggRow[], dim: Exclude<PerfDim, "all">, view: DeviceView): BreakdownRow[] {
  const keys = [...new Set(rows.filter((r) => r.dim === dim && (view === "all" || r.device === view)).map((r) => r.key))]
  const out: BreakdownRow[] = []
  for (const key of keys) {
    const r = rowFor(rows, view, dim, key)
    if (!r || r.samples === 0) continue
    const metrics: BreakdownRow["metrics"] = {}
    for (const m of RUM_METRICS) {
      const samples = r.n[m] ?? 0
      metrics[m] = { samples, p75: samples >= MIN_SAMPLES ? p75FromHistogram(m, r.h[m]) : null }
    }
    out.push({ key, views: Math.round(r.views), samples: r.samples, metrics })
  }
  return out.sort((a, b) => b.views - a.views || (a.key < b.key ? -1 : 1))
}

function seriesPoint(t: string, rows: AggRow[]): SeriesPoint {
  const values = { all: {}, mobile: {}, desktop: {} } as SeriesPoint["values"]
  const samples = { all: {}, mobile: {}, desktop: {} } as SeriesPoint["samples"]
  for (const view of DEVICE_VIEWS) {
    const r = rowFor(rows, view, "all", "")
    for (const m of RUM_METRICS) {
      const n = r?.n[m] ?? 0
      samples[view][m] = n
      values[view][m] = r && n >= MIN_POINT_SAMPLES ? p75FromHistogram(m, r.h[m]) : null
    }
  }
  return { t, values, samples }
}

/** How far over its Good line a value is: 1 is on the line. */
function badness(metric: PerfMetric, value: number): number {
  return value / PERF_THRESHOLDS[metric][0]
}

/**
 * WHAT TO FIX, FROM THE DATA AND NOTHING ELSE. The worst rated metric on
 * each device that is not Good, with the page type where it is worst (when
 * that page type has enough visits to say), and the evidence the last lab
 * test found for it, if there is a test and it found any. Then a metric
 * that moved into a worse band since the previous period. All Good says so.
 * At most three.
 */
export function insightsFor(
  summary: Record<DeviceView, Summary>,
  types: Record<DeviceView, BreakdownRow[]>,
  evidence: Partial<Record<PerfDevice, Partial<Record<PerfMetric, LabEvidence>>>>,
): Insight[] {
  const out: Insight[] = []
  for (const device of ["mobile", "desktop"] as const) {
    let worst: { metric: PerfMetric; p75: number; score: number } | null = null
    for (const metric of PERF_METRICS) {
      const f = summary[device].metrics[metric]
      if (f.p75 === null || f.rating === "good") continue
      const score = badness(metric, f.p75) + (CORE_METRICS.includes(metric) ? 0.5 : 0)
      if (!worst || score > worst.score) worst = { metric, p75: f.p75, score }
    }
    if (!worst) continue
    let pageType: PageType | null = null
    let p75 = worst.p75
    for (const row of types[device]) {
      const m = row.metrics[worst.metric]
      if (!m || m.p75 === null) continue
      if (m.p75 > p75) {
        p75 = m.p75
        pageType = row.key as PageType
      }
    }
    out.push({ kind: "worst", metric: worst.metric, device, pageType, p75, rating: ratePerf(worst.metric, p75), evidence: evidence[device]?.[worst.metric] ?? null })
  }
  if (out.length < 3) {
    for (const metric of CORE_METRICS) {
      const f = summary.all.metrics[metric]
      if (f.p75 === null || f.previous === null) continue
      if (rankOf(ratePerf(metric, f.p75)) > rankOf(ratePerf(metric, f.previous))) {
        out.push({ kind: "slower", metric, device: "all", from: f.previous, to: f.p75 })
        if (out.length >= 3) break
      }
    }
  }
  if (out.length === 0) {
    const all = CORE_METRICS.every((m) => summary.all.metrics[m].rating === "good")
    if (all) out.push({ kind: "all-good", device: "all" })
  }
  return out.slice(0, 3)
}

function rankOf(r: PerfRating): number {
  return r === "good" ? 0 : r === "needs-improvement" ? 1 : 2
}

/** Whether a change is better or worse: every metric here is better lower. Null under 3% either way, or without both values. */
export function directionOf(now: number | null, before: number | null): "better" | "worse" | "same" | null {
  if (now === null || before === null) return null
  if (before === 0 && now === 0) return "same"
  const change = before === 0 ? 1 : (now - before) / before
  if (Math.abs(change) < 0.03) return "same"
  return change < 0 ? "better" : "worse"
}

export interface ReportInput {
  range: PerfRange
  now: number
  current: AggRow[]
  previous: AggRow[]
  /** Chart points, oldest first, each with its own rows. */
  points: Array<{ t: string; rows: AggRow[] }>
  lastViewAt: string | null
  /** What the last lab test on each device found, per metric (lib/website-builder/pagespeed.ts labEvidence). */
  evidence?: Partial<Record<PerfDevice, Partial<Record<PerfMetric, LabEvidence>>>>
  partial?: boolean
}

export function buildReport(input: ReportInput): PerfReport {
  const summary = {} as Record<DeviceView, Summary>
  for (const v of DEVICE_VIEWS) summary[v] = summaryFor(input.current, input.previous, v)
  const breakdowns = {} as PerfReport["breakdowns"]
  for (const dim of PERF_DIMS as Array<Exclude<PerfDim, "all">>) {
    breakdowns[dim] = { all: breakdownFor(input.current, dim, "all"), mobile: breakdownFor(input.current, dim, "mobile"), desktop: breakdownFor(input.current, dim, "desktop") }
  }
  const total = summary.all.views
  /* Safari has no INP: its page views are in every other figure and in none of INP's. */
  const noInpViews = input.current.filter((r) => r.dim === "browser" && r.key === "Safari").reduce((sum, r) => sum + r.views, 0)
  return {
    range: input.range,
    state: summary.all.samples === 0 ? "no-data" : "ready",
    updatedAt: new Date(input.now).toISOString(),
    lastViewAt: input.lastViewAt,
    summary,
    series: input.points.map((p) => seriesPoint(p.t, p.rows)),
    breakdowns,
    insights: summary.all.samples === 0 ? [] : insightsFor(summary, breakdowns.type, input.evidence ?? {}),
    noInpShare: total > 0 && noInpViews > 0 ? Math.min(1, noInpViews / total) : null,
    partial: !!input.partial,
  }
}

/* ── The rows as the database holds them ───────────────────────────────── */

/** A daily row as site_rum_daily and site_rum_window give it. */
export interface DbAggRow {
  day?: string
  device: string
  dim: string
  key: string
  views: number | string
  samples: number | string
  [column: string]: unknown
}

/** A database row to an AggRow. Columns are `<metric>_h` (the histogram) and `<metric>_n` (the samples). */
export function aggFromDb(r: DbAggRow): AggRow | null {
  if (r.device !== "mobile" && r.device !== "desktop") return null
  if (r.dim !== "all" && !PERF_DIMS.includes(r.dim as PerfDim)) return null
  const row = emptyAgg(r.device, r.dim as PerfDim, String(r.key ?? ""))
  row.views = Number(r.views) || 0
  row.samples = Number(r.samples) || 0
  for (const m of RUM_METRICS) {
    const h = r[`${m}_h`]
    row.h[m] = Array.isArray(h) ? addHistograms(emptyHistogram(m), h as number[]) : emptyHistogram(m)
    row.n[m] = Number(r[`${m}_n`]) || 0
  }
  return row
}

/** An AggRow to the columns site_rum_replace_day writes. */
export function aggToDb(r: AggRow): Record<string, unknown> {
  const out: Record<string, unknown> = { device: r.device, dim: r.dim, key: r.key, views: Math.round(r.views * 1000) / 1000, samples: r.samples }
  for (const m of RUM_METRICS) {
    out[`${m}_h`] = r.h[m].map((v) => Math.round(v * 1000) / 1000)
    out[`${m}_n`] = r.n[m]
  }
  return out
}
