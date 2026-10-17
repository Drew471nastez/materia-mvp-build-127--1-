"use client"

/**
 * ===========================================================================
 *  THE 75TH PERCENTILE OVER TIME, FOR ONE METRIC
 * ===========================================================================
 * Website settings › Performance's chart: one line per device (Mobile in
 * the builder's violet, Desktop in teal, validated together against this
 * page's dark card with the dataviz palette check: lightness band, CVD
 * separation 18.0 ΔE deutan, contrast all over 3:1), Google's two lines for
 * the metric as hairlines labelled Good and Poor, and a crosshair that
 * finds the nearest point under a pointer, a finger or the arrow keys,
 * with one readout for every line at that point.
 *
 * A point with too few page views behind it (MIN_POINT_SAMPLES) is a gap,
 * never a guess. Plain SVG: the width is measured once per resize, and the
 * crosshair is moved without laying anything out.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { PERF_THRESHOLDS, formatPerf, type PerfDevice, type RumMetric } from "@/lib/website-builder/web-performance"

export const DEVICE_COLOR: Record<PerfDevice, string> = { mobile: "#8b6cf6", desktop: "#26a69a" }

export interface ChartPoint {
  t: string
  values: Partial<Record<PerfDevice, number | null>>
  samples: Partial<Record<PerfDevice, number>>
}

const H = 200
const PAD_TOP = 12
const PAD_BOTTOM = 26
const PAD_LEFT = 44
const PAD_RIGHT = 12

function niceTop(max: number, metric: RumMetric): number {
  if (metric === "cls") {
    const steps = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10]
    return steps.find((s) => s >= max) ?? 10
  }
  const steps = [300, 600, 900, 1200, 1500, 2000, 2400, 3000, 3600, 4500, 6000, 7500, 9000, 12_000, 15_000, 20_000, 30_000, 45_000, 60_000]
  return steps.find((s) => s >= max) ?? 60_000
}

export function PerformanceChart({
  points,
  metric,
  devices,
  grain,
  label,
}: {
  points: ChartPoint[]
  metric: RumMetric
  devices: PerfDevice[]
  grain: "hour" | "day"
  label: string
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const thresholds = metric === "nav" ? null : PERF_THRESHOLDS[metric]
  const values = points.flatMap((p) => devices.map((d) => p.values[d]).filter((v): v is number => typeof v === "number"))
  const hasLine = values.length > 0
  const top = niceTop(Math.max(...values, thresholds ? thresholds[0] * 1.2 : 0, metric === "cls" ? 0.05 : 300) * 1.08, metric)
  const plotW = Math.max(40, width - PAD_LEFT - PAD_RIGHT)
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const x = (i: number) => PAD_LEFT + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (v: number) => PAD_TOP + (1 - Math.min(v, top) / top) * plotH
  const ticks = [0, top / 3, (2 * top) / 3, top]

  const fmtTime = useMemo(() => {
    const f = new Intl.DateTimeFormat(appLocale(), grain === "hour" ? { hour: "numeric" } : { day: "numeric", month: "short" })
    const full = new Intl.DateTimeFormat(appLocale(), grain === "hour" ? { weekday: "short", hour: "numeric", minute: "2-digit" } : { weekday: "short", day: "numeric", month: "long" })
    return { short: (t: string) => f.format(new Date(t)), full: (t: string) => full.format(new Date(t)) }
  }, [grain])

  /* A line is broken wherever a point has too few visits. */
  const paths = devices.map((d) => {
    let dPath = ""
    let open = false
    points.forEach((p, i) => {
      const v = p.values[d]
      if (typeof v !== "number") {
        open = false
        return
      }
      dPath += `${open ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      open = true
    })
    /* A lone point between gaps is drawn as a dot, so it is not lost. */
    const lone = points
      .map((p, i) => ({ v: p.values[d], i }))
      .filter(({ v, i }) => typeof v === "number" && typeof points[i - 1]?.values[d] !== "number" && typeof points[i + 1]?.values[d] !== "number")
    return { d, dPath, lone }
  })

  const labelIdx = points.length <= 1 ? [0] : [0, Math.floor((points.length - 1) / 2), points.length - 1]

  const pick = (clientX: number) => {
    const el = box.current
    if (!el || points.length === 0) return
    const rect = el.getBoundingClientRect()
    const rel = clientX - rect.left - PAD_LEFT
    const i = points.length <= 1 ? 0 : Math.round((rel / plotW) * (points.length - 1))
    setActive(Math.max(0, Math.min(points.length - 1, i)))
  }

  const at = active !== null ? points[active] : null
  const tipLeft = active !== null ? Math.min(Math.max(x(active) - 112, 0), Math.max(0, width - 224)) : 0

  return (
    <div
      ref={box}
      className="relative select-none"
      data-perf-chart=""
      role="img"
      aria-label={label}
      tabIndex={0}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setActive(null)
      }}
      onBlur={() => setActive(null)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
        e.preventDefault()
        const step = e.key === "ArrowLeft" ? -1 : 1
        setActive((a) => Math.max(0, Math.min(points.length - 1, (a ?? (step > 0 ? -1 : points.length)) + step)))
      }}
      style={{ touchAction: "pan-y" }}
    >
      <svg width={width} height={H} className="block overflow-visible" aria-hidden>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_LEFT} x2={PAD_LEFT + plotW} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
            <text x={PAD_LEFT - 8} y={y(t) + 4} textAnchor="end" className="fill-white/40 text-[11px] tabular-nums">
              {t === 0 ? "0" : formatPerf(metric, t)}
            </text>
          </g>
        ))}
        {thresholds &&
          thresholds.map((v, i) =>
            v <= top ? (
              <g key={v} data-threshold={i === 0 ? "good" : "poor"}>
                <line x1={PAD_LEFT} x2={PAD_LEFT + plotW} y1={y(v)} y2={y(v)} stroke={i === 0 ? "rgba(12,163,12,0.55)" : "rgba(208,59,59,0.6)"} strokeWidth={1} />
                <text x={PAD_LEFT + plotW} y={y(v) - 5} textAnchor="end" className="fill-white/45 text-[11px]">
                  {i === 0 ? tt("Good up to {value}", { value: formatPerf(metric, v) }) : tt("Poor over {value}", { value: formatPerf(metric, v) })}
                </text>
              </g>
            ) : null,
          )}
        {paths.map(({ d, dPath, lone }) => (
          <g key={d}>
            <path d={dPath} fill="none" stroke={DEVICE_COLOR[d]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {lone.map(({ v, i }) => (
              <circle key={i} cx={x(i)} cy={y(v as number)} r={3} fill={DEVICE_COLOR[d]} />
            ))}
          </g>
        ))}
        {labelIdx.map((i, k) =>
          points[i] ? (
            <text key={`${i}-${k}`} x={x(i)} y={H - 8} textAnchor={k === 0 ? "start" : k === labelIdx.length - 1 ? "end" : "middle"} className="fill-white/40 text-[11px]">
              {fmtTime.short(points[i].t)}
            </text>
          ) : null,
        )}
        {at && active !== null && (
          <g data-crosshair="">
            <line x1={x(active)} x2={x(active)} y1={PAD_TOP} y2={PAD_TOP + plotH} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
            {devices.map((d) =>
              typeof at.values[d] === "number" ? (
                <circle key={d} cx={x(active)} cy={y(at.values[d] as number)} r={4.5} fill={DEVICE_COLOR[d]} stroke="#161616" strokeWidth={2} />
              ) : null,
            )}
          </g>
        )}
      </svg>
      {!hasLine && (
        <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-[13px] text-white/50">
          {grain === "hour" ? tt("Not enough visits per hour to draw a line yet.") : tt("Not enough visits per day to draw a line yet.")}
        </p>
      )}
      {at && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-[224px] rounded-lg border border-white/10 bg-[#202020] px-3 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
          style={{ transform: `translateX(${tipLeft}px)` }}
          data-perf-tooltip=""
        >
          <p className="text-[12px] text-white/55">{fmtTime.full(at.t)}</p>
          {devices.map((d) => {
            const v = at.values[d]
            const n = at.samples[d] ?? 0
            return (
              <div key={d} className="mt-1 flex items-baseline gap-2 whitespace-nowrap">
                <span className="h-[2px] w-3 shrink-0 self-center rounded-full" style={{ background: DEVICE_COLOR[d] }} aria-hidden />
                <span className={cn("text-[13px] font-semibold tabular-nums", typeof v === "number" ? "text-white" : "text-white/45")}>
                  {typeof v === "number" ? formatPerf(metric, v) : n > 0 ? tt("Too few") : "–"}
                </span>
                <span className="text-[12px] text-white/60">{d === "mobile" ? tt("Mobile") : tt("Desktop")}</span>
                <span className="ml-auto text-[11.5px] tabular-nums text-white/40">{tt("{count} measured", { count: n })}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
