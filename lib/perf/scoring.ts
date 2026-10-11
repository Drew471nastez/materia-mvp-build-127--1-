/**
 * ===========================================================================
 *  THE HEALTH INDEX: HOW A SCORE FROM 0 TO 100 IS WORKED OUT
 * ===========================================================================
 * Written down once, here, and printed on /admin/performance from these same
 * objects, so the page can never describe a rule the code does not follow.
 *
 * 1. EVERY MEASUREMENT HAS TWO LINES, good and poor. Where Google publishes
 *    them (LCP, INP, CLS, FCP, TTFB) they are Google's; the rest are
 *    Storelib's own and say so.
 *
 * 2. A MEASUREMENT SCORES 100 at zero, 90 on its good line, 50 on its poor
 *    line and 0 at twice the poor line, in straight lines between. So a page
 *    exactly on Google's good line reads 90, the start of the "good" band,
 *    and two pages that are both good can still be told apart.
 *
 * 3. A MEASUREMENT COUNTS ONLY WITH ENOUGH DATA: a 75th percentile needs
 *    MIN_SAMPLES samples, a rate needs MIN_RATE_BASE of what it divides by.
 *    Otherwise it is "insufficient data" and is left out, never guessed.
 *
 * 4. A SUB SCORE is the plain average of its measurements that count, and
 *    needs at least two of them. With fewer it is "insufficient data".
 *
 * 5. THE HEALTH INDEX is the weighted average of the sub scores that have a
 *    score, and needs at least three. Checkout and published websites weigh
 *    double (they are where money and strangers meet Storelib), the
 *    Dashboard and the database one and a half, infrastructure a half.
 *
 * 6. A PROVISIONAL SCORE, when the official one has too little to stand on.
 *    A measurement with a quarter of what rule 3 asks (PROVISIONAL_SHARE)
 *    gets a provisional score by rule 2, marked with how sure it is: low,
 *    or medium from half of what rule 3 asks; one that meets rule 3 is high.
 *    A sub score and the Health Index are then the same averages over what
 *    has at least a provisional score, one being enough, and are as sure as
 *    the least sure thing in them (low when fewer than rules 4 and 5 ask).
 *    The official score of a day (lib/perf/daily.ts) is still only ever the
 *    official rules'; the provisional one is kept beside it, labelled.
 *
 * Pure: no DOM, no database. lib/perf/read.ts and lib/perf/daily.ts hand it
 * real aggregates; tests/perf-health18.test.ts checks every rule.
 */

import { MIN_RATE_BASE, MIN_SAMPLES, PROVISIONAL_SHARE, STEPS, type Metric, type StepRoute } from "./config"

/** One aggregate over a window: a percentile row from the raw samples or a daily rollup. `*` means all. */
export interface Aggregate {
  area: string
  device: string
  route: string
  metric: Metric | string
  samples: number
  p50: number | null
  p75: number | null
  p95: number | null
  /** For `api`: answers with a status of 500 or more. */
  bad: number
}

/** What the score reads from outside the telemetry. Null means it could not be read, or is not configured. */
export interface Extras {
  /** Orders in the window: failed payments against completed ones. */
  payments: { failed: number; completed: number } | null
  /** Database statements averaging SLOW_STATEMENT_MS or more over at least SLOW_STATEMENT_CALLS calls. */
  slowStatements: number | null
  /** Scheduled jobs: how many are late, of those whose state could be read. */
  jobs: { late: number; known: number } | null
  /** Supabase services not healthy. Only with SUPABASE_ACCESS_TOKEN. */
  supabaseDown: number | null
  /** Production deployments in the window: failed of total. Only with VERCEL_API_TOKEN. */
  deployments: { failed: number; total: number } | null
}

export const NO_EXTRAS: Extras = { payments: null, slowStatements: null, jobs: null, supabaseDown: null, deployments: null }

export const SLOW_STATEMENT_MS = 200
export const SLOW_STATEMENT_CALLS = 50

export type Unit = "ms" | "cls" | "pct" | "per100" | "count"
export type Rating = "good" | "needs-improvement" | "poor"

export interface Reading {
  value: number | null
  /** How many samples (or orders, calls, jobs) the value stands on. */
  base: number
  enough: boolean
  /** What rule 3 asks for this kind of figure (samples, page views, orders). Absent: one is enough. */
  need?: number
}

