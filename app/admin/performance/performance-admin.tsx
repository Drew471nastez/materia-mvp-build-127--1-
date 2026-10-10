"use client"

import * as React from "react"

import { AREA_LABEL, AREAS, MIN_RATE_BASE, MIN_SAMPLES, type Area } from "@/lib/perf/config"
import { WINDOWS, type PerfReport, type ScoreDay, type WindowId } from "@/lib/perf/report"
import {
  MIN_MEASURES,
  MIN_SUB_SCORES,
  METRIC_LINES,
  SUB_SCORES,
  errorsPer100,
  findAggregate,
  formatValue,
  rateValue,
  scoreBand,
  type Aggregate,
  type MeasureResult,
  type Rating,
  type SubScoreResult,
  type Unit,
} from "@/lib/perf/scoring"

import { ago, date, num } from "../_console/format"
import { Banner, Button, C, DataList, Filters, Panel, cx, type Column } from "../_console/ui"

/**
 * ===========================================================================
 *  PERFORMANCE AND HEALTH, FOR THE OWNER
 * ===========================================================================
 * Top to bottom, in the order the owner reads it:
 *
 *   1. The Health Index for the window (24 hours or 7 days), and the daily
 *      official score with its last 30 days.
 *   2. The sub scores, each opening onto the measurements behind it.
 *   3. Problems, by how many people they touched.
 *   4. The live figures: Web Vitals on phones and computers, each area, the
 *      timed API routes, JavaScript errors, checkout, the database, and the
 *      platforms when a token lets us ask.
 *   5. Optimizations shipped, with their before and after.
 *   6. How the score is worked out, printed from the rules the code runs.
 *
 * A figure with too few samples says "Insufficient data" where the number
 * would be. Nothing is drawn from a default or an estimate.
 */

const RATING_WORD: Record<Rating, string> = { good: "Good", "needs-improvement": "Needs work", poor: "Poor" }

function ratingColour(r: Rating | null): string {
  return r === "good" ? C.good : r === "needs-improvement" ? C.wait : r === "poor" ? C.bad : C.faint
}

function Dot({ rating }: { rating: Rating | null }) {
  return <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ratingColour(rating) }} />
}

function Insufficient({ note, className }: { note?: string; className?: string }) {
  return (
    <span className={cx("text-[13px] text-[#6b6b76]", className)} data-insufficient="">
      Insufficient data{note ? <span className="text-[#6b6b76]"> · {note}</span> : null}
    </span>
  )
}

