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
 *   The MARKER is components/app/chart-scrub: a crosshair, a dot on each
 *   line and the readout, over the plot, moved by transforms written straight
 *   to the nodes. A finger or a pointer moving along the chart changes the
 *   marker and nothing else, and renders nothing.
 *
 * It used to be one layer, then two with a marker of this chart's own that
 * snapped the readout to each point and glided it there over 140ms, so it
 * trailed a moving finger by 6px and a mouse by 17px, and every point crossed
 * was a React render. The home page's chart felt different, and it was. Both
 * charts and the report cards draw the same layer now: the readout stays on
 * the pointer at full frame rate, the crosshair and the dots sit on the
 * nearest day, and it all fades out when the pointer leaves.
 *
 * THE SCALE IS OURS TOO (components/app/chart-morph fixedScale). A top
 * with headroom above the highest point, whole-number ticks for counts, and
 * always three intervals, so the grid is the same drawing on every tab.
 *
 * A METRIC TAB MOVES THE LINE, IT DOES NOT REPLACE IT. The series sits in
 * one slot, `s0`, whatever the metric, and the slot keeps its key; a tab
 * hands it other numbers and recharts animates each point from where it was
 * to where it now goes, on the iOS curve. The axis is as wide as the widest
 * label of every metric the tabs can show, so the plot never moves sideways,
 * and its numbers cross-fade (chart-morph AxisLabels). The dot at the end of
 * the line is ours, and travels with it. A tab never asks the server for
 * anything: every metric is already in the series the page holds.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ComponentProps } from "react"
import { XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area } from "recharts"

import { CHART_ANIM_MS } from "@/lib/chart-motion"
import { axisWidth, compactCount, compactMoney, compactPercent } from "@/lib/analytics/chart-scale"
import { ChartScrub, type ScrubRow, type ScrubSeries } from "@/components/app/chart-scrub"
import { AxisLabels, MORPH_EASE, MORPH_MS, fixedScale, useEndDotMotion } from "@/components/app/chart-morph"

/** How tall the chart is, and the band under the plot that holds the dates. */
const CHART_H = 200
const XAXIS_H = 24
/** The right margin: room for the last point's dot and its ring. */
const PLOT_RIGHT = 10
/** Room above for the active dot: six pixels of radius plus its white ring. */
const PLOT_TOP = 10

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

/** What the plot is given: the dates, the metric in its slot, and what it is compared with. */
interface PlotPoint {
  date: string
  s0?: number
  s1?: number
  s2?: number
  p?: number
}

/** The slots, in order. One while a single metric shows, which is always, from the tabs. */
const SLOTS = ["s0", "s1", "s2"] as const

interface PlotProps {
  data: PlotPoint[]
  slots: number
  isLoading: boolean
  compared: boolean
  top: number
  ticks: number[]
  plotLeft: number
}

type Easing = ComponentProps<typeof Area>["animationEasing"]