export type Confidence = "high" | "medium" | "low"

export interface MeasureDef {
  key: string
  label: string
  /** Where the number comes from, in a few words. */
  source: string
  unit: Unit
  good: number
  poor: number
  /** Whose lines: Google's or Storelib's own. */
  lines: "google" | "storelib"
  read: (aggs: Aggregate[], extras: Extras) => Reading
}

export interface SubScoreDef {
  id: string
  label: string
  weight: number
  measures: MeasureDef[]
}

/* ── Rule 2 ────────────────────────────────────────────────────────────── */

/** 100 at zero, 90 on the good line, 50 on the poor line, 0 at twice poor; straight lines between. */
export function measureScore(value: number, good: number, poor: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 100
  if (value <= good) return Math.round(100 - (10 * value) / good)
  if (value <= poor) return Math.round(90 - (40 * (value - good)) / (poor - good))
  return Math.max(0, Math.round(50 - (50 * (value - poor)) / poor))
}

export function rateValue(value: number, good: number, poor: number): Rating {
  if (value <= good) return "good"
  if (value <= poor) return "needs-improvement"
  return "poor"
}

/* ── Reading the aggregates ────────────────────────────────────────────── */

export function findAggregate(aggs: Aggregate[], area: string, metric: string, device = "*", route = "*"): Aggregate | undefined {
  return aggs.find((a) => a.area === area && a.metric === metric && a.device === device && a.route === route)
}

const NOTHING: Reading = { value: null, base: 0, enough: false }

/** Rule 3 for a percentile. */
export function p75Of(aggs: Aggregate[], area: string, metric: Metric, device = "*", route = "*"): Reading {
  const a = findAggregate(aggs, area, metric, device, route)
  if (!a || a.p75 === null || !Number.isFinite(a.p75)) return { ...NOTHING, base: a?.samples ?? 0, need: MIN_SAMPLES }
  return { value: a.p75, base: a.samples, enough: a.samples >= MIN_SAMPLES, need: MIN_SAMPLES }
}

/** JavaScript errors per 100 page views in an area. */
export function errorsPer100(aggs: Aggregate[], area: string): Reading {
  const views = findAggregate(aggs, area, "view")?.samples ?? 0
  const errors = findAggregate(aggs, area, "js_error")?.samples ?? 0
  if (views === 0) return { ...NOTHING, need: MIN_RATE_BASE }
  return { value: Math.round((errors / views) * 10_000) / 100, base: views, enough: views >= MIN_RATE_BASE, need: MIN_RATE_BASE }
}

/** Share of timed answers (an API route's, or a scheduled job's run) that were server errors, in percent. */
export function apiErrorShare(aggs: Aggregate[], area: string, metric: "api" | "job" = "api"): Reading {
  const a = findAggregate(aggs, area, metric)
  if (!a || a.samples === 0) return { ...NOTHING, need: MIN_RATE_BASE }
  return { value: Math.round((a.bad / a.samples) * 10_000) / 100, base: a.samples, enough: a.samples >= MIN_RATE_BASE, need: MIN_RATE_BASE }
}

/** Share of a flow step's attempts that failed, in percent: fails against fails and finished ones. */
export function stepFailShare(aggs: Aggregate[], route: StepRoute): Reading {
  const area = STEPS[route].area
  const fails = findAggregate(aggs, area, "fail", "*", route)?.samples ?? 0
  const done = findAggregate(aggs, area, "step", "*", route)?.samples ?? 0
  const base = fails + done
  if (base === 0) return { ...NOTHING, need: MIN_RATE_BASE }
  return { value: Math.round((fails / base) * 10_000) / 100, base, enough: base >= MIN_RATE_BASE, need: MIN_RATE_BASE }
}

/** The fewest a provisional figure stands on: a quarter of what rule 3 asks, and never none. */
export function provisionalFloor(need: number): number {
  return Math.max(1, Math.ceil(need * PROVISIONAL_SHARE))
}

/** How sure a figure is, from what it stands on against what rule 3 asks; null under the provisional floor. */
export function confidenceOf(base: number, need: number): Confidence | null {
  if (base >= need) return "high"
  if (base >= need / 2) return "medium"
  if (base >= provisionalFloor(need)) return "low"
  return null
}

