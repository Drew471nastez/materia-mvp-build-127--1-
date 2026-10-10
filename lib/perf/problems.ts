/**
 * ===========================================================================
 *  WHAT IS WRONG, IN THE ORDER IT HURTS PEOPLE
 * ===========================================================================
 * The problems list on /admin/performance, ranked by user impact:
 *
 *   impact = how many sampled page views or API calls it touched
 *            x how bad it was for them (0 to 1)
 *
 * "How bad" is one minus the measurement's score under the Health Index's
 * own rule (lib/perf/scoring.ts): a route whose 75th percentile sits on the
 * poor line is 0.5, one at twice the poor line is 1. A JavaScript error or a
 * server error is 1 for every time it happened. So a page that is slightly
 * slow for thousands of people ranks above one that is very slow for three,
 * and a crash that keeps happening ranks above both.
 *
 * Only routes with enough samples (MIN_SAMPLES) are judged, so a route with
 * two slow visits is not a problem yet. Slow database statements are listed
 * under Database instead: their counts come from the database's own
 * statistics, not from samples of people, and are not comparable.
 *
 * Pure. tests/perf-health18.test.ts holds the ranking.
 */

import { AREA_LABEL, MIN_SAMPLES, type Area } from "./config"
import { METRIC_LINES, formatValue, measureScore, type Aggregate, type Unit } from "./scoring"

export interface ErrorGroupRow {
  detail: string
  area: string
  route: string
  n: number
  lastAt: string | null
}

export interface Problem {
  id: string
  kind: "slow" | "js-error" | "api-error"
  title: string
  where: string
  /** The measurement, already formatted: "3.4 s at the 75th percentile". */
  measured: string
  /** Sampled page views or calls it touched. */
  samples: number
  /** 0 to 1. */
  severity: number
  impact: number
}

const SLOW: Record<string, { title: string; unit: Unit; good: number; poor: number }> = {
  lcp: { title: "Slow to load", ...METRIC_LINES.lcp },
  inp: { title: "Slow to answer a tap", ...METRIC_LINES.inp },
  cls: { title: "Moves while loading", ...METRIC_LINES.cls },
  nav: { title: "Slow to open from a tap", ...METRIC_LINES.nav },
  api: { title: "Slow API route", ...METRIC_LINES.api },
}

export function whereOf(area: string, route: string): string {
  const label = AREA_LABEL[area as Area] ?? area
  return route && route !== "*" ? `${label}, ${route}` : label
}

export function rankProblems(aggs: Aggregate[], errors: ErrorGroupRow[] | null, limit = 12): Problem[] {
  const out: Problem[] = []
  for (const a of aggs) {
    if (a.route === "*" || a.device !== "*" || a.area === "*") continue
    const rule = SLOW[a.metric]
    if (rule && a.samples >= MIN_SAMPLES && a.p75 !== null && a.p75 > rule.good) {
      const severity = 1 - measureScore(a.p75, rule.good, rule.poor) / 100
      out.push({
        id: `slow:${a.area}:${a.route}:${a.metric}`,
        kind: "slow",
        title: rule.title,
        where: whereOf(a.area, a.route),
        measured: `${formatValue(rule.unit, a.p75)} at the 75th percentile`,
        samples: a.samples,
        severity: Math.round(severity * 100) / 100,
        impact: Math.round(severity * a.samples * 100) / 100,
      })
    }
    if (a.metric === "api" && a.bad > 0) {
      out.push({
        id: `api-error:${a.area}:${a.route}`,
        kind: "api-error",
        title: "API route failing",
        where: whereOf(a.area, a.route),
        measured: `${a.bad} of ${a.samples} timed calls answered with a server error`,
        samples: a.bad,
        severity: 1,
        impact: a.bad,
      })
    }
  }
  for (const e of errors ?? []) {
    if (!e.n) continue
    out.push({
      id: `js-error:${e.area}:${e.route}:${e.detail}`,
      kind: "js-error",
      title: "JavaScript error",
      where: whereOf(e.area, e.route),
      measured: e.detail,
      samples: e.n,
      severity: 1,
      impact: e.n,
    })
  }
  return out.sort((x, y) => y.impact - x.impact || y.samples - x.samples || x.id.localeCompare(y.id)).slice(0, limit)
}
