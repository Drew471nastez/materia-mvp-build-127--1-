"use client"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE REPORTS UNDER THE ANALYTICS CHART
 * ═══════════════════════════════════════════════════════════════════════════
 * Read from app/api/analytics/reports, which counts on the server from every
 * row (lib/analytics/reports.ts has the rules), for the store or the OnePage.
 * The page reads it once and hands the same answer to the chart at the top
 * and to these cards (useAnalyticsReports), so the two never disagree.
 *
 * DRAWN IN STORELIB'S OWN COLOUR. The violet of every other /app screen for
 * the period, the period it is compared with as a quiet grey dashed line, the
 * donut and the funnel in steps of the same violet. Thin marks, a recessive
 * grid, text in ink and never in the data colour.
 *
 * READ THE SAME WAY AS THE CHART ABOVE, by the same layer
 * (components/app/chart-scrub): the readout stays on the pointer or the
 * finger, the dots sit on the nearest day, and it fades when let go; a
 * sideways drag or a hold scrubs, a finger going down the page is a scroll.
 *
 * NOTHING SCROLLS INSIDE A CARD. A list shows its top five and opens the rest
 * in a sheet, so a wheel or a thumb over a card always moves the page.
 *
 * NOTHING MOVES WHILE IT LOADS. Every card body has a fixed height, and a
 * change of period keeps the figures on screen, softened, until the new ones
 * arrive.
 *
 * AND WHEN THEY ARRIVE, THE LINES MOVE TO THEM. A line chart here is drawn
 * by hand, so a new answer used to be a new drawing, cut in. Each point now
 * travels from where it was to where it goes, on the same curve and in the
 * same time as the trend chart above (components/app/chart-morph); the grid
 * is three intervals whatever the numbers, the numbers on it cross-fade, and
 * the axis only ever widens, so a new period never pushes the plot about.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { Shimmer, ShimmerBlock, ShimmerChart, ShimmerSwap } from "@/components/ui/shimmer"
import type { BreakdownRow, Headline, OnePageReports, Reports, Series } from "@/lib/analytics/reports"
import { axisWidth, compactCount, compactMoney, compactPercent } from "@/lib/analytics/chart-scale"
import { AxisLabels, MORPH_MS, fixedScale, morphEase } from "@/components/app/chart-morph"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { HelpLabel } from "@/components/app/help-label"
import { ChartScrub, type ScrubRow, type ScrubSeries } from "@/components/app/chart-scrub"
import { SourceIcon, type IconFor } from "@/components/analytics/source-icon"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

/** Storelib's accent, the one every /app screen already uses. */
export const SERIES = "#8b5cf6"
/** The period it is compared with: grey, dashed, behind. */
export const BEFORE = "#b8bcc6"
/** Two or three parts of a whole, in steps of the same violet. */
const CATEGORICAL = ["#8b5cf6", "#c4b5fd", "#e4dcfd"]
const FUNNEL = ["#6d28d9", "#8b5cf6", "#a78bfa", "#c4b5fd"]

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
const moneyShort = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 })
const fmtMoney = (cents: number) => money.format((cents || 0) / 100)
const fmtMoneyShort = (cents: number) => (Math.abs(cents) >= 100_000 ? moneyShort.format(cents / 100).replace("K", "k") : fmtMoney(cents))
const fmtCount = (n: number) => Math.round(n).toLocaleString("en-US")
const fmtPct = (f: number) => `${(f * 100).toFixed(f > 0 && f < 0.1 ? 2 : 1).replace(/\.0+$/, "")}%`

const LIST_ROWS = 5
const BODY = "h-[236px]"

/** Whether there is a period to compare with. Off, every "was" and every percentage goes. */
const ComparedContext = React.createContext(true)

/* ─── Frame ───────────────────────────────────────────────────────────── */