/* ── The measurements ──────────────────────────────────────────────────── */

/**
 * The good and poor lines of every timed metric. LCP, INP, CLS, FCP and TTFB
 * are Google's (web.dev); the time from a tap to the next screen and the API
 * answer time are Storelib's own.
 */
export const METRIC_LINES: Record<"lcp" | "inp" | "cls" | "fcp" | "ttfb" | "nav" | "api", { label: string; short: string; unit: Unit; good: number; poor: number; lines: "google" | "storelib" }> = {
  lcp: { label: "Loading (LCP)", short: "LCP", unit: "ms", good: 2500, poor: 4000, lines: "google" },
  inp: { label: "Responsiveness (INP)", short: "INP", unit: "ms", good: 200, poor: 500, lines: "google" },
  cls: { label: "Layout shift (CLS)", short: "CLS", unit: "cls", good: 0.1, poor: 0.25, lines: "google" },
  fcp: { label: "First paint (FCP)", short: "FCP", unit: "ms", good: 1800, poor: 3000, lines: "google" },
  ttfb: { label: "Server response (TTFB)", short: "TTFB", unit: "ms", good: 800, poor: 1800, lines: "google" },
  nav: { label: "Tap to next screen", short: "Tap", unit: "ms", good: 400, poor: 1000, lines: "storelib" },
  api: { label: "API answer time", short: "API", unit: "ms", good: 300, poor: 1000, lines: "storelib" },
}

type VitalKind = "lcp" | "inp" | "cls" | "nav" | "fcp" | "ttfb"

const VITAL = METRIC_LINES

function vital(kind: VitalKind, area: string, where: string, device = "*"): MeasureDef {
  const v = VITAL[kind]
  return {
    key: `${area}.${device}.${kind}`,
    label: v.label,
    source: `${where}, 75th percentile`,
    unit: v.unit,
    good: v.good,
    poor: v.poor,
    lines: v.lines,
    read: (aggs) => p75Of(aggs, area, kind, device),
  }
}

function jsErrors(area: string, where: string): MeasureDef {
  return {
    key: `${area}.js_errors`,
    label: "JavaScript errors",
    source: `${where}, errors per 100 page views`,
    unit: "per100",
    good: 1,
    poor: 5,
    lines: "storelib",
    read: (aggs) => errorsPer100(aggs, area),
  }
}

const API_P75: MeasureDef = {
  key: "api.p75",
  label: METRIC_LINES.api.label,
  source: "Timed API routes, 75th percentile",
  unit: "ms",
  good: METRIC_LINES.api.good,
  poor: METRIC_LINES.api.poor,
  lines: "storelib",
  read: (aggs) => p75Of(aggs, "*", "api"),
}

const API_ERRORS: MeasureDef = {
  key: "api.errors",
  label: "API server errors",
  source: "Timed API routes, share answered with a 5xx",
  unit: "pct",
  good: 0.5,
  poor: 2,
  lines: "storelib",
  read: (aggs) => apiErrorShare(aggs, "*"),
}

const SLOW_STATEMENTS: MeasureDef = {
  key: "db.slow",
  label: "Slow database statements",
  source: `Statements averaging ${SLOW_STATEMENT_MS} ms or more over ${SLOW_STATEMENT_CALLS}+ calls (pg_stat_statements)`,
  unit: "count",
  good: 0,
  poor: 5,
  lines: "storelib",
  read: (_a, x) => (x.slowStatements === null ? NOTHING : { value: x.slowStatements, base: 1, enough: true }),
}

const CHECKOUT_API_ERRORS: MeasureDef = {
  key: "checkout.api_errors",
  label: "Checkout server errors",
  source: "Checkout API routes, share answered with a 5xx",
  unit: "pct",
  good: 0.5,
  poor: 2,
  lines: "storelib",
  read: (aggs) => apiErrorShare(aggs, "checkout"),
}

/** Orders needed before a failure share is read. */
export const MIN_ORDERS = 20