const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`

/* ── One measured figure, or the honest absence of one ─────────────────── */

function Figure({ unit, value, samples, min, good, poor, compact }: { unit: Unit; value: number | null; samples: number; min: number; good: number; poor: number; compact?: boolean }) {
  if (value === null || samples < min) {
    return (
      <span className="block min-w-0" data-figure-empty="">
        <Insufficient />
        {!compact ? <span className="block text-[11px] tabular-nums text-[#6b6b76]">{samples ? `${num(samples)} of ${min} needed` : "nothing measured"}</span> : null}
      </span>
    )
  }
  const rating = rateValue(value, good, poor)
  return (
    <span className="block min-w-0" data-figure-value="">
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium tabular-nums text-[#ededf0]" title={RATING_WORD[rating]}>
        <Dot rating={rating} />
        {formatValue(unit, value)}
      </span>
      {!compact ? <span className="block text-[11px] tabular-nums text-[#6b6b76]">{plural(samples, "sample", "samples")}</span> : null}
    </span>
  )
}

function P75({ aggs, area, metric, device = "*", compact }: { aggs: Aggregate[]; area: string; metric: keyof typeof METRIC_LINES; device?: string; compact?: boolean }) {
  const a = findAggregate(aggs, area, metric, device)
  const l = METRIC_LINES[metric]
  return <Figure unit={l.unit} value={a?.p75 ?? null} samples={a?.samples ?? 0} min={MIN_SAMPLES} good={l.good} poor={l.poor} compact={compact} />
}

/* ── 1. The Health Index and the daily official score ──────────────────── */

function bandLabel(score: number) {
  const b = scoreBand(score)
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-[#c9c9d1]">
      <Dot rating={b} />
      {RATING_WORD[b]}
    </span>
  )
}

function lastDays(history: ScoreDay[], days: number, today: string): ScoreDay[] {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
  return history.filter((d) => d.day > from && d.day <= today)
}

function average(days: ScoreDay[]): { value: number; of: number } | null {
  const scored = days.filter((d) => d.score !== null)
  if (!scored.length) return null
  return { value: Math.round(scored.reduce((s, d) => s + (d.score as number), 0) / scored.length), of: scored.length }
}

function ScoreHistory({ history, today }: { history: ScoreDay[]; today: string }) {
  const slots = React.useMemo(() => {
    const byDay = new Map(history.map((d) => [d.day, d]))
    return Array.from({ length: 30 }, (_, i) => {
      const day = new Date(Date.parse(`${today}T00:00:00Z`) - (29 - i) * 86_400_000).toISOString().slice(0, 10)
      return { day, row: byDay.get(day) ?? null }
    })
  }, [history, today])
  const latest = [...slots].reverse().find((s) => s.row)?.day ?? null
  const [focus, setFocus] = React.useState<string | null>(null)
  const shown = slots.find((s) => s.day === (focus ?? latest)) ?? null
  const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

  return (
    <div data-score-history="">
      <div className="flex min-h-[20px] items-baseline justify-between gap-3">
        <p className="text-[12px] tabular-nums text-[#9b9ba6]">{shown ? label(shown.day) : "Last 30 days"}</p>
        <p className="text-[13px] font-medium text-[#ededf0]">
          {shown?.row ? shown.row.score === null ? <Insufficient /> : <span className="tabular-nums">{shown.row.score}</span> : shown ? <span className="text-[#6b6b76]">No score that day</span> : null}
        </p>
      </div>
      <div className="relative mt-2 h-[96px]" role="img" aria-label="Official daily Health Index, last 30 days" onMouseLeave={() => setFocus(null)}>
        {/* The good line (90) and the poor line (50), hairlines behind the columns. */}
        {[90, 50].map((y) => (
          <div key={y} aria-hidden className="absolute inset-x-0 border-t border-white/[0.06]" style={{ bottom: `${y}%` }}>
            <span className="absolute -top-[7px] right-0 bg-[#111116] pl-1 text-[10px] leading-none tabular-nums text-[#6b6b76]">{y}</span>
          </div>
        ))}
        <div className="absolute inset-0 right-5 flex items-end gap-[2px]">
          {slots.map((s) => {
            const score = s.row?.score ?? null
            const on = s.day === (focus ?? latest)
            return (
              <button
                key={s.day}
                type="button"
                onMouseEnter={() => setFocus(s.day)}
                onFocus={() => setFocus(s.day)}
                onTouchStart={() => setFocus(s.day)}
                aria-label={`${label(s.day)}: ${score !== null ? score : s.row ? "insufficient data" : "no score"}`}
                className="flex h-full min-w-0 flex-1 items-end justify-center outline-none focus-visible:bg-white/[0.04]"
              >
                <span
                  className="block w-full max-w-[24px] rounded-t-[4px]"
                  style={{
                    height: score !== null ? `${Math.max(2, score)}%` : "2px",
                    background: score !== null ? (on ? "#a78bfa" : C.accent) : on ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.1)",
                  }}
                />
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-1 flex justify-between pr-5 text-[10px] tabular-nums text-[#6b6b76]">
        <span>{label(slots[0].day)}</span>
        <span>{label(slots[slots.length - 1].day)}</span>
      </div>
      <details className="mt-2 text-[12px] text-[#9b9ba6]">
        <summary className="flex min-h-[40px] cursor-pointer select-none items-center hover:text-[#ededf0] sm:min-h-0 sm:py-1">Days as a list</summary>
        <ul className="mt-1 max-h-[180px] overflow-y-auto tabular-nums">
          {[...history].reverse().map((d) => (
            <li key={d.day} className="flex justify-between border-b border-white/[0.04] py-1">
              <span>{label(d.day)}</span>
              <span className="text-[#ededf0]">{d.score === null ? "Insufficient data" : d.score}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function HealthPanel({ report }: { report: PerfReport }) {
  const today = report.generatedAt.slice(0, 10)
  const history = report.history ?? []
  const official = [...history].reverse().find((d) => d.day < today) ?? null
  const week = average(lastDays(history, 7, today))
  const month = average(lastDays(history, 30, today))
  const windowLabel = WINDOWS.find((w) => w.id === report.window)?.label ?? ""
  const { health } = report

  return (
    <Panel title="Health Index" meta={windowLabel}>
      <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0 border-b border-white/[0.08] px-4 py-4 lg:border-b-0 lg:border-r" data-health-index="">
          {health.score !== null ? (
            <>
              <p className="text-[56px] font-semibold leading-[60px] tracking-[-0.03em] text-[#ededf0]" data-health-score="">
                {health.score}
                <span className="ml-1 text-[18px] font-normal tracking-normal text-[#6b6b76]">/ 100</span>
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {bandLabel(health.score)}
                <span className="text-[12px] text-[#6b6b76]">from {health.used} of {health.subs.length} sub scores</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-[28px] font-semibold leading-[60px] tracking-[-0.02em] text-[#9b9ba6]" data-health-score-empty="">
                Insufficient data
              </p>
              <p className="mt-1.5 text-[12px] leading-5 text-[#6b6b76]">
                {health.used} of {health.subs.length} sub scores have enough measurements; the index needs {MIN_SUB_SCORES}.
              </p>
            </>
          )}
          <dl className="mt-4 divide-y divide-white/[0.06] border-t border-white/[0.06] text-[13px]">
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-[#9b9ba6]">Official score{official ? `, ${date(official.day)}` : ""}</dt>
              <dd className="tabular-nums text-[#ededf0]">{official ? official.score === null ? <Insufficient /> : official.score : <span className="text-[#6b6b76]">None yet</span>}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-[#9b9ba6]">7 day average</dt>
              <dd className="tabular-nums text-[#ededf0]">{week ? <>{week.value} <span className="text-[12px] text-[#6b6b76]">over {plural(week.of, "day", "days")}</span></> : <Insufficient />}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-[#9b9ba6]">30 day average</dt>
              <dd className="tabular-nums text-[#ededf0]">{month ? <>{month.value} <span className="text-[12px] text-[#6b6b76]">over {plural(month.of, "day", "days")}</span></> : <Insufficient />}</dd>
            </div>
          </dl>
        </div>
        <div className="min-w-0 px-4 py-4">
          {report.history === null ? (
            <p className="text-[13px] text-[#9b9ba6]">The daily scores could not be read.</p>
          ) : history.length ? (
            <ScoreHistory history={history} today={today} />
          ) : (
            <div className="flex h-full min-h-[120px] flex-col justify-center" data-history-empty="">
              <p className="text-[13px] text-[#ededf0]">No official score yet</p>
              <p className="mt-1 max-w-[46ch] text-[12px] leading-5 text-[#9b9ba6]">The nightly job writes one for each day once part 126 has run, from that day&apos;s measurements. A day without enough of them is kept as insufficient data.</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

/* ── 2. Sub scores ─────────────────────────────────────────────────────── */

function Meter({ score }: { score: number }) {
  const b = scoreBand(score)
  return (
    <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, score)}%`, background: ratingColour(b) }} />
    </span>
  )
}

