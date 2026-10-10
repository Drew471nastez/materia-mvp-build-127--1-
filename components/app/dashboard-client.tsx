"use client"

import { TAB_STRIP_STYLE, useTabStrip } from "@/components/app/use-tab-strip"
import { MetricTab } from "@/components/app/metric-tab"
import { memo, useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, type ReactNode } from "react"
import { SPOKES_HOLD, usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { PullToRefreshIndicator } from "./pull-to-refresh-indicator"
import { useHideNativeSplash } from "@/hooks/use-hide-native-splash"
import Link from "next/link"
import { dayPart, firstName, type DayPart } from "@/lib/greeting"
import { rememberTimeZone, viewerTimeZone } from "@/lib/orders/time-zone"
import {
  Eye,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  X,
  Camera,
  FileText,
  Type,
  Blocks,
  Globe,
  Sparkles,
} from "lucide-react"
import dynamic from "next/dynamic"

// Lazy-load recharts — it's ~200KB gzipped and only used in the trend chart.
// Dynamic import keeps it out of the initial JS bundle for faster dashboard load.
const LazyAreaChart = dynamic(
  () => import("recharts").then(m => {
    const { AreaChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } = m
    // Return a wrapper component that passes all recharts components via render prop
    return {
      default: ({ data, children }: { data: any[]; children: (components: {
        AreaChart: typeof AreaChart; XAxis: typeof XAxis;
        YAxis: typeof YAxis; CartesianGrid: typeof CartesianGrid;
        ResponsiveContainer: typeof ResponsiveContainer;
      }) => ReactNode }) =>
        <>{children({ AreaChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer })}</>,
    }
  }),
  /*
    NOTHING WHILE IT LOADS. This drew a grey box pulsing for the moment
    recharts took to arrive, over a card whose axis numbers and line were
    already on screen: a flash on every first visit. The card holds its
    height without it; recharts only lays out the grid and the dates, which
    arrive under a line that is already there.
  */
  { ssr: false, loading: () => null },
)
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n"
import { getLinksShareUrl, getLinksUrlDisplay, getStoreShareUrl, getStoreUrlDisplay, getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import { ShareStorelib } from "@/components/app/share/share-storelib"
import { HomeCards, bumpGettingStarted } from "@/components/app/home/home-cards"
import { QuickActions } from "@/components/app/home/quick-actions"
import { AppLink } from "@/components/app/app-link"
import { STRIP_ACTION, STRIP_SPARKLE, STRIP_TEXT, STRIP_TINT, STRIP_TITLE } from "@/components/app/announcement-bar-mobile"
import { useHomeProgress } from "@/components/app/home/use-home-progress"
import { HomeBanner } from "@/components/app/home/home-banner"
import { NO_SALES, type SalesSummary } from "@/lib/home/announcements"
import type { ConnectedPlatform, ShareAddress } from "@/components/app/share/share-data"
import { homeProgress, legacyFacts, type ProgressFacts } from "@/lib/home/progress"
import { AxisLabels, fixedScale } from "@/components/app/chart-morph"
import { MorphLines } from "@/components/app/morph-lines"
import { ChartScrub, type ScrubRow, type ScrubSeries } from "@/components/app/chart-scrub"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { resolveValue, todayIn, type RangeValue } from "@/lib/date-range/range"
import { homeAllTime, homeFigures, homeFromReports, homeQuestion, homeSpans, type HomeMetric } from "@/lib/analytics/home-figures"
import type { Reports } from "@/lib/analytics/reports"
import { NOW_STEP_MS, askReport, keptAnswer, questionOf, reportNow } from "@/lib/analytics/report-cache"
import { PhysicalSetupCard } from "@/components/app/home/physical-setup-card"

/** The old checklist's shape, still accepted from the probes that render Home with it. */
interface SetupStep {
  id: string
  title?: string
  description?: string
  tooltip?: string
  completed: boolean
  href?: string
}

interface ChartDataPoint {
  label: string
  /* Null on the conversion line where the bucket had no visitors: drawn on the floor, read as "No visitors". */
  value: number | null
  secondaryValue?: number
  refunds?: number
}

type KPIType = "views" | "orders" | "revenue" | "conversion" | null

/** One empty series, the same object every time, so an empty chart is not a new one on each render. */
const NO_POINTS: ChartDataPoint[] = []

/** The strip's own order, which is what decides which way it scrolls. */
const KPI_TAB_ORDER = ["views", "revenue", "orders", "conversion"] as const

/**
 * ===========================================================================
 *  ONE NUMBER FOR WHERE THE PLOT STARTS
 * ===========================================================================
 * The chart's left inset was written down twice: once as the y axis's
 * `width`, and once as a literal `rect.left + 40` in the maths that turns a
 * finger's x position into a data point. Two copies of a number that had to
 * agree — and when the axis was removed, only one of them changed. So every
 * touch landed thirty pixels from where it looked like it landed and the
 * tooltip trailed the finger by most of a column. That is the "clunky".
 *
 * The axis is told this, the chart's margin is told this, and so is the
 * touch maths. They cannot drift apart again.
 */
/**
 * THE AXIS IS ONLY AS WIDE AS ITS WIDEST NUMBER.
 *
 * A flat 40px is right for "$12.4k" and absurd for "0", "1", "2" — which is
 * what a new store's chart is made of, and why the left of it looked like a
 * margin somebody forgot to remove. On a 320px phone that was an eighth of
 * the chart spent on three characters.
 *
 * Measured from the longest label the formatter will actually produce for
 * this data, at roughly seven pixels a character, with room for the gap to
 * the plot. Bounded so it can neither collapse onto the grid nor run away
 * for a large currency value.
 */
function plotLeftFor(labels: string[]): number {
  const longest = labels.reduce((a, b) => (b.length > a.length ? b : a), "")
  return Math.max(22, Math.min(46, longest.length * 7 + 10))
}
/** The right margin. */
const PLOT_RIGHT = 10
/** The band under the plot that holds the dates: recharts' own default, written down so the dot over the line can use it. */
const XAXIS_H = 30
const CHART_H = 200

type Metric = Exclude<KPIType, null>

/**
 * The numbers on the axis, one formatter per metric, used to write them and
 * to measure the gutter they need.
 */
function tickText(metric: KPIType, v: number): string {
  const short = (n: number) => (n >= 1000 ? `${Number((n / 1000).toFixed(1))}k` : `${Number(n.toFixed(2))}`)
  if (metric === "revenue") return `$${short(v)}`
  if (metric === "conversion") return `${Number(v.toFixed(2))}%`
  return short(v)
}

/** The scale a metric's series is drawn on: always three intervals, so the grid never moves. */
function scaleOf(metric: KPIType, series: ChartDataPoint[]) {
  const max = series.reduce((m, d) => Math.max(m, d.value ?? 0), 0)
  return fixedScale(max, metric === "views" || metric === "orders")
}



/** Room above for the active dot: six pixels of radius plus its white ring. */
const PLOT_TOP = 10

/**
 * ===========================================================================
 *  THE HOME PAGE'S TREND CHART
 * ===========================================================================
 * Three layers, the same three the Analytics chart draws, so the two feel
 * the same because they are the same:
 *
 *   the frame, the grid and the dates, which recharts lays out (loaded
 *   lazily, and memoised on the dates and the scale);
 *   the line and the dot at its end, components/app/morph-lines, which move
 *   from where they are drawn to the next metric's numbers, even when a
 *   second tab is tapped mid move;
 *   the marker, components/app/chart-scrub: the crosshair, the dot and the
 *   readout, for a mouse and a finger alike.
 *
 * This chart used to read a pointer its own way: recharts' Tooltip, cursor
 * and active dot for a mouse, and for a finger a gesture of its own that
 * moved the readout by hand and re-ran recharts at every point crossed, for
 * the dot on the line and the crosshair. The gesture's rules (a sideways
 * drag or a hold of 100ms scrubs, a drag down the page scrolls it, a hold
 * that turns into a scroll lets go) moved into chart-scrub with it, and
 * tests/analytics-chart.test.ts holds them there.
 */
export function DashboardTrendChart({
  displayChartData,
  openKPIModal,
  widthFrom,
  loading = false,
  t,
}: {
  displayChartData: ChartDataPoint[]
  openKPIModal: KPIType
  /** No line has come back yet: the placeholder lies on the floor in grey, as on Analytics. */
  loading?: boolean
  /** Every metric the tabs can show, so the axis is one width for all of them. */
  widthFrom: Partial<Record<Metric, ChartDataPoint[]>>
  t: (key: string) => string
}) {
  /**
   * The axis labels, and therefore how wide the axis has to be. One
   * formatter, used to draw the ticks and to measure them, so the gutter can
   * never be sized for text the chart does not show.
   */
  const axisTick = useCallback((v: number) => tickText(openKPIModal, v), [openKPIModal])
  const scale = useMemo(() => scaleOf(openKPIModal, displayChartData), [openKPIModal, displayChartData])
  const axisLabels = useMemo(() => scale.ticks.map(axisTick), [scale.ticks, axisTick])

  /*
    ONE WIDTH FOR EVERY TAB: the widest label of every metric, so choosing
    Revenue after Views does not move the plot sideways. It changes with the
    period, never with the tab.
  */
  const plotLeft = useMemo(() => {
    const widths = (Object.keys(widthFrom) as Metric[]).map((m) =>
      plotLeftFor(scaleOf(m, widthFrom[m] ?? []).ticks.map((v) => tickText(m, v))),
    )
    return Math.max(plotLeftFor(axisLabels), ...widths)
  }, [widthFrom, axisLabels])

  /*
    ONE MOVE PER SWITCH, AND ONLY WHEN THE NUMBERS CHANGE. A tab used to fire
    the animation once with the old numbers still in the chart and again when
    the new ones came, the double refresh; then the flag that started it was
    raised a render late, so the first frame was the new line cut in. The
    lines move whenever their numbers differ from what is drawn, from what is
    drawn, and at no other time (components/app/morph-lines).
  */
  const lines = useMemo(() => [displayChartData.map((d) => d.value ?? 0)], [displayChartData])
  /* The dates, the same array for as long as they are the same dates, so a tab never redraws the frame. */
  const datesKey = displayChartData.map((d) => d.label).join("\u0000")
  const frameData = useMemo(() => (datesKey ? datesKey.split("\u0000").map((label) => ({ label })) : []), [datesKey])

  const formatValue = useCallback((val: number | null) => {
    if (val === null) return "No visitors"
    if (openKPIModal === "revenue") return `$${val.toFixed(2)}`
    if (openKPIModal === "conversion") return `${val}%`
    return val.toLocaleString()
  }, [openKPIModal])

  const metricLabel = openKPIModal === "views" ? t("dashboard.visitors")
    : openKPIModal === "orders" ? t("dashboard.orders")
    : openKPIModal === "revenue" ? t("dashboard.revenue")
    : t("dashboard.conversionRate")

  const plotHeight = CHART_H - PLOT_TOP - XAXIS_H
  const yOf = useCallback((v: number) => PLOT_TOP + (1 - Math.max(0, v) / scale.top) * plotHeight, [scale.top, plotHeight])

  /* The marker: one dot on the line, and what the readout says at each point. */
  const scrubSeries = useMemo<ScrubSeries[]>(
    () => [{ ys: displayChartData.map((d) => yOf(d.value ?? 0)), color: "#8b5cf6" }],
    [displayChartData, yOf],
  )
  const scrubRows = useMemo<ScrubRow[]>(
    () => [
      { label: metricLabel, value: (i) => formatValue(displayChartData[i] ? displayChartData[i].value : 0), mark: "line", tone: "value", color: "#8b5cf6" },
      ...(openKPIModal === "orders"
        ? [{ value: (i: number) => { const r = displayChartData[i]?.refunds ?? 0; return r > 0 ? `${r} refunded` : null }, mark: null, tone: "note" } as ScrubRow]
        : []),
    ],
    [displayChartData, metricLabel, formatValue, openKPIModal],
  )
  const scrubTitle = useCallback((i: number) => displayChartData[i]?.label ?? "", [displayChartData])

  return (
    <div style={{ position: "relative", height: CHART_H }}>
      <DashboardFrame data={frameData} top={scale.top} ticks={scale.ticks} plotLeft={plotLeft} />
      <AxisLabels labels={axisLabels} top={PLOT_TOP} height={plotHeight} width={plotLeft} />
      <MorphLines
        lines={lines}
        top={scale.top}
        left={plotLeft}
        right={PLOT_RIGHT}
        plotTop={PLOT_TOP}
        plotHeight={plotHeight}
        loading={loading}
        color="#8b5cf6"
      />

      {/* The crosshair, the dot and the readout: the layer the Analytics chart draws. */}
      <ChartScrub
        count={displayChartData.length}
        left={plotLeft}
        right={PLOT_RIGHT}
        top={PLOT_TOP}
        bottom={PLOT_TOP + plotHeight}
        series={scrubSeries}
        title={scrubTitle}
        rows={scrubRows}
        disabled={loading || displayChartData.length === 0}
      />
    </div>
  )
}

/**
 * THE GRID AND THE DATES, laid out by recharts, which loads lazily. Memoised
 * on the dates, the scale and the gutter, so a tab that changes only the
 * numbers never reaches it; the line is drawn over it by MorphLines, and
 * arrives before recharts does.
 */
const DashboardFrame = memo(function DashboardFrame({
  data,
  top,
  ticks,
  plotLeft,
}: {
  data: { label: string }[]
  top: number
  ticks: number[]
  plotLeft: number
}) {
  const plotHeight = CHART_H - PLOT_TOP - XAXIS_H
  return (
    <LazyAreaChart data={data}>
      {({ AreaChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer }) => (
        <ResponsiveContainer width="100%" height={CHART_H}>
          {/*
            ROOM FOR THE DOTS, now that there is no y axis reserving any.
            The axis used to take 40px on the left, and removing it left
            `left: 0`, so the first point's active dot, six pixels of
            radius plus a two pixel white ring, was drawn half outside the
            card. That clipped stub at the top left of the chart was the
            dot, not a spike in the data.
          */}
          <AreaChart data={data} margin={{ top: PLOT_TOP, right: PLOT_RIGHT, left: 0, bottom: 0 }}>
            {/* At the ticks, placed by us: the same four heights on every tab. */}
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f3f4f6"
              vertical={false}
              horizontalPoints={ticks.map((v) => PLOT_TOP + (1 - v / top) * plotHeight)}
            />
            <XAxis
              dataKey="label"
              height={XAXIS_H}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            {/* The numbers are AxisLabels, over the plot, so they cross-fade. */}
            <YAxis
              tick={false}
              tickLine={false}
              axisLine={false}
              domain={[0, top]}
              ticks={ticks}
              interval={0}
              width={plotLeft}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </LazyAreaChart>
  )
})

// ── Sample data shown when the creator has zero real activity ──────────────
const SAMPLE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const SAMPLE_CHART: Record<string, ChartDataPoint[]> = {
  views:      SAMPLE_DAYS.map((d, i) => ({ label: d, value: [45, 78, 35, 92, 63, 88, 51][i], secondaryValue: [12, 22, 9, 31, 18, 28, 15][i] })),
  orders:     SAMPLE_DAYS.map((d, i) => ({ label: d, value: [2, 5, 1, 7, 3, 6, 4][i], refunds: [0, 0, 0, 1, 0, 0, 0][i] })),
  revenue:    SAMPLE_DAYS.map((d, i) => ({ label: d, value: [12.5, 34, 9, 45, 25, 38, 20][i] })),
  conversion: SAMPLE_DAYS.map((d, i) => ({ label: d, value: [4.2, 6.1, 2.8, 7.5, 4.8, 6.8, 7.8][i] })),
}
/** The week on the floor while the first line is on its way: the frame, no numbers. */
const WAITING_CHART: ChartDataPoint[] = SAMPLE_DAYS.map((d) => ({ label: d, value: 0 }))
const SAMPLE_KPI = {
  periodVisitors: 452, periodPageViews: 1240, prevPeriodVisitors: 380,
  periodOrders: 28, totalOrders: 95, prevPeriodOrders: 22,
  periodRevenue: 34500, totalRevenue: 125000, prevPeriodRevenue: 28900,
  conversionRate: 6.2, prevConversionRate: 5.8,
}

/**
 * What Home draws its figures from: the Analytics answer for the period
 * (app/api/analytics/reports, counted on the server from every row), the
 * period it was asked for, and the period's link taps.
 */
interface HomeAnswer {
  /** Null when the answer could not be had: every figure zero, and the chart stops waiting. */
  reports: Reports | null
  allTime: { views?: number; orders?: number; salesCents?: number } | null
  window: { start: number; end: number }
  previous: { start: number; end: number } | null
}
/** A realtime order row: only which creator and product it is for is read. */
type LiveOrder = { product_id?: string | null; creator_id?: string | null }

interface DashboardClientProps {
  creatorId: string
  displayName: string
  /** Worked out on the server from the creator's zone, so the first paint is already right. */
  initialDayPart?: DayPart
  /**
   * What the account has done (lib/home/progress), read on the server. Getting
   * started, the challenges after it and the purple bar are all worked out
   * from these, and they are asked for again when Home is landed on from
   * another page (use-home-progress).
   */
  initialProgress?: ProgressFacts
  /** The banner's sales news, counted on the server (app/app/page.tsx). */
  bannerSales?: SalesSummary
  /** The old checklist, read only when `initialProgress` is not given. */
  initialSetupSteps?: SetupStep[]
  productIds: string[]
  /** The signed in user: a kept Analytics answer is shown only to the person it was counted for. */
  viewerId?: string | null
  creatorHandle?: string
  connectedDomain?: string | null
  /** The website's own domain (lib/custom-domains). On an old database, the same one domain. */
  websiteDomain?: string | null
  /** True only when a site has actually been published, never when one merely exists. */
  websitePublished?: boolean
  subscriptionPlanId?: string
  /** No longer shown: the share panel is the addresses, Copy, a QR code and Share (components/app/share). */
  sharePlatforms?: ConnectedPlatform[]
  /** The OnePage is published, so its address opens (app/app/page.tsx). */
  onePageLive?: boolean
}

// Helper function to calculate percentage change
const calculatePercentChange = (current: number, previous: number): { value: number; isPositive: boolean; isZero: boolean } => {
  if (previous === 0 && current === 0) return { value: 0, isPositive: true, isZero: true }
  if (previous === 0) return { value: 100, isPositive: true, isZero: false }
  const change = ((current - previous) / previous) * 100
  return { value: Math.abs(change), isPositive: change >= 0, isZero: change === 0 }
}

// Small percentage change indicator component
function PercentChangeIndicator({ current, previous }: { current: number; previous: number }) {
  const { value, isPositive, isZero } = calculatePercentChange(current, previous)

  if (isZero) return null

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
      isPositive ? "text-emerald-600" : "text-[#9ca3af]"
    }`}>
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {Math.round(value)}%
    </span>
  )
}

/**
 * ===========================================================================
 *  THE ANNOUNCEMENT BAR: ONE SLIDE AT A TIME, ALWAYS, AND ONLY WHEN SEEN
 * ===========================================================================
 * Reported first as two slides' text interlacing and the progress line
 * stopping part way (timers that outlived their cycle), and then as lag.
 *
 * THE LAG. The cycle's state lived in DashboardClient, so every slide change
 * was two renders of the whole dashboard, chart included, every fifteen
 * seconds, on a hidden tab and with the bar scrolled away as much as on
 * screen. The bar is its own memoised component now: a slide change renders
 * the bar and nothing else.
 *
 * THE CLOCK IS THE LINE. The line is a CSS animation on `transform`, which the
 * compositor runs, and the slide changes when it ends (onAnimationEnd), then
 * once more after the fade. So pausing the line pauses the bar: off screen
 * (IntersectionObserver) or with the tab hidden, the line is paused and
 * nothing here runs at all. The one timer left, the fade, is cleared on the
 * way out.
 *
 * A NEW SLIDE PUTS NOTHING INTO THE PAGE. Every slide the bar can show is
 * there from the start, the others hidden by their `hidden` attribute, the
 * fade is a style, and the line starts its animation again where it is
 * rather than a new line taking its place. An element going in or out was
 * a change the page's :has() rules answer by restyling the whole document:
 * about 820 elements and 35 to 50ms of style work on a phone's CPU every
 * fifteen seconds, whatever else the page was doing (Chromium's trace, as
 * scripts/check-app-sheets-frames.mjs takes it).
 */
type AnnouncementSlide = "upgrade" | "steps" | "payouts"
const DURATION = 15000

const AnnouncementBar = memo(function AnnouncementBar({
  slides,
  completedSteps,
  totalSteps,
}: {
  slides: AnnouncementSlide[]
  completedSteps: number
  totalSteps: number
}) {
  const { t } = useLanguage()
  /*
    THE SLIDE SHOWING IS NAMED, NOT COUNTED. It was an index into `slides`
    with a fade out, a swap and a fade in on the whole row: when the list
    changed under it (a step done, payouts connected) the index pointed at
    another slide with no fade at all, and on a phone the old words could
    still be on screen as the new ones came in. Now every slide has its own
    place in one grid cell, and the one leaving is gone (160ms) before the
    one arriving starts (see .announce-slide in globals.css): two slides'
    words are never on screen together.
  */
  const [currentId, setCurrentId] = useState<AnnouncementSlide>(slides[0])
  const current = slides.includes(currentId) ? currentId : slides[0]
  const [announceCycle, setAnnounceCycle] = useState(0)
  const [paused, setPaused] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = barRef.current
    if (!el) return
    let onScreen = true
    const sync = () => setPaused(!onScreen || document.visibilityState === "hidden")
    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync() })
      : null
    io?.observe(el)
    document.addEventListener("visibilitychange", sync)
    sync()
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  const next = () => {
    const i = slides.indexOf(current)
    setCurrentId(slides[(i + 1) % slides.length])
    setAnnounceCycle((c) => c + 1)
  }

  /* Each new slide runs the same line's animation again from its start, and
     it ends again, which is what picks the slide after. Without the Web
     Animations API to do that, a new line takes its place, as it used to. */
  const lineRef = useRef<HTMLDivElement>(null)
  const [lineKey, setLineKey] = useState(0)
  const firstCycle = useRef(true)
  useLayoutEffect(() => {
    if (firstCycle.current) {
      firstCycle.current = false
      return
    }
    const run = lineRef.current?.getAnimations?.().find((a) => String((a as CSSAnimation).animationName ?? "").startsWith("announce-progress"))
    if (run) run.currentTime = 0
    else setLineKey((k) => k + 1)
  }, [announceCycle])

  return (
      <div ref={barRef} data-page-strip="" className={STRIP_TINT}>
        {/* 38px on a phone and 40px wider, the same as every other /app page's
            strip, in the same calm colours and with the same one button
            (components/app/announcement-bar-mobile). The black bar's rounded
            corners are drawn over its top corners (components/app/app-top-corners). */}
        <div className="py-[5px] px-4 md:py-1">
          <div className="announce-stack max-w-[1200px] mx-auto grid h-7 md:h-8 text-center whitespace-nowrap">
            {slides.includes("upgrade") && (
              <div data-announce="upgrade" data-on={current === "upgrade" ? "" : undefined} inert={current !== "upgrade"} className="announce-slide flex items-center justify-center gap-2 md:gap-3">
                <span className="text-[12px] md:text-[14px]">
                  <span className={STRIP_TITLE}>{t("dashboard.tryProFree")}</span>
                  <span className={`hidden md:inline ml-2 ${STRIP_TEXT}`}>{t("dashboard.proSubtitle")}</span>
                </span>
                <AppLink href="/app/settings/billing/upgrade" className={STRIP_ACTION}>
                  <Sparkles className={STRIP_SPARKLE} aria-hidden="true" />
                  {t("dashboard.upgrade")}
                </AppLink>
              </div>
            )}
            {slides.includes("steps") && (
              <div data-announce="steps" data-on={current === "steps" ? "" : undefined} inert={current !== "steps"} className="announce-slide flex items-center justify-center gap-2 md:gap-3">
                <span className="text-[12px] md:text-[14px]">
                  <span className={STRIP_TITLE}>{t("dashboard.completeSetup")}</span>
                  <span className={`md:hidden ml-1.5 ${STRIP_TEXT}`}>{completedSteps}/{totalSteps}</span>
                  <span className={`hidden md:inline ml-2 ${STRIP_TEXT}`}>{totalSteps - completedSteps} {t("dashboard.stepsRemaining")}</span>
                </span>
                <button onClick={bumpGettingStarted} className={STRIP_ACTION}>
                  {t("common.continue")}
                </button>
              </div>
            )}
            {slides.includes("payouts") && (
              <div data-announce="payouts" data-on={current === "payouts" ? "" : undefined} inert={current !== "payouts"} className="announce-slide flex items-center justify-center gap-2 md:gap-3">
                <span className="text-[12px] md:text-[14px]">
                  <span className={STRIP_TITLE}>{t("dashboard.getPaid")}</span>
                  <span className={`hidden md:inline ml-2 ${STRIP_TEXT}`}>{t("dashboard.connectPayoutsDesc")}</span>
                </span>
                <AppLink href="/app/settings?tab=payments" className={STRIP_ACTION}>
                  {t("common.connect")}
                </AppLink>
              </div>
            )}
          </div>
        </div>
        {/* How long until the next slide. Each slide runs it again from the
            start; see "A NEW SLIDE PUTS NOTHING INTO THE PAGE". Its track is
            the strip's hairline. */}
        <div className="h-[2px] bg-white/10 overflow-hidden">
          {slides.length > 1 && (
            <div
              key={lineKey}
              ref={lineRef}
              className="announce-progress h-full bg-white/35"
              style={{ animationDuration: `${DURATION}ms`, animationPlayState: paused ? "paused" : "running" }}
              onAnimationEnd={next}
            />
          )}
        </div>
      </div>
  )
})

/**
 * THE LIVE PILL WAITS AS ITSELF.
 * It used to hold a grey shimmer bar where the number goes until the first
 * count came back, a skeleton for two characters. Now the pill is drawn
 * whole from the first frame: a grey dot, "live", and a "0" held
 * invisible so the pill already has its width. When the count lands the
 * number fades in on opacity and the dot turns green if anyone is there.
 * Nothing moves.
 */
function LivePill({ count, label, className, textClassName }: { count: number | null; label: string; className: string; textClassName: string }) {
  const active = (count ?? 0) > 0
  return (
    <div className={`flex items-center gap-1.5 bg-[#f3f4f6] ${className}`} aria-busy={count == null}>
      <span
        aria-hidden
        className={`w-2 h-2 shrink-0 rounded-full ${
          active ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-gray-400"
        }`}
      />
      <span className={`${textClassName} font-medium ${active ? "text-emerald-600" : "text-gray-500"}`}>
        <span className={`tabular-nums transition-opacity duration-300 ease-out ${count == null ? "opacity-0" : "opacity-100"}`}>{count ?? 0}</span> {label}
      </span>
    </div>
  )
}

export function DashboardClient({
  creatorId,
  displayName,
  initialDayPart = "morning",
  initialProgress,
  bannerSales,
  initialSetupSteps,
  productIds,
  viewerId = null,
  creatorHandle = "",
  connectedDomain = null,
  websiteDomain = null,
  websitePublished = false,
  subscriptionPlanId = "free",
  onePageLive = false,
}: DashboardClientProps) {
  /**
   * THE PERIOD, from the date picker every page in /app shares, remembered
   * on this device as the old choice was. A preset is re-read against today
   * each time, so "Last 7 days" chosen last week is still the last 7 days.
   */
  const dashTimeZone = useMemo(() => viewerTimeZone(), [])
  const dashToday = todayIn(dashTimeZone, Date.now())
  const [period, setPeriod] = useState<RangeValue>(() => {
    let saved: Partial<RangeValue> | null = null
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("dashboard_period") : null
      saved = raw ? (JSON.parse(raw) as Partial<RangeValue>) : null
      /* The old key held a bare preset name. */
      const legacy = !saved && typeof window !== "undefined" ? localStorage.getItem("dashboard_timeframe") : null
      if (legacy) saved = { preset: (legacy === "this_month" ? "month_to_date" : legacy) as RangeValue["preset"] }
    } catch {
      saved = null
    }
    return resolveValue(saved, dashToday, "last_7_days")
  })
  const periodKey = `${period.preset}:${period.start}:${period.end}`

  useHideNativeSplash()

  // Remember the period on this device
  useEffect(() => {
    try {
      localStorage.setItem("dashboard_period", JSON.stringify({ preset: period.preset, start: period.start, end: period.end }))
    } catch {
      /* private mode: the default next time */
    }
  }, [periodKey]) // eslint-disable-line react-hooks/exhaustive-deps

  /* The page arrives with its data (app/app/page.tsx), so it is drawn at once;
     the figures the browser reads for itself soften while they refresh. There
     is no drawing of the page before it: a full page skeleton used to sit
     here behind an `isLoading` that nothing ever set. */
  const [isRefreshing, setIsRefreshing] = useState(true)
  /* The period's first figures are in. Until then the four tabs draw their
     figures soft, blurred, and clear to the real numbers when they land
     (components/app/metric-tab `loading`), and "No activity yet" waits for
     the answer rather than showing over the chart before it. */
  const [figuresReady, setFiguresReady] = useState(false)
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>("views")
  /* Follows the chosen tab; the swipe itself is the browser's. */
  const kpiStripRef = useTabStrip<HTMLDivElement>(openKPIModal ?? "views", KPI_TAB_ORDER)
  const [chartExpanded, setChartExpanded] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("storelib_chart_expanded")
      if (saved !== null) return saved === "true"
      // Desktop: closed by default; Mobile: open by default
      return window.innerWidth < 768
    }
    return false
  })
  // Persist chart expanded/collapsed preference
  useEffect(() => {
    localStorage.setItem("storelib_chart_expanded", String(chartExpanded))
  }, [chartExpanded])

  const [isChartLoading, setIsChartLoading] = useState(false)
  /* The chart shows another period's numbers while this one's are on their way: it stays, blurred and dimmed. */
  const [chartStale, setChartStale] = useState(false)
  // Sample data toggle — session-only (resets on page refresh, no localStorage)
  const [showSampleData, setShowSampleData] = useState(false)
  /**
   * ===========================================================================
   *  THE FOUR FIGURES AND THE CHART ARE ANALYTICS' OWN
   * ===========================================================================
   * Home asks app/api/analytics/reports the very question the Analytics page
   * asks for the same period (lib/analytics/home-figures homeQuestion), and
   * draws its answer (homeFromReports): a basket is one order, money is what
   * was charged less what was refunded, a disputed payment is not a sale,
   * the period is compared with the one just before on the creator's clock,
   * and every figure is counted on the server from every row.
   *
   * It used to read the period's views in the browser and every order on
   * the server (app/app/page.tsx), and a read stops at 1,000 rows: a busy
   * store's views, and a store past its thousandth order, simply stopped
   * counting, without saying so. The answer is shared with Analytics too:
   * one Home has asked for opens Analytics at once, and the other way round.
   */
  const [homeAnswer, setHomeAnswer] = useState<HomeAnswer | null>(null)
  /* A new order, or a changed one, asks again (the realtime subscription below). */
  const [ordersChanged, setOrdersChanged] = useState(0)
  /* That question ends a step later than the last, so neither this browser
     nor the server answers it with what they kept from before the order. */
  const askPastKept = useRef(false)

  // Subscribe to new/updated orders for this creator's products
  useEffect(() => {
    if (!productIds || productIds.length === 0) return
    const supabase = createClient()
    let pending: number | undefined
    const channel = supabase
      .channel("dashboard-orders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const row = (payload.new || payload.old) as LiveOrder | undefined
          if (!row || !(row.creator_id === creatorId || (row.product_id && productIds.includes(row.product_id)))) return
          /* A basket writes a row per product in a burst: one question for all of them. */
          window.clearTimeout(pending)
          pending = window.setTimeout(() => {
            askPastKept.current = true
            setOrdersChanged((n) => n + 1)
          }, 1500)
        }
      )
      .subscribe()

    return () => {
      window.clearTimeout(pending)
      supabase.removeChannel(channel)
    }
  }, [productIds.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Before the first answer: the period's buckets, every figure zero, drawn soft. */
  const figures = useMemo(() => {
    if (homeAnswer?.reports) return homeFromReports(homeAnswer.reports)
    const { window, previous } = homeSpans(period, dashTimeZone, Date.now())
    return homeFigures({ orders: [], views: [], window, previous, timeZone: dashTimeZone })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeAnswer, periodKey, dashTimeZone])
  /* All time, under each figure, as Analytics counts it (analytics_all_time). */
  const totals = homeAllTime(homeAnswer?.allTime)
  /* Page views ever, only to know whether this store has had any activity at all (the sample toggle below). */
  const everViewed = (homeAnswer?.allTime?.views ?? 0) > 0
  const analyticsData = { ...figures, ...totals }
  /** Every metric's series for the period. Null until the period's answer is in. */
  const chartSeries: Record<HomeMetric, ChartDataPoint[]> | null = homeAnswer ? figures.series : null
  /** The chosen metric's series. A tab changes this and nothing else. */
  const chartData = (openKPIModal && chartSeries?.[openKPIModal]) || NO_POINTS

  // ── Sample data overlay ────────────────────────────────────────────────────
  // True once any real metric exists — toggle and badge disappear permanently
  const hasRealData = everViewed || analyticsData.periodVisitors > 0 || analyticsData.totalOrders > 0 || analyticsData.totalRevenue > 0
  const displayAnalytics = showSampleData && !hasRealData ? { ...analyticsData, ...SAMPLE_KPI } : analyticsData
  const displayChartData = showSampleData && !hasRealData && openKPIModal
    ? (SAMPLE_CHART[openKPIModal] ?? chartData)
    : chartData

  /* null until the first read: a count of 0 drawn and then replaced by the
     real one was a figure that changed in front of you. */
  /* Each address pill opens its own panel; this asks whichever one is on screen to open (Getting started's "Make your first sale"). */
  const [shareSignal, setShareSignal] = useState(0)
  const [liveVisitors, setLiveVisitors] = useState<number | null>(null)
  const { t } = useLanguage()
  /* The greeting follows the creator's own clock: the server's guess first
     (lib/greeting.ts), then the browser's zone once it runs, then every
     minute, so a tab left open over lunch does not keep saying morning. */
  const [greetingPart, setGreetingPart] = useState<DayPart>(initialDayPart)
  useEffect(() => {
    const zone = viewerTimeZone()
    rememberTimeZone(zone)
    const tick = () => setGreetingPart(dayPart(Date.now(), zone))
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])
  const greetingName = displayName === "there" ? "" : firstName(displayName)

  const formatCurrency = (cents: number, compact = false) => {
    const value = cents / 100
    if (compact && value >= 1000) {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`
      }
      return `$${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
    }
    // Remove decimal places if they are .00
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value)
    return formatted
  }

  // Format numbers compactly (10.5K, 1.2M, etc.)
  const formatCompactNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`
    }
    return num.toLocaleString()
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  const isFirstLoadRef = useRef(true)

  // Fetch live visitors (active in last 5 minutes)
  const fetchLiveVisitors = async () => {
    const supabase = createClient()
    try {
      const fiveMinutesAgo = new Date()
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5)

      const { data: recentViews } = await supabase
        .from("analytics_events")
        .select("visitor_id, session_id")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", fiveMinutesAgo.toISOString())

      // Count unique visitors
      const uniqueVisitors = new Set(
        (recentViews || [])
          .map((e: any) => e.visitor_id || e.session_id)
          .filter(Boolean)
      )

      setLiveVisitors(uniqueVisitors.size)
    } catch (error) {
      console.error("Error fetching live visitors:", error)
      setLiveVisitors((n) => n ?? 0)
    }
  }

  // Poll for live visitors every 30 seconds — "live" means last 5 min so 30 s cadence is plenty
  useEffect(() => {
    fetchLiveVisitors()
    const interval = setInterval(fetchLiveVisitors, 30000)
    return () => clearInterval(interval)
  }, [creatorId])

  /**
   * =========================================================================
   *  THE PERIOD IS READ ONCE, NEVER PER TAB
   * =========================================================================
   * This fetched on every tab: tapping Revenue asked Supabase again, then
   * redrew, so a tap was a wait and a line that appeared rather than one
   * that moved. The period is asked for once, and the four figures and every
   * metric's series are worked out from it (`figures` above). A tab picks one
   * of four series the page already holds, and the chart morphs to it.
   *
   * The figures are the Analytics answer for the period and the one just
   * before (homeQuestion), asked through lib/analytics/report-cache: the
   * figures line is drawn as soon as the server has counted it, a question
   * already on its way (the sidebar's prefetch) is joined rather than asked
   * again, and the last answer kept for this person is drawn at once while
   * the new one comes. Link clicks are in that answer too, counted on the
   * server as `link_click`. They were read here, in the browser, as
   * `event_type = 'click'`, a name nothing has ever written: that read found
   * nothing, a thousand rows at a time.
   *
   * A newer period's answer wins: a slow reply for the period before is
   * dropped rather than drawn over the new one.
   */
  const chartRequestRef = useRef(0)
  const fetchPeriodEvents = async (opts?: { pull?: boolean }) => {
    const request = ++chartRequestRef.current
    const fromPull = opts?.pull === true
    setIsChartLoading(true)
    const { window: span, previous, key } = homeQuestion(period, dashTimeZone, reportNow(Date.now() + (askPastKept.current ? NOW_STEP_MS : 0)))
    askPastKept.current = false
    const question = questionOf(key)
    const answerOf = (answer: Record<string, unknown>): HomeAnswer => ({
      reports: (answer.reports as Reports | undefined) ?? null,
      allTime: (answer.allTime as HomeAnswer["allTime"] | undefined) ?? null,
      window: span,
      previous,
    })
    const kept = keptAnswer(question, viewerId)
    if (kept) setHomeAnswer(answerOf(kept.answer))
    /* A period answered before is drawn from what was kept, sharp, and asked again quietly behind it.
       Otherwise the figures go soft, and a chart already drawn for another period stays, blurred,
       until this one's numbers land (First load: isRefreshing is already true, seeded in useState). */
    if (!fromPull) {
      setIsRefreshing(!kept)
      setChartStale(!kept)
    }
    try {
      const answer = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const asked = askReport(key, (quick) => resolve(quick))
        asked.promise.then(resolve, reject).finally(asked.release)
      })
      if (request !== chartRequestRef.current) return
      /* THE ANSWER IS DRAWN THE MOMENT IT LANDS: the quick first part has every figure Home shows. */
      setHomeAnswer(answerOf(answer))
      setChartStale(false)
      setIsChartLoading(false)
    } catch (error) {
      console.error("Error fetching the period's figures:", error)
      if (request === chartRequestRef.current) {
        setIsChartLoading(false)
        setChartStale(false)
        /* Nothing to draw, rather than a skeleton that waits for ever. */
        setHomeAnswer((prev) => prev ?? answerOf({}))
      }
    } finally {
      if (request === chartRequestRef.current) {
        // Delay removing the refresh blur so KPI numbers and charts
        // settle before the CSS transition fades them back in cleanly
        if (!isFirstLoadRef.current) {
          setTimeout(() => setIsRefreshing(false), 300)
        } else {
          setIsRefreshing(false)
        }
        isFirstLoadRef.current = false
        setFiguresReady(true)
      }
    }
  }

  // Read the period when it changes, or when an order comes in. Not when the tab does.
  useEffect(() => {
    // Safety net: if the answer hangs (slow network, a busy database), stop
    // the chart's wait after 8 s rather than never. A stuck request is asked
    // again beside itself after 4 s (lib/analytics/report-cache hedged), so
    // this is the rare case. The answer still lands when it comes; until
    // then the figures stay soft.
    const safetyTimer = window.setTimeout(() => {
      setIsChartLoading(false)
      setChartStale(false)
      isFirstLoadRef.current = false
    }, 8000)
    fetchPeriodEvents().finally(() => window.clearTimeout(safetyTimer))
    return () => window.clearTimeout(safetyTimer)
  }, [periodKey, creatorId, ordersChanged]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * WHAT THE ACCOUNT HAS DONE (lib/home/progress), from the server, asked for
   * again when Home is landed on from another page or comes back into view
   * (use-home-progress), so a domain verified or Stripe connected meanwhile
   * ticks without a reload. The sales are the all time line of this page's
   * Analytics answer, asked again when an order comes in over realtime: a
   * first sale ticks moments after it lands.
   */
  const { facts: readFacts, markGuideOpened } = useHomeProgress(initialProgress ?? legacyFacts(initialSetupSteps ?? [], subscriptionPlanId))
  const facts = useMemo<ProgressFacts>(
    () =>
      /* The server's count (every order, app/app/page.tsx) until Home's first answer, then the answer's all time line, which a new order moves. */
      homeAnswer?.allTime
        ? { ...readFacts, sales: totals.totalOrders, revenueCents: Math.max(0, totals.totalRevenue) }
        : readFacts,
    [readFacts, homeAnswer?.allTime, totals.totalOrders, totals.totalRevenue],
  )
  const progress = useMemo(() => homeProgress(facts), [facts])
  const hasProducts = facts.products > 0
  const hasPayouts = facts.paymentsReady
  /**
   * THE ADDRESSES A CREATOR HANDS OUT, for the pill and the share sheet
   * (components/app/share). Always absolute, so the same string is copied,
   * put in the QR code and handed to a share link, in the app as in a
   * browser. The creator page comes first: it is what the pill shows.
   *
   * A domain is connected for the website or for the creator page
   * (Settings, Domains), and each is given to the one it opens. A website
   * domain answers with the creator page while no website is published
   * (proxy.ts), and before the database knew purposes there was one domain
   * for both, which is why the page also takes it then. The OnePage is
   * always offered, because every creator has one to hand out beside their
   * page; until it is published the sheet says so under its address. The
   * website is only offered once it has been published, never because a
   * theme was installed.
   */
  const shareAddresses = useMemo<ShareAddress[]>(() => {
    if (!creatorHandle) return []
    const domainIsWebsite = !!websiteDomain && websitePublished
    const domainIsPage = !!connectedDomain && (!websitePublished || connectedDomain !== websiteDomain)
    const list: ShareAddress[] = [
      {
        surface: "creator",
        label: "Creator page",
        url: domainIsPage ? `https://${connectedDomain}` : getStoreShareUrl(creatorHandle),
        display: domainIsPage ? (connectedDomain as string) : getStoreUrlDisplay(creatorHandle),
      },
    ]
    list.push({
      surface: "onepage",
      label: "OnePage",
      url: connectedDomain ? `https://${connectedDomain}/links` : getLinksShareUrl(creatorHandle),
      display: connectedDomain ? `${connectedDomain}/links` : getLinksUrlDisplay(creatorHandle),
      live: onePageLive,
    })
    if (websitePublished) {
      list.push({
        surface: "website",
        label: "Website",
        url: domainIsWebsite ? `https://${websiteDomain}` : getWebsiteShareUrl(creatorHandle),
        display: domainIsWebsite ? (websiteDomain as string) : getWebsiteUrlDisplay(creatorHandle),
      })
    }
    return list
  }, [creatorHandle, connectedDomain, websiteDomain, websitePublished, onePageLive])

  /**
   * GETTING STARTED (components/app/home/home-cards): the seven steps of
   * lib/home/progress, and once every one is done, the challenges. The
   * purple bar's "steps remaining" counts the same seven. The first sale
   * (and the ten sales after it) open the share panel while there is an
   * address to share, because sharing it is how a sale comes.
   */
  const completedSteps = progress.completed
  const totalSteps = progress.total
  const allCompleted = progress.setupDone
  const canShare = shareAddresses.length > 0
  const openShare = useCallback(() => setShareSignal((n) => n + 1), [])
  /* The guide points at Getting started, and opening it is a step of its own, kept on the account. */
  const openGuide = useCallback(() => {
    markGuideOpened()
    bumpGettingStarted()
  }, [markGuideOpened])

  /* The purple bar's slides, worked out from the account. The bar itself,
     its timing and its state are AnnouncementBar, above. */
  const slides = useMemo(() => {
    const list: AnnouncementSlide[] = ["upgrade"]
    if (!allCompleted) list.push("steps")
    if (hasProducts && !hasPayouts) list.push("payouts")
    return list
  }, [allCompleted, hasProducts, hasPayouts])

  // ── Pull-to-refresh ───────────────────────────────────────────────────────
  // Wraps the dashboard's own scroll container so we can intercept touch events
  // with { passive: false } — the only reliable way to block iOS rubber-band
  // bounce on a child overflow-scroll element.
  const handlePullRefresh = useCallback(async () => {
    await fetchPeriodEvents({ pull: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey])

  /**
   * The gap held open while refreshing. Shared with the indicator and the hook
   * so the ring is centred in the SAME gap the content opens — it used to be a
   * literal 10px against this 34, which was never actually centred and would
   * have drifted silently the moment either number was touched.
   */
  /* The room iOS's spinner turns in (round 13: the community's spokes, components/app/pull-to-refresh-indicator). */
  const REFRESH_HOLD = SPOKES_HOLD

  /**
   * THE PULL DOES NOT RENDER THIS PAGE.
   *
   * It used to: the hook held the distance in state, so every touchmove
   * re-rendered this component — the chart, the cards, the order list, all of
   * it — and then recomputed a translateY and a transition string from the new
   * props. That is why the drag could not hold a frame rate.
   *
   * The hook writes the two elements below directly instead, one write per
   * frame, and this component renders once. There is no pull value in scope
   * here to render from.
   */
  const { contentRef, indicatorRef } =
    usePullToRefresh(scrollRef, handlePullRefresh, { refreshHold: REFRESH_HOLD })

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto bg-[#f8f9fa] dashboard-scroll-container relative app-page-enter"
    >
      {/*
        ANNOUNCEMENT BAR — ANCHORED, AND OUTSIDE THE PULL WRAPPER.

        It used to sit INSIDE the sliding content, so pulling to refresh pushed
        the purple bar down the screen and opened a white gap between it and the
        header, with the spinner sitting in that gap — above the bar, detached
        from the page, over nothing. That is the thing that looked broken.

        The bar stays put now. Only what is below it moves, so the gap the
        spinner lives in opens UNDER the bar, where a refresh indicator belongs.
      */}
      <AnnouncementBar slides={slides} completedSteps={completedSteps} totalSteps={totalSteps} />

      {/*
        Everything below the anchored bar. `relative` makes this the positioning
        context for the indicator, so topOffset=0 means "the top of the area
        under the purple bar" rather than "the top of the page".

        The indicator is absolute and pointer-events-none, so it neither takes up
        layout space nor intercepts a tap meant for anything underneath it.
      */}
      <div className="relative">
        <PullToRefreshIndicator
          ref={indicatorRef}
          topOffset={0}
          refreshHold={REFRESH_HOLD}
        />

        {/* What slides down. The hook owns its transform and its will-change;
            neither is written here, so neither costs a render. */}
        <div ref={contentRef} data-pull-content="" data-keep-transform="">

      <div className="app-gutter py-6 max-w-[1200px] mx-auto">

        {/* Header Section */}
        {/*
          THE ADDRESS ON THE RIGHT, THE PERIOD BESIDE THE GREETING.

          The period and the live count sit next to the greeting they
          describe. The right of the row is the creator's address in a grey
          pill (components/app/share): the one thing on this page they hand
          to other people, and what opens the share panel.

          ON A PHONE THE PILL IS ABOVE THE GREETING, AT THE RIGHT EDGE. "The
          pill on the same row as 'Last 7 days' and '0 live' looks bad. Better
          to position that pill above the 'Good evening' text, and reduce its
          width on mobile by only 3%." Then: "put the light grey View pill on
          the right side of the screen." It had what the live count and the period left of the row
          (measured with Inter: 130, 160 and 200px at 360, 390 and 430 wide,
          the column less 198px), and it keeps 97% of exactly that, its
          address fading out where the room runs out; the live count and the
          period have the row under the greeting to themselves.
        */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="min-w-0">
            {shareAddresses.length > 0 && (
              <div data-home-phone-pill="" className="md:hidden mb-3 ml-auto flex min-w-0 max-w-[calc((100%-198px)*0.97)] justify-end">
                <ShareStorelib size="sm" addresses={shareAddresses} openSignal={shareSignal} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">
                {t(`dashboard.greeting.${greetingPart}` as Parameters<typeof t>[0])}
                {greetingName ? `, ${greetingName}` : ""}
              </h1>
              {/* Desktop: the period and the live count, beside the greeting */}
              <div className="hidden md:flex items-center gap-2.5">
                {/* The date picker every page in /app shares. */}
                <DateRangePicker value={period} onChange={setPeriod} today={dashToday} align="start" className="h-[38px] rounded-xl px-3.5" />
                <LivePill count={liveVisitors} label={t("dashboard.liveVisitors")} className="px-3 py-2 rounded-lg" textClassName="text-[13px]" />
              </div>
            </div>
            <p className="text-[14px] text-[#6b7280] mt-1">{t("dashboard.subtitle")}</p>
          </div>

          {/* Desktop: the address, which opens the share panel in place */}
          {shareAddresses.length > 0 && (
            <div className="hidden md:flex min-w-0 max-w-[300px] shrink-0 items-center">
              <ShareStorelib addresses={shareAddresses} openSignal={shareSignal} />
            </div>
          )}

          {/* Mobile: the live count and the period, on the row under the greeting */}
          <div className="md:hidden flex min-w-0 items-center gap-2">
            <LivePill count={liveVisitors} label={t("dashboard.liveVisitors")} className="shrink-0 px-2.5 rounded-xl h-9" textClassName="text-[12px] whitespace-nowrap" />
            <div className="shrink-0">
              <DateRangePicker value={period} onChange={setPeriod} today={dashToday} align="start" className="h-9 rounded-xl px-3" />
            </div>
          </div>
        </div>

        {/* Stats Cards + Chart Section */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8 overflow-hidden">
          {/* KPI Metric Tabs - horizontally scrollable on mobile.
              The strip follows the chosen tab; the browser scrolls it, and
              decides from the swipe whether it is the row's or the page's
              (components/app/use-tab-strip). */}
          <div ref={kpiStripRef} role="tablist" aria-label="Metric" data-scroll-x className="relative flex overflow-x-auto scrollbar-hide md:grid md:grid-cols-4 divide-x divide-[#e5e7eb]/60" style={TAB_STRIP_STYLE}>
            {/* The four figures: components/app/metric-tab, the same tab Analytics draws. */}
            <MetricTab
              tab="views"
              className="flex-shrink-0 min-w-[130px] md:min-w-0"
              selected={openKPIModal === "views"}
              soft={isRefreshing && figuresReady}
              loading={!figuresReady}
              sample={showSampleData && !hasRealData}
              label={t("dashboard.visitors")}
              value={formatCompactNumber(displayAnalytics.periodVisitors)}
              change={<PercentChangeIndicator current={displayAnalytics.periodVisitors} previous={displayAnalytics.prevPeriodVisitors} />}
              foot={`${formatCompactNumber(displayAnalytics.periodPageViews)} ${t("dashboard.pageViews")}`}
              onSelect={() => { setOpenKPIModal("views"); setChartExpanded(true) }}
            />
            <MetricTab
              tab="revenue"
              className="flex-shrink-0 min-w-[130px] md:min-w-0"
              selected={openKPIModal === "revenue"}
              soft={isRefreshing && figuresReady}
              loading={!figuresReady}
              sample={showSampleData && !hasRealData}
              label={t("dashboard.revenue")}
              value={formatCurrency(displayAnalytics.periodRevenue)}
              change={<PercentChangeIndicator current={displayAnalytics.periodRevenue} previous={displayAnalytics.prevPeriodRevenue} />}
              foot={`${formatCurrency(displayAnalytics.totalRevenue)} ${t("dashboard.allTime")}`}
              onSelect={() => { setOpenKPIModal("revenue"); setChartExpanded(true) }}
            />
            <MetricTab
              tab="orders"
              className="flex-shrink-0 min-w-[130px] md:min-w-0"
              selected={openKPIModal === "orders"}
              soft={isRefreshing && figuresReady}
              loading={!figuresReady}
              sample={showSampleData && !hasRealData}
              label={t("dashboard.orders")}
              value={formatCompactNumber(displayAnalytics.periodOrders)}
              change={<PercentChangeIndicator current={displayAnalytics.periodOrders} previous={displayAnalytics.prevPeriodOrders} />}
              foot={`${formatCompactNumber(displayAnalytics.totalOrders)} ${t("dashboard.allTime")}`}
              onSelect={() => { setOpenKPIModal("orders"); setChartExpanded(true) }}
            />
            <MetricTab
              tab="conversion"
              className="flex-shrink-0 min-w-[130px] md:min-w-0"
              selected={openKPIModal === "conversion"}
              soft={isRefreshing && figuresReady}
              loading={!figuresReady}
              sample={showSampleData && !hasRealData}
              label={t("dashboard.conversionRate")}
              value={displayAnalytics.conversionRate === null ? "–" : `${Math.round(displayAnalytics.conversionRate)}%`}
              change={displayAnalytics.conversionRate === null || displayAnalytics.prevConversionRate === null ? null : <PercentChangeIndicator current={displayAnalytics.conversionRate} previous={displayAnalytics.prevConversionRate} />}
              foot={t("dashboard.ordersPerVisitor")}
              onSelect={() => { setOpenKPIModal("conversion"); setChartExpanded(true) }}
            />

            {/* Toggle arrow - sticky right on mobile, positioned in conversion rate area on desktop */}
            <div className="sticky right-0 flex items-center md:absolute md:right-2 md:top-2 z-10 bg-white md:bg-transparent pl-1 pr-2 md:p-0">
              <button
                onClick={(e) => { e.stopPropagation(); setChartExpanded(!chartExpanded) }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f3f4f6] md:bg-transparent hover:bg-[#e5e7eb] md:hover:bg-[#f3f4f6] transition-colors shrink-0"
                title={chartExpanded ? "Hide chart" : "Show chart"}
              >
                {chartExpanded ? (
                  <ChevronUp className="h-4 w-4 text-[#6b7280]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[#6b7280]" />
                )}
              </button>
            </div>
          </div>

          {/* Shared Chart Area - smooth line chart, toggleable */}
          <div className={`overflow-hidden transition-all duration-500 ease-out ${chartExpanded && openKPIModal ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"}`}>
            <div className="border-t border-[#e5e7eb]/60 px-2 py-3 sm:px-4 sm:py-4">
              {/*
                NO SKELETON. Until the period's first line is in, the chart
                is drawn as Analytics draws it: its frame, a grey line on the
                floor, softly blurred. The line then rises into place and the
                blur clears, one motion. The grey block shapes that stood here
                before read as too much for one chart. `homeAnswer == null`
                counts as waiting, because the read starts in an effect and
                `isChartLoading` alone left one empty frame first.
              */}
              {(() => {
                const chartWaiting = (homeAnswer == null || isChartLoading) && displayChartData.length === 0
                return (
                <div className="relative">
                  {/*
                    NO BLUR WHEN THE METRIC CHANGES.

                    This used to drop to 30% opacity with a 2px blur for as
                    long as `isChartLoading` was true, over 500ms each way.
                    Tapping Revenue therefore played three things at once: the
                    chart blurring out, the chart blurring back in, and the
                    line re-drawing itself. That is the pumping and the double
                    loading — one tap, three animations, none of which was
                    telling you anything you did not already know.

                    A first load with no data at all is the one blur: the grey
                    floor line above, softened, which is the only moment there
                    is genuinely nothing to look at. From then on the old line
                    simply becomes the new one, which the eye reads as a
                    change rather than a reload.

                    The sample-data dimming stays, because that is not a
                    loading state — it says these numbers are not yours.

                    A NEW PERIOD ON ITS WAY is the other real wait ("blur it
                    while it loads but keep it intact"): the chart already
                    drawn stays where it is, whole, and softens (4px, dimmed)
                    over 300ms while the new numbers come; when they land the
                    blur lifts over 700ms as the line moves to them. A period
                    answered before comes from what was kept and never
                    blurs; a tab never does.
                  */}
                  <div
                    aria-busy={chartWaiting || chartStale || undefined}
                    data-chart-stale={chartStale && !chartWaiting ? "" : undefined}
                    className={`transition-[opacity,filter] ease-[cubic-bezier(0.32,0.72,0,1)] ${chartStale && !chartWaiting ? "duration-300" : "duration-[700ms]"} ${chartWaiting ? "opacity-60 blur-[1.5px]" : chartStale ? "opacity-55 blur-[4px]" : showSampleData && !hasRealData ? "opacity-50 blur-0" : "opacity-100 blur-0"}`}
                  >
                  <DashboardTrendChart
                    displayChartData={chartWaiting ? WAITING_CHART : displayChartData}
                    loading={chartWaiting}
                    openKPIModal={openKPIModal}
                    widthFrom={showSampleData && !hasRealData ? SAMPLE_CHART : chartSeries ?? {}}
                    t={t}
                  />
                  </div>
                  {figuresReady && !hasRealData && (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                      <span className="text-[11px] text-[#c8ccd4]">
                        {showSampleData ? "Sample data" : "No activity yet"}
                      </span>
                      <button
                        onClick={() => setShowSampleData(prev => !prev)}
                        className={`relative inline-flex h-4 w-7 rounded-full transition-colors cursor-pointer ${showSampleData ? "bg-indigo-300/80" : "bg-[#e9ecef]"}`}
                        aria-label={showSampleData ? "Hide sample data" : "Show sample data"}
                      >
                        <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm my-0.5 transition-transform ${showSampleData ? "translate-x-3.5" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                  )}
                </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Dashboard Banner: what matters now for this store, beside the globe (components/app/home/home-banner) */}
        <div className="mb-8">
          <HomeBanner facts={facts} planId={subscriptionPlanId} sales={bannerSales ?? NO_SALES} onShare={canShare ? openShare : undefined} onGuide={openGuide} />
        </div>

        {/* Getting started, the guide and Your Plan (components/app/home/home-cards).
            The id is where the sidebar's Setup ring and the phone menu's
            Store setup card scroll to (components/app/sidebar). */}
        <div id="store-setup-section" className="mb-8 scroll-mt-4">
          <HomeCards progress={progress} planId={subscriptionPlanId} onGuide={openGuide} onShare={canShare ? openShare : undefined} />
        </div>

        {/* Shipping things: the five steps, while physical commerce is on and until they are done (components/app/home/physical-setup-card). */}
        <PhysicalSetupCard />

        {/* Quick actions, two across from a tablet up (components/app/home/quick-actions) */}
        <QuickActions />

      </div>

      {/* Dashboard Scrollbar Styles */}
      <style jsx>{`
        @keyframes pulse-glow {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
          }
          50% {
            opacity: 0.7;
            box-shadow: 0 0 12px rgba(16, 185, 129, 0.8);
          }
        }
        .dashboard-scroll-container {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
        }
        .dashboard-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .dashboard-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .dashboard-scroll-container::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 3px;
        }
        .dashboard-scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: rgba(156, 163, 175, 0.7);
        }
        @media (max-width: 768px) {
          .dashboard-scroll-container::-webkit-scrollbar {
            display: none;
          }
          .dashboard-scroll-container {
            scrollbar-width: none;
          }
        }
      `}</style>
        </div>{/* end content translateY wrapper */}
      </div>{/* end below-the-bar area that hosts the pull indicator */}

      {/* Bottom sheets rendered OUTSIDE transform wrapper — iOS position:fixed requires no ancestor transform */}
    </div>
  )
}