function Card({
  title,
  help,
  tabs,
  children,
  className,
}: {
  title: string
  help: string
  tabs?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)}>
      <header className="flex min-h-[52px] flex-col justify-center gap-2.5 px-5 pt-4">
        <HelpLabel as="h3" label={title} description={help} className="max-w-full truncate text-[14px] font-semibold text-[#1a1a2e]" />
        {tabs ? <div className="orders-strip -mx-1 overflow-x-auto px-1">{tabs}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">{children}</div>
    </section>
  )
}

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="inline-flex shrink-0 items-center rounded-lg bg-[#f1f2f4] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 cursor-pointer rounded-md px-3 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 sm:h-7 sm:px-2.5",
            o.value === value ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(17,24,39,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Change({ h, upIsBad = false }: { h: Pick<Headline, "change" | "value">; upIsBad?: boolean }) {
  const compared = React.useContext(ComparedContext)
  if (!compared) return null
  if (h.change === null) return <span className="text-[13px] text-[#9ca3af]">{h.value > 0 ? "New" : "–"}</span>
  const pct = Math.round(h.change * 100)
  if (pct === 0) return <span className="text-[13px] text-[#9ca3af]">0%</span>
  const good = pct > 0 !== upIsBad
  return (
    <span className={cn("text-[13px] font-medium tabular-nums", good ? "text-[#15803d]" : "text-[#b42318]")}>
      {pct > 0 ? "↗" : "↘"} {Math.abs(pct)}%
    </span>
  )
}

function Figure({ value, h }: { value: string; h: Headline }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{value}</span>
      <Change h={h} />
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center py-6 text-center text-[13px] text-[#9ca3af]">{children}</div>
}

/* ─── Line chart ──────────────────────────────────────────────────────── */

type AxisKind = "count" | "money" | "percent"

function LineChart({ series, format, kind }: { series: Series; format: (n: number) => string; kind: AxisKind }) {
  const compared = React.useContext(ComparedContext) && series.previous.length > 0
  /* Drawn at the card's own width in pixels, measured before the first
     paint and again on resize, so the plot reaches both edges and the axis
     text stays 10px. */
  const [W, setW] = React.useState(320)
  const H = 150
  const n = series.current.length

  const max = Math.max(0, ...series.current, ...(compared ? series.previous : []))
  const scale = fixedScale(max, kind === "count")
  const tickLabel = (t: number) => (kind === "money" ? compactMoney(t, scale.step) : kind === "percent" ? compactPercent(t) : compactCount(t))
  const labels = scale.ticks.map(tickLabel)
  /* As wide as the widest number on it, and it only ever widens: a new
     period with shorter numbers does not pull the plot back to the left. */
  const widest = React.useRef(0)
  widest.current = Math.max(widest.current, axisWidth(labels, 10, 8))
  const pad = { l: widest.current, r: 8, t: 10, b: 22 }
  const plotW = W - pad.l - pad.r
  const x = (i: number) => pad.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)

  const boxRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setW(Math.max(160, Math.round(el.getBoundingClientRect().width)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const plotH = H - pad.t - pad.b
  const y = (v: number) => pad.t + (1 - v / scale.top) * plotH
  const floor = y(0)

  /*
    THE LINE MOVES TO THE NEW NUMBERS. Where each point should be, in
    pixels, and where it is drawn: the drawn one travels to the target over
    MORPH_MS whenever the target changes. From the floor the first time, so
    a card grows its line rather than having one appear. A point that did
    not exist before starts from the nearest one that did.
  */
  const target = React.useMemo(
    () => ({ cur: series.current.map((v) => y(v)), prev: compared ? series.previous.map((v) => y(v)) : [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, compared, scale.top, pad.t, plotH],
  )
  const [drawn, setDrawn] = React.useState(() => ({ cur: target.cur.map(() => floor), prev: target.prev.map(() => floor) }))
  const drawnRef = React.useRef(drawn)
  React.useEffect(() => {
    const from = drawnRef.current
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const mix = (a: number[], b: number[], k: number) =>
      b.map((v, i) => {
        const f = a.length ? a[Math.min(a.length - 1, Math.floor((i * a.length) / b.length))] : floor
        return f + (v - f) * k
      })
    if (still) {
      drawnRef.current = target
      setDrawn(target)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const step = () => {
      const k = morphEase(Math.min(1, (performance.now() - t0) / MORPH_MS))
      const next = { cur: mix(from.cur, target.cur, k), prev: mix(from.prev, target.prev, k) }
      drawnRef.current = next
      setDrawn(next)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  /* For the one render between new numbers and the first frame of their
     move, the drawn line may still have the old number of points: it is
     stretched to the new count rather than left undrawn. */
  const fit = (ys: number[], count: number) =>
    ys.length === count ? ys : Array.from({ length: count }, (_, k) => (ys.length ? ys[Math.min(ys.length - 1, Math.floor((k * ys.length) / count))] : floor))
  const cur = fit(drawn.cur, n)
  const prev = fit(drawn.prev, compared ? series.previous.length : 0)
  const path = (ys: number[]) => ys.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${v.toFixed(1)}`).join("")
  const area = n > 1 ? `${path(cur)}L${x(n - 1).toFixed(1)},${floor}L${x(0).toFixed(1)},${floor}Z` : ""
  const xl = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0]
  const gradient = React.useId().replace(/:/g, "")

  /*
    READ THE WAY EVERY TREND CHART IS READ: components/app/chart-scrub, with
    its readout in the light card these reports use. The dots sit where the
    line is going, not where the morph has it this frame.
  */
  const scrubSeries = React.useMemo<ScrubSeries[]>(
    () => [
      ...(compared ? [{ ys: target.prev, color: BEFORE, hollow: true }] : []),
      { ys: target.cur, color: SERIES },
    ],
    [target, compared],
  )
  const scrubRows = React.useMemo<ScrubRow[]>(
    () => [
      { label: compared ? "This period" : "Value", value: (k) => format(series.current[k] ?? 0), mark: "line", tone: "value", color: SERIES },
      ...(compared ? [{ label: "Before", value: (k: number) => format(series.previous[k] ?? 0), mark: "dashed", tone: "compared", color: BEFORE } as ScrubRow] : []),
    ],
    [series, compared, format],
  )
  const scrubTitle = React.useCallback((k: number) => series.labels[k] ?? "", [series])

  return (
    <div className="mt-3 select-none">
      <div ref={boxRef} className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-[150px] w-full overflow-visible" role="img" aria-label="Chart">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity={0.14} />
              <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Four lines at four fixed heights; the numbers on them are AxisLabels, below. */}
          {scale.ticks.map((t, k) => (
            <line key={k} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eef0f2" strokeWidth={1} />
          ))}
          {xl.map((k) => (
            <text key={k} x={x(k)} y={H - 5} textAnchor={k === 0 ? "start" : k === n - 1 ? "end" : "middle"} fontSize="10" fill="#9ca3af">
              {series.labels[k]}
            </text>
          ))}
          <path d={area} fill={`url(#${gradient})`} />
          {compared ? <path d={path(prev)} fill="none" stroke={BEFORE} strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" /> : null}
          <path d={path(cur)} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <AxisLabels labels={labels} top={pad.t} height={plotH} width={pad.l} fontSize={10} />
        <ChartScrub
          count={n}
          left={pad.l}
          right={pad.r}
          top={pad.t}
          bottom={H - pad.b}
          series={scrubSeries}
          title={scrubTitle}
          rows={scrubRows}
          disabled={n === 0}
          tone="light"
          readoutTop={-12}
          crosshairColor="#c9ccd3"
        />
      </div>
      {compared ? (
        <div className="mt-2 flex items-center gap-4 text-[12px] text-[#6b7280]">
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-3.5 rounded" style={{ background: SERIES }} />
            This period
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: BEFORE }} />
            Period before
          </span>
        </div>
      ) : null}
    </div>
  )
}

/* ─── Donut ───────────────────────────────────────────────────────────── */

function Donut({ rows, total, format, sub }: { rows: BreakdownRow[]; total: string; format: (n: number) => string; sub?: (r: BreakdownRow) => string | null }) {
  const R = 52
  const C = 2 * Math.PI * R
  let offset = 0
  const [hover, setHover] = React.useState<string | null>(null)
  return (
    <div className="mt-2 flex flex-1 items-center gap-x-5 sm:gap-x-6">
      <div className="relative h-[112px] w-[112px] shrink-0 sm:h-[140px] sm:w-[140px]">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f2f4" strokeWidth="16" />
          {rows.slice(0, CATEGORICAL.length).map((r, i) => {
            const len = r.share * C
            const seg = (
              <circle
                key={r.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={CATEGORICAL[i]}
                strokeWidth={hover === r.key ? 19 : 16}
                strokeDasharray={`${Math.max(0, len - (rows.length > 1 ? 2 : 0))} ${C}`}
                strokeDashoffset={-offset}
                className="transition-[stroke-width] duration-150"
                onPointerEnter={() => setHover(r.key)}
                onPointerLeave={() => setHover(null)}
              />
            )
            offset += len
            return seg
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[14px] font-bold tabular-nums text-[#1a1a2e] sm:text-[17px]">{total}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {rows.slice(0, CATEGORICAL.length).map((r, i) => (
          <li
            key={r.key}
            className={cn("rounded-md text-[13px] transition-opacity duration-150", hover && hover !== r.key && "opacity-50")}
            onPointerEnter={() => setHover(r.key)}
            onPointerLeave={() => setHover(null)}
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CATEGORICAL[i] }} />
              <span className="min-w-0 flex-1 truncate text-[#303036]">{r.label}</span>
              <span className="tabular-nums text-[#1a1a2e]">{format(r.value)}</span>
              {sub ? null : <span className="w-10 text-right tabular-nums text-[#9ca3af]">{Math.round(r.share * 100)}%</span>}
            </div>
            {sub ? (
              <p className="pl-[18px] text-[12px] tabular-nums text-[#9ca3af]">
                {sub(r)}, {Math.round(r.share * 100)}%
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ─── Lists ───────────────────────────────────────────────────────────── */

type Lead = { flag: true } | { icon: IconFor } | null

function RowChange({ r }: { r: BreakdownRow }) {
  const compared = React.useContext(ComparedContext)
  if (!compared) return null
  if (r.previous <= 0) return <span className="text-[12px] text-[#c4c7cf]">{r.value > 0 ? "New" : "–"}</span>
  const pct = Math.round(((r.value - r.previous) / r.previous) * 100)
  if (pct === 0) return <span className="text-[12px] text-[#9ca3af]">0%</span>
  return (
    <span className={cn("text-[12px] tabular-nums", pct > 0 ? "text-[#15803d]" : "text-[#b42318]")}>
      {pct > 0 ? "+" : "−"}
      {Math.abs(pct)}%
    </span>
  )
}

/**
 * A COUNTRY'S FLAG, drawn, not typed. The emoji flags were letters on a
 * Windows computer and flat everywhere else. These are SVGs (public/flags,
 * country-flag-icons, MIT) at 3:2, with a hairline edge so white flags keep
 * their shape and a faint light from above, so a flag reads as a small
 * printed thing on the page. Anything that is not a country is the globe.
 */
function Flag({ code }: { code: string }) {
  const cc = (code || "").toUpperCase()
  const [failed, setFailed] = React.useState(false)
  if (!/^[A-Z]{2}$/.test(cc) || failed) return <SourceIcon kind="source" value="referral" />
  return (
    <span aria-hidden data-flag={cc} className="relative flex h-6 w-6 shrink-0 items-center justify-center">
      <span className="relative block h-[14px] w-[21px] overflow-hidden rounded-[3px] shadow-[0_0_0_0.5px_rgba(17,24,39,0.18),0_1px_2px_rgba(17,24,39,0.12)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/flags/${cc}.svg`}
          alt=""
          width={21}
          height={14}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="block h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0)_48%,rgba(0,0,0,0.06)_100%)]" />
      </span>
    </span>
  )
}

/**
 * A ROW: the mark, the name and the figure, with the share drawn as a quiet
 * grey bar behind the name, the way Vercel and Plausible draw theirs. It was
 * a thin violet line under the name, which the owner found generic; the
 * figure is what matters and the bar only says how big it is next to the
 * others, so it sits behind the words in the page's own grey.
 */
function Row({
  r,
  max,
  format,
  lead,
  sub,
}: {
  r: BreakdownRow
  max: number
  format: (n: number) => string
  lead: Lead
  sub?: string | null
}) {
  const compared = React.useContext(ComparedContext)
  return (
    <li className="group flex h-10 items-center gap-3" title={sub ?? undefined}>
      <div className="relative flex h-8 min-w-0 flex-1 items-center">
        <div
          aria-hidden
          data-bar=""
          className="absolute inset-y-0 left-0 rounded-md bg-[#f1f2f5] transition-[width,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:bg-[#e8eaef]"
          style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
        />
        <div className="relative flex min-w-0 items-center gap-2 pl-1">
          {lead && "flag" in lead ? <Flag code={r.extra?.code ?? r.key} /> : lead ? <SourceIcon kind={lead.icon} value={r.key} /> : null}
          <span className={cn("min-w-0 truncate text-[13px] text-[#303036]", !lead && "pl-1.5")} title={r.label}>
            {r.label}
          </span>
        </div>
      </div>
      <span className="shrink-0 text-[13px] font-medium tabular-nums text-[#1a1a2e]">{format(r.value)}</span>
      {compared ? (
        <span className="w-11 shrink-0 text-right">
          <RowChange r={r} />
        </span>
      ) : null}
    </li>
  )
}

function BarList({
  rows,
  format,
  lead = null,
  sub,
  empty,
  title,
}: {
  rows: BreakdownRow[]
  format: (n: number) => string
  lead?: Lead
  sub?: (r: BreakdownRow) => string | null
  empty: string
  title: string
}) {
  const [all, setAll] = React.useState(false)
  if (rows.length === 0) return <Empty>{empty}</Empty>
  const max = Math.max(...rows.map((r) => r.value), 1)
  const shown = rows.slice(0, LIST_ROWS)
  return (
    <>
      <ol className="mt-0.5">
        {shown.map((r) => (
          <Row key={r.key} r={r} max={max} format={format} lead={lead} sub={sub?.(r)} />
        ))}
      </ol>
      {rows.length > LIST_ROWS ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-auto w-fit cursor-pointer rounded-md py-1 text-[12px] font-medium text-[#7c3aed] hover:underline"
        >
          View all {rows.length}
        </button>
      ) : null}
      <Dialog open={all} onOpenChange={setAll}>
        <DialogContent className="max-h-[80vh] w-[calc(100%-32px)] max-w-[480px] gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0">
          <div className="border-b border-[#eef0f2] px-5 py-4">
            <DialogTitle className="text-[15px] font-semibold text-[#1a1a2e]">{title}</DialogTitle>
          </div>
          <ol className="max-h-[calc(80vh-64px)] overflow-y-auto px-5 py-2">
            {rows.map((r) => (
              <Row key={r.key} r={r} max={max} format={format} lead={lead} sub={sub?.(r)} />
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ─── Funnel ──────────────────────────────────────────────────────────── */

function Funnel({ steps }: { steps: Reports["funnel"] }) {
  const compared = React.useContext(ComparedContext)
  const top = Math.max(steps[0]?.value ?? 0, ...steps.map((s) => s.value), 1)
  return (
    <div className="mt-2 grid flex-1 grid-cols-4 gap-2">
      {steps.map((s, i) => {
        const prevRate = compared && steps[0].previous > 0 ? s.previous / steps[0].previous : null
        return (
          <div key={s.key} className={cn("flex min-w-0 flex-col", i > 0 && "border-l border-[#eef0f2] pl-2")}>
            <p className="truncate text-[12px] text-[#6b7280]" title={s.label}>
              {s.label}
            </p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{i === 0 ? fmtCount(s.value) : fmtPct(s.rate)}</p>
            <p className="text-[12px] tabular-nums text-[#9ca3af]">{i === 0 ? "visits" : `${fmtCount(s.value)} ${s.value === 1 ? "visit" : "visits"}`}</p>
            <div className="mt-3 flex h-[80px] items-end">
              <div
                className="w-full max-w-[24px] rounded-t-[4px] transition-[height] duration-500"
                style={{ height: `${Math.max(3, (s.value / top) * 100)}%`, background: FUNNEL[i] }}
              />
            </div>
            <p className={cn("mt-1.5 text-[11px] tabular-nums", i > 0 && prevRate !== null ? "text-[#9ca3af]" : "text-transparent")}>
              {i > 0 && prevRate !== null ? `was ${fmtPct(prevRate)}` : "."}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Loading ─────────────────────────────────────────────────────────── */

type WaitKind = "list" | "chart" | "donut" | "funnel"

/* Row widths that vary the way names do, the same on every render. */
const ROW_SPREAD = [0.82, 0.64, 0.74, 0.52, 0.6]

/**
 * A card whose figures are still on their way, drawn as the card will be in
 * light gray (components/ui/shimmer): the five rows of a list with their
 * bars, the headline and plot of a chart, the ring and legend of a donut,
 * the four columns of the funnel. It was the spinner, past half a second, in
 * an empty card: "not the spinner in the charts loading and the tables
 * loading; loading structures, light gray shimmering". Each card's body is
 * a fixed 236px (BODY), so whatever arrives moves nothing.
 */
function Waiting({ kind }: { kind: WaitKind; lead?: boolean }) {
  if (kind === "chart") return <ShimmerChart height={236} figure />
  if (kind === "donut") {
    return (
      <Shimmer className="mt-2 flex h-[180px] items-center gap-x-5 sm:gap-x-6">
        <span className="flex h-[112px] w-[112px] shrink-0 items-center justify-center rounded-full border-[16px] border-[#f1f2f4] sm:h-[140px] sm:w-[140px] sm:border-[18px]" />
        <div className="min-w-0 flex-1 space-y-3.5">
          {ROW_SPREAD.slice(0, 3).map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <ShimmerBlock className="h-2.5 w-2.5 shrink-0 rounded-[3px]" />
              <ShimmerBlock className="h-3 rounded-full" style={{ width: `${w * 60}%` }} />
              <ShimmerBlock className="ml-auto h-3 w-8 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </Shimmer>
    )
  }
  if (kind === "funnel") {
    return (
      <Shimmer>
        <div className="flex h-9 items-center">
          <ShimmerBlock className="h-6 w-24 rounded-lg" />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[1, 0.62, 0.4, 0.22].map((h, i) => (
            <div key={i} className={cn("flex flex-col", i > 0 && "border-l border-[#eef0f2] pl-2")}>
              <ShimmerBlock className="mt-1 h-3 w-4/5 rounded-full" />
              <ShimmerBlock className="mt-2 h-3.5 w-1/2 rounded-full" />
              <div className="mt-3 flex h-[80px] items-end">
                <ShimmerBlock className="w-full max-w-[24px] rounded-b-none rounded-t-[4px]" style={{ height: `${h * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Shimmer>
    )
  }
  return (
    <Shimmer className="mt-0.5">
      {ROW_SPREAD.map((w, i) => (
        /* The row's own shape: the bar behind the name, the figure after it. */
        <div key={i} className="flex h-10 items-center gap-3">
          <div className="flex h-8 min-w-0 flex-1 items-center">
            <ShimmerBlock className="h-8 rounded-md" style={{ width: `${Math.max(30, w * 100)}%` }} />
          </div>
          <ShimmerBlock className="h-3 w-9 shrink-0 rounded-full" />
        </div>
      ))}
    </Shimmer>
  )
}

/**
 * A card's body: its fixed height, the skeleton while `blank`, and the
 * figures crossfading in over it when they come (ShimmerSwap). The children
 * are only built once there is something to build them from.
 */
function Body({ blank, wait, lead, children }: { blank: boolean; wait: WaitKind; lead?: boolean; children: React.ReactNode }) {
  return (
    <ShimmerSwap loading={blank} skeleton={<Waiting kind={wait} lead={lead} />} className={BODY} contentClassName="h-full">
      {children}
    </ShimmerSwap>
  )
}

/* ─── The grids ───────────────────────────────────────────────────────── */

type SourceTab = "source" | "referrer" | "social" | "campaign"
type PlaceTab = "country" | "city"
type DeviceTab = "device" | "browser" | "os"

const SOURCE_TABS: Array<{ value: SourceTab; label: string }> = [
  { value: "source", label: "Source" },
  { value: "referrer", label: "Referrer" },
  { value: "social", label: "Social" },
  { value: "campaign", label: "Campaign" },
]
const DEVICE_TABS: Array<{ value: DeviceTab; label: string }> = [
  { value: "device", label: "Device" },
  { value: "browser", label: "Browser" },
  { value: "os", label: "System" },
]

const SOURCE_EMPTY: Record<SourceTab, string> = {
  source: "No visits in this period",
  referrer: "No visits from other websites in this period",
  social: "No visits from social apps in this period",
  campaign: "No visits from links with a campaign tag",
}
const SOURCE_ICON: Record<SourceTab, IconFor | null> = { source: "source", referrer: "referrer", social: "social", campaign: "campaign" }

type Breakdowns = Reports["breakdowns"] | OnePageReports["breakdowns"]

function VisitCards({ b, blank, noun }: { b: Breakdowns | null; blank: boolean; noun: "visits" | "views" }) {
  const [sourceTab, setSourceTab] = React.useState<SourceTab>("source")
  const [placeTab, setPlaceTab] = React.useState<PlaceTab>("country")
  const [deviceTab, setDeviceTab] = React.useState<DeviceTab>("device")
  const share = (r: BreakdownRow) => `${Math.round(r.share * 100)}% of ${noun}`
  return (
    <>
      <Card
        title={`${noun === "visits" ? "Sessions" : "Views"} by traffic source`}
        help="Where each visit came from, judged by its first page: a search engine, a social app, an email, another website, or typed in directly."
        tabs={<Tabs value={sourceTab} onChange={setSourceTab} options={SOURCE_TABS} />}
      >
        <Body blank={blank || !b} wait="list" lead>
          {blank || !b ? null : (
            <BarList
              key={sourceTab}
              title={`${noun === "visits" ? "Sessions" : "Views"} by ${sourceTab}`}
              rows={b[sourceTab]}
              format={fmtCount}
              lead={SOURCE_ICON[sourceTab] ? { icon: SOURCE_ICON[sourceTab]! } : null}
              sub={share}
              empty={SOURCE_EMPTY[sourceTab]}
            />
          )}
        </Body>
      </Card>

      <Card
        title={`${noun === "visits" ? "Sessions" : "Views"} by location`}
        help="Where visitors were, from their connection."
        tabs={<Tabs value={placeTab} onChange={setPlaceTab} options={[{ value: "country", label: "Country" }, { value: "city", label: "City" }]} />}
      >
        <Body blank={blank || !b} wait="list" lead>
          {blank || !b ? null : (
            <BarList
              key={placeTab}
              title={`${noun === "visits" ? "Sessions" : "Views"} by ${placeTab}`}
              rows={b[placeTab]}
              format={fmtCount}
              lead={placeTab === "country" ? { flag: true } : null}
              sub={(row) =>
                placeTab === "country" && (row.extra?.orders ?? 0) > 0
                  ? `${fmtCount(row.extra!.orders!)} ${row.extra!.orders === 1 ? "order" : "orders"}, ${fmtMoney(row.extra!.salesCents ?? 0)}`
                  : share(row)
              }
              empty={placeTab === "city" ? "No cities recorded in this period" : "No locations recorded in this period"}
            />
          )}
        </Body>
      </Card>

      <Card
        title={`${noun === "visits" ? "Sessions" : "Views"} by device`}
        help="The device, browser and system of the first page of each visit."
        tabs={<Tabs value={deviceTab} onChange={setDeviceTab} options={DEVICE_TABS} />}
      >
        <Body blank={blank || !b} wait="list" lead>
          {blank || !b ? null : (
            <BarList
              key={deviceTab}
              title={`${noun === "visits" ? "Sessions" : "Views"} by ${deviceTab === "os" ? "system" : deviceTab}`}
              rows={b[deviceTab]}
              format={fmtCount}
              lead={{ icon: deviceTab }}
              sub={share}
              empty={`No ${noun} in this period`}
            />
          )}
        </Body>
      </Card>
    </>
  )
}

function StoreGrid({ r }: { r: Reports | null }) {
  const blank = !r
  const orders = (row: BreakdownRow) => {
    const n = row.extra?.orders ?? 0
    return `${fmtCount(n)} ${n === 1 ? "order" : "orders"}`
  }
  return (
    <>
      <Card title="Total sales by channel" help="Money taken in the period, less refunds, split by where the order was placed: your Storelib page or your website. Orders from before the channel was recorded count as your Storelib page.">
        <Body blank={blank} wait="donut">
          {blank ? null : r!.salesByChannel.length === 0 ? <Empty>No orders in this period</Empty> : (
            <Donut rows={r!.salesByChannel} total={fmtMoneyShort(r!.sales.value)} format={fmtMoneyShort} sub={orders} />
          )}
        </Body>
      </Card>

      <Card title="Average order value over time" help="What a paying buyer spent in one order, on average. Free orders are left out.">
        <Body blank={blank} wait="chart">
          {blank ? null : (
            <>
              <Figure value={fmtMoney(r!.aov.value)} h={r!.aov} />
              <LineChart series={r!.aov.series} format={fmtMoney} kind="money" />
            </>
          )}
        </Body>
      </Card>

      <Card title="Total sales by product" help="Each product's share of the money taken, less refunds, and how many were sold.">
        <Body blank={blank} wait="list">
          {blank ? null : (
            <BarList
              title="Total sales by product"
              rows={r!.salesByProduct}
              format={fmtMoney}
              sub={(row) => `${fmtCount(row.extra?.orders ?? 0)} sold`}
              empty="No sales in this period"
            />
          )}
        </Body>
      </Card>

      <Card title="Sessions over time" help="Visits to your Storelib page and your website. A visit ends after 30 minutes without opening a page. Your own visits and search engine robots are not counted.">
        <Body blank={blank} wait="chart">
          {blank ? null : (
            <>
              <Figure value={fmtCount(r!.sessions.value)} h={r!.sessions} />
              <LineChart series={r!.sessions.series} format={fmtCount} kind="count" />
            </>
          )}
        </Body>
      </Card>

      <Card title="Conversion rate over time" help="Orders divided by visits: how many visits ended in an order.">
        <Body blank={blank} wait="chart">
          {blank ? null : (
            <>
              <Figure value={fmtPct(r!.conversion.value)} h={r!.conversion} />
              <LineChart series={r!.conversion.series} format={fmtPct} kind="percent" />
            </>
          )}
        </Body>
      </Card>

      <Card title="Conversion rate breakdown" help="Of the visits in the period, how many pressed Buy, how many reached the checkout, and how many ordered.">
        <Body blank={blank} wait="funnel">
          {blank ? null : (
            <>
              <Figure value={fmtPct(r!.conversion.value)} h={r!.conversion} />
              <Funnel steps={r!.funnel} />
            </>
          )}
        </Body>
      </Card>

      <VisitCards b={r?.breakdowns ?? null} blank={blank} noun="visits" />

      <Card title="Sessions by landing page" help="The page each visit started on." className="md:col-span-2">
        <Body blank={blank} wait="list">
          {blank ? null : (
            <BarList
              title="Sessions by landing page"
              rows={r!.breakdowns.landing}
              format={fmtCount}
              sub={(row) => `${Math.round(row.share * 100)}% of visits`}
              empty="No visits in this period"
            />
          )}
        </Body>
      </Card>

      <Card title="Sessions by channel" help="Visits to your Storelib page, and visits to the website you built.">
        <Body blank={blank} wait="donut">
          {blank ? null : r!.sessions.value === 0 ? <Empty>No visits in this period</Empty> : (
            <Donut rows={r!.breakdowns.channel} total={fmtCount(r!.sessions.value)} format={fmtCount} />
          )}
        </Body>
      </Card>
    </>
  )
}

function OnePageGrid({ r, hasPage }: { r: OnePageReports | null; hasPage: boolean }) {
  const blank = !r
  if (r && !hasPage) {
    return (
      <p className="rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-6 text-center text-[13px] text-[#6b7280] md:col-span-2 xl:col-span-3">
        Publish a OnePage and its views, clicks and subscribers show up here.
      </p>
    )
  }
  return (
    <>
      <Card title="Views over time" help="Visits to your OnePage. One person counts once a day, however many times they reload it.">
        <Body blank={blank} wait="chart">
          {blank ? null : (
            <>
              <Figure value={fmtCount(r!.views.value)} h={r!.views} />
              <LineChart series={r!.views.series} format={fmtCount} kind="count" />
            </>
          )}
        </Body>
      </Card>

      <Card title="Link clicks over time" help="Taps on the links and buttons of your OnePage. One person's taps on the same link count once a day.">
        <Body blank={blank} wait="chart">
          {blank ? null : (
            <>
              <Figure value={fmtCount(r!.clicks.value)} h={r!.clicks} />
              <LineChart series={r!.clicks.series} format={fmtCount} kind="count" />
            </>
          )}
        </Body>
      </Card>

      <Card title="Click-through rate" help="Link clicks divided by views: how often a visit led somewhere.">
        <Body blank={blank} wait="chart">
          {blank ? null : (
            <>
              <Figure value={fmtPct(r!.ctr.value)} h={r!.ctr} />
              <LineChart series={r!.ctr.series} format={fmtPct} kind="percent" />
            </>
          )}
        </Body>
      </Card>

      <Card title="Top links" help="Which links and buttons were tapped most, by the name they have on your OnePage." className="md:col-span-2">
        <Body blank={blank} wait="list">
          {blank ? null : (
            <BarList
              title="Top links"
              rows={r!.links}
              format={fmtCount}
              sub={(row) => `${Math.round(row.share * 100)}% of clicks`}
              empty="No link clicks in this period"
            />
          )}
        </Body>
      </Card>

      <Card title="Subscribers over time" help="People who left their email on your OnePage.">
        <Body blank={blank} wait="chart">
          {blank ? null : (
            <>
              <Figure value={fmtCount(r!.subscribers.value)} h={r!.subscribers} />
              <LineChart series={r!.subscribers.series} format={fmtCount} kind="count" />
            </>
          )}
        </Body>
      </Card>

      <VisitCards b={r?.breakdowns ?? null} blank={blank} noun="views" />
    </>
  )
}

/* ─── The data, read once for the whole page ──────────────────────────── */

export interface StoreAllTime {
  views: number
  orders: number
  salesCents: number
}
export interface OnePageAllTime {
  views: number
  clicks: number
  subscribers: number
}

export type ReportsAnswer =
  | { mode: "store"; key: string; reports: Reports; allTime: StoreAllTime | null; truncated: boolean }
  | { mode: "onepage"; key: string; reports: OnePageReports; allTime: OnePageAllTime | null; truncated: boolean; hasPage: boolean }

export interface ReportsState {
  data: ReportsAnswer | null
  loading: boolean
  failed: boolean
  /**
   * The figures on screen answer another question than the one being asked:
   * a new period, product or mode is on its way. Only then does anything go
   * soft. The page's minute refresh asks the same question again, and that
   * is never stale: the figures stay as they are until the new ones land.
   */
  stale: boolean
}

/**
 * The page's one read of /api/analytics/reports. `compare` is the
 * comparison picker's span, or null for No comparison. A new question
 * aborts the one in flight, so a quick run of taps cannot land out of order.
 * `refresh` asks the same question again, for the page's minute poll.
 */
/** What was asked, without the moving end of a period that runs to now. */
function questionOf(key: string | undefined): string {
  const p = new URLSearchParams(key || "")
  p.delete("end")
  p.delete("cend")
  return p.toString()
}

export function useAnalyticsReports({
  start,
  end,
  compare,
  product,
  mode,
  refresh = 0,
}: {
  start: number
  end: number
  compare: { start: number; end: number } | null
  product: string
  mode: "store" | "onepage"
  refresh?: number
}): ReportsState {
  const [state, setState] = React.useState<{ data: ReportsAnswer | null; loading: boolean; failed: boolean; asking: string }>({
    data: null,
    loading: true,
    failed: false,
    asking: "",
  })
  /* The last answer's text, so an answer that says nothing new changes nothing on screen. */
  const lastText = React.useRef("")
  const cs = compare?.start ?? null
  const ce = compare?.end ?? null
  React.useEffect(() => {
    const ctrl = new AbortController()
    const q = new URLSearchParams({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      tz: viewerTimeZone(),
      product,
      mode,
    })
    if (cs !== null && ce !== null) {
      q.set("cstart", new Date(cs).toISOString())
      q.set("cend", new Date(ce).toISOString())
    } else {
      q.set("compare", "none")
    }
    const key = q.toString()
    const question = questionOf(key)
    /* Same question, same state: a refresh does not even re-render the page until it has something to say. */
    setState((s) => (s.loading && !s.failed && s.asking === question ? s : { ...s, loading: true, failed: false, asking: question }))
    fetch(`/api/analytics/reports?${q}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        setState((s) => {
          /*
            NOTHING NEW, NOTHING DRAWN. The minute refresh usually brings the
            same numbers; handing the page a new object anyway re-rendered
            the chart and the cards for nothing. Keep the one on screen.
          */
          if (s.data && questionOf(s.data.key) === question && text === lastText.current) return { ...s, loading: false, failed: false }
          lastText.current = text
          const json = JSON.parse(text)
          return {
            data: { ...json, allTime: json.allTime ?? null, truncated: !!json.truncated, mode, key } as ReportsAnswer,
            loading: false,
            failed: false,
            asking: question,
          }
        })
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return
        /* A failed refresh of the same question keeps the figures on screen;
           figures for a different question (another period, product or
           mode) would read as this one's, so those go. The end of a running
           period moves every minute, so it is not part of the question. */
        setState((s) => ({ ...s, data: s.data && questionOf(s.data.key) === question ? s.data : null, loading: false, failed: true }))
      })
    return () => ctrl.abort()
  }, [start, end, cs, ce, product, mode, refresh])
  const stale = state.loading && !!state.data && questionOf(state.data.key) !== state.asking
  return React.useMemo(
    () => ({ data: state.data, loading: state.loading, failed: state.failed, stale }),
    [state.data, state.loading, state.failed, stale],
  )
}

/**
 * The cards. Given the page's answer as `state`; without one they read
 * their own, with the period just before as the comparison, which is what
 * the probe in scripts/render-analytics-reports.tsx mounts.
 */
export function AnalyticsReports({
  start,
  end,
  product,
  mode = "store",
  state,
}: {
  start: Date
  end: Date
  product: string
  mode?: "store" | "onepage"
  state?: ReportsState
}) {
  return state ? (
    <ReportsView state={state} mode={mode} />
  ) : (
    <SelfLoading start={start.getTime()} end={end.getTime()} product={product} mode={mode} />
  )
}

function SelfLoading({ start, end, product, mode }: { start: number; end: number; product: string; mode: "store" | "onepage" }) {
  const compare = React.useMemo(() => ({ start: start - (end - start), end: start }), [start, end])
  const state = useAnalyticsReports({ start, end, compare, product, mode })
  return <ReportsView state={state} mode={mode} />
}

function ReportsView({ state, mode: asked }: { state: ReportsState; mode: "store" | "onepage" }) {
  const { data, loading, failed, stale } = state
  /*
    THE CARDS OF THE ANSWER ON SCREEN. A switch to the other mode used to
    put that mode's eight or eleven cards up as skeletons at once, and the
    answer, which is usually quick, replaced them a moment later: a flash of
    grey blocks on every switch. The cards on screen stay now, softened,
    until the other mode's answer lands, and then the grid changes once. The
    chart above does the same (analytics-client, trendMode).
  */
  const mode = data?.mode ?? asked
  const current = data
  const soft = stale

  return (
    <ComparedContext.Provider value={current ? current.reports.compared !== false : true}>
      <div
        aria-busy={loading}
        className={cn("grid gap-4 transition-[opacity,filter] duration-300 md:grid-cols-2 xl:grid-cols-3", soft && "opacity-60 blur-[0.5px]")}
      >
        {failed && !current ? (
          <p className="rounded-xl border border-[#fde8e7] bg-[#fff7f6] px-4 py-3 text-[13px] text-[#8a1c0f] md:col-span-2 xl:col-span-3">
            The reports could not be loaded. Refresh the page to try again.
          </p>
        ) : null}

        {mode === "store" ? (
          <StoreGrid r={current?.mode === "store" ? current.reports : null} />
        ) : (
          <OnePageGrid r={current?.mode === "onepage" ? current.reports : null} hasPage={current?.mode === "onepage" ? current.hasPage !== false : true} />
        )}

        {current?.truncated ? (
          <p className="text-[12px] text-[#9ca3af] md:col-span-2 xl:col-span-3">
            This period has more activity than one report reads at once. Choose a shorter period for exact figures.
          </p>
        ) : null}
      </div>
    </ComparedContext.Provider>
  )
}
