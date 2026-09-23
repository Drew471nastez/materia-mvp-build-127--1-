"use client"

/**
 * ===========================================================================
 *  THE ANALYTICS TREND CHART
 * ===========================================================================
 * The chart under the metric tabs at the top of Analytics. At module scope
 * and behind React.memo, so a state change anywhere else on the page does
 * not reach recharts.
 *
 * TWO LAYERS, AND ONLY ONE OF THEM MOVES.
 *
 *   The PLOT is recharts: grid, axes, the line and the dashed comparison.
 *   It is memoised on the series alone, so it is drawn when data arrives and
 *   at no other time.
 *
 *   The MARKER is ours: a crosshair, a dot on each line and the readout,
 *   absolutely placed over the plot and moved with CSS transforms. A finger
 *   or a pointer moving along the chart changes the marker and nothing else.
 *
 * It used to be one layer. Every point a finger crossed set React state that
 * the plot read (the dots were drawn by a function of the active index), so
 * each step of a scrub re-ran recharts over every path and every dot, on the
 * same thread that was handling the finger. That is the lack of smoothness:
 * on a phone the marker arrived a frame or two behind the thumb, and then
 * jumped. Now a step is a transform on four nodes, and between two points the
 * marker glides for 140ms and stops exactly on the day it reports.
 *
 * ONE WAY TO READ A CHART. The finger and the pointer go through
 * components/app/use-chart-scrub, the same gesture the report cards under
 * this chart use: a sideways drag or a short hold scrubs, a finger going
 * down the page scrolls it, and each new point is a light tick.
 *
 * THE SCALE IS OURS TOO (lib/analytics/chart-scale). A top with headroom
 * above the highest point and whole-number ticks for counts, so a day of one
 * view is drawn in the middle of the card rather than along its top edge,
 * and an axis exactly as wide as its widest label.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ComponentProps } from "react"
import { XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area } from "recharts"

import { CHART_ANIM_MS } from "@/lib/chart-motion"
import { axisWidth, compactCount, compactMoney, compactPercent, niceScale } from "@/lib/analytics/chart-scale"
import { useChartScrub } from "@/components/app/use-chart-scrub"

/** How tall the chart is, and the band under the plot that holds the dates. */
const CHART_H = 200
const XAXIS_H = 24
/** The right margin: room for the last point's dot and its ring. */
const PLOT_RIGHT = 10
/** Room above for the active dot: six pixels of radius plus its white ring. */
const PLOT_TOP = 10
/** A marker moving from one point to the next: short, and slowing into place. */
const GLIDE = "transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1)"

/** Storelib's accent for the line, and a quiet grey for what it is compared with. */
export const CHART_COLORS = {
  views: "#8b5cf6",
  clicks: "#8b5cf6",
  orders: "#8b5cf6",
  revenue: "#8b5cf6",
  conversion: "#8b5cf6",
  subscribers: "#8b5cf6",
  ctr: "#8b5cf6",
  compared: "#b8bcc6",
}

export interface AnalyticsChartData {
  date: string
  views: number
  sales: number
  revenue: number
  clicks?: number
  subscribers?: number
  refunds?: number
  conversion?: number
  ctr?: number
  prev_views?: number
  prev_sales?: number
  prev_revenue?: number
  prev_refunds?: number
  prev_conversion?: number
}

type Key = keyof AnalyticsChartData

/**
 * The key of the comparison series for one metric filter, or null. Drawn
 * only when one metric is showing: four solid lines and four dashed ones on
 * one plot is a drawing nobody can read.
 */
function previousKeyFor(filter: string): Key | null {
  if (filter === "views") return "prev_views"
  if (filter === "orders") return "prev_sales"
  if (filter === "revenue") return "prev_revenue"
  if (filter === "conversion") return "prev_conversion"
  return null
}

const LABELS: Record<string, string> = {
  views: "Views",
  clicks: "Clicks",
  sales: "Orders",
  revenue: "Revenue",
  subscribers: "Subscribers",
  conversion: "Conversion",
  ctr: "CTR",
}

