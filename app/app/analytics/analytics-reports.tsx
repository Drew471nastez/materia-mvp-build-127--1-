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
 * READ THE SAME WAY AS THE CHART ABOVE. A pointer or a finger moves a marker
 * that glides from point to point and stops on each one; a sideways drag or
 * a hold scrubs, a finger going down the page is a scroll
 * (components/app/use-chart-scrub).
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
import { Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BreakdownRow, Headline, OnePageReports, Reports, Series } from "@/lib/analytics/reports"
import { axisWidth, compactCount, compactMoney, compactPercent } from "@/lib/analytics/chart-scale"
import { AxisLabels, MORPH_MS, fixedScale, morphEase } from "@/components/app/chart-morph"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { HelpLabel } from "@/components/app/help-label"
import { useChartScrub, type ChartScrub } from "@/components/app/use-chart-scrub"
import { SourceIcon, type IconFor } from "@/components/analytics/source-icon"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

/** Storelib's accent, the one every /app screen already uses. */
export const SERIES = "#8b5cf6"
/** The period it is compared with: grey, dashed, behind. */
export const BEFORE = "#b8bcc6"
/** Two or three parts of a whole, in steps of the same violet. */
const CATEGORICAL = ["#8b5cf6", "#c4b5fd", "#e4dcfd"]
const FUNNEL = ["#6d28d9", "#8b5cf6", "#a78bfa", "#c4b5fd"]
/** Every move of a marker between two points: short, and slowing into place. */
const GLIDE = "transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1)"

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

/**
 * The first placement of a marker is a cut, and every move after it a
 * glide: turning the transition on only once the marker has been painted
 * where it starts is what stops it swooping in from the corner.
 */