function MeasureRow({ m }: { m: MeasureResult }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_56px]" data-measure={m.key}>
      <div className="min-w-0">
        <p className="text-[13px] leading-[18px] text-[#ededf0]">{m.label}</p>
        <p className="text-[11px] leading-4 text-[#6b6b76]">{m.source}</p>
      </div>
      <div className="min-w-0 text-right sm:text-left">
        {m.enough && m.value !== null ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] tabular-nums text-[#ededf0]">
            <Dot rating={m.rating} />
            {formatValue(m.unit, m.value)}
          </span>
        ) : (
          <Insufficient />
        )}
        <p className="text-[11px] tabular-nums text-[#6b6b76]">
          good {formatValue(m.unit, m.good)}, poor past {formatValue(m.unit, m.poor)}
        </p>
      </div>
      <p className="hidden text-right text-[13px] tabular-nums text-[#c9c9d1] sm:block">{m.score ?? ""}</p>
    </li>
  )
}

function SubScores({ subs }: { subs: SubScoreResult[] }) {
  const [open, setOpen] = React.useState<string | null>(null)
  return (
    <Panel title="Sub scores" meta="Tap one for its measurements">
      <ul className="divide-y divide-white/[0.06]" data-sub-scores="">
        {subs.map((s) => {
          const needed = Math.min(MIN_MEASURES, s.measures.length)
          const isOpen = open === s.id
          return (
            <li key={s.id} data-sub={s.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : s.id)}
                className="grid min-h-[48px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-2.5 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.05] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_112px]"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] leading-[18px] text-[#ededf0]">{s.label}</span>
                  <span className="block text-[11px] tabular-nums text-[#6b6b76]">
                    {s.used} of {s.measures.length} measured{s.score === null ? `, needs ${needed}` : ""}
                  </span>
                </span>
                <span className="col-span-2 row-start-2 mt-1.5 block sm:col-span-1 sm:row-start-auto sm:mt-0">{s.score !== null ? <Meter score={s.score} /> : <span aria-hidden className="block h-1.5 w-full rounded-full bg-white/[0.04]" />}</span>
                <span className="text-right">
                  {s.score !== null ? <span className="text-[20px] font-semibold leading-6 text-[#ededf0]">{s.score}</span> : <span className="whitespace-nowrap text-[12px] leading-4 text-[#6b6b76]" data-insufficient="">Insufficient data</span>}
                </span>
              </button>
              {isOpen ? (
                <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06] bg-white/[0.015] px-4" data-sub-measures="">
                  {s.measures.map((m) => (
                    <MeasureRow key={m.key} m={m} />
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

/* ── 3. Problems ───────────────────────────────────────────────────────── */

function ProblemsPanel({ report }: { report: PerfReport }) {
  const kindWord = { slow: "Slow", "js-error": "Error", "api-error": "Failing" } as const
  return (
    <Panel title="Problems" meta="By how many people they touched">
      {!report.ready ? (
        <p className="px-4 py-6 text-[13px] text-[#6b6b76]"><Insufficient /></p>
      ) : report.problems.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-[#9b9ba6]" data-problems-empty="">Nothing is past its good line with enough samples to judge, and no errors were recorded.</p>
      ) : (
        <ol className="divide-y divide-white/[0.06]" data-problems="">
          {report.problems.map((p, i) => (
            <li key={p.id} className="grid grid-cols-[20px_minmax(0,1fr)_auto] gap-x-3 px-4 py-2.5">
              <span className="pt-px text-[12px] tabular-nums text-[#6b6b76]">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-[13px] text-[#ededf0]">
                  {p.title} <span className="text-[#9b9ba6]">· {p.where}</span>
                </p>
                <p className={cx("mt-0.5 text-[12px] leading-4 text-[#9b9ba6] [overflow-wrap:anywhere]", p.kind === "js-error" && "font-mono text-[11px]")}>{p.measured}</p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[#c9c9d1]">
                  <Dot rating={p.severity >= 0.5 ? "poor" : "needs-improvement"} />
                  {kindWord[p.kind]}
                </span>
                <p className="text-[11px] tabular-nums text-[#6b6b76]">{plural(p.samples, p.kind === "slow" ? "sample" : "time", p.kind === "slow" ? "samples" : "times")}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

/* ── 4. The live figures ───────────────────────────────────────────────── */

const DEVICE_ROWS: (keyof typeof METRIC_LINES)[] = ["lcp", "inp", "cls", "fcp", "ttfb", "nav"]

function VitalsPanel({ aggs }: { aggs: Aggregate[] }) {
  return (
    <Panel title="Speed on phones and computers" meta="75th percentile">
      <div role="table" aria-label="Speed on phones and computers" className="min-w-0" data-vitals-devices="">
        <div role="row" className="grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] gap-x-3 border-b border-white/[0.08] px-4 py-2 text-[12px] font-medium text-[#6b6b76]">
          <span role="columnheader">Measurement</span>
          <span role="columnheader">All</span>
          <span role="columnheader">Phones</span>
          <span role="columnheader">Computers</span>
        </div>
        {DEVICE_ROWS.map((m) => (
          <div role="row" key={m} className="grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] items-start gap-x-3 border-b border-white/[0.06] px-4 py-2 last:border-b-0">
            <span role="cell" className="min-w-0">
              <span className="block truncate text-[13px] text-[#ededf0]">
                <span className="sm:hidden">{METRIC_LINES[m].short}</span>
                <span className="hidden sm:inline">{METRIC_LINES[m].label}</span>
              </span>
              <span className="block text-[11px] tabular-nums text-[#6b6b76]">good {formatValue(METRIC_LINES[m].unit, METRIC_LINES[m].good)}</span>
            </span>
            {["*", "mobile", "desktop"].map((d) => (
              <span role="cell" key={d} className="min-w-0">
                <P75 aggs={aggs} area="*" metric={m} device={d} />
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] leading-5 text-[#6b6b76]">Published websites measure themselves separately and are in the next table.</p>
    </Panel>
  )
}

const AREA_COLUMNS: { key: "lcp" | "inp" | "cls" | "nav"; label: string }[] = [
  { key: "lcp", label: "LCP" },
  { key: "inp", label: "INP" },
  { key: "cls", label: "CLS" },
  { key: "nav", label: "Tap to next" },
]

function ErrorsCell({ aggs, area }: { aggs: Aggregate[]; area: string }) {
  const r = errorsPer100(aggs, area)
  if (area === "sites") return <span className="text-[13px] text-[#6b6b76]">Not measured</span>
  return <Figure unit="per100" value={r.value} samples={r.base} min={MIN_RATE_BASE} good={1} poor={5} compact />
}

function AreasPanel({ aggs }: { aggs: Aggregate[] }) {
  const views = (area: string) => {
    const n = findAggregate(aggs, area, "view")?.samples ?? 0
    return n ? plural(n, "page view", "page views") : "nothing measured"
  }
  return (
    <Panel title="Each part of Storelib" meta="75th percentile">
      {/* A desk: one row per area. */}
      <div role="table" aria-label="Each part of Storelib" className="hidden min-w-0 lg:block" data-vitals-areas="">
        <div role="row" className="grid grid-cols-[minmax(0,1.3fr)_repeat(5,minmax(0,1fr))] gap-x-3 border-b border-white/[0.08] px-4 py-2 text-[12px] font-medium text-[#6b6b76]">
          <span role="columnheader">Area</span>
          {AREA_COLUMNS.map((c) => (
            <span role="columnheader" key={c.key}>{c.label}</span>
          ))}
          <span role="columnheader">Errors per 100</span>
        </div>
        {AREAS.map((a) => (
          <div role="row" key={a} className="grid grid-cols-[minmax(0,1.3fr)_repeat(5,minmax(0,1fr))] items-start gap-x-3 border-b border-white/[0.06] px-4 py-2 last:border-b-0">
            <span role="cell" className="min-w-0">
              <span className="block truncate text-[13px] text-[#ededf0]">{AREA_LABEL[a]}</span>
              <span className="block text-[11px] tabular-nums text-[#6b6b76]">{a === "sites" ? "their own collector" : views(a)}</span>
            </span>
            {AREA_COLUMNS.map((c) => (
              <span role="cell" key={c.key} className="min-w-0">
                {a === "sites" && c.key === "nav" ? <span className="text-[13px] text-[#6b6b76]">Not measured</span> : <P75 aggs={aggs} area={a} metric={c.key} compact />}
              </span>
            ))}
            <span role="cell" className="min-w-0">
              <ErrorsCell aggs={aggs} area={a} />
            </span>
          </div>
        ))}
      </div>
      {/* A phone: the area on one line, its figures in a grid under it. */}
      <ul className="divide-y divide-white/[0.06] lg:hidden" data-vitals-areas-phone="">
        {AREAS.map((a) => (
          <li key={a} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[14px] text-[#ededf0]">{AREA_LABEL[a]}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-[#6b6b76]">{a === "sites" ? "their own collector" : views(a)}</span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
              {AREA_COLUMNS.filter((c) => !(a === "sites" && c.key === "nav")).map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-[11px] text-[#6b6b76]">{c.label}</dt>
                  <dd><P75 aggs={aggs} area={a} metric={c.key} compact /></dd>
                </div>
              ))}
              {a !== "sites" ? (
                <div className="min-w-0">
                  <dt className="text-[11px] text-[#6b6b76]">Errors per 100</dt>
                  <dd><ErrorsCell aggs={aggs} area={a} /></dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ApiPanel({ aggs }: { aggs: Aggregate[] }) {
  const all = findAggregate(aggs, "*", "api")
  const routes = aggs.filter((a) => a.metric === "api" && a.route !== "*" && a.device === "*").sort((x, y) => y.samples - x.samples)
  const l = METRIC_LINES.api
  const columns: Column<Aggregate>[] = [
    { key: "route", label: "Route", width: "minmax(0,2.2fr)", phone: "primary", render: (a) => <span className="font-mono text-[12px]">{a.route}</span> },
    { key: "calls", label: "Timed calls", width: "88px", align: "right", render: (a) => plural(a.samples, "call", "calls") },
    { key: "p75", label: "p75", width: "88px", align: "right", phone: "end", render: (a) => <Figure unit="ms" value={a.p75} samples={a.samples} min={MIN_SAMPLES} good={l.good} poor={l.poor} compact /> },
    { key: "p95", label: "p95", width: "72px", align: "right", render: (a) => (a.samples >= MIN_SAMPLES && a.p95 !== null ? formatValue("ms", a.p95) : "") },
    { key: "bad", label: "Server errors", width: "96px", align: "right", render: (a) => (a.bad ? `${a.bad} (${formatValue("pct", (a.bad / a.samples) * 100)})` : "None") },
  ]
  return (
    <Panel title="API routes" meta="Timed on the server">
      <div className="grid grid-cols-2 border-b border-white/[0.08]">
        <div className="border-r border-white/[0.08] px-4 py-3">
          <p className="text-[12px] text-[#9b9ba6]">Answer time, p75</p>
          <div className="mt-1"><Figure unit="ms" value={all?.p75 ?? null} samples={all?.samples ?? 0} min={MIN_SAMPLES} good={l.good} poor={l.poor} /></div>
        </div>
        <div className="px-4 py-3">
          <p className="text-[12px] text-[#9b9ba6]">Server errors</p>
          <div className="mt-1">
            {all && all.samples >= MIN_RATE_BASE ? (
              <Figure unit="pct" value={(all.bad / all.samples) * 100} samples={all.samples} min={MIN_RATE_BASE} good={0.5} poor={2} />
            ) : (
              <Figure unit="pct" value={null} samples={all?.samples ?? 0} min={MIN_RATE_BASE} good={0.5} poor={2} />
            )}
          </div>
        </div>
      </div>
      <DataList columns={columns} rows={routes} rowKey={(a) => `${a.area}${a.route}`} empty="No API call timed in this window." label="API routes" />
    </Panel>
  )
}

function ErrorsPanel({ report }: { report: PerfReport }) {
  const rows = report.errors
  const columns: Column<NonNullable<PerfReport["errors"]>[number]>[] = [
    { key: "detail", label: "Message", width: "minmax(0,2.4fr)", phone: "primary", render: (e) => <span className="font-mono text-[12px]" title={e.detail}>{e.detail}</span> },
    { key: "where", label: "Where", width: "minmax(0,1.2fr)", render: (e) => `${AREA_LABEL[e.area as Area] ?? e.area}, ${e.route}` },
    { key: "n", label: "Times", width: "64px", align: "right", phone: "end", render: (e) => num(e.n) },
    { key: "last", label: "Last", width: "80px", align: "right", render: (e) => ago(e.lastAt) },
  ]
  return (
    <Panel title="JavaScript errors" meta="In sampled page views">
      {rows === null ? (
        <p className="px-4 py-6 text-[13px]"><Insufficient /></p>
      ) : (
        <DataList columns={columns} rows={rows} rowKey={(e) => `${e.area}${e.route}${e.detail}`} empty="No JavaScript error in the sampled page views of this window." label="JavaScript errors" />
      )}
      <p className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] leading-5 text-[#6b6b76]">
        Crashes that reach an error screen are also counted in full under <a href="/admin?view=system" className="text-[#c9c9d1] underline decoration-white/20 underline-offset-2 hover:text-[#ededf0]">Health</a>.
      </p>
    </Panel>
  )
}

function CheckoutPanel({ report }: { report: PerfReport }) {
  const { aggs, payments } = report
  const checkoutApi = findAggregate(aggs, "checkout", "api")
  const errs = errorsPer100(aggs, "checkout")
  const total = payments ? payments.failed + payments.completed : 0
  return (
    <Panel title="Checkout" meta="Reliability">
      <dl className="divide-y divide-white/[0.06]">
        <div className="flex items-start justify-between gap-4 px-4 py-2.5">
          <dt className="text-[13px] text-[#9b9ba6]">Failed payments<span className="block text-[11px] text-[#6b6b76]">Orders, failed against completed</span></dt>
          <dd className="text-right">
            {payments === null ? <span className="text-[13px] text-[#d4a72c]">Could not be read</span> : <Figure unit="pct" value={total ? (payments.failed / total) * 100 : null} samples={total} min={20} good={5} poor={15} />}
            {payments && total ? <span className="block text-[11px] tabular-nums text-[#6b6b76]">{num(payments.failed)} of {plural(total, "order", "orders")}</span> : null}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 px-4 py-2.5">
          <dt className="text-[13px] text-[#9b9ba6]">Checkout server errors<span className="block text-[11px] text-[#6b6b76]">Timed checkout calls with a 5xx</span></dt>
          <dd className="text-right">
            <Figure unit="pct" value={checkoutApi && checkoutApi.samples ? (checkoutApi.bad / checkoutApi.samples) * 100 : null} samples={checkoutApi?.samples ?? 0} min={MIN_RATE_BASE} good={0.5} poor={2} />
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 px-4 py-2.5">
          <dt className="text-[13px] text-[#9b9ba6]">Checkout page errors<span className="block text-[11px] text-[#6b6b76]">JavaScript errors per 100 page views</span></dt>
          <dd className="text-right">
            <Figure unit="per100" value={errs.value} samples={errs.base} min={MIN_RATE_BASE} good={1} poor={5} />
          </dd>
        </div>
      </dl>
    </Panel>
  )
}

function DatabasePanel({ report }: { report: PerfReport }) {
  const slow = report.slow
  type Row = Extract<NonNullable<PerfReport["slow"]>, { available: true }>["rows"][number]
  const columns: Column<Row>[] = [
    { key: "query", label: "Statement", width: "minmax(0,3fr)", phone: "primary", render: (q) => <span className="font-mono text-[11px]" title={q.query}>{q.query}</span> },
    { key: "calls", label: "Calls", width: "80px", align: "right", render: (q) => num(q.calls) },
    { key: "mean", label: "Average", width: "80px", align: "right", phone: "end", render: (q) => formatValue("ms", q.mean_ms) },
    { key: "total", label: "Total", width: "80px", align: "right", render: (q) => formatValue("ms", q.total_ms) },
  ]
  return (
    <Panel title="Database" meta="Statements by total time, since the statistics were last reset">
      {slow === null ? (
        <p className="px-4 py-6 text-[13px] text-[#d4a72c]">Could not be read.</p>
      ) : !slow.available ? (
        <p className="px-4 py-6 text-[13px]"><Insufficient note={"reason" in slow ? slow.reason : undefined} /></p>
      ) : (
        <>
          <p className="border-b border-white/[0.08] px-4 py-2.5 text-[13px] text-[#9b9ba6]">
            <span className="tabular-nums text-[#ededf0]">{slow.slow}</span> {slow.slow === 1 ? "statement averages" : "statements average"} 200 ms or more over 50+ calls.
          </p>
          <DataList columns={columns} rows={slow.rows} rowKey={(q) => q.query} empty="No statement recorded yet." label="Database statements" />
        </>
      )}
    </Panel>
  )
}

function InfraPanel({ report }: { report: PerfReport }) {
  const { jobs, supabase, vercel } = report
  const line = (label: string, sub: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <dt className="min-w-0 text-[13px] text-[#9b9ba6]">
        {label}
        <span className="block text-[11px] text-[#6b6b76]">{sub}</span>
      </dt>
      <dd className="min-w-0 text-right text-[13px] text-[#ededf0]">{value}</dd>
    </div>
  )
  const notSet = (name: string) => <span className="text-[13px] text-[#6b6b76]">Insufficient data<span className="block text-[11px]">Set {name} to read it</span></span>
  return (
    <Panel title="Infrastructure">
      <dl className="divide-y divide-white/[0.06]" data-infra="">
        {line(
          "Scheduled jobs",
          "Judged by the work they leave behind",
          jobs === null ? <span className="text-[#d4a72c]">Could not be read</span> : jobs.known === 0 ? <Insufficient /> : (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Dot rating={jobs.late === 0 ? "good" : jobs.late >= 2 ? "poor" : "needs-improvement"} />
              {jobs.late === 0 ? `All ${jobs.known} on time` : `${jobs.late} of ${jobs.known} late`}
            </span>
          ),
        )}
        {line(
          "Supabase",
          "Health of each service, requests yesterday",
          !supabase.configured ? notSet("SUPABASE_ACCESS_TOKEN") : !supabase.ok ? <span className="text-[#d4a72c]">{"reason" in supabase ? supabase.reason : ""}</span> : (
            <span className="block">
              <span className="inline-flex items-center gap-1.5">
                <Dot rating={supabase.down === 0 ? "good" : "poor"} />
                {supabase.down === 0 ? `${supabase.services.length} services healthy` : `${supabase.down} of ${supabase.services.length} down`}
              </span>
              {supabase.requests ? <span className="block text-[11px] tabular-nums text-[#6b6b76]">{num(supabase.requests.rest)} REST, {num(supabase.requests.auth)} auth, {num(supabase.requests.storage)} storage</span> : null}
            </span>
          ),
        )}
        {line(
          "Vercel",
          "Production deployments, last 7 days",
          !vercel.configured ? notSet("VERCEL_API_TOKEN") : !vercel.ok ? <span className="text-[#d4a72c]">{"reason" in vercel ? vercel.reason : ""}</span> : vercel.total === 0 ? <Insufficient /> : (
            <span className="block tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <Dot rating={vercel.failed === 0 ? "good" : vercel.failed / vercel.total > 0.3 ? "poor" : "needs-improvement"} />
                {vercel.failed} of {plural(vercel.total, "deployment", "deployments")} failed
              </span>
              {vercel.medianBuildMs !== null ? <span className="block text-[11px] text-[#6b6b76]">Build {formatValue("ms", vercel.medianBuildMs)} at the median</span> : null}
            </span>
          ),
        )}
      </dl>
    </Panel>
  )
}

/* ── 5. Optimizations ──────────────────────────────────────────────────── */

function OptimizationsPanel({ report }: { report: PerfReport }) {
  const list = [...report.optimizations].sort((a, b) => b.shippedAt.localeCompare(a.shippedAt))
  return (
    <Panel title="Optimizations shipped" meta="With the measurement before and after">
      {list.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-[#9b9ba6]" data-optimizations-empty="">None recorded yet. Each one is added here with what was measured before and after it.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]" data-optimizations="">
          {list.map((o) => {
            const sameUnit = o.before && o.after && o.before.unit === o.after.unit
            const change = sameUnit && o.before!.value !== 0 ? ((o.after!.value - o.before!.value) / o.before!.value) * 100 : null
            return (
              <li key={o.id} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <p className="text-[13px] text-[#ededf0]">{o.title}</p>
                  <p className="text-[11px] text-[#6b6b76]">
                    {o.area} · {date(o.shippedAt)}
                    {o.note ? ` · ${o.note}` : ""}
                  </p>
                </div>
                <div className="min-w-0 text-[13px] tabular-nums text-[#c9c9d1] sm:text-right">
                  {o.before && o.after ? (
                    <>
                      <span>
                        {num(o.before.value)} {o.before.unit} <span className="text-[#6b6b76]">to</span> {num(o.after.value)} {o.after.unit}
                      </span>
                      {change !== null ? <span className="ml-2 text-[12px] text-[#9b9ba6]">{change > 0 ? "+" : ""}{Math.round(change)}%</span> : null}
                      <span className="block text-[11px] text-[#6b6b76]">{o.before.metric}</span>
                    </>
                  ) : (
                    <span className="text-[#6b6b76]">No measurement recorded</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/* ── 6. The rules, printed from the code ───────────────────────────────── */

function RulesPanel() {
  const lines = Object.values(METRIC_LINES)
  return (
    <Panel title="How the score is worked out">
      <ol className="list-decimal space-y-2 py-3 pl-9 pr-4 text-[13px] leading-5 text-[#c9c9d1] marker:text-[#6b6b76]" data-rules="">
        <li>Every measurement has a good line and a poor line. LCP, INP, CLS, FCP and TTFB use Google&apos;s; the others are Storelib&apos;s own.</li>
        <li>A measurement scores 100 at zero, 90 on its good line, 50 on its poor line and 0 at twice the poor line, in straight lines between.</li>
        <li>It only counts with enough data: {MIN_SAMPLES} samples for a percentile, {MIN_RATE_BASE} page views or calls for a rate. Otherwise it is insufficient data and left out.</li>
        <li>A sub score is the average of its measurements that count, and needs at least {MIN_MEASURES}.</li>
        <li>
          The Health Index is the weighted average of the sub scores that have one, and needs at least {MIN_SUB_SCORES}. Weights:{" "}
          {SUB_SCORES.map((s) => `${s.label.toLowerCase()} ${s.weight}`).join(", ")}.
        </li>
        <li>The official score of a day is worked out the night after, from that day&apos;s measurements, and kept. 90 and over reads as good, under 50 as poor.</li>
        <li>Measured in one page load in five on storelib.com and one API request in five; the other loads send nothing. Raw samples are kept 8 days, daily rollups 120.</li>
      </ol>
      <details className="border-t border-white/[0.08]">
        <summary className="flex min-h-[44px] cursor-pointer select-none items-center px-4 text-[13px] text-[#9b9ba6] hover:text-[#ededf0]">The lines for each measurement</summary>
        <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {lines.map((l) => (
            <li key={l.label} className="flex items-baseline justify-between gap-3 px-4 py-2 text-[13px]">
              <span className="text-[#ededf0]">{l.label}</span>
              <span className="text-right tabular-nums text-[#9b9ba6]">
                good {formatValue(l.unit, l.good)}, poor past {formatValue(l.unit, l.poor)} <span className="text-[#6b6b76]">· {l.lines === "google" ? "Google" : "Storelib"}</span>
              </span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3 px-4 py-2 text-[13px]">
            <span className="text-[#ededf0]">JavaScript errors per 100 page views</span>
            <span className="tabular-nums text-[#9b9ba6]">good 1, poor past 5</span>
          </li>
          <li className="flex items-baseline justify-between gap-3 px-4 py-2 text-[13px]">
            <span className="text-[#ededf0]">Server errors, share of API calls</span>
            <span className="tabular-nums text-[#9b9ba6]">good 0.5%, poor past 2%</span>
          </li>
          <li className="flex items-baseline justify-between gap-3 px-4 py-2 text-[13px]">
            <span className="text-[#ededf0]">Failed payments, share of orders</span>
            <span className="tabular-nums text-[#9b9ba6]">good 5%, poor past 15%</span>
          </li>
        </ul>
      </details>
    </Panel>
  )
}

/* ── The page ──────────────────────────────────────────────────────────── */

export function PerformanceAdmin({ initial }: { initial: PerfReport }) {
  const [report, setReport] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async (window: WindowId) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/perf/admin?window=${window}`, { cache: "no-store" })
      if (res.status === 401) return location.reload()
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) setError(body?.error ?? "The figures could not be read.")
      else {
        setReport(body as PerfReport)
        const url = new URL(location.href)
        url.searchParams.set("window", window)
        history.replaceState(null, "", url)
      }
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [color-scheme:dark] [font-family:Inter,system-ui,sans-serif]" data-admin-performance="">
      <div aria-hidden className={cx("fixed inset-x-0 top-0 z-50 h-[2px] bg-[#8b5cf6] transition-opacity duration-200", busy ? "opacity-60" : "opacity-0")} />
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <a href="/admin" className="-ml-2 mb-1 inline-flex h-10 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0] sm:h-8">
          Console
        </a>
        <div className="mb-4 min-w-0">
          <h1 className="text-[20px] font-semibold tracking-[-0.015em] sm:text-[22px]">Performance and health</h1>
          <p className="mt-0.5 text-[13px] text-[#9b9ba6]">
            Measured in browsers on storelib.com and on Storelib&apos;s own API. Read {ago(report.generatedAt)}.
          </p>
        </div>

        <div className="mb-4 flex min-w-0 items-center justify-between gap-2">
          <Filters options={WINDOWS.map((w) => ({ id: w.id, label: w.label }))} value={report.window} onChange={(w) => void load(w)} label="Window" />
          <Button variant="quiet" className="h-10 sm:h-8" onClick={() => void load(report.window)} disabled={busy}>
            Refresh
          </Button>
        </div>

        {!report.ready ? (
          <div className="mb-4" data-not-ready="">
            <Banner>
              {report.readyReason ?? "The measurements could not be read."} Until then every measurement below reads insufficient data.
            </Banner>
          </div>
        ) : null}
        {error ? (
          <div className="mb-4">
            <Banner tone="bad" onClose={() => setError(null)}>{error}</Banner>
          </div>
        ) : null}

        <div className={cx("space-y-3 transition-opacity duration-200", busy && "opacity-60")}>
          <HealthPanel report={report} />
          <div className="grid min-w-0 items-start gap-3 lg:grid-cols-2">
            <SubScores subs={report.health.subs} />
            <ProblemsPanel report={report} />
          </div>
          <VitalsPanel aggs={report.aggs} />
          <AreasPanel aggs={report.aggs} />
          <ApiPanel aggs={report.aggs} />
          <div className="grid min-w-0 items-start gap-3 lg:grid-cols-2">
            <CheckoutPanel report={report} />
            <InfraPanel report={report} />
          </div>
          <ErrorsPanel report={report} />
          <DatabasePanel report={report} />
          <OptimizationsPanel report={report} />
          <RulesPanel />
        </div>
      </div>
    </div>
  )
}
