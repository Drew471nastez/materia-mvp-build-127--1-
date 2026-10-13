"use client"

/**
 * ===========================================================================
 *  THE ANALYTICS TREND CHART
 * ===========================================================================
 * The chart under the metric tabs at the top of Analytics. At module scope
 * and behind React.memo, so a state change anywhere else on the page does
 * not reach recharts.
 *
 * THREE LAYERS, EACH DRAWN ONCE AND MOVED BY ITS OWN HAND.
 *
 *   The FRAME is recharts: the grid and the dates. It is memoised on the
 *   dates and the scale, so a tab that changes only the numbers never
 *   reaches it.
 *
 *   The LINES are components/app/morph-lines: the metric, the dashed period
 *   it is compared with and the dot at the end. A tab, a period or the first
 *   answer moves every point from where it is drawn to where it goes, and a
 *   tab tapped mid move carries on from that frame. Recharts restarted from
 *   where the last move was going, so a quick second tap made the whole
 *   line jump.
 *
 *   The MARKER is components/app/chart-scrub: a crosshair, a dot on each
 *   line and the readout, moved by transforms written straight to the
 *   nodes. A finger or a pointer changes the marker and nothing else, and
 *   renders nothing.
 *
 * The home page's chart draws the same lines and the same marker, so the
 * two feel the same because they are the same. The marker used to be this
 * chart's own: it snapped the readout to each point and glided it there over
 * 140ms, so it trailed a moving finger by 6px and a mouse by 17px, and every
 * point crossed was a React render.
 *
 * THE SCALE IS OURS TOO (components/app/chart-morph fixedScale). A top
 * with headroom above the highest point, whole-number ticks for counts, and
 * always three intervals, so the grid is the same drawing on every tab.
 *
 * A METRIC TAB MOVES THE LINE, IT DOES NOT REPLACE IT. The metric sits in
 * the first slot whatever it is, and a tab hands that slot other numbers.
 * The axis is as wide as the widest label of every metric the tabs can
 * show, so the plot never moves sideways, and its numbers cross-fade
 * (chart-morph AxisLabels). A tab never asks the server for anything: every
 * metric is already in the series the page holds.
 */

import { memo, useCallback, useMemo } from "react"
import { XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart } from "recharts"

import { axisWidth, compactCount, compactMoney, compactPercent } from "@/lib/analytics/chart-scale"
import { ChartScrub, type ScrubRow, type ScrubSeries } from "@/components/app/chart-scrub"
import { AxisLabels, fixedScale } from "@/components/app/chart-morph"
import { MorphLines } from "@/components/app/morph-lines"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

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
  /** Null where the bucket had no visitors: no rate, drawn on the floor and read as "No visitors". */
  conversion?: number | null
  ctr?: number
  prev_views?: number
  prev_sales?: number
  prev_revenue?: number
  prev_refunds?: number
  prev_conversion?: number | null
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
  get views() { return tt("Views") },
  get clicks() { return tt("Clicks") },
  get sales() { return tt("Orders") },
  get revenue() { return tt("Revenue") },
  get subscribers() { return tt("Subscribers") },
  get conversion() { return tt("Conversion") },
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

/* ─── The frame: recharts lays out the grid and the dates, and nothing else ── */

interface FrameProps {
  /** The dates along the bottom, one per point. */
  dates: string[]
  top: number
  ticks: number[]
  plotLeft: number
}

/**
 * THE GRID AND THE DATES, which recharts lays out well: the dates thinned so
 * they never collide, the grid at the four heights of the scale. It is
 * memoised on the dates, the scale and the gutter, so a tab that changes
 * only the numbers never reaches it. The lines are components/app/morph-lines,
 * drawn over it.
 */
