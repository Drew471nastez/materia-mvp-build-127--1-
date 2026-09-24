/**
 * ===========================================================================
 *  HOW FAST A PUBLISHED WEBSITE FEELS TO THE PEOPLE WHO VISIT IT
 * ===========================================================================
 * Three numbers, the ones Google ranks pages by and reports in Search
 * Console, measured in the visitors' own browsers:
 *
 *   LCP  when the biggest thing on the first screen had been drawn
 *   INP  how long the page took to answer a tap, a click or a key
 *   CLS  how much the page jumped about while it was being read
 *
 * Each is reported as the 75th percentile of the page views measured: three
 * visits in four were at least that good. That is Google's own rule, and so
 * are the lines between Good, Needs improvement and Poor below.
 *
 * Pure: no DOM, no database. The collector on a published site
 * (components/website-builder/site-vitals.tsx) uses the two algorithms,
 * the ingest route (app/api/public/vitals) uses the cleaning, the website
 * page uses the ratings and the formatting, and tests/web-vitals.test.ts
 * holds all of it.
 */

export type VitalName = "lcp" | "inp" | "cls"
export type Rating = "good" | "needs-improvement" | "poor"
export type DeviceClass = "mobile" | "desktop"

export const VITALS: VitalName[] = ["lcp", "inp", "cls"]

/** Google's lines: at or under the first is Good, over the second is Poor. */
export const VITAL_THRESHOLDS: Record<VitalName, readonly [number, number]> = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
}

/**
 * Fewer page views than this and a 75th percentile is one or two visits
 * deciding the answer. The cell says there are too few instead of showing it.
 */
export const MIN_SAMPLES = 20

export const VITAL_LABEL: Record<VitalName, string> = {
  lcp: "Loading",
  inp: "Responsiveness",
  cls: "Layout shift",
}

export const VITAL_SHORT: Record<VitalName, string> = { lcp: "LCP", inp: "INP", cls: "CLS" }

export const VITAL_NAME: Record<VitalName, string> = {
  lcp: "Largest Contentful Paint",
  inp: "Interaction to Next Paint",
  cls: "Cumulative Layout Shift",
}

export const VITAL_DEFINITION: Record<VitalName, string> = {
  lcp: "How long until the biggest picture or block of text on the first screen has been drawn.",
  inp: "How long the page takes to show a response after a visitor taps, clicks or types.",
  cls: "How much the page moves under the visitor while it loads. 0 is perfectly still.",
}

export const RATING_LABEL: Record<Rating, string> = {
  good: "Good",
  "needs-improvement": "Needs improvement",
  poor: "Poor",
}

export function rate(name: VitalName, value: number): Rating {
  const [good, poor] = VITAL_THRESHOLDS[name]
  if (value <= good) return "good"
  if (value <= poor) return "needs-improvement"
  return "poor"
}

/** "2.1 s", "850 ms", "180 ms", "0.04". */
export function formatVital(name: VitalName, value: number): string {
  if (name === "cls") return value < 0.01 && value > 0 ? "<0.01" : value.toFixed(2)
  if (name === "lcp" && value >= 1000) return `${(value / 1000).toFixed(1)} s`
  return `${Math.round(value)} ms`
}

/** The threshold line as a person reads it: "2.5 s", "200 ms", "0.1". */
export function formatThreshold(name: VitalName, value: number): string {
  if (name === "cls") return String(value)
  if (name === "lcp") return `${value / 1000} s`
  return `${value} ms`
}

/**
 * The 75th percentile by nearest rank: a value somebody actually had, never
 * one interpolated between two visits. Null for no values.
 */
export function p75(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  return sorted[Math.max(0, Math.ceil(0.75 * sorted.length) - 1)]
}

/* ── The two algorithms the collector runs ─────────────────────────────── */

/**
 * CLS BY SESSION WINDOWS, as Chrome and web-vitals define it. Shifts less
 * than a second apart belong to one window, a window lasts at most five
 * seconds, and the page's CLS is its worst window. Shifts right after the
 * visitor's own input (`hadRecentInput`) are expected and are left out
 * before this is called.
 */
