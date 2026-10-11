/**
 * ===========================================================================
 *  HOW MUCH STORELIB MEASURES ITSELF, AND HOW LONG IT KEEPS IT
 * ===========================================================================
 * Every number on /admin/performance comes from three places:
 *
 *   1. Browsers (components/perf/perf-beacon.tsx): Web Vitals, the time from
 *      a tap to the next screen, the steps of a flow (the editor opening, a
 *      save, the payment form drawing, a payment starting) and JavaScript
 *      errors. On storelib.com and in the iOS and Android apps (they load
 *      storelib.com), on OnePages (storelib.me), and on a website's own
 *      checkout and receipt. Published websites' own pages have their own
 *      collector (components/website-builder/site-vitals.tsx, and the inline
 *      one an imported theme's page carries, lib/perf/site-vitals-inline.ts).
 *   2. Storelib's own API routes (lib/perf/server-timing.ts): how long the
 *      routes that matter took to answer and whether they failed, the
 *      webhooks, and every scheduled job run.
 *   3. What already exists: orders, the scheduled jobs' traces, and the
 *      database's own statement statistics.
 *
 * EVERY PAGE LOAD MEASURES ITSELF (CLIENT_SAMPLE_RATE is 1). Storelib's
 * traffic is small enough that one in five left most figures on
 * "insufficient data" for days. The cost per page load stays negligible:
 * the collector is a few kilobytes, downloaded when the browser is idle,
 * runs the browser's own PerformanceObserver and nothing per frame, and
 * sends a few small batches.
 *
 * AUTOMATIC CAPS, so a busy day or a long session cannot cost more:
 *   per page load (one session of the app: it never reloads)
 *     MAX_ITEMS_PER_PAGE_LOAD items in all; past FULL_VIEWS_PER_PAGE_LOAD
 *     screens, one screen in VIEW_SAMPLE_AFTER is measured; MAX_ERRORS_PER_PAGE
 *     JavaScript errors; MAX_STEPS_PER_PAGE_LOAD flow steps.
 *   per server instance
 *     SERVER_ROUTE_PER_MINUTE timings per route a minute, the rest are not
 *     recorded; BEACONS_PER_MINUTE beacons per address a minute.
 *   per day, in the database (perf_ingest)
 *     DAILY_CAP rows per source. Past it, the day's sample is full. If that
 *     starts happening every day, lower CLIENT_SAMPLE_RATE here: the page
 *     reports the rate it ran at.
 *
 * Raw rows are kept RAW_RETENTION_DAYS, so every window up to 30 days is
 * worked out from real samples; after that only the daily rollup remains.
 *
 * Pure: no DOM, no database. The beacon, the ingest route, the SQL in parts
 * 126 and 130 and tests/perf-health18.test.ts and tests/perf-collect.test.ts
 * read these.
 */

/** Every page load measures itself; see above for the caps that keep it cheap. */
export const CLIENT_SAMPLE_RATE = 1
/** Every call to a timed API route is timed, up to SERVER_ROUTE_PER_MINUTE a route a minute per instance. */
export const SERVER_SAMPLE_RATE = 1
/** Timings one server instance records per route a minute. */
export const SERVER_ROUTE_PER_MINUTE = 120

/** Items one page load may send in all. */
export const MAX_ITEMS_PER_PAGE_LOAD = 400
/** Screens of one page load measured in full; after them one in VIEW_SAMPLE_AFTER is. */
export const FULL_VIEWS_PER_PAGE_LOAD = 60
export const VIEW_SAMPLE_AFTER = 4
/** Flow steps (editor open, save, payment start) one page load may report. */
export const MAX_STEPS_PER_PAGE_LOAD = 60

/** Rows a day the database accepts per source (client, server). Past it, the day's sample is full. */
export const DAILY_CAP = { client: 50_000, server: 40_000 } as const
/** Raw samples are deleted after this many days; the daily rollup keeps the history. */
export const RAW_RETENTION_DAYS = 31
/** Daily rollups are kept this long. */
export const ROLLUP_RETENTION_DAYS = 120