const PAYMENT_FAILURES: MeasureDef = {
  key: "checkout.payments",
  label: "Failed payments",
  source: "Orders, failed against completed",
  unit: "pct",
  good: 5,
  poor: 15,
  lines: "storelib",
  read: (_a, x) => {
    if (!x.payments) return NOTHING
    const total = x.payments.failed + x.payments.completed
    if (total === 0) return NOTHING
    return { value: Math.round((x.payments.failed / total) * 10_000) / 100, base: total, enough: total >= MIN_ORDERS, need: MIN_ORDERS }
  },
}

const JOBS_LATE: MeasureDef = {
  key: "infra.jobs",
  label: "Scheduled jobs late",
  source: "Scheduled jobs whose traces can be read",
  unit: "count",
  good: 0,
  poor: 2,
  lines: "storelib",
  read: (_a, x) => (!x.jobs || x.jobs.known === 0 ? NOTHING : { value: x.jobs.late, base: x.jobs.known, enough: true }),
}

const SUPABASE_DOWN: MeasureDef = {
  key: "infra.supabase",
  label: "Supabase services down",
  source: "Supabase health, needs SUPABASE_ACCESS_TOKEN",
  unit: "count",
  good: 0,
  poor: 1,
  lines: "storelib",
  read: (_a, x) => (x.supabaseDown === null ? NOTHING : { value: x.supabaseDown, base: 1, enough: true }),
}

const DEPLOYS_FAILED: MeasureDef = {
  key: "infra.deploys",
  label: "Failed deployments",
  source: "Vercel production deployments, needs VERCEL_API_TOKEN",
  unit: "pct",
  good: 10,
  poor: 30,
  lines: "storelib",
  read: (_a, x) => {
    if (!x.deployments || x.deployments.total === 0) return NOTHING
    return { value: Math.round((x.deployments.failed / x.deployments.total) * 1000) / 10, base: x.deployments.total, enough: x.deployments.total >= 3, need: 3 }
  },
}

/** A flow step's time (lib/perf/mark.ts), 75th percentile; the lines are Storelib's own, in STEPS. */
function stepTime(route: StepRoute): MeasureDef {
  const st = STEPS[route]
  return {
    key: `step.${route.slice("/step/".length).replace(/\//g, ".")}`,
    label: st.label,
    source: `Timed in the browser, 75th percentile`,
    unit: "ms",
    good: st.good,
    poor: st.poor,
    lines: "storelib",
    read: (aggs) => p75Of(aggs, st.area, "step", "*", route),
  }
}

/** A flow step's failures, as a share of its attempts. */
function stepFails(route: StepRoute, label: string): MeasureDef {
  return {
    key: `fail.${route.slice("/step/".length).replace(/\//g, ".")}`,
    label,
    source: "Timed in the browser, share of attempts that failed",
    unit: "pct",
    good: 1,
    poor: 5,
    lines: "storelib",
    read: (aggs) => stepFailShare(aggs, route),
  }
}

const WEBHOOK_P75: MeasureDef = {
  key: "infra.webhooks",
  label: "Webhook answer time",
  source: "Stripe, Mailgun and Airwallex webhooks, timed on the server, 75th percentile",
  unit: "ms",
  good: METRIC_LINES.api.good,
  poor: METRIC_LINES.api.poor,
  lines: "storelib",
  read: (aggs) => p75Of(aggs, "infra", "api"),
}

const JOB_FAILURES: MeasureDef = {
  key: "infra.job_failures",
  label: "Scheduled job failures",
  source: "Every scheduled job run, share that answered with a 5xx",
  unit: "pct",
  good: 1,
  poor: 5,
  lines: "storelib",
  read: (aggs) => apiErrorShare(aggs, "infra", "job"),
}

/* ── Rule 4 and 5: the sub scores and their weights ────────────────────── */

