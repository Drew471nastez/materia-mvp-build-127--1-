/**
 * ===========================================================================
 *  A COMMUNITY'S ANALYTICS ANSWERS, KEPT PER PERIOD AND ASKED ONCE
 * ===========================================================================
 * Browser only. What components/community/creator/analytics-section.tsx
 * reads app/api/app/community/<id>/analytics through, on the rules /app
 * Analytics keeps its own answers by (lib/analytics/report-cache):
 *
 *   THE QUESTION IS THE PERIOD. A period that runs to now ends at a new
 *   instant every time it is asked, so the instants are not the question:
 *   the community, the zone and the period's days are ("last_7_days
 *   2026-10-09 2026-10-15 in Europe/Bucharest"). The minute's refresh is the
 *   same question again, and a return to a period finds its answer.
 *
 *   KEPT. Every answer, with the instants it was counted for, in memory and
 *   in this browser's storage for KEEP_MS. Drawn on the first frame of a
 *   return; under FRESH_MS old it is the answer and nothing is asked.
 *
 *   ASKED ONCE. A request on its way for the same question is joined, not
 *   repeated. One nobody waits for any more (the period was changed again
 *   before it came) is dropped, unless it was asked ahead of time.
 */
import { boundsOf, compareBounds, compareRange, type CompareValue, type DateRange, type RangeValue } from "@/lib/date-range/range"
import type { Span } from "@/lib/analytics/buckets"
import { REPORT_VERSION, type CommunityReport } from "@/lib/communities/analytics-report"

/** How long a kept answer may be drawn while the section asks again. */
export const KEEP_MS = 30 * 60_000
/** How long a kept answer simply is the answer. */
export const FRESH_MS = 15_000
const STORE = "storelib.community.analytics.v1"
const MAX_KEPT = 16

export const PREVIOUS_PERIOD: CompareValue = { mode: "previous_period" }

/** One question: the period, its instants and the query that asks for them. */
export interface CommunityAsk {
  communityId: string
  /** The community, the zone and the period's days: the same for every minute of a running period. */
  question: string
  query: string
  span: Span
  period: RangeValue
  /** The days it is compared with, or null for All time. */
  compared: DateRange | null
}

/** An answer as the section draws it: the report and the period it was counted for. */
export interface ShownReport {
  question: string
  report: CommunityReport
  span: Span
  period: RangeValue
  compared: DateRange | null
  /** When it was received (ms). */
  at: number
}

/** The question for a period, in the viewer's zone, at `now` (rounded by the caller: lib/analytics/report-cache reportNow). */
export function communityAsk(communityId: string, period: RangeValue, timeZone: string, now: number): CommunityAsk {
  const b = boundsOf(period, timeZone, now)
  const span = { start: b.start, end: Math.max(b.end, b.start + 1) }
  const allTime = period.preset === "all_time"
  const against = allTime ? null : compareBounds(period, PREVIOUS_PERIOD, timeZone, now)
  const p = new URLSearchParams({ start: new Date(span.start).toISOString(), end: new Date(span.end).toISOString(), tz: timeZone })
  if (against) {
    p.set("cstart", new Date(against.start).toISOString())
    p.set("cend", new Date(against.end).toISOString())
  }
  return {
    communityId,
    question: `${communityId}|${timeZone}|${period.preset}|${period.start}|${period.end}`,
    query: p.toString(),
    span,
    period: { start: period.start, end: period.end, preset: period.preset },
    compared: allTime ? null : compareRange(period, PREVIOUS_PERIOD),
  }
}

/* ─── Kept answers ─────────────────────────────────────────────────────── */

let memory: Map<string, ShownReport> | null = null

function readStore(storage: Storage | undefined): ShownReport[] {
  try {
    const xs = storage ? (JSON.parse(storage.getItem(STORE) || "[]") as ShownReport[]) : []
    return Array.isArray(xs) ? xs : []
  } catch {
    return []
  }
}