/** Items one beacon may carry, and its largest body. */
export const MAX_BATCH = 40
export const MAX_BODY_BYTES = 8_192
/** JavaScript errors one page load may report. */
export const MAX_ERRORS_PER_PAGE = 5
/** Beacons per address per minute, per server instance. */
export const BEACONS_PER_MINUTE = 60

/**
 * Where the browser sends its measurements: a first party address with no
 * word in it that ad blockers' lists match (beacon, perf, vitals, track,
 * analytics, collect), under /api/public/ (the prefix the proxy lets a
 * published site's own page call). /api/perf/beacon still answers, for pages
 * loaded before this changed.
 */
export const BEACON_PATH = "/api/public/m"
/** And where a published website's own pages send theirs (/api/public/vitals still answers). */
export const SITE_BEACON_PATH = "/api/public/sv"

/**
 * Fewer samples than this and a percentile is a handful of visits deciding
 * the answer: the official figure says "insufficient data" instead (the same
 * rule the website page uses, lib/website-builder/web-vitals.ts MIN_SAMPLES).
 */
export const MIN_SAMPLES = 20
/** A rate (errors per page view, failures per call) needs at least this many of the thing it divides by. */
export const MIN_RATE_BASE = 50

/**
 * BELOW THOSE, A PROVISIONAL FIGURE. With a quarter of what the official
 * rule needs, the number is shown, marked provisional, with how sure it is:
 * low under half the official amount, medium from half. The official score
 * of a day is still only worked out under the official rules.
 */
export const PROVISIONAL_SHARE = 0.25

/** The parts of Storelib a measurement belongs to. */
export const AREAS = ["app", "builder", "explore", "community", "creator", "product", "checkout", "sites"] as const
export type Area = (typeof AREAS)[number]

/** Areas only the server records under: webhooks and scheduled jobs. */
export const SERVER_AREAS = [...AREAS, "infra"] as const
export type ServerArea = (typeof SERVER_AREAS)[number]

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

/** What a browser may send. `step` is a flow step's time, `fail` a flow step that failed. */
export const CLIENT_METRICS = ["lcp", "inp", "cls", "fcp", "ttfb", "nav", "view", "js_error", "step", "fail"] as const
/** What the server records: an API answer, and a scheduled job's run. */
export const SERVER_METRICS = ["api", "job"] as const
export const METRICS = [...CLIENT_METRICS, ...SERVER_METRICS] as const
export type Metric = (typeof METRICS)[number]
export type ClientMetric = (typeof CLIENT_METRICS)[number]

export type Device = "mobile" | "desktop"

/** A route pattern as stored: lower case, ids already replaced by `:name`. */
export const ROUTE_PATTERN = /^\/[a-z0-9:_\-/]{0,95}$/

/**
 * ===========================================================================
 *  THE STEPS OF A FLOW, TIMED WHERE THEY HAPPEN
 * ===========================================================================
 * Stored as metric `step` (milliseconds) or `fail` (one failed attempt, with
 * a short code), under the step's own route, so each is its own figure.
 * Nothing else may be sent as a step: the beacon route refuses any route
 * not listed here.
 */
export const STEPS = {
  /* The website builder (app/website-builder/editor). */
  "/step/editor/open": { area: "builder", label: "Editor open to ready", good: 2500, poor: 6000 },
  "/step/editor/canvas": { area: "builder", label: "Canvas first paint", good: 1500, poor: 4000 },
  "/step/editor/save": { area: "builder", label: "Save", good: 800, poor: 2500 },
  /* Checkout, on storelib.com (a product, Explore, a membership) and on a website's own host. */
  "/step/checkout/ready": { area: "checkout", label: "Payment form ready", good: 2500, poor: 5000 },
  "/step/checkout/intent": { area: "checkout", label: "Payment started (intent)", good: 1000, poor: 3000 },
  "/step/checkout/confirm": { area: "checkout", label: "Payment confirmed", good: 3000, poor: 8000 },
} as const satisfies Record<string, { area: Area; label: string; good: number; poor: number }>
export type StepRoute = keyof typeof STEPS
export const STEP_ROUTES = Object.keys(STEPS) as StepRoute[]