export function useGlide(shown: boolean): string {
  const [settled, setSettled] = React.useState(false)
  React.useEffect(() => {
    if (!shown) {
      setSettled(false)
      return
    }
    const id = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(id)
  }, [shown])
  return shown && settled ? GLIDE : "none"
}

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

  const scrub: ChartScrub<HTMLDivElement> = useChartScrub<HTMLDivElement>((clientX: number): number | null => {
    const el: HTMLDivElement | null = scrub.ref.current
    if (!el || n === 0) return null
    const px: number = clientX - el.getBoundingClientRect().left
    if (px < pad.l - 16 || px > W - pad.r + 16) return null
    return Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / plotW) * (n - 1))))
  })

  React.useLayoutEffect(() => {
    const el = scrub.ref.current
    if (!el) return
    const measure = () => setW(Math.max(160, Math.round(el.getBoundingClientRect().width)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const i = scrub.index
  const glide = useGlide(i !== null)
  const gradient = React.useId().replace(/:/g, "")

  return (
    <div
      ref={scrub.ref}
      className="relative mt-3 select-none [-webkit-touch-callout:none]"
      style={{ touchAction: "pan-y" }}
      onPointerMove={scrub.onPointerMove}
      onPointerLeave={scrub.onPointerLeave}
    >
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
        {i !== null ? (
          <g style={{ transform: `translateX(${x(i).toFixed(1)}px)`, transition: glide }}>
            <line x1={0} x2={0} y1={pad.t} y2={H - pad.b} stroke="#d4d6dc" strokeWidth={1} />
          </g>
        ) : null}
        {i !== null && compared ? (
          <circle
            r={3}
            cx={0}
            cy={0}
            fill="#fff"
            stroke={BEFORE}
            strokeWidth={1.5}
            style={{ transform: `translate(${x(i).toFixed(1)}px, ${y(series.previous[i] ?? 0).toFixed(1)}px)`, transition: glide }}
          />
        ) : null}
        {i !== null ? (
          <circle
            r={4.5}
            cx={0}
            cy={0}
            fill={SERIES}
            stroke="#fff"
            strokeWidth={2}
            style={{ transform: `translate(${x(i).toFixed(1)}px, ${y(series.current[i]).toFixed(1)}px)`, transition: glide }}
          />
        ) : null}
      </svg>
      <AxisLabels labels={labels} top={pad.t} height={plotH} width={pad.l} fontSize={10} />
      {i !== null ? (
        <div
          className="pointer-events-none absolute top-0 left-0 z-10 min-w-[136px] rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] shadow-[0_10px_28px_-8px_rgba(17,24,39,0.22)]"
          style={{
            transform: `translateX(clamp(0px, calc(${x(i).toFixed(1)}px - 50%), calc(${W}px - 100%))) translateY(-12px)`,
            transition: glide,
            willChange: "transform",
          }}
        >
          <p className="text-[11px] font-medium text-[#6b7280]">{series.labels[i]}</p>
          <p className="mt-1 flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[#4b5563]">
              <span className="h-[2px] w-3 rounded" style={{ background: SERIES }} />
              {compared ? "This period" : "Value"}
            </span>
            <span className="font-semibold tabular-nums text-[#1a1a2e]">{format(series.current[i])}</span>
          </p>
          {compared ? (
            <p className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-[#6b7280]">
                <span className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: BEFORE }} />
                Before
              </span>
              <span className="tabular-nums text-[#4b5563]">{format(series.previous[i] ?? 0)}</span>
            </p>
          ) : null}
        </div>
      ) : null}
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

function flagOf(code: string): React.ReactNode {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return <Globe className="h-3.5 w-3.5 text-[#9ca3af]" />
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)))
}

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
    <li className="group flex h-10 items-center gap-2.5" title={sub ?? undefined}>
      {lead && "flag" in lead ? (
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center text-[15px] leading-none">
          {flagOf(r.extra?.code ?? r.key)}
        </span>
      ) : lead ? (
        <SourceIcon kind={lead.icon} value={r.key} />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className="min-w-0 flex-1 truncate text-[#303036]" title={r.label}>
            {r.label}
          </span>
          <span className="shrink-0 font-medium tabular-nums text-[#1a1a2e]">{format(r.value)}</span>
          {compared ? (
            <span className="w-11 shrink-0 text-right">
              <RowChange r={r} />
            </span>
          ) : null}
        </div>
        <div className={cn("mt-1.5", compared && "pr-[52px]")}>
          <div
            className="h-[6px] rounded-r-[3px] transition-[width,opacity] duration-500 group-hover:opacity-100"
            style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: SERIES, opacity: 0.8 }}
          />
        </div>
      </div>
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

function Skeleton({ lines = false }: { lines?: boolean }) {
  return (
    <div className="animate-pulse" aria-hidden>
      {lines ? <div className="h-7 w-28 rounded-md bg-[#f1f2f4]" /> : null}
      <div className={cn("space-y-4", lines ? "mt-5" : "mt-1")}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-3 rounded bg-[#f3f4f6]" style={{ width: `${88 - i * 14}%` }} />
        ))}
      </div>
    </div>
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
const SOURCE_ICON: Record<SourceTab, IconFor | null> = { source: "source", referrer: "referrer", social: "social", campaign: null }

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
        <div className={BODY}>
          {blank || !b ? (
            <Skeleton />
          ) : (
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
        </div>
      </Card>

      <Card
        title={`${noun === "visits" ? "Sessions" : "Views"} by location`}
        help="Where visitors were, from their connection."
        tabs={<Tabs value={placeTab} onChange={setPlaceTab} options={[{ value: "country", label: "Country" }, { value: "city", label: "City" }]} />}
      >
        <div className={BODY}>
          {blank || !b ? (
            <Skeleton />
          ) : (
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
        </div>
      </Card>

      <Card
        title={`${noun === "visits" ? "Sessions" : "Views"} by device`}
        help="The device, browser and system of the first page of each visit."
        tabs={<Tabs value={deviceTab} onChange={setDeviceTab} options={DEVICE_TABS} />}
      >
        <div className={BODY}>
          {blank || !b ? (
            <Skeleton />
          ) : (
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
        </div>
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
        <div className={BODY}>
          {blank ? <Skeleton /> : r!.salesByChannel.length === 0 ? <Empty>No orders in this period</Empty> : (
            <Donut rows={r!.salesByChannel} total={fmtMoneyShort(r!.sales.value)} format={fmtMoneyShort} sub={orders} />
          )}
        </div>
      </Card>

      <Card title="Average order value over time" help="What a paying buyer spent in one order, on average. Free orders are left out.">
        <div className={BODY}>
          {blank ? <Skeleton lines /> : (
            <>
              <Figure value={fmtMoney(r!.aov.value)} h={r!.aov} />
              <LineChart series={r!.aov.series} format={fmtMoney} kind="money" />
            </>
          )}
        </div>
      </Card>

      <Card title="Total sales by product" help="Each product's share of the money taken, less refunds, and how many were sold.">
        <div className={BODY}>
          {blank ? <Skeleton /> : (
            <BarList
              title="Total sales by product"
              rows={r!.salesByProduct}
              format={fmtMoney}
              sub={(row) => `${fmtCount(row.extra?.orders ?? 0)} sold`}
              empty="No sales in this period"
            />
          )}
        </div>
      </Card>

      <Card title="Sessions over time" help="Visits to your Storelib page and your website. A visit ends after 30 minutes without opening a page. Your own visits and search engine robots are not counted.">
        <div className={BODY}>
          {blank ? <Skeleton lines /> : (
            <>
              <Figure value={fmtCount(r!.sessions.value)} h={r!.sessions} />
              <LineChart series={r!.sessions.series} format={fmtCount} kind="count" />
            </>
          )}
        </div>
      </Card>

      <Card title="Conversion rate over time" help="Orders divided by visits: how many visits ended in an order.">
        <div className={BODY}>
          {blank ? <Skeleton lines /> : (
            <>
              <Figure value={fmtPct(r!.conversion.value)} h={r!.conversion} />
              <LineChart series={r!.conversion.series} format={fmtPct} kind="percent" />
            </>
          )}
        </div>
      </Card>

      <Card title="Conversion rate breakdown" help="Of the visits in the period, how many pressed Buy, how many reached the checkout, and how many ordered.">
        <div className={BODY}>
          {blank ? <Skeleton /> : (
            <>
              <Figure value={fmtPct(r!.conversion.value)} h={r!.conversion} />
              <Funnel steps={r!.funnel} />
            </>
          )}
        </div>
      </Card>

      <VisitCards b={r?.breakdowns ?? null} blank={blank} noun="visits" />

      <Card title="Sessions by landing page" help="The page each visit started on." className="md:col-span-2">
        <div className={BODY}>
          {blank ? <Skeleton /> : (
            <BarList
              title="Sessions by landing page"
              rows={r!.breakdowns.landing}
              format={fmtCount}
              sub={(row) => `${Math.round(row.share * 100)}% of visits`}
              empty="No visits in this period"
            />
          )}
        </div>
      </Card>

      <Card title="Sessions by channel" help="Visits to your Storelib page, and visits to the website you built.">
        <div className={BODY}>
          {blank ? <Skeleton /> : r!.sessions.value === 0 ? <Empty>No visits in this period</Empty> : (
            <Donut rows={r!.breakdowns.channel} total={fmtCount(r!.sessions.value)} format={fmtCount} />
          )}
        </div>
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
        <div className={BODY}>
          {blank ? <Skeleton lines /> : (
            <>
              <Figure value={fmtCount(r!.views.value)} h={r!.views} />
              <LineChart series={r!.views.series} format={fmtCount} kind="count" />
            </>
          )}
        </div>
      </Card>

      <Card title="Link clicks over time" help="Taps on the links and buttons of your OnePage. One person's taps on the same link count once a day.">
        <div className={BODY}>
          {blank ? <Skeleton lines /> : (
            <>
              <Figure value={fmtCount(r!.clicks.value)} h={r!.clicks} />
              <LineChart series={r!.clicks.series} format={fmtCount} kind="count" />
            </>
          )}
        </div>
      </Card>

      <Card title="Click-through rate" help="Link clicks divided by views: how often a visit led somewhere.">
        <div className={BODY}>
          {blank ? <Skeleton lines /> : (
            <>
              <Figure value={fmtPct(r!.ctr.value)} h={r!.ctr} />
              <LineChart series={r!.ctr.series} format={fmtPct} kind="percent" />
            </>
          )}
        </div>
      </Card>

      <Card title="Top links" help="Which links and buttons were tapped most, by the name they have on your OnePage." className="md:col-span-2">
        <div className={BODY}>
          {blank ? <Skeleton /> : (
            <BarList
              title="Top links"
              rows={r!.links}
              format={fmtCount}
              sub={(row) => `${Math.round(row.share * 100)}% of clicks`}
              empty="No link clicks in this period"
            />
          )}
        </div>
      </Card>

      <Card title="Subscribers over time" help="People who left their email on your OnePage.">
        <div className={BODY}>
          {blank ? <Skeleton lines /> : (
            <>
              <Figure value={fmtCount(r!.subscribers.value)} h={r!.subscribers} />
              <LineChart series={r!.subscribers.series} format={fmtCount} kind="count" />
            </>
          )}
        </div>
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
  const [state, setState] = React.useState<ReportsState>({ data: null, loading: true, failed: false })
  const cs = compare?.start ?? null
  const ce = compare?.end ?? null
  React.useEffect(() => {
    const ctrl = new AbortController()
    setState((s) => ({ ...s, loading: true, failed: false }))
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
    fetch(`/api/analytics/reports?${q}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        setState({
          data: { ...json, allTime: json.allTime ?? null, truncated: !!json.truncated, mode, key } as ReportsAnswer,
          loading: false,
          failed: false,
        })
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return
        /* A failed refresh of the same question keeps the figures on screen;
           figures for a different question (another period, product or
           mode) would read as this one's, so those go. The end of a running
           period moves every minute, so it is not part of the question. */
        setState((s) => ({ data: s.data && questionOf(s.data.key) === question ? s.data : null, loading: false, failed: true }))
      })
    return () => ctrl.abort()
  }, [start, end, cs, ce, product, mode, refresh])
  return state
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

function ReportsView({ state, mode }: { state: ReportsState; mode: "store" | "onepage" }) {
  const { data, loading, failed } = state
  /* Reports for the other mode are not these reports: draw the frames. */
  const current = data && data.mode === mode ? data : null
  const soft = loading && !!current

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
