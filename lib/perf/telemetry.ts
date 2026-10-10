/**
 * ===========================================================================
 *  WHAT A BEACON MAY SAY, CHECKED BEFORE ANYTHING IS KEPT
 * ===========================================================================
 * The beacon is public (visitors have no session), so its body is treated as
 * a stranger's: every item is checked against a short list of metrics,
 * areas and route patterns, numbers are clamped to what a browser can
 * honestly measure, and anything else in the body is never read.
 *
 * WHAT IS KEPT: the area, the route pattern, phone or computer (decided on
 * the server from the user agent, which is then dropped), the metric and its
 * number, and for a JavaScript error its message with addresses, ids and
 * numbers taken out. No address, no cookie, no user, no query string.
 *
 * Pure. app/api/perf/beacon uses it; tests/perf-health18.test.ts holds it.
 */

import {
  AREAS,
  CLIENT_METRICS,
  MAX_BATCH,
  MAX_ERRORS_PER_PAGE,
  ROUTE_PATTERN,
  type Area,
  type ClientMetric,
  type Device,
  type Metric,
} from "./config"

/** A row as part 126's perf_ingest takes it. */
export interface PerfRow {
  a: string
  r: string
  d: Device
  m: Metric
  v: number
  s?: number | null
  x?: string | null
}

/** A minute is the most a page can honestly take for any of these. */
const MAX_MS = 60_000
const MAX_CLS = 10

const CLIENT_AREAS: readonly string[] = AREAS.filter((a) => a !== "sites")

/** Addresses, ids, long numbers and anything after a `?` taken out of an error message. */
export function maskDetail(message: string): string {
  return message
    .replace(/[\r\n\t]+/g, " ")
    .replace(/https?:\/\/[^\s"')]+/g, (u) => u.split(/[?#]/)[0])
    .replace(/[^\s@<>"',;]+@[^\s@<>"',;]+/g, "<email>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\b\d{4,}\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)
}

function cleanValue(metric: ClientMetric, raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null
  if (metric === "view" || metric === "js_error") return 1
  if (metric === "cls") return raw > MAX_CLS ? null : Math.round(raw * 10_000) / 10_000
  return raw > MAX_MS ? null : Math.round(raw)
}

/**
 * The beacon's items, checked. Each item is `[metric, area, route, value,
 * detail?]`. Items that fail a check are dropped one by one; a body that is
 * not the right shape at all is nothing.
 */
export function cleanBatch(raw: unknown, device: Device): PerfRow[] {
  if (!raw || typeof raw !== "object") return []
  const items = (raw as { i?: unknown }).i
  if (!Array.isArray(items)) return []
  const out: PerfRow[] = []
  let errors = 0
  for (const item of items.slice(0, MAX_BATCH)) {
    if (!Array.isArray(item)) continue
    const [m, a, r, v, x] = item as unknown[]
    if (typeof m !== "string" || !(CLIENT_METRICS as readonly string[]).includes(m)) continue
    if (typeof a !== "string" || !CLIENT_AREAS.includes(a)) continue
    if (typeof r !== "string" || !ROUTE_PATTERN.test(r)) continue
    const value = cleanValue(m as ClientMetric, v)
    if (value === null) continue
    if (m === "js_error") {
      if (errors >= MAX_ERRORS_PER_PAGE) continue
      const detail = typeof x === "string" ? maskDetail(x) : ""
      if (!detail) continue
      errors++
      out.push({ a, r, d: device, m: "js_error", v: 1, x: detail })
      continue
    }
    out.push({ a: a as Area, r, d: device, m: m as Metric, v: value })
  }
  return out
}

/** A server timing row, checked the same way (lib/perf/server-timing.ts). */
export function serverRow(area: Area, route: string, device: Device, ms: number, status: number): PerfRow | null {
  if (!(AREAS as readonly string[]).includes(area) || !ROUTE_PATTERN.test(route)) return null
  if (!Number.isFinite(ms) || ms < 0) return null
  return { a: area, r: route, d: device, m: "api", v: Math.min(Math.round(ms), 600_000), s: Math.max(0, Math.min(999, Math.trunc(status))) }
}