function kept(): Map<string, ShownReport> {
  if (memory) return memory
  memory = new Map()
  const local = typeof localStorage === "undefined" ? undefined : localStorage
  const session = typeof sessionStorage === "undefined" ? undefined : sessionStorage
  try {
    for (const k of [...readStore(local), ...readStore(session)].sort((a, b) => (a?.at ?? 0) - (b?.at ?? 0))) {
      if (k && typeof k.question === "string" && k.report?.version === REPORT_VERSION && Date.now() - k.at < KEEP_MS) memory.set(k.question, k)
    }
  } catch {
    /* storage closed: the section asks as it always did */
  }
  return memory
}

/** The last answer to this question, if it is recent enough to draw. */
export function keptCommunityReport(question: string): ShownReport | null {
  const k = kept().get(question)
  return k && Date.now() - k.at < KEEP_MS ? k : null
}

function keep(s: ShownReport) {
  const all = kept()
  all.delete(s.question)
  all.set(s.question, s)
  while (all.size > MAX_KEPT) all.delete(all.keys().next().value as string)
  const saved = JSON.stringify([...all.values()])
  for (const storage of ["sessionStorage", "localStorage"] as const) {
    try {
      window[storage].setItem(STORE, saved)
    } catch {
      /* full or closed: memory has it for this visit */
    }
  }
}

/** Forget every kept answer (the probe and the tests start clean). */
export function resetCommunityReports() {
  memory = new Map()
  flights.clear()
}

/** Whether two answers say the same: everything but when they were counted. */
export function sameReport(a: CommunityReport, b: CommunityReport): boolean {
  return JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 })
}

/* ─── Asking ───────────────────────────────────────────────────────────── */

interface Flight {
  promise: Promise<ShownReport>
  ctrl: AbortController
  holders: number
  /** Asked ahead of time: kept going when nobody waits for it, so the choice it was asked for finds it. */
  ahead: boolean
  done: boolean
}
const flights = new Map<string, Flight>()

function fly(ask: CommunityAsk, ahead: boolean): Flight {
  const on = flights.get(ask.question)
  if (on) {
    if (ahead) on.ahead = true
    return on
  }
  const ctrl = new AbortController()
  const flight: Flight = { promise: Promise.resolve(null as unknown as ShownReport), ctrl, holders: 0, ahead, done: false }
  flight.promise = fetch(`/api/app/community/${ask.communityId}/analytics?${ask.query}`, { signal: ctrl.signal, headers: { Accept: "application/json" } })
    .then(async (res) => {
      const body = (await res.json().catch(() => null)) as CommunityReport | null
      if (!res.ok || !body || body.version !== REPORT_VERSION) throw new Error("bad answer")
      const shown: ShownReport = { question: ask.question, report: body, span: ask.span, period: ask.period, compared: ask.compared, at: Date.now() }
      keep(shown)
      return shown
    })
    .finally(() => {
      flight.done = true
      if (flights.get(ask.question) === flight) flights.delete(ask.question)
    })
  /* Nobody may be listening to a request asked ahead: its failure is not an error anybody sees. */
  flight.promise.catch(() => {})
  flights.set(ask.question, flight)
  return flight
}

/**
 * The answer to `ask`, joining one already on its way. `release` says the
 * caller no longer wants it: when nobody does and it was not asked ahead,
 * the request is dropped.
 */
export function askCommunityReport(ask: CommunityAsk): { promise: Promise<ShownReport>; release: () => void } {
  const flight = fly(ask, false)
  flight.holders++
  let released = false
  return {
    promise: flight.promise,
    release: () => {
      if (released) return
      released = true
      flight.holders--
      if (flight.holders <= 0 && !flight.ahead && !flight.done) {
        flight.ctrl.abort()
        if (flights.get(ask.question) === flight) flights.delete(ask.question)
      }
    },
  }
}

/** Ask ahead for a period that has no recent answer kept and none on its way. */
export function warmCommunityReport(ask: CommunityAsk): boolean {
  const k = keptCommunityReport(ask.question)
  if ((k && Date.now() - k.at < FRESH_MS * 4) || flights.has(ask.question)) return false
  fly(ask, true)
  return true
}