/** The series one set of tabs draws. One metric at a time, in one unit. */
function visibleKeysFor(mode: "store" | "onepage", metric: string, onePage: string): Key[] {
  if (mode === "store") {
    const k: Key[] = []
    if (metric === "all" || metric === "views") k.push("views")
    if (metric === "all" || metric === "orders") k.push("sales")
    if (metric === "all" || metric === "revenue") k.push("revenue")
    if (metric === "conversion") k.push("conversion")
    return k
  }
  const k: Key[] = []
  if (onePage === "all" || onePage === "views") k.push("views")
  if (onePage === "all" || onePage === "clicks") k.push("clicks")
  if (onePage === "all" || onePage === "subscribers") k.push("subscribers")
  if (onePage === "ctr") k.push("ctr")
  return k
}

/* ─── The plot: recharts, drawn when the series changes ─────────────────── */

interface PlotProps {
  data: AnalyticsChartData[]
  analyticsMode: "store" | "onepage"
  chartMetricFilter: string
  onePageChartFilter: string
  isLoading: boolean
  compareKey: Key | null
  top: number
  ticks: number[]
  plotLeft: number
  axisTick: (v: number) => string
}

const Plot = memo(function Plot({
  data: chartDisplayData,
  analyticsMode,
  chartMetricFilter,
  onePageChartFilter,
  isLoading,
  compareKey,
  top,
  ticks,
  plotLeft,
  axisTick,
}: PlotProps) {
  const [shouldAnimate, setShouldAnimate] = useState(true)

  /**
   * THE DRAW-IN IS DECIDED BY THE RENDER THAT RECEIVES THE DATA. An effect
   * runs after the render it belongs to, so recharts would draw the new
   * series with the old flag still down and only then be told to animate,
   * with nothing left to play. Setting state during this render re-runs it
   * before anything is committed. The series only: a metric changing is a
   * request for data, not the arrival of any.
   */
  const seenSeriesRef = useRef(chartDisplayData)
  if (seenSeriesRef.current !== chartDisplayData) {
    seenSeriesRef.current = chartDisplayData
    if (!shouldAnimate) setShouldAnimate(true)
  }

  /* Play the draw-in once, then switch it off so nothing re-animates. */
  useEffect(() => {
    if (!shouldAnimate) return
    const timer = setTimeout(() => setShouldAnimate(false), CHART_ANIM_MS)
    return () => clearTimeout(timer)
  }, [shouldAnimate, chartDisplayData])

  /*
    ── WHAT A PLACEHOLDER LINE LOOKS LIKE ──────────────────────────────────
    The shape of the card is right from the first frame, and nothing in it
    claims to be a number. Grey, no fill under it, no dots on it. The stroke
    transitions in CSS, so the change from this to the real colour is a fade.
  */
  const SKELETON_STROKE = "#e5e7eb"
  const lineStroke = (colour: string) => (isLoading ? SKELETON_STROKE : colour)
  const lineFill = (gradient: string) => (isLoading ? "none" : gradient)
  const lineDot = (colour: string) => (isLoading ? false : makeDot(colour))
  /* Nothing to draw in while it is flat; the draw-in belongs to the arrival. */
  const lineAnimates = isLoading ? false : shouldAnimate

  const lastDotIndex = chartDisplayData.length - 1
  /*
    A HIDDEN DOT IS NO DOT. Only the last point carries one, to say where
    the line ends; every other point returns null rather than an invisible
    circle, which was 120 nodes reconciled on every render.
  */
  type AreaDot = ComponentProps<typeof Area>["dot"]
  const makeDot = (color: string): AreaDot =>
    ((props: { index?: number; cx?: number; cy?: number }) => {
      if (props.index === lastDotIndex && chartDisplayData.length > 1) {
        return <circle key={`dot-${props.index}`} cx={props.cx} cy={props.cy} r={3.5} fill={color} stroke="#fff" strokeWidth={2} />
      }
      return null
    }) as unknown as AreaDot

  const grad = (id: string) => `url(#${id})`

  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <AreaChart data={chartDisplayData} margin={{ top: PLOT_TOP, right: PLOT_RIGHT, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradViolet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.views} stopOpacity={0.16} />
            <stop offset="100%" stopColor={CHART_COLORS.views} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#f1f2f4" vertical={false} />
        <XAxis
          dataKey="date"
          height={XAXIS_H}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={18}
        />
        {/*
          THE SCALE IS GIVEN, NOT GUESSED: a domain with headroom and the
          ticks to draw on it, and a width that is the widest of them.
        */}
        <YAxis
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          domain={[0, top]}
          ticks={ticks}
          allowDataOverflow={false}
          interval={0}
          width={plotLeft}
          tickFormatter={axisTick}
        />
        {/* The comparison, dashed and quieter, under the line it is compared with.
            An Area with no fill, not a Line: an AreaChart draws only its areas,
            so the dashed Line that was here was never on screen. */}
        {compareKey && !isLoading && (
          <Area
            type="monotone"
            dataKey={compareKey as string}
            stroke={CHART_COLORS.compared}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            strokeLinecap="round"
            fill="none"
            dot={false}
            activeDot={false}
            isAnimationActive={lineAnimates}
            animationDuration={600}
            name="compared"
          />
        )}
        {/* Store series */}
        {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "views") && (
          <Area type="monotone" dataKey="views" stroke={lineStroke(CHART_COLORS.views)} strokeWidth={2} fill={lineFill(grad("gradViolet"))} dot={lineDot(CHART_COLORS.views)} activeDot={false} name="views" isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
        )}
        {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "orders") && (
          <Area type="monotone" dataKey="sales" stroke={lineStroke(CHART_COLORS.orders)} strokeWidth={2} fill={lineFill(grad("gradViolet"))} dot={lineDot(CHART_COLORS.orders)} activeDot={false} name="sales" isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
        )}
        {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "revenue") && (
          <Area type="monotone" dataKey="revenue" stroke={lineStroke(CHART_COLORS.revenue)} strokeWidth={2} fill={lineFill(grad("gradViolet"))} dot={lineDot(CHART_COLORS.revenue)} activeDot={false} name="revenue" isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={45} />
        )}
        {analyticsMode === "store" && chartMetricFilter === "conversion" && (
          <Area type="monotone" dataKey="conversion" stroke={lineStroke(CHART_COLORS.conversion)} strokeWidth={2} fill={lineFill(grad("gradViolet"))} dot={lineDot(CHART_COLORS.conversion)} activeDot={false} name="conversion" isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
        )}
        {/* OnePage series */}
        {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "views") && (
          <Area type="monotone" dataKey="views" stroke={lineStroke(CHART_COLORS.views)} strokeWidth={2} fill={lineFill(grad("gradViolet"))} dot={lineDot(CHART_COLORS.views)} activeDot={false} name="views" connectNulls isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
        )}
        {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "clicks") && (
          <Area type="monotone" dataKey="clicks" stroke={lineStroke(CHART_COLORS.clicks)} strokeWidth={2} fill={lineFill(grad("gradViolet"))} dot={lineDot(CHART_COLORS.clicks)} activeDot={false} name="clicks" connectNulls isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
        )}
        {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "subscribers") && (
          <Area type="monotone" dataKey="subscribers" stroke={lineStroke(CHART_COLORS.subscribers)} strokeWidth={2} fill={lineFill(grad("gradViolet"))} dot={lineDot(CHART_COLORS.subscribers)} activeDot={false} name="subscribers" connectNulls isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={45} />
        )}
        {analyticsMode === "onepage" && onePageChartFilter === "ctr" && (
          <Area type="monotone" dataKey="ctr" stroke={lineStroke(CHART_COLORS.ctr)} strokeWidth={2} fill={lineFill(grad("gradViolet"))} dot={lineDot(CHART_COLORS.ctr)} activeDot={false} name="ctr" connectNulls isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
})