const Frame = memo(function Frame({ dates, top, ticks, plotLeft }: FrameProps) {
  const data = useMemo(() => dates.map((date) => ({ date })), [dates])
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <AreaChart data={data} margin={{ top: PLOT_TOP, right: PLOT_RIGHT, left: 0, bottom: 0 }}>
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
  color = CHART_COLORS.views,
  seriesLabels,
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
  /**
   * The line, its fill and its marker in another ink: a OnePage link's own
   * stats draw this chart in the editor's near black (components/onepage/
   * link-stats-chart). Analytics leaves it to the accent.
   */
  color?: string
  /** A series under another name in the readout: a form's "clicks" are Submissions. */
  seriesLabels?: Partial<Record<string, string>>
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

  /*
    THE LINES: the chosen metric in the first slot whatever it is, so a tab
    moves the line rather than replacing it, and what it is compared with.
    A number the series does not have is drawn at nothing.
  */
  const lines = useMemo(
    () => visibleKeys.map((k) => chartDisplayData.map((d) => (typeof d[k] === "number" ? (d[k] as number) : 0))),
    [chartDisplayData, visibleKeys],
  )
  const comparedLine = useMemo(
    () => (compareKey && !isLoading ? chartDisplayData.map((d) => (typeof d[compareKey] === "number" ? (d[compareKey] as number) : 0)) : null),
    [chartDisplayData, compareKey, isLoading],
  )
  /* The dates, the same array for as long as they are the same dates: a tab or a refresh does not redraw the frame. */
  const datesKey = chartDisplayData.map((d) => d.date).join("\u0000")
  const dates = useMemo(() => (datesKey ? datesKey.split("\u0000") : []), [datesKey])

  /* ── The marker: components/app/chart-scrub, the same layer the home page's chart draws ── */
  const n = chartDisplayData.length
  const plotHeight = CHART_H - PLOT_TOP - XAXIS_H
  const yOf = useCallback((v: number) => PLOT_TOP + (1 - Math.max(0, v) / scale.top) * plotHeight, [scale.top, plotHeight])

  const format = useCallback(
    (key: string, val: number) => {
      const base = key.replace("prev_", "")
      if (base === "revenue") return formatPrice(val)
      if (base === "conversion" || base === "ctr") return `${Number(val.toFixed(2))}%`
      return Math.round(val).toLocaleString(appLocale())
    },
    [formatPrice],
  )

  /* Where each dot of the marker sits at every point: the comparison first, under the line. */
  const scrubSeries = useMemo<ScrubSeries[]>(() => {
    const num = (d: AnalyticsChartData, k: Key) => (typeof d[k] === "number" ? (d[k] as number) : null)
    return [
      ...(compareKey ? [{ ys: chartDisplayData.map((d) => { const v = num(d, compareKey); return v === null ? null : yOf(v) }), color: CHART_COLORS.compared, hollow: true }] : []),
      ...visibleKeys.map((k) => ({ ys: chartDisplayData.map((d) => yOf(num(d, k) ?? 0)), color })),
    ]
  }, [chartDisplayData, visibleKeys, compareKey, yOf, color])

  /* What the readout says at a point: this period's number, and what it is compared with. */
  const scrubRows = useMemo<ScrubRow[]>(() => {
    const at = (i: number, k: Key) => {
      const v = chartDisplayData[i]?.[k]
      return typeof v === "number" ? v : null
    }
    return [
      ...visibleKeys.map((k): ScrubRow => ({
        label: seriesLabels?.[k] ?? LABELS[k] ?? k,
        /* A rate with nobody to divide by is not 0%. */
        value: (i) => (k === "conversion" && chartDisplayData[i]?.conversion === null ? tt("No visitors") : format(k, at(i, k) ?? 0)),
        mark: "line",
        tone: "value",
        color,
      })),
      ...(compareKey
        ? [{ label: tt("Compared"), value: (i: number) => { const v = at(i, compareKey); return v === null ? null : format(compareKey, v) }, mark: "dashed", tone: "compared", color: CHART_COLORS.compared } as ScrubRow]
        : []),
    ]
  }, [chartDisplayData, visibleKeys, compareKey, format, seriesLabels, color])
  const scrubTitle = useCallback((i: number) => chartDisplayData[i]?.date ?? "", [chartDisplayData])

  return (
    <div data-chart-loading={isLoading ? "true" : "false"} style={{ position: "relative", height: CHART_H }}>
      <Frame dates={dates} top={scale.top} ticks={scale.ticks} plotLeft={plotLeft} />
      <AxisLabels labels={axisLabels} top={PLOT_TOP} height={plotHeight} width={plotLeft} />

      {/*
        THE LINE, WHAT IT IS COMPARED WITH, AND THE DOT AT ITS END:
        components/app/morph-lines, which the home page's chart draws too. A
        tab, a period or the first answer moves every point from where it is
        drawn to where it goes; a placeholder lies on the floor in grey.
      */}
      <MorphLines
        lines={lines}
        compared={comparedLine}
        top={scale.top}
        left={plotLeft}
        right={PLOT_RIGHT}
        plotTop={PLOT_TOP}
        plotHeight={plotHeight}
        loading={isLoading}
        color={color}
        comparedColor={CHART_COLORS.compared}
      />

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
