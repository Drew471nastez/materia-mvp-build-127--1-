"use client"

/**
 * ===========================================================================
 *  REVIEWS › ANALYTICS: THE CHARTS
 * ===========================================================================
 * Drawn here in plain SVG, in the /app analytics palette (components/app/
 * analytics-chart CHART_COLORS): the period in Storelib's violet, the period
 * it is compared with in a quiet grey. One axis each, hairline grids, thin
 * marks with 4px rounded ends, a readout that follows the pointer or the
 * keyboard and lists every series at that point, and a table of the same
 * numbers a press away, so nothing is read from colour or hover alone.
 *
 *   VolumeChart        reviews written per day, week or month (columns),
 *                      the previous period as a line through the same slots
 *   RatingTrend        the mean rating per slot (a line, a gap where nothing
 *                      was written), on a fixed 1 to 5 scale
 *   Distribution       how many of each rating (bars, five first)
 *   Funnel             request emails: went, not delivered, reviewed
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatNumber, formatPercent } from "@/lib/i18n/format"
import { niceMax, type Granularity, type SeriesPoint } from "@/lib/reviews/analytics"

export const ACCENT = "#8b5cf6"
export const COMPARED = "#b8bcc6"
const GRID = "#eef0f2"
const AXIS_TEXT = "#9ca3af"

/** The width the chart has, measured, so its text is drawn at its own size rather than stretched. */
function useWidth(fallback = 640): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = React.useRef<HTMLDivElement>(null)
  const [w, setW] = React.useState(fallback)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setW(Math.max(240, Math.round(el.getBoundingClientRect().width)))
    read()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  return [ref, w]
}

export function slotLabel(start: number, g: Granularity, long = false): string {
  const d = new Date(start)
  const opts: Intl.DateTimeFormatOptions = g === "month" ? { month: long ? "long" : "short", year: long ? "numeric" : undefined, timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" }
  try {
    return d.toLocaleDateString(undefined, opts)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

function rangeLabel(p: SeriesPoint, g: Granularity): string {
  if (g === "day") return slotLabel(p.start, g, true)
  if (g === "month") return slotLabel(p.start, g, true)
  return tt("{from} to {to}", { from: slotLabel(p.start, "day"), to: slotLabel(p.end - 1, "day") })
}

/** A rounded top, square at the baseline: the column's path. */
function column(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return ""
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

interface Readout {
  x: number
  title: string
  rows: { color: string; label: string; value: string; line?: boolean }[]
}

function Tooltip({ readout, width }: { readout: Readout | null; width: number }) {
  if (!readout) return null
  const left = Math.min(Math.max(readout.x, 90), width - 90)
  return (
    <div role="status" className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-[12.5px] shadow-[0_0_0_1px_rgba(16,24,40,0.08),0_6px_18px_-6px_rgba(16,24,40,0.25)]" style={{ left }}>
      <p className="whitespace-nowrap text-[#6b7280]">{readout.title}</p>
      {readout.rows.map((r) => (
        <p key={r.label} className="mt-0.5 flex items-center gap-2 whitespace-nowrap">
          <span aria-hidden className={r.line ? "h-0.5 w-3 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"} style={{ background: r.color }} />
          <span className="font-semibold tabular-nums text-[#1a1a2e]">{r.value}</span>
          <span className="text-[#6b7280]">{r.label}</span>
        </p>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[#4b5563]">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className={i.line ? "h-0.5 w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"} style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

const H = 200
const PAD = { top: 12, right: 8, bottom: 24, left: 36 }

/** Reviews per slot, the previous period's as a line over the same slots. */
export function VolumeChart({ series, previous, granularity }: { series: SeriesPoint[]; previous: SeriesPoint[] | null; granularity: Granularity }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = React.useState<number | null>(null)
  const top = niceMax(Math.max(0, ...series.map((s) => s.count), ...(previous ?? []).map((s) => s.count)))
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / Math.max(1, series.length)
  const barW = Math.max(2, Math.min(24, band - 2))
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH
  const cx = (i: number) => PAD.left + band * i + band / 2
  const ticks = [0, top / 3, (2 * top) / 3, top]
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(innerW / 64))))
  const line = previous && previous.length === series.length ? previous.map((p, i) => `${i ? "L" : "M"}${cx(i)},${y(p.count)}`).join("") : null
  const readout: Readout | null =
    hover === null || !series[hover]
      ? null
      : {
          x: cx(hover),
          title: rangeLabel(series[hover], granularity),
          rows: [
            { color: ACCENT, label: tt("reviews"), value: formatNumber(series[hover].count) },
            ...(previous?.[hover] ? [{ color: COMPARED, label: tt("the period before"), value: formatNumber(previous[hover].count), line: true }] : []),
          ],
        }
  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      <Tooltip readout={readout} width={width} />
      <svg width={width} height={H} role="img" aria-label={tt("Reviews written over time")} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT} className="tabular-nums">
              {formatNumber(Math.round(t))}
            </text>
          </g>
        ))}
        {series.map((s, i) => (
          <path key={s.start} d={column(cx(i) - barW / 2, y(s.count), barW, y(0) - y(s.count))} fill={ACCENT} opacity={hover === null || hover === i ? 1 : 0.55} />
        ))}
        {line ? <path d={line} fill="none" stroke={COMPARED} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {series.map((s, i) =>
          i % labelEvery === 0 ? (
            <text key={`l${s.start}`} x={cx(i)} y={H - 6} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
              {slotLabel(s.start, granularity)}
            </text>
          ) : null,
        )}
        {series.map((s, i) => (
          <rect
            key={`h${s.start}`}
            x={PAD.left + band * i}
            y={PAD.top}
            width={band}
            height={innerH}
            fill="transparent"
            tabIndex={i === 0 ? 0 : -1}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setHover((h) => Math.min(series.length - 1, (h ?? -1) + 1))
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? 1) - 1))
            }}
            aria-label={`${rangeLabel(s, granularity)}: ${formatNumber(s.count)}`}
          />
        ))}
      </svg>
    </div>
  )
}

