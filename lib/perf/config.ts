/**
 * ===========================================================================
 *  HOW MUCH STORELIB MEASURES ITSELF, AND HOW LONG IT KEEPS IT
 * ===========================================================================
 * Every number on /admin/performance comes from three places:
 *
 *   1. Browsers on storelib.com (components/perf/perf-beacon.tsx): Web
 *      Vitals, the time from a tap to the next screen, and JavaScript errors,
 *      from one page load in CLIENT_SAMPLE_RATE. The rest send nothing.
 *   2. Storelib's own API routes (lib/perf/server-timing.ts): how long the
 *      routes that matter took to answer and whether they failed, from one
 *      request in SERVER_SAMPLE_RATE.
 *   3. What already exists: published websites' Web Vitals (site_web_vitals,
 *      run-now part 06), orders, the scheduled jobs' traces, and the
 *      database's own statement statistics.
 *
 * WHY SAMPLED. A measurement that costs every visitor something is not worth
 * having. One page load in five is plenty for a 75th percentile on a busy
 * area, a quiet day says "insufficient data" rather than guessing, and the
 * raw table stays small whatever the traffic: at most DAILY_CAP rows a day per
 * source, kept RAW_RETENTION_DAYS, then only the daily rollup remains.
 *
 * Pure: no DOM, no database. The beacon, the ingest route, the SQL in part
 * 126 and tests/perf-health18.test.ts all read these.
 */

/** One page load in five measures itself; the rest run nothing at all. */
export const CLIENT_SAMPLE_RATE = 0.2
/** One API request in five is timed. */
export const SERVER_SAMPLE_RATE = 0.2

/** Rows a day the database accepts per source (client, server). Past it, the day's sample is full. */
export const DAILY_CAP = { client: 30_000, server: 20_000 } as const
/** Raw samples are deleted after this many days; the daily rollup keeps the history. */
export const RAW_RETENTION_DAYS = 8
/** Daily rollups are kept this long. */
export const ROLLUP_RETENTION_DAYS = 120

/** Items one beacon may carry, and its largest body. */
export const MAX_BATCH = 40
export const MAX_BODY_BYTES = 8_192
/** JavaScript errors one page load may report. */
export const MAX_ERRORS_PER_PAGE = 5
/** Beacons per address per minute, per server instance. */
export const BEACONS_PER_MINUTE = 20

/**
 * Fewer samples than this and a percentile is a handful of visits deciding
 * the answer: the cell says "insufficient data" instead (the same rule the
 * website page uses, lib/website-builder/web-vitals.ts MIN_SAMPLES).
 */
export const MIN_SAMPLES = 20
/** A rate (errors per page view, failures per call) needs at least this many of the thing it divides by. */
export const MIN_RATE_BASE = 50

/** The parts of Storelib a measurement belongs to. */
export const AREAS = ["app", "builder", "explore", "community", "creator", "product", "checkout", "sites"] as const
export type Area = (typeof AREAS)[number]

export const AREA_LABEL: Record<Area, string> = {
  app: "Dashboard",
  builder: "Website builder",
  explore: "Explore",
  community: "Communities",
  creator: "Creator pages",
  product: "Product pages",
  checkout: "Checkout",
  sites: "Published websites",
}

/** What a browser may send. */
export const CLIENT_METRICS = ["lcp", "inp", "cls", "fcp", "ttfb", "nav", "view", "js_error"] as const
/** What the server records. */
export const SERVER_METRICS = ["api"] as const
export const METRICS = [...CLIENT_METRICS, ...SERVER_METRICS] as const
export type Metric = (typeof METRICS)[number]
export type ClientMetric = (typeof CLIENT_METRICS)[number]

export type Device = "mobile" | "desktop"

/** A route pattern as stored: lower case, ids already replaced by `:name`. */
export const ROUTE_PATTERN = /^\/[a-z0-9:_\-/]{0,95}$/