const Plot = memo(function Plot({ data: chartDisplayData, slots, isLoading, compared, top, ticks, plotLeft }: PlotProps) {
  const [shouldAnimate, setShouldAnimate] = useState(true)

  /**
   * THE MORPH IS DECIDED BY THE RENDER THAT RECEIVES THE DATA. An effect
   * runs after the render it belongs to, so recharts would draw the new
   * series with the old flag still down, a cut to the new line, and only
   * then be told to animate, with nothing left to play. Setting state
   * during this render re-runs it before anything is committed. A tab is
   * new data here: the page hands a new series for the metric chosen.
   */
  const seenSeriesRef = useRef(chartDisplayData)
  if (seenSeriesRef.current !== chartDisplayData) {
    seenSeriesRef.current = chartDisplayData
    if (!shouldAnimate) setShouldAnimate(true)
  }

  /* Play it once, then switch it off so nothing re-animates. The flag has to
     outlast the morph (MORPH_MS): pulled early, recharts cuts to the end. */
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
  /* The dot at the end of the line is drawn over the plot (see below), so
     recharts draws none: its own vanish for the length of every animation. */
  const lineDot = false as const
  /* Nothing to draw in while it is flat; the draw-in belongs to the arrival. */
  const lineAnimates = isLoading ? false : shouldAnimate

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
        {/* The grid lines at the ticks, placed by us: with the axis drawing no
            text, recharts would keep only the top and the floor. The same
            four heights on every tab. */}
        <CartesianGrid
          stroke="#f1f2f4"
          vertical={false}
          horizontalPoints={ticks.map((t) => PLOT_TOP + (1 - t / top) * (CHART_H - PLOT_TOP - XAXIS_H))}
        />
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
          ticks the grid is drawn on, and a width that fits every metric's
          widest label. The numbers themselves are AxisLabels, over the plot.
        */}
        <YAxis
          tick={false}
          tickLine={false}
          axisLine={false}
          domain={[0, top]}
          ticks={ticks}
          allowDataOverflow={false}
          interval={0}
          width={plotLeft}
        />
        {/* The comparison, dashed and quieter, under the line it is compared with.
            An Area with no fill, not a Line: an AreaChart draws only its areas.
            Its own slot too, so it morphs with the line. */}
        {compared && !isLoading && (
          <Area
            key="p"
            type="monotone"
            dataKey="p"
            stroke={CHART_COLORS.compared}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            strokeLinecap="round"
            fill="none"
            dot={false}
            activeDot={false}
            isAnimationActive={lineAnimates}
            animationDuration={MORPH_MS}
            animationEasing={MORPH_EASE as Easing}
            animationBegin={0}
            name="compared"
          />
        )}
        {/* The series, one slot per metric showing, each keeping its key across tabs. */}
        {SLOTS.slice(0, slots).map((slot) => (
          <Area
            key={slot}
            type="monotone"
            dataKey={slot}
            stroke={lineStroke(CHART_COLORS.views)}
            strokeWidth={2}
            fill={lineFill(grad("gradViolet"))}
            dot={lineDot}
            activeDot={false}
            name={slot}
            connectNulls
            isAnimationActive={lineAnimates}
            animationDuration={MORPH_MS}
            animationEasing={MORPH_EASE as Easing}
            animationBegin={0}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
})

type AxisKind = "count" | "money" | "percent"

/** Every metric a set of tabs can show, and how its axis is written. */
const METRICS_OF: Record<"store" | "onepage", Array<{ keys: Key[]; kind: AxisKind }>> = {
  store: [
    { keys: ["views", "prev_views"], kind: "count" },
    { keys: ["sales", "prev_sales"], kind: "count" },
    { keys: ["revenue", "prev_revenue"], kind: "money" },
    { keys: ["conversion", "prev_conversion"], kind: "percent" },
  ],
  onepage: [
    { keys: ["views"], kind: "count" },
    { keys: ["clicks"], kind: "count" },
    { keys: ["subscribers"], kind: "count" },
    { keys: ["ctr"], kind: "percent" },
  ],
}

const tickFor = (kind: AxisKind, step: number) => (v: number) =>
  kind === "percent" ? compactPercent(v / 100) : kind === "money" ? compactMoney(v, step) : compactCount(v)

function maxOf(data: AnalyticsChartData[], keys: Key[]): number {
  let max = 0
  for (const d of data) for (const k of keys) if (typeof d[k] === "number") max = Math.max(max, d[k] as number)
  return max
}

/* ─── The chart: the plot, and the marker over it ───────────────────────── */

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

  /* The scale, from every number the plot will draw. Always three intervals. */
  const scale = useMemo(
    () => fixedScale(maxOf(chartDisplayData, compareKey ? [...visibleKeys, compareKey] : visibleKeys), !isPercent && !isMoney),
    [chartDisplayData, visibleKeys, compareKey, isPercent, isMoney],
  )

  /** One formatter, used to write the numbers on the axis and to measure how wide they are. */
  const axisTick = useCallback(
    (v: number) => tickFor(isPercent ? "percent" : isMoney ? "money" : "count", scale.step)(v),
    [isPercent, isMoney, scale.step],
  )
  const axisLabels = useMemo(() => scale.ticks.map(axisTick), [scale.ticks, axisTick])
  /*
    ONE WIDTH FOR EVERY TAB. The widest label of every metric this mode can
    show, measured in the 11px it is drawn in, so choosing Revenue after
    Views does not move the plot sideways. It changes with the data, which
    is a new period, never with the tab.
  */
  const plotLeft = useMemo(() => {
    const widths = METRICS_OF[analyticsMode].map(({ keys, kind }) => {
      const sc = fixedScale(maxOf(chartDisplayData, keys), kind === "count")
      return axisWidth(sc.ticks.map(tickFor(kind, sc.step)), 11, 8)
    })
    return Math.max(axisWidth(axisLabels, 11, 8), ...widths)
  }, [analyticsMode, chartDisplayData, axisLabels])

  /* The plot's own series: the chosen metric in the first slot, whatever it is. */
  const plotData = useMemo<PlotPoint[]>(
    () =>
      chartDisplayData.map((d) => {
        const point: PlotPoint = { date: d.date }
        visibleKeys.forEach((k, i) => {
          point[SLOTS[i]] = typeof d[k] === "number" ? (d[k] as number) : 0
        })
        if (compareKey) point.p = typeof d[compareKey] === "number" ? (d[compareKey] as number) : undefined
        return point
      }),
    [chartDisplayData, visibleKeys, compareKey],
  )

  /* ── The marker: components/app/chart-scrub, the same layer the home page's chart draws ── */
  const n = chartDisplayData.length
  const ref = useRef<HTMLDivElement>(null)

  /* The width of the card, measured once and on resize, for the dot at the end. */
  const [track, setTrack] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setTrack(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const plotWidth = Math.max(0, track - plotLeft - PLOT_RIGHT)
  const plotHeight = CHART_H - PLOT_TOP - XAXIS_H
  const xOf = (i: number) => (n <= 1 ? plotLeft + plotWidth / 2 : plotLeft + (i / (n - 1)) * plotWidth)
  const yOf = useCallback((v: number) => PLOT_TOP + (1 - Math.max(0, v) / scale.top) * plotHeight, [scale.top, plotHeight])

  const format = useCallback(
    (key: string, val: number) => {
      const base = key.replace("prev_", "")
      if (base === "revenue") return formatPrice(val)
      if (base === "conversion" || base === "ctr") return `${Number(val.toFixed(2))}%`
      return Math.round(val).toLocaleString("en-US")
    },
    [formatPrice],
  )

  /* Where each dot of the marker sits at every point: the comparison first, under the line. */
  const scrubSeries = useMemo<ScrubSeries[]>(() => {
    const num = (d: AnalyticsChartData, k: Key) => (typeof d[k] === "number" ? (d[k] as number) : null)
    return [
      ...(compareKey ? [{ ys: chartDisplayData.map((d) => { const v = num(d, compareKey); return v === null ? null : yOf(v) }), color: CHART_COLORS.compared, hollow: true }] : []),
      ...visibleKeys.map((k) => ({ ys: chartDisplayData.map((d) => yOf(num(d, k) ?? 0)), color: CHART_COLORS.views })),
    ]
  }, [chartDisplayData, visibleKeys, compareKey, yOf])

  /* What the readout says at a point: this period's number, and what it is compared with. */
  const scrubRows = useMemo<ScrubRow[]>(() => {
    const at = (i: number, k: Key) => {
      const v = chartDisplayData[i]?.[k]
      return typeof v === "number" ? v : null
    }
    return [
      ...visibleKeys.map((k): ScrubRow => ({ label: LABELS[k] ?? k, value: (i) => format(k, at(i, k) ?? 0), mark: "line", tone: "value", color: CHART_COLORS.views })),
      ...(compareKey
        ? [{ label: "Compared", value: (i: number) => { const v = at(i, compareKey); return v === null ? null : format(compareKey, v) }, mark: "dashed", tone: "compared", color: CHART_COLORS.compared } as ScrubRow]
        : []),
    ]
  }, [chartDisplayData, visibleKeys, compareKey, format])
  const scrubTitle = useCallback((i: number) => chartDisplayData[i]?.date ?? "", [chartDisplayData])

  /* The end of the line: on the floor first, then with the line wherever it goes. */
  const last = n > 1 && !isLoading ? chartDisplayData[n - 1] : null
  const end = useEndDotMotion(last !== null && track > 0)

  return (
    <div
      ref={ref}
      data-chart-loading={isLoading ? "true" : "false"}
      style={{ position: "relative", height: CHART_H }}
    >
      <Plot
        data={plotData}
        slots={Math.min(SLOTS.length, visibleKeys.length)}
        isLoading={isLoading}
        compared={!!compareKey}
        top={scale.top}
        ticks={scale.ticks}
        plotLeft={plotLeft}
      />
      <AxisLabels labels={axisLabels} top={PLOT_TOP} height={plotHeight} width={plotLeft} />

      {last && track > 0 ? (
        <svg aria-hidden width="100%" height={CHART_H} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
          {visibleKeys.map((k) => (
            <circle
              key={`end-${k}`}
              data-chart-end-dot
              r={3.5}
              cx={0}
              cy={0}
              fill={CHART_COLORS.views}
              stroke="#fff"
              strokeWidth={2}
              style={{
                transform: `translate(${xOf(n - 1).toFixed(1)}px, ${yOf(end.armed && typeof last[k] === "number" ? (last[k] as number) : 0).toFixed(1)}px)`,
                transition: end.transition,
              }}
            />
          ))}
        </svg>
      ) : null}

      {/*
        THE CROSSHAIR, THE DOTS AND THE READOUT: components/app/chart-scrub,
        the one layer both trend charts and the report cards draw. A
        placeholder has nothing to read, so it takes no touches and raises
        no readout of zero for a number nobody has.
      */}
      <ChartScrub
        count={n}
        left={plotLeft}
        right={PLOT_RIGHT}
        top={PLOT_TOP}
        bottom={PLOT_TOP + plotHeight}
        series={scrubSeries}
        title={scrubTitle}
        rows={scrubRows}
        disabled={isLoading || n === 0}
      />
    </div>
  )
}

/**
 * MEMOISED, which is the point of the module. The props are an array the
 * page memoises, three strings, a boolean and a stable formatter; none of
 * them changes while somebody is reading the chart.
 */
export const AnalyticsChartWithTooltip = memo(AnalyticsChartWithTooltipInner)