export const SUB_SCORES: SubScoreDef[] = [
  {
    id: "app",
    label: "Dashboard and navigation",
    weight: 1.5,
    measures: [vital("lcp", "app", "Dashboard"), vital("inp", "app", "Dashboard"), vital("cls", "app", "Dashboard"), vital("nav", "app", "Dashboard"), jsErrors("app", "Dashboard")],
  },
  {
    id: "storefront",
    label: "Public websites and storefronts",
    weight: 2,
    measures: [
      vital("lcp", "sites", "Published websites"),
      vital("inp", "sites", "Published websites"),
      vital("cls", "sites", "Published websites"),
      vital("lcp", "product", "Product pages"),
      vital("inp", "product", "Product pages"),
      vital("cls", "product", "Product pages"),
    ],
  },
  {
    id: "explore",
    label: "Explore",
    weight: 1,
    measures: [vital("lcp", "explore", "Explore"), vital("inp", "explore", "Explore"), vital("cls", "explore", "Explore"), vital("nav", "explore", "Explore"), jsErrors("explore", "Explore")],
  },
  {
    id: "community",
    label: "Communities and creator pages",
    weight: 1,
    measures: [
      vital("lcp", "community", "Communities"),
      vital("inp", "community", "Communities"),
      vital("cls", "community", "Communities"),
      vital("nav", "community", "Communities"),
      jsErrors("community", "Communities"),
      vital("lcp", "creator", "Creator pages"),
      vital("inp", "creator", "Creator pages"),
      vital("cls", "creator", "Creator pages"),
    ],
  },
  {
    id: "builder",
    label: "Website builder",
    weight: 1,
    measures: [
      vital("lcp", "builder", "Website builder"),
      vital("inp", "builder", "Website builder"),
      vital("cls", "builder", "Website builder"),
      vital("nav", "builder", "Website builder"),
      jsErrors("builder", "Website builder"),
      stepTime("/step/editor/open"),
      stepTime("/step/editor/canvas"),
      stepTime("/step/editor/save"),
      stepFails("/step/editor/save", "Saves that failed"),
    ],
  },
  { id: "database", label: "Database and API", weight: 1.5, measures: [API_P75, API_ERRORS, SLOW_STATEMENTS] },
  {
    id: "checkout",
    label: "Checkout reliability",
    weight: 2,
    measures: [
      CHECKOUT_API_ERRORS,
      PAYMENT_FAILURES,
      jsErrors("checkout", "Checkout pages"),
      stepTime("/step/checkout/ready"),
      stepFails("/step/checkout/ready", "Payment form failed to load"),
      stepTime("/step/checkout/intent"),
      stepFails("/step/checkout/intent", "Payment start failures"),
      stepFails("/step/checkout/confirm", "Payment confirm errors (not declines)"),
    ],
  },
  { id: "infra", label: "Infrastructure", weight: 0.5, measures: [JOBS_LATE, SUPABASE_DOWN, DEPLOYS_FAILED, JOB_FAILURES, WEBHOOK_P75] },
  {
    id: "mobile",
    label: "Mobile",
    weight: 1,
    measures: [
      vital("lcp", "*", "Phones and tablets, all of Storelib", "mobile"),
      vital("inp", "*", "Phones and tablets, all of Storelib", "mobile"),
      vital("cls", "*", "Phones and tablets, all of Storelib", "mobile"),
      vital("nav", "*", "Phones and tablets, all of Storelib", "mobile"),
      vital("lcp", "sites", "Phones on published websites", "mobile"),
      /* Measured on every phone, Safari and the iOS app included, which report no CLS and (before Safari 26.2) no LCP or INP. */
      vital("fcp", "*", "Phones and tablets, all of Storelib", "mobile"),
      vital("ttfb", "*", "Phones and tablets, all of Storelib", "mobile"),
    ],
  },
]

/** A sub score needs this many of its measurements to count (rule 4). */
export const MIN_MEASURES = 2
/** The Health Index needs this many sub scores (rule 5). */
export const MIN_SUB_SCORES = 3

export interface MeasureResult {
  key: string
  label: string
  source: string
  unit: Unit
  good: number
  poor: number
  value: number | null
  base: number
  /** What rule 3 asks. */
  need: number
  enough: boolean
  /** The official score (rule 3 met), else null. */
  score: number | null
  rating: Rating | null
  /** Rule 6: the score shown when the official one is missing; equal to it when there is one. */
  pscore: number | null
  confidence: Confidence | null
}

/** Rule 6: an average over what has at least a provisional score, and how sure it is. */
export interface Provisional {
  score: number
  used: number
  confidence: Confidence
}

export interface SubScoreResult {
  id: string
  label: string
  weight: number
  score: number | null
  /** Measurements that had enough data. */
  used: number
  /** Null when not one measurement reaches the provisional floor. */
  provisional: Provisional | null
  measures: MeasureResult[]
}