export function clsFromShifts(shifts: Array<{ value: number; startTime: number }>): number {
  let worst = 0
  let current = 0
  let first = 0
  let last = 0
  for (const s of shifts) {
    if (current > 0 && s.startTime - last < 1000 && s.startTime - first < 5000) {
      current += s.value
      last = s.startTime
    } else {
      current = s.value
      first = s.startTime
      last = s.startTime
    }
    if (current > worst) worst = current
  }
  return worst
}

/**
 * INP, THE STANDARD WAY. Every interaction is its longest event. The page's
 * INP is its slowest interaction, except that on a busy page one outlier per
 * fifty interactions is forgiven: the (n/50)th slowest, where n is how many
 * interactions the page had. Null when nobody interacted, which is a page
 * view with no INP rather than an INP of nothing.
 */
export function inpFromInteractions(latencies: number[], interactionCount: number): number | null {
  const sorted = latencies.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => b - a)
  if (sorted.length === 0) return null
  const count = Math.max(interactionCount, sorted.length)
  const index = Math.min(sorted.length - 1, Math.floor(count / 50))
  return sorted[index]
}

/* ── What arrives at the ingest route ──────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A minute is the most any of these can honestly be; past it is a broken clock. */
const MAX_MS = 60_000
const MAX_CLS = 10

export interface CleanBeacon {
  installId: string
  lcp: number | null
  inp: number | null
  cls: number | null
}

function ms(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_MS) return null
  return Math.round(v)
}

/**
 * The beacon, checked and clamped. Anything that is not a site id and at
 * least one believable number is nothing. Nothing else in the body is read,
 * so nothing else can be stored.
 */
export function cleanBeacon(raw: unknown): CleanBeacon | null {
  if (!raw || typeof raw !== "object") return null
  const b = raw as Record<string, unknown>
  const installId = typeof b.s === "string" && UUID.test(b.s) ? b.s.toLowerCase() : null
  if (!installId) return null
  const lcp = ms(b.lcp)
  const inp = ms(b.inp)
  const cls =
    typeof b.cls === "number" && Number.isFinite(b.cls) && b.cls >= 0 && b.cls <= MAX_CLS
      ? Math.round(b.cls * 10_000) / 10_000
      : null
  if (lcp === null && inp === null && cls === null) return null
  return { installId, lcp, inp, cls }
}

/** Phones and tablets are mobile, the way Search Console splits them. */
export function deviceClassOf(parsedDevice: string | null | undefined): DeviceClass {
  return parsedDevice === "mobile" || parsedDevice === "tablet" ? "mobile" : "desktop"
}

/* ── What the website page is handed ───────────────────────────────────── */

export interface VitalFigure {
  /** Null when there are fewer than MIN_SAMPLES page views to go on. */
  p75: number | null
  samples: number
}

export interface VitalReport {
  all: VitalFigure
  mobile: VitalFigure
  desktop: VitalFigure
}

export type VitalsState =
  /** The table is not there yet (the SQL has not been run). */
  | { kind: "unavailable" }
  | { kind: "ready"; metrics: Record<VitalName, VitalReport> }

export interface SummaryRow {
  metric: string
  device: string | null
  p75: number | null
  samples: number | null
}

/** The summary function's rows, as the cells read them. */
export function vitalsFromRows(rows: SummaryRow[]): Record<VitalName, VitalReport> {
  const empty = (): VitalFigure => ({ p75: null, samples: 0 })
  const out = {} as Record<VitalName, VitalReport>
  for (const v of VITALS) out[v] = { all: empty(), mobile: empty(), desktop: empty() }
  for (const r of rows) {
    if (!VITALS.includes(r.metric as VitalName)) continue
    const slot: keyof VitalReport = r.device === "mobile" ? "mobile" : r.device === "desktop" ? "desktop" : "all"
    const samples = Number(r.samples) || 0
    const value = typeof r.p75 === "number" ? r.p75 : r.p75 === null ? null : Number(r.p75)
    out[r.metric as VitalName][slot] = {
      samples,
      p75: samples >= MIN_SAMPLES && value !== null && Number.isFinite(value) ? value : null,
    }
  }
  return out
}