/* ─── The chart: the plot, and the marker over it ───────────────────────── */

/** See the note at the top: the box's own width resolves the clamp, never JavaScript. */
function shiftFor(x: number, track: number): string {
  return `translateX(clamp(8px, calc(${x.toFixed(1)}px - 50%), calc(${track}px - 100% - 8px))) translateZ(0)`
}

function AnalyticsChartWithTooltipInner({
  chartDisplayData,
  analyticsMode,
  chartMetricFilter,
  onePageChartFilter,
  formatPrice,
  isLoading = false,
  compareLabel = null,
}: {
  chartDisplayData: AnalyticsChartData[]
  analyticsMode: "store" | "onepage"
  chartMetricFilter: string
  onePageChartFilter: string
  /** Kept for the callers; the gesture is the same for a finger and a pointer now. */
  isTouchDevice?: boolean
  formatPrice: (cents: number) => string
  /**
   * The series is the placeholder, not the answer: grid, dates and a grey
   * line resting on the axis, with no colour, no fill and nothing to press.
   */
  isLoading?: boolean
  /** What the dashed line is, "Dec 1–Dec 31, 2025", or null for no comparison. */
  compareLabel?: string | null
}) {
  const visibleKeys = useMemo(
    () => visibleKeysFor(analyticsMode, chartMetricFilter, onePageChartFilter),
    [analyticsMode, chartMetricFilter, onePageChartFilter],
  )
  const compareKey = analyticsMode === "store" && compareLabel ? previousKeyFor(chartMetricFilter) : null
  const isPercent = chartMetricFilter === "conversion" && analyticsMode === "store" ? true : analyticsMode === "onepage" && onePageChartFilter === "ctr"
  const isMoney = analyticsMode === "store" && chartMetricFilter === "revenue"

  /* The scale, from every number the plot will draw. */
  const scale = useMemo(() => {
    let max = 0
    for (const d of chartDisplayData) {
      for (const k of visibleKeys) max = Math.max(max, typeof d[k] === "number" ? (d[k] as number) : 0)
      if (compareKey && typeof d[compareKey] === "number") max = Math.max(max, d[compareKey] as number)
    }
    return niceScale(max, { integer: !isPercent && !isMoney, intervals: 3 })
  }, [chartDisplayData, visibleKeys, compareKey, isPercent, isMoney])

  /** One formatter, used to draw the ticks and to measure how wide they are. */
  const axisTick = useCallback(
    (v: number) => (isPercent ? compactPercent(v / 100) : isMoney ? compactMoney(v, scale.step) : compactCount(v)),
    [isPercent, isMoney, scale.step],
  )
  /* The axis is as wide as the numbers on it, in the 11px they are drawn in. */
  const plotLeft = useMemo(() => axisWidth(scale.ticks.map(axisTick), 11, 8), [scale.ticks, axisTick])

  /* ── The marker ──────────────────────────────────────────────────────── */
  const n = chartDisplayData.length
  const indexAt = useCallback(
    (clientX: number): number | null => {
      const el = scrub.ref.current
      if (!el || n === 0 || isLoading) return null
      const rect = el.getBoundingClientRect()
      const chartLeft = rect.left + plotLeft
      const chartWidth = rect.right - PLOT_RIGHT - chartLeft
      if (n === 1) return 0
      const ratio = Math.max(0, Math.min(1, (clientX - chartLeft) / chartWidth))
      return Math.round(ratio * (n - 1))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, plotLeft, isLoading],
  )
  const scrub = useChartScrub<HTMLDivElement>(indexAt)
  const activeIndex = scrub.index !== null && scrub.index < n ? scrub.index : null
  const activePoint = activeIndex !== null ? chartDisplayData[activeIndex] : null

  /* The width of the card, measured once and on resize, for the marker's maths. */
  const [track, setTrack] = useState(0)
  useEffect(() => {
    const el = scrub.ref.current
    if (!el) return
    const measure = () => setTrack(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* First placement is a cut; every move after it glides. */
  const [settled, setSettled] = useState(false)
  const shown = activePoint !== null
  useEffect(() => {
    if (!shown) {
      setSettled(false)
      return
    }
    const id = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(id)
  }, [shown])
  const transition = shown && settled ? GLIDE : "none"

  const plotWidth = Math.max(0, track - plotLeft - PLOT_RIGHT)
  const plotHeight = CHART_H - PLOT_TOP - XAXIS_H
  const xOf = (i: number) => (n <= 1 ? plotLeft + plotWidth / 2 : plotLeft + (i / (n - 1)) * plotWidth)
  const yOf = (v: number) => PLOT_TOP + (1 - Math.max(0, v) / scale.top) * plotHeight

  const format = (key: string, val: number) => {
    const base = key.replace("prev_", "")
    if (base === "revenue") return formatPrice(val)
    if (base === "conversion" || base === "ctr") return `${Number(val.toFixed(2))}%`
    return Math.round(val).toLocaleString("en-US")
  }

  const x = activeIndex !== null ? xOf(activeIndex) : 0

  return (
    <div
      ref={scrub.ref}
      data-chart-loading={isLoading ? "true" : "false"}
      onPointerMove={scrub.onPointerMove}
      onPointerLeave={scrub.onPointerLeave}
      style={{
        /*
          THE VERTICAL AXIS BELONGS TO THE BROWSER. The page scrolls from
          here the way it scrolls from the cards above and below, on the
          compositor; the chart keeps the horizontal axis, which is the one
          a scrub is made of (components/app/use-chart-scrub).
        */
        touchAction: "pan-y",
        /* A placeholder has nothing to scrub, and letting a finger press it
           would raise a readout of zero for a number nobody has. */
        pointerEvents: isLoading ? "none" : undefined,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        position: "relative",
        height: CHART_H,
      } as React.CSSProperties}
    >
      <Plot
        data={chartDisplayData}
        analyticsMode={analyticsMode}
        chartMetricFilter={chartMetricFilter}
        onePageChartFilter={onePageChartFilter}
        isLoading={isLoading}
        compareKey={compareKey}
        top={scale.top}
        ticks={scale.ticks}
        plotLeft={plotLeft}
        axisTick={axisTick}
      />

      {/*
        ONE STABLE THING FOR A FINGER TO LAND ON. A touch belongs to the node
        it started on for the whole gesture, so it lands here, on one layer
        that is rendered unconditionally and never re-keyed, and never on a
        node recharts might replace. The marker is drawn inside it.
      */}
      <svg
        aria-hidden
        data-chart-touch-shield
        width="100%"
        height={CHART_H}
        style={{ position: "absolute", inset: 0, zIndex: 5, overflow: "visible", pointerEvents: "auto" }}
      >
        {activePoint ? (
          <g data-chart-marker style={{ transform: `translateX(${x.toFixed(1)}px)`, transition, willChange: "transform" }}>
            <line x1={0} x2={0} y1={PLOT_TOP} y2={PLOT_TOP + plotHeight} stroke="#c4b5fd" strokeWidth={1} strokeDasharray="4 3" />
          </g>
        ) : null}
        {activePoint && compareKey && typeof activePoint[compareKey] === "number" ? (
          <circle
            r={3.5}
            cx={0}
            cy={0}
            fill="#fff"
            stroke={CHART_COLORS.compared}
            strokeWidth={1.5}
            style={{ transform: `translate(${x.toFixed(1)}px, ${yOf(activePoint[compareKey] as number).toFixed(1)}px)`, transition }}
          />
        ) : null}
        {activePoint
          ? visibleKeys.map((k) => (
              <circle
                key={k}
                data-chart-active-dot
                r={5.5}
                cx={0}
                cy={0}
                fill={CHART_COLORS.views}
                stroke="#fff"
                strokeWidth={2.5}
                style={{
                  transform: `translate(${x.toFixed(1)}px, ${yOf(typeof activePoint[k] === "number" ? (activePoint[k] as number) : 0).toFixed(1)}px)`,
                  transition,
                  filter: "drop-shadow(0 1px 3px rgba(139,92,246,0.4))",
                }}
              />
            ))
          : null}
      </svg>

      {/* The readout, over its own point, never wider than the card. */}
      {activePoint && (
        <div
          data-chart-tooltip
          style={{
            position: "absolute",
            top: -4,
            left: 0,
            transform: shiftFor(x, track),
            transition,
            maxWidth: "calc(100% - 16px)",
            background: "#1a1a2e",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#fff",
            padding: "6px 10px",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            willChange: "transform",
          }}
        >
          <p style={{ fontSize: "11px", color: "#9ca3af", margin: 0, marginBottom: "2px" }}>{activePoint.date}</p>
          {visibleKeys.map((k) => (
            <p key={k} style={{ fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 2, borderRadius: 1, background: CHART_COLORS.views, display: "inline-block" }} />
              {LABELS[k] ?? k}: {format(k, typeof activePoint[k] === "number" ? (activePoint[k] as number) : 0)}
            </p>
          ))}
          {compareKey && typeof activePoint[compareKey] === "number" ? (
            <p style={{ margin: 0, color: "#c9ccd3", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 0, borderTop: `2px dashed ${CHART_COLORS.compared}`, display: "inline-block" }} />
              Compared: {format(compareKey, activePoint[compareKey] as number)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * MEMOISED, which is the point of the module. The props are an array the
 * page memoises, three strings, a boolean and a stable formatter; none of
 * them changes while somebody is reading the chart.
 */
export const AnalyticsChartWithTooltip = memo(AnalyticsChartWithTooltipInner)