export interface HealthResult {
  score: number | null
  /** Sub scores that had a score. */
  used: number
  /** Null when not one sub score has even a provisional score. */
  provisional: Provisional | null
  subs: SubScoreResult[]
}

const SURE: Confidence[] = ["low", "medium", "high"]
const leastSure = (list: Confidence[]): Confidence => SURE[Math.min(...list.map((c) => SURE.indexOf(c)))]

export function scoreMeasure(def: MeasureDef, aggs: Aggregate[], extras: Extras): MeasureResult {
  const r = def.read(aggs, extras)
  const need = r.need ?? 1
  const finite = r.value !== null && Number.isFinite(r.value)
  const counts = r.enough && finite
  /* Rule 6: a reading that meets rule 3 is high; one under it, as sure as its base allows. */
  const confidence = !finite ? null : counts ? "high" : confidenceOf(r.base, need)
  const pscore = confidence ? measureScore(r.value as number, def.good, def.poor) : null
  return {
    key: def.key,
    label: def.label,
    source: def.source,
    unit: def.unit,
    good: def.good,
    poor: def.poor,
    value: r.value,
    base: r.base,
    need,
    enough: counts,
    score: counts ? measureScore(r.value as number, def.good, def.poor) : null,
    rating: counts ? rateValue(r.value as number, def.good, def.poor) : null,
    pscore,
    confidence: counts ? "high" : confidence === "high" ? "medium" : confidence,
  }
}

export function scoreSub(def: SubScoreDef, aggs: Aggregate[], extras: Extras): SubScoreResult {
  const measures = def.measures.map((m) => scoreMeasure(m, aggs, extras))
  const counted = measures.filter((m) => m.score !== null)
  const needed = Math.min(MIN_MEASURES, def.measures.length)
  const score = counted.length >= needed ? Math.round(counted.reduce((s, m) => s + (m.score as number), 0) / counted.length) : null
  /* Rule 6. With an official score, that is the provisional one too, and as sure as it gets. */
  const rough = measures.filter((m) => m.pscore !== null)
  const provisional: Provisional | null =
    score !== null
      ? { score, used: counted.length, confidence: "high" }
      : rough.length
        ? {
            score: Math.round(rough.reduce((s, m) => s + (m.pscore as number), 0) / rough.length),
            used: rough.length,
            confidence: rough.length < needed ? "low" : leastSure(rough.map((m) => m.confidence as Confidence)),
          }
        : null
  return { id: def.id, label: def.label, weight: def.weight, score, used: counted.length, provisional, measures }
}

export function healthIndex(aggs: Aggregate[], extras: Extras = NO_EXTRAS, defs: SubScoreDef[] = SUB_SCORES): HealthResult {
  const subs = defs.map((d) => scoreSub(d, aggs, extras))
  const scored = subs.filter((s) => s.score !== null)
  const rough = subs.filter((s) => s.provisional !== null)
  const weighted = (list: SubScoreResult[], pick: (s: SubScoreResult) => number) =>
    Math.round(list.reduce((sum, x) => sum + pick(x) * x.weight, 0) / list.reduce((sum, x) => sum + x.weight, 0))
  const score = scored.length >= MIN_SUB_SCORES ? weighted(scored, (x) => x.score as number) : null
  const provisional: Provisional | null =
    score !== null
      ? { score, used: scored.length, confidence: "high" }
      : rough.length
        ? {
            score: weighted(rough, (x) => (x.provisional as Provisional).score),
            used: rough.length,
            confidence: rough.length < MIN_SUB_SCORES ? "low" : leastSure(rough.map((x) => (x.provisional as Provisional).confidence)),
          }
        : null
  return { score, used: scored.length, provisional, subs }
}

/** The words beside a score. */
export function scoreBand(score: number): Rating {
  if (score >= 90) return "good"
  if (score >= 50) return "needs-improvement"
  return "poor"
}

/* ── Formatting, shared by the page and the problems list ──────────────── */

export function formatValue(unit: Unit, value: number): string {
  switch (unit) {
    case "ms":
      return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} s` : `${Math.round(value)} ms`
    case "cls":
      return value > 0 && value < 0.01 ? "<0.01" : value.toFixed(2)
    case "pct":
      return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`
    case "per100":
      return value.toFixed(1)
    case "count":
      return String(Math.round(value))
  }
}