/** The mean rating per slot, 1 to 5, a gap where nothing was written. */
export function RatingTrend({ series, previous, granularity }: { series: SeriesPoint[]; previous: SeriesPoint[] | null; granularity: Granularity }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = React.useState<number | null>(null)
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const step = series.length > 1 ? innerW / (series.length - 1) : innerW
  const x = (i: number) => PAD.left + (series.length > 1 ? step * i : innerW / 2)
  const y = (v: number) => PAD.top + innerH - ((v - 1) / 4) * innerH
  const path = (list: SeriesPoint[]) => {
    let d = ""
    let pen = false
    list.forEach((p, i) => {
      if (p.average === null) {
        pen = false
        return
      }
      d += `${pen ? "L" : "M"}${x(i)},${y(p.average)}`
      pen = true
    })
    return d
  }
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(innerW / 64))))
  const lone = series.map((p, i) => (p.average !== null && (series[i - 1]?.average ?? null) === null && (series[i + 1]?.average ?? null) === null ? i : -1)).filter((i) => i >= 0)
  const near = (px: number) => {
    let best = -1
    let dist = Infinity
    series.forEach((p, i) => {
      if (p.average === null) return
      const dd = Math.abs(x(i) - px)
      if (dd < dist) {
        dist = dd
        best = i
      }
    })
    return best < 0 ? null : best
  }
  const h = hover !== null ? series[hover] : null
  const readout: Readout | null =
    hover === null || !h || h.average === null
      ? null
      : {
          x: x(hover),
          title: rangeLabel(h, granularity),
          rows: [
            { color: ACCENT, label: tt("{n, plural, one {from # review} other {from # reviews}}", { n: h.count }), value: formatNumber(h.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), line: true },
            ...(previous?.[hover]?.average != null ? [{ color: COMPARED, label: tt("the period before"), value: formatNumber(previous[hover].average as number, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), line: true }] : []),
          ],
        }
  return (
    <div
      ref={ref}
      className="relative"
      onPointerMove={(e) => setHover(near(e.clientX - e.currentTarget.getBoundingClientRect().left))}
      onPointerLeave={() => setHover(null)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
        const dir = e.key === "ArrowRight" ? 1 : -1
        let i = (hover ?? (dir > 0 ? -1 : series.length)) + dir
        while (i >= 0 && i < series.length && series[i].average === null) i += dir
        if (i >= 0 && i < series.length) setHover(i)
      }}
      aria-label={tt("Average rating over time. Use the arrow keys to read each point.")}
    >
      <Tooltip readout={readout} width={width} />
      <svg width={width} height={H} role="img" aria-label={tt("Average rating over time")} className="block">
        {[1, 2, 3, 4, 5].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
              {t}
            </text>
          </g>
        ))}
        {previous && previous.length === series.length ? <path d={path(previous)} fill="none" stroke={COMPARED} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
        <path d={path(series)} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {lone.map((i) => (
          <circle key={`p${i}`} cx={x(i)} cy={y(series[i].average as number)} r={4} fill={ACCENT} stroke="#fff" strokeWidth={2} />
        ))}
        {hover !== null && h && h.average !== null ? (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#d1d5db" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(h.average)} r={5} fill={ACCENT} stroke="#fff" strokeWidth={2} />
          </>
        ) : null}
        {series.map((s, i) =>
          i % labelEvery === 0 ? (
            <text key={`l${s.start}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
              {slotLabel(s.start, granularity)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}

/** How many of each rating: bars from one baseline, the count and its share at the tip. */
export function Distribution({ rows, previous }: { rows: { stars: number; count: number; share: number }[]; previous: { stars: number; count: number; share: number }[] | null }) {
  const most = Math.max(1, ...rows.map((r) => r.count))
  return (
    <ul className="space-y-2.5" aria-label={tt("Ratings")}>
      {rows.map((r) => {
        const before = previous?.find((p) => p.stars === r.stars)
        return (
          <li key={r.stars} className="grid grid-cols-[56px_minmax(0,1fr)_minmax(84px,auto)] items-center gap-3 text-[13px]" title={before ? tt("{count} in the period before", { count: formatNumber(before.count) }) : undefined}>
            <span className="text-[#4b5563]">{tt("{n, plural, one {# star} other {# stars}}", { n: r.stars })}</span>
            <span className="h-2.5 overflow-hidden rounded-r-[4px] bg-[#f4f5f7]">
              <span className="block h-full rounded-r-[4px]" style={{ width: `${(r.count / most) * 100}%`, background: ACCENT }} />
            </span>
            <span className="text-right tabular-nums text-[#1a1a2e]">
              {formatNumber(r.count)} <span className="text-[#9ca3af]">· {formatPercent(r.share, 0)}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Request emails, as one baseline: went, not delivered, reviewed. */
export function Funnel({ sent, failed, reviewed }: { sent: number; failed: number; reviewed: number }) {
  const whole = Math.max(1, sent + failed)
  const rows = [
    { label: tt("Emails that went"), value: sent },
    { label: tt("Not delivered"), value: failed },
    { label: tt("Led to a review"), value: reviewed },
  ]
  return (
    <ul className="space-y-2.5" aria-label={tt("Request emails")}>
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[112px_minmax(0,1fr)_56px] items-center gap-3 text-[13px] sm:grid-cols-[132px_minmax(0,1fr)_64px]">
          <span className="text-[#4b5563]">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-r-[4px] bg-[#f4f5f7]">
            <span className={cn("block h-full rounded-r-[4px]")} style={{ width: `${(r.value / whole) * 100}%`, background: i === 1 ? COMPARED : ACCENT }} />
          </span>
          <span className="text-right tabular-nums text-[#1a1a2e]">{formatNumber(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}
