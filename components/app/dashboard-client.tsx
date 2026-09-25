"use client"

import { useTabStrip } from "@/components/app/use-tab-strip"
import { MetricTab } from "@/components/app/metric-tab"
import { memo, useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from "react"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { PullToRefreshIndicator } from "./pull-to-refresh-indicator"
import { useHideNativeSplash } from "@/hooks/use-hide-native-splash"
import Link from "next/link"
import Image from "next/image"
import { dayPart, firstName, type DayPart } from "@/lib/greeting"
import { rememberTimeZone, viewerTimeZone } from "@/lib/orders/time-zone"
import { useRouter } from "next/navigation"
import {
  Eye,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Check,
  ChevronRight,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Image as ImageIcon,
  Package,
  Link2,
  Trophy,
  User,
  Palette,
  CreditCard,
  ExternalLink,
  X,
  Camera,
  FileText,
  Type,
  Wallet,
  Share2,
  Blocks,
  BarChart3,
  Globe,
  MonitorSmartphone,
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
import { getLinksShareUrl, getLinksUrl, getStoreShareUrl, getStoreUrl, getWebsiteUrl } from "@/lib/url-helpers"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal } from "@/lib/native-bridge"
import { AxisLabels, fixedScale } from "@/components/app/chart-morph"
import { MorphLines } from "@/components/app/morph-lines"
import { useToast } from "@/hooks/use-toast"
import { ChartScrub, type ScrubRow, type ScrubSeries } from "@/components/app/chart-scrub"
import { STORELIB_LOGO } from "@/lib/brand/logo"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { ShimmerBlock } from "@/components/ui/shimmer"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { boundsOf, resolveValue, todayIn, type RangeValue } from "@/lib/date-range/range"

interface SetupStep {
  id: string
  title: string
  description: string
  tooltip: string
  completed: boolean
  href: string
}

interface ChartDataPoint {
  label: string
  value: number
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

  const formatValue = useCallback((val: number) => {
    if (openKPIModal === "revenue") return `$${val.toFixed(2)}`
    if (openKPIModal === "conversion") return `${val}%`
    return val.toLocaleString()
  }, [openKPIModal])

  const metricLabel = openKPIModal === "views" ? t("dashboard.views")
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
      { label: metricLabel, value: (i) => formatValue(displayChartData[i]?.value ?? 0), mark: "line", tone: "value", color: "#8b5cf6" },
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
  periodViews: 452, totalViews: 1660, prevPeriodViews: 380,
  periodOrders: 28, totalOrders: 95, prevPeriodOrders: 22,
  periodRevenue: 34500, totalRevenue: 125000, prevPeriodRevenue: 28900,
  conversionRate: 6.2, prevConversionRate: 5.8,
}

// Icon mapping for setup steps
const stepIcons: Record<string, any> = {
  welcome: User,
  branding: Palette,
  product: Package,
  payouts: CreditCard,
  onepage: Link2,
  sale: Trophy,
}

// Substeps for each main step - using translation keys
const stepSubsteps: Record<string, { labelKey: string; check: (data: any) => boolean; href: string }[]> = {
  welcome: [
    { labelKey: "setup.accountCreated", check: () => true, href: "/app/settings" },
  ],
  branding: [
    { labelKey: "setup.addPhoto", check: (d) => !!d.hasAvatar, href: "/app/settings" },
    { labelKey: "setup.setName", check: (d) => !!d.hasName, href: "/app/settings" },
    { labelKey: "setup.writeBio", check: (d) => !!d.hasBio, href: "/app/settings" },
  ],
  product: [
    { labelKey: "setup.createAProduct", check: (d) => d.hasProducts, href: "/app/products/new" },
  ],
  payouts: [
    { labelKey: "setup.connectStripe", check: (d) => d.hasPayouts, href: "/app/payouts" },
  ],
  onepage: [
    { labelKey: "setup.createOnePage", check: (d) => d.hasOnePage, href: "/app/onepage" },
    { labelKey: "setup.addBlocks", check: (d) => d.hasOnePageBlock, href: "/app/onepage" },
  ],
  sale: [
    { labelKey: "setup.shareLink", check: () => false, href: "/app/onepage" },
    { labelKey: "setup.getFirstSale", check: (d) => d.hasFirstSale, href: "/app/orders" },
  ],
}

interface Order {
  id: string
  product_id: string
  amount_cents: number
  status: string
  created_at: string
}

interface DashboardClientProps {
  creatorId: string
  displayName: string
  /** Worked out on the server from the creator's zone, so the first paint is already right. */
  initialDayPart?: DayPart
  initialSetupSteps: SetupStep[]
  productIds: string[]
  initialOrders?: Order[]
  initialTotalOrders?: number
  initialTotalRevenue?: number
  creatorHandle?: string
  connectedDomain?: string | null
  brandingDetail?: { hasAvatar: boolean; hasName: boolean; hasBio: boolean }
  /** True only when a site has actually been published, never when one merely exists. */
  websitePublished?: boolean
  subscriptionPlanId?: string
}

function ChainLinkIcon({ className = "w-4 h-4", stroke = "#ffffff" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M10.0002 13C10.4297 13.5741 10.9776 14.0491 11.6067 14.3929C12.2359 14.7367 12.9317 14.9411 13.6468 14.9923C14.362 15.0435 15.0798 14.9403 15.7515 14.6897C16.4233 14.4392 17.0333 14.047 17.5402 13.54L20.5402 10.54C21.451 9.59695 21.955 8.33394 21.9436 7.02296C21.9322 5.71198 21.4063 4.45791 20.4793 3.53087C19.5523 2.60383 18.2982 2.07799 16.9872 2.0666C15.6762 2.0552 14.4132 2.55918 13.4702 3.46997L11.7502 5.17997M14.0002 11C13.5707 10.4258 13.0228 9.95078 12.3936 9.60703C11.7645 9.26327 11.0687 9.05885 10.3535 9.00763C9.63841 8.95641 8.92061 9.0596 8.24885 9.31018C7.5771 9.56077 6.96709 9.9529 6.4602 10.46L3.4602 13.46C2.54941 14.403 2.04544 15.666 2.05683 16.977C2.06822 18.288 2.59407 19.542 3.52111 20.4691C4.44815 21.3961 5.70221 21.9219 7.01319 21.9333C8.32418 21.9447 9.58719 21.4408 10.5302 20.53L12.2402 18.82"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CopyLinkIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M10.0696 7C10.3869 3.9787 11.8424 3 15.5 3C19.7059 3 21 4.29412 21 8.5C21 12.1576 20.0213 13.6131 17 13.9304M3 15.5C3 11.2941 4.29412 10 8.5 10C12.7059 10 14 11.2941 14 15.5C14 19.7059 12.7059 21 8.5 21C4.29412 21 3 19.7059 3 15.5Z"
        stroke="#6b6b6b"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function QuickAccessRow({
  label,
  url,
  icon,
  actionLabel,
  isCopied,
  onAction,
  onOpen,
}: {
  label: string
  url: string
  icon: ReactNode
  actionLabel: "copy" | "setup"
  isCopied: boolean
  onAction: () => void
  onOpen: () => void
}) {
  const isSetupAction = actionLabel === "setup"

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen()
      }}
      className="w-full text-left rounded-2xl border border-[#ececf1] p-3.5 hover:bg-[#fafafa] active:bg-[#f4f4f5] transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[#111827]">{label}</p>
          <p className="text-[12px] text-[#6b7280] truncate">{url}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAction()
          }}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
            isSetupAction
              ? "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9] hover:bg-[#ede9fe]"
              : isCopied
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f8fafc]"
          }`}
        >
          {isSetupAction ? (
            <ArrowRight className="h-3.5 w-3.5" />
          ) : isCopied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <CopyLinkIcon className="h-3.5 w-3.5" />
          )}
          {isSetupAction ? "Set up" : isCopied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  )
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

// Helper function to format period text naturally
// Progress circle component with purple accent
function ProgressCircle({ progress, size = 32 }: { progress: number; size?: number }) {
  const strokeWidth = 2.5
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  )
}

/**
 * Quick access on a phone: the shared sheet (components/ui/bottom-sheet), so
 * it opens, follows the thumb and closes like every other sheet in /app and
 * sits above the navigation pill. It was drawn here by hand, on a CSS
 * transition that started from an effect a paint late, with its own drag.
 */
function QuickAccessBottomSheet({
  isOpen,
  onClose,
  onePageUrl,
  storeUrl,
  navOnePageUrl,
  navStoreUrl,
  isOnePageCopied,
  isStoreCopied,
  onCopyOnePage,
  onCopyStore,
  isOnePageReady,
  onSetupOnePage,
}: {
  isOpen: boolean
  onClose: () => void
  onePageUrl: string
  storeUrl: string
  navOnePageUrl?: string
  navStoreUrl?: string
  isOnePageCopied: boolean
  isStoreCopied: boolean
  onCopyOnePage: () => void
  onCopyStore: () => void
  isOnePageReady: boolean
  onSetupOnePage: () => void
}) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      label="Quick access"
      hideFrom="md"
      header={<h3 className="px-4 pt-2 text-[16px] font-semibold text-[#1a1a2e]">Quick access</h3>}
    >
      <div className="space-y-2 px-4 pb-5 pt-4">
        <QuickAccessRow
          label="OnePage"
          url={isOnePageReady ? onePageUrl : "Set up your OnePage to create a link"}
          actionLabel={isOnePageReady ? "copy" : "setup"}
          isCopied={isOnePageCopied}
          onAction={() => {
            if (isOnePageReady) {
              onCopyOnePage()
            } else {
              onSetupOnePage()
              onClose()
            }
          }}
          onOpen={() => {
            if (isOnePageReady) {
              const url = onePageUrl || navOnePageUrl
              if (url) openExternal(url)
            } else {
              onSetupOnePage()
            }
            onClose()
          }}
          icon={<div className="w-8 h-8 rounded-full bg-[#8b5cf6] flex items-center justify-center"><ChainLinkIcon className="w-4 h-4" stroke="#ffffff" /></div>}
        />

        <QuickAccessRow
          label="Store"
          url={storeUrl}
          actionLabel="copy"
          isCopied={isStoreCopied}
          onAction={onCopyStore}
          onOpen={() => {
            const url = storeUrl || navStoreUrl
            if (url) openExternal(url)
            onClose()
          }}
          icon={<img src={STORELIB_LOGO} alt="" width={32} height={32} className="w-8 h-8 shrink-0 object-contain" loading="eager" decoding="async" />}
        />
      </div>
    </BottomSheet>
  )
}

/** Which of the chart's bucket shapes a preset draws with; the rest are drawn between their dates. */
const DASH_LEGACY_TIMEFRAME: Partial<Record<RangeValue["preset"], string>> = {
  today: "today",
  yesterday: "yesterday",
  last_7_days: "last_7_days",
  last_30_days: "last_30_days",
  month_to_date: "this_month",
  last_90_days: "last_90_days",
  all_time: "all_time",
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
 * The line is keyed to the cycle, so each slide draws its own from nothing.
 */
type AnnouncementSlide = "upgrade" | "steps" | "payouts"
const DURATION = 15000
const FADE_MS = 320

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
  const [announceCycle, setAnnounceCycle] = useState(0)
  const [announceLeaving, setAnnounceLeaving] = useState(false)
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

  /* The next slide is picked only after the last has faded out. */
  useEffect(() => {
    if (!announceLeaving) return
    const swap = setTimeout(() => {
      setAnnounceCycle((c) => c + 1)
      setAnnounceLeaving(false)
    }, FADE_MS)
    return () => clearTimeout(swap)
  }, [announceLeaving])

  const announcementType = slides[announceCycle % slides.length]
  const announcementVisible = !announceLeaving

  return (
      <div ref={barRef} className="bg-[#8b5cf6] text-white">
        <div className="py-2 px-4 md:py-2.5">
          <div
            className={`max-w-[1200px] mx-auto flex h-7 md:h-8 items-center justify-center gap-2 md:gap-3 text-center whitespace-nowrap transition-opacity duration-300 ${
              announcementVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {announcementType === "upgrade" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">{t("dashboard.tryProFree")}</span>
                  <span className="hidden md:inline text-white/85 ml-2">{t("dashboard.proSubtitle")}</span>
                </span>
                <Link
                  href="/app/settings/billing/upgrade"
                  className="relative inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-gray-900 to-black text-white text-[11px] md:text-[13px] font-medium rounded-full transition-all shrink-0 overflow-hidden group"
                >
                  <span className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/50 transition-colors" />
                  {/* The sweep runs while hovered and not otherwise: it was an
                    infinite animation on a layer at opacity 0, which kept the
                    compositor producing frames for as long as the page was open. */}
                <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 group-hover:[animation:laser-sweep_2s_linear_infinite] transition-opacity" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }} />
                  <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 relative z-10" />
                  <span className="relative z-10">{t("dashboard.upgrade")}</span>
                </Link>
              </>
            )}
            {announcementType === "steps" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">{t("dashboard.completeSetup")}</span>
                  <span className="md:hidden text-white/85 ml-1.5">{completedSteps}/{totalSteps}</span>
                  <span className="hidden md:inline text-white/85 ml-2">{totalSteps - completedSteps} {t("dashboard.stepsRemaining")}</span>
                </span>
                <button
                  onClick={() => {
                    const setupSection = document.getElementById("store-setup-section")
                    setupSection?.scrollIntoView({ behavior: "smooth" })
                  }}
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  {t("common.continue")}
                  <ChevronRight className="h-3 w-3 md:h-3.5 md:w-3.5" />
                </button>
              </>
            )}
            {announcementType === "payouts" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">{t("dashboard.getPaid")}</span>
                  <span className="hidden md:inline text-white/85 ml-2">{t("dashboard.connectPayoutsDesc")}</span>
                </span>
                <Link
                  href="/app/settings?tab=payments"
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  <Wallet className="h-3 w-3 md:h-3.5 md:w-3.5" />
                  {t("common.connect")}
                </Link>
              </>
            )}
          </div>
        </div>
        {/* How long until the next slide. Keyed to the cycle, so each slide
            draws its own line from nothing; see "ONE SLIDE AT A TIME". */}
        <div className="h-[2px] bg-white/10 overflow-hidden">
          {slides.length > 1 && (
            <div
              key={announceCycle}
              className="announce-progress h-full bg-white/35"
              style={{ animationDuration: `${DURATION}ms`, animationPlayState: paused ? "paused" : "running" }}
              onAnimationEnd={() => setAnnounceLeaving(true)}
            />
          )}
        </div>
      </div>
  )
})

export function DashboardClient({
  creatorId,
  displayName,
  initialDayPart = "morning",
  initialSetupSteps,
  productIds,
  initialOrders = [],
  initialTotalOrders = 0,
  initialTotalRevenue = 0,
  creatorHandle = "",
  connectedDomain = null,
  brandingDetail,
  websitePublished = false,
  subscriptionPlanId = "free",
}: DashboardClientProps) {
  /**
   * THE PERIOD, from the date picker every page in /app shares, remembered
   * on this device as the old choice was. A preset is re-read against today
   * each time, so "Last 7 days" chosen last week is still the last 7 days.
   * `timeframe` is the older name the chart's bucket shapes still branch on.
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
  const timeframe = DASH_LEGACY_TIMEFRAME[period.preset] ?? "custom"
  const periodKey = `${period.preset}:${period.start}:${period.end}`
  /** The period's instants: whole days on the creator's clock, to now. */
  const periodDates = () => {
    const b = boundsOf(period, dashTimeZone, Date.now())
    return { start: new Date(b.start), end: new Date(Math.max(b.start, b.end - 1)) }
  }
  const [isProfileAccessOpen, setIsProfileAccessOpen] = useState(false)
  const [isProfileAccessVisible, setIsProfileAccessVisible] = useState(false)
  const [isProfileAccessAnimating, setIsProfileAccessAnimating] = useState(false)
  const [isQuickAccessMobileOpen, setIsQuickAccessMobileOpen] = useState(false)
  const profileAccessRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()

  useHideNativeSplash()

  // Remember the period on this device
  useEffect(() => {
    try {
      localStorage.setItem("dashboard_period", JSON.stringify({ preset: period.preset, start: period.start, end: period.end }))
    } catch {
      /* private mode: the default next time */
    }
  }, [periodKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Canonical subdomain URLs for display text and clipboard copy
  const publicStoreUrl = connectedDomain ? `https://${connectedDomain}` : (creatorHandle ? getStoreShareUrl(creatorHandle) : "")
  /**
   * TWO ADDRESSES, TWO THINGS, and url-helpers is explicit about which is
   * which: <name>.storelib.com is the WEBSITE built in the website builder,
   * storelib.com/<name> is the creator PAGE. Quick access listed the page
   * twice under two names and never listed the website at all.
   */
  const publicWebsiteUrl = creatorHandle && websitePublished ? getWebsiteUrl(creatorHandle) : ""
  const publicOnePageUrl = connectedDomain ? `https://${connectedDomain}/links` : (creatorHandle ? getLinksShareUrl(creatorHandle) : "")
  // Internal-path URLs for in-app navigation (preserves auth in Capacitor)
  const navStoreUrl = connectedDomain ? `https://${connectedDomain}` : (creatorHandle ? getStoreUrl(creatorHandle) : "")
  const navOnePageUrl = connectedDomain ? `https://${connectedDomain}/links` : (creatorHandle ? getLinksUrl(creatorHandle) : "")
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
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>("views")
  /* Follows the chosen tab, and keeps a sideways swipe off the page. */
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
  // Sample data toggle — session-only (resets on page refresh, no localStorage)
  const [showSampleData, setShowSampleData] = useState(false)
  const [analyticsData, setAnalyticsData] = useState({
    totalViews: 0,
    totalOrders: initialTotalOrders,
    totalRevenue: initialTotalRevenue,
    conversionRate: 0,
    periodViews: 0,
    periodOrders: initialTotalOrders,
    periodRevenue: initialTotalRevenue,
    // Previous period for comparison
    prevPeriodViews: 0,
    prevPeriodOrders: 0,
    prevPeriodRevenue: 0,
    prevConversionRate: 0,
  })
  // Live orders — starts from SSR-fetched initialOrders, updated via Realtime
  const [liveOrders, setLiveOrders] = useState<Order[]>(initialOrders)
  const liveOrdersRef = useRef<Order[]>(initialOrders)

  // Keep ref in sync so realtime handler always has latest array
  useEffect(() => {
    liveOrdersRef.current = liveOrders
  }, [liveOrders])

  // Subscribe to new/updated orders for this creator's products
  useEffect(() => {
    if (!productIds || productIds.length === 0) return
    const supabase = createClient()
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
          const row = (payload.new || payload.old) as Order | undefined
          if (!row || !productIds.includes(row.product_id)) return

          setLiveOrders((prev) => {
            if (payload.eventType === "INSERT") {
              // Avoid duplicates
              if (prev.some((o) => o.id === row.id)) return prev
              return [row, ...prev]
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((o) => (o.id === row.id ? { ...o, ...row } : o))
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((o) => o.id !== row.id)
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [productIds.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  const [chartEvents, setChartEvents] = useState<{
    buckets: { start: number; end: number; label: string }[]
    views: { at: number; key: string | null }[]
    clicks: number[]
  } | null>(null)
  /**
   * Every metric's series for the period, from the events read below (fetchChartEvents) and the
   * orders the page keeps live. The same rules as the figures on the tabs:
   * orders count completed and refunded, revenue counts completed only.
   */
  const chartSeries = useMemo<Record<Exclude<KPIType, null>, ChartDataPoint[]> | null>(() => {
    if (!chartEvents) return null
    const within = (t: number, b: { start: number; end: number }) => t >= b.start && t <= b.end
    const valid = liveOrders
      .filter((o) => o.status === "completed" || o.status === "refunded")
      .map((o) => ({ at: Date.parse(o.created_at), refunded: o.status === "refunded"}))
    const completed = liveOrders.filter((o) => o.status === "completed").map((o) => ({ at: Date.parse(o.created_at), cents: o.amount_cents || 0 }))
    const out = { views: [] as ChartDataPoint[], orders: [] as ChartDataPoint[], revenue: [] as ChartDataPoint[], conversion: [] as ChartDataPoint[] }
    for (const b of chartEvents.buckets) {
      const seen = new Set<string>()
      for (const v of chartEvents.views) if (v.key && within(v.at, b)) seen.add(v.key)
      const views = seen.size
      const clicks = chartEvents.clicks.reduce((n, t) => (within(t, b) ? n + 1 : n), 0)
      const inBucket = valid.filter((o) => within(o.at, b))
      const orders = inBucket.length
      const refunds = inBucket.filter((o) => o.refunded).length
      const revenue = completed.reduce((sum, o) => (within(o.at, b) ? sum + o.cents : sum), 0) / 100
      out.views.push({ label: b.label, value: views, secondaryValue: clicks })
      out.orders.push({ label: b.label, value: orders, refunds })
      out.revenue.push({ label: b.label, value: revenue })
      out.conversion.push({ label: b.label, value: views > 0 ? Number(((orders / views) * 100).toFixed(2)) : 0 })
    }
    return out
  }, [chartEvents, liveOrders])
  /** The chosen metric's series. A tab changes this and nothing else. */
  const chartData = (openKPIModal && chartSeries?.[openKPIModal]) || NO_POINTS

  // ── Sample data overlay ────────────────────────────────────────────────────
  // True once any real metric exists — toggle and badge disappear permanently
  const hasRealData = analyticsData.totalViews > 0 || analyticsData.totalOrders > 0 || analyticsData.totalRevenue > 0
  const displayAnalytics = showSampleData && !hasRealData ? { ...analyticsData, ...SAMPLE_KPI } : analyticsData
  const displayChartData = showSampleData && !hasRealData && openKPIModal
    ? (SAMPLE_CHART[openKPIModal] ?? chartData)
    : chartData

  /* null until the first read: a count of 0 drawn and then replaced by the
     real one was a figure that changed in front of you. */
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
  const { toast } = useToast()
  const [copiedTarget, setCopiedTarget] = useState<"onepage" | "store" | "website" | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

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
  const fetchAnalytics = async (selectedTimeframe: string) => {
    // First load: isRefreshing is already true (seeded in useState), and the
    // soft blur on the figures is the only sign of the read.
    setIsRefreshing(true)
    const supabase = createClient()

    try {
      void selectedTimeframe
      const { start, end } = periodDates()

      // Calculate previous period dates (same duration, immediately before)
      const periodDuration = end.getTime() - start.getTime()
      const prevEnd = new Date(start.getTime() - 1) // 1ms before current period start
      const prevStart = new Date(prevEnd.getTime() - periodDuration)

      // Fetch views for the current period (analytics_events are OK to fetch client-side)
      const { data: viewEvents } = await supabase
        .from("analytics_events")
        .select("id, visitor_id, session_id, product_id, created_at")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())

      const uniqueViewKeys = new Set(
        (viewEvents || [])
          .map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          })
          .filter(Boolean)
      )

      const periodViews = uniqueViewKeys.size || 0

      // Fetch views for the previous period
      const { data: prevViewEvents } = await supabase
        .from("analytics_events")
        .select("id, visitor_id, session_id, product_id, created_at")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString())

      const prevUniqueViewKeys = new Set(
        (prevViewEvents || [])
          .map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          })
          .filter(Boolean)
      )

      const prevPeriodViews = prevUniqueViewKeys.size || 0

      // Filter orders — include both completed + refunded in order counts
      const completedOrders = liveOrders.filter(o => o.status === "completed")
      const allValidOrders = liveOrders.filter(o => o.status === "completed" || o.status === "refunded")

      // Current period orders
      const periodOrdersData = allValidOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= start && orderDate <= end
      })
      const periodOrders = periodOrdersData.length
      const periodRevenue = completedOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= start && orderDate <= end
      }).reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      // Previous period orders
      const prevPeriodOrdersData = allValidOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= prevStart && orderDate <= prevEnd
      })
      const prevPeriodOrders = prevPeriodOrdersData.length
      const prevPeriodRevenue = completedOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= prevStart && orderDate <= prevEnd
      }).reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      // Fetch all-time views
      const { data: allViewEvents } = await supabase
        .from("analytics_events")
        .select("id, visitor_id, session_id, product_id")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")

      const allUniqueViewKeys = new Set(
        (allViewEvents || [])
          .map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          })
          .filter(Boolean)
      )

      const totalViews = allUniqueViewKeys.size || 0

      // All-time orders — includes completed + refunded
      const totalOrders = allValidOrders.length
      const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      const conversionRate = periodViews > 0 ? (periodOrders / periodViews) * 100 : 0
      const prevConversionRate = prevPeriodViews > 0 ? (prevPeriodOrders / prevPeriodViews) * 100 : 0

      setAnalyticsData({
        totalViews,
        totalOrders,
        totalRevenue,
        conversionRate: Number(conversionRate.toFixed(2)),
        periodViews,
        periodOrders,
        periodRevenue,
        prevPeriodViews,
        prevPeriodOrders,
        prevPeriodRevenue,
        prevConversionRate: Number(prevConversionRate.toFixed(2)),
      })
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
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

  // Generate time buckets based on timeframe for chart
  const generateTimeBuckets = (tf: string, start: Date, end: Date) => {
    const buckets: { start: Date; end: Date; label: string }[] = []
    const isHourly = tf === "today" || tf === "yesterday"
    const is48h = tf === "last_48_hours"
    const isAllTime = tf === "all_time"
    const is90Days = tf === "last_90_days"
    const isMonth = tf === "last_30_days" || tf === "this_month"

    if (isHourly) {
      const maxHour = tf === "today" ? new Date().getHours() : 23
      for (let hour = 0; hour <= maxHour; hour++) {
        const hourStart = new Date(start)
        hourStart.setHours(hour, 0, 0, 0)
        const hourEnd = new Date(start)
        hourEnd.setHours(hour, 59, 59, 999)
        buckets.push({ start: hourStart, end: hourEnd, label: `${hour.toString().padStart(2, '0')}:00` })
      }
    } else if (is48h) {
      for (let i = 47; i >= 0; i -= 4) {
        const bStart = new Date(end)
        bStart.setHours(bStart.getHours() - i)
        bStart.setMinutes(0, 0, 0)
        const bEnd = new Date(bStart)
        bEnd.setHours(bEnd.getHours() + 3, 59, 59, 999)
        buckets.push({
          start: bStart,
          end: bEnd,
          label: `${bStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${bStart.getHours().toString().padStart(2, '0')}:00`,
        })
      }
    } else if (isAllTime) {
      const currentYear = new Date().getFullYear()
      for (let year = 2020; year <= currentYear; year++) {
        buckets.push({
          start: new Date(year, 0, 1),
          end: new Date(year, 11, 31, 23, 59, 59, 999),
          label: year.toString(),
        })
      }
    } else if (is90Days) {
      for (let week = 11; week >= 0; week--) {
        const wStart = new Date(end)
        wStart.setDate(wStart.getDate() - (week * 7 + 6))
        wStart.setHours(0, 0, 0, 0)
        const wEnd = new Date(wStart)
        wEnd.setDate(wEnd.getDate() + 6)
        wEnd.setHours(23, 59, 59, 999)
        buckets.push({
          start: wStart,
          end: wEnd,
          label: wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        })
      }
    } else if (tf === "custom" && end.getTime() - start.getTime() > 92 * 86_400_000) {
      /* A long chosen range is drawn a month at a time, not a thousand days. */
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cursor <= end) {
        const mStart = new Date(cursor)
        const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999)
        buckets.push({
          start: mStart < start ? start : mStart,
          end: mEnd > end ? end : mEnd,
          label: mStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        })
        cursor.setMonth(cursor.getMonth() + 1)
      }
    } else {
      let dayStep = 1
      let dayCount: number
      if (isMonth) { dayCount = 10; dayStep = 3 }
      else {
        // Compute day count from actual date range to avoid off-by-one
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        dayCount = diffDays + 1
      }
      for (let i = dayCount - 1; i >= 0; i--) {
        const dStart = new Date(end)
        dStart.setDate(dStart.getDate() - (i * dayStep))
        dStart.setHours(0, 0, 0, 0)
        const dEnd = new Date(dStart)
        dEnd.setDate(dEnd.getDate() + dayStep - 1)
        dEnd.setHours(23, 59, 59, 999)
        buckets.push({
          start: dStart,
          end: dEnd,
          label: dStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        })
      }
    }
    return buckets
  }

  /**
   * =========================================================================
   *  THE CHART IS READ ONCE PER PERIOD, NEVER PER TAB
   * =========================================================================
   * This fetched on every tab: tapping Revenue asked Supabase again, then
   * redrew, so a tap was a wait and a line that appeared rather than one
   * that moved. The events are read once for the period (views and clicks,
   * the only two that are not already in `liveOrders`), and every metric's
   * series is worked out from them here. A tab picks one of four series the
   * page already holds, and the chart morphs to it.
   *
   * A newer period's answer wins: a slow reply for the period before is
   * dropped rather than drawn over the new one.
   */
  const chartRequestRef = useRef(0)
  const fetchChartEvents = async () => {
    const request = ++chartRequestRef.current
    setIsChartLoading(true)
    const supabase = createClient()
    try {
      const { start, end } = periodDates()
      // For all_time, extend start to 2020
      const fetchStart = timeframe === "all_time" ? new Date(2020, 0, 1) : start
      const [viewsRead, clicksRead] = await Promise.all([
        supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id, created_at")
          .eq("creator_id", creatorId)
          .eq("event_type", "view")
          .gte("created_at", fetchStart.toISOString())
          .lte("created_at", end.toISOString()),
        supabase
          .from("analytics_events")
          .select("id, created_at")
          .eq("creator_id", creatorId)
          .eq("event_type", "click")
          .gte("created_at", fetchStart.toISOString())
          .lte("created_at", end.toISOString()),
      ])
      if (request !== chartRequestRef.current) return
      const buckets = generateTimeBuckets(timeframe, start, end).map((b) => ({ start: b.start.getTime(), end: b.end.getTime(), label: b.label }))
      setChartEvents({
        buckets,
        views: (viewsRead.data || []).map((e: any) => {
          const identity = e.visitor_id || e.session_id
          return { at: Date.parse(e.created_at), key: identity ? `${identity}__${e.product_id || "store"}` : null }
        }),
        clicks: (clicksRead.data || []).map((e: any) => Date.parse(e.created_at)),
      })
      // Delay removing loading blur so chart lines redraw while still
      // blurred, then the CSS transition fades in the finished chart cleanly
      setTimeout(() => setIsChartLoading(false), 350)
    } catch (error) {
      console.error("Error fetching chart data:", error)
      if (request === chartRequestRef.current) {
        setIsChartLoading(false)
        /* Nothing to draw, rather than a skeleton that waits for ever. */
        setChartEvents((prev) => prev ?? { buckets: [], views: [], clicks: [] })
      }
    }
  }

  // Read the chart's events when the period changes. Not when the tab does.
  useEffect(() => {
    // Safety net: if Supabase queries hang, stop the skeleton after 5 s
    const safetyTimer = window.setTimeout(() => {
      setIsChartLoading(false)
      setChartEvents((prev) => prev ?? { buckets: [], views: [], clicks: [] })
    }, 5000)
    fetchChartEvents().finally(() => window.clearTimeout(safetyTimer))
    return () => window.clearTimeout(safetyTimer)
  }, [periodKey, creatorId]) // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    // Safety net: if analytics queries hang (slow network, Supabase latency),
    // let live order updates recalculate after 5s rather than wait forever.
    const safetyTimer = window.setTimeout(() => {
      isFirstLoadRef.current = false
      setFiguresReady(true)
    }, 5000)
    fetchAnalytics(timeframe).finally(() => window.clearTimeout(safetyTimer))
    return () => window.clearTimeout(safetyTimer)
  }, [periodKey, creatorId]) // eslint-disable-line react-hooks/exhaustive-deps

  // When liveOrders updates (realtime), recalculate order KPIs without re-fetching views
  useEffect(() => {
    // Skip on first render — fetchAnalytics will handle it
    if (isFirstLoadRef.current) return

    const { start, end } = periodDates()
    const periodDuration = end.getTime() - start.getTime()
    const prevEnd = new Date(start.getTime() - 1)
    const prevStart = new Date(prevEnd.getTime() - periodDuration)

    const completedOrders = liveOrders.filter(o => o.status === "completed")
    const allValidOrders = liveOrders.filter(o => o.status === "completed" || o.status === "refunded")

    const periodOrders = allValidOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= start && d <= end
    }).length
    const periodRevenue = completedOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= start && d <= end
    }).reduce((s, o) => s + (o.amount_cents || 0), 0)
    const prevPeriodOrders = allValidOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= prevStart && d <= prevEnd
    }).length
    const prevPeriodRevenue = completedOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= prevStart && d <= prevEnd
    }).reduce((s, o) => s + (o.amount_cents || 0), 0)
    const totalOrders = allValidOrders.length
    const totalRevenue = completedOrders.reduce((s, o) => s + (o.amount_cents || 0), 0)

    setAnalyticsData(prev => ({
      ...prev,
      totalOrders,
      totalRevenue,
      periodOrders,
      periodRevenue,
      prevPeriodOrders,
      prevPeriodRevenue,
    }))
  }, [liveOrders]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown when clicking outside (desktop only)
  const copyQuickAccessUrl = async (target: "onepage" | "store" | "website") => {
    const url = target === "onepage" ? publicOnePageUrl : target === "website" ? publicWebsiteUrl : publicStoreUrl
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiedTarget(target)
      setCopyNotice("Link copied")
      toast({ title: "Link copied" })
      setTimeout(() => setCopiedTarget((prev) => (prev === target ? null : prev)), 1800)
      setTimeout(() => setCopyNotice(null), 1800)
    } catch {
      toast({ title: "Could not copy the link", variant: "destructive" })
    }
  }


  useEffect(() => {
    if (isProfileAccessOpen) {
      setIsProfileAccessVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setIsProfileAccessAnimating(true)))
    } else if (isProfileAccessVisible) {
      setIsProfileAccessAnimating(false)
      const timer = setTimeout(() => setIsProfileAccessVisible(false), 180)
      return () => clearTimeout(timer)
    }
  }, [isProfileAccessOpen, isProfileAccessVisible])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (profileAccessRef.current && !profileAccessRef.current.contains(target)) {
        setIsProfileAccessOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const completedSteps = initialSetupSteps.filter((s) => s.completed).length
  const totalSteps = initialSetupSteps.length
  const allCompleted = completedSteps === totalSteps

  // Derive completion status from steps
  const hasProducts = initialSetupSteps.find((s) => s.id === "product")?.completed || false
  const hasPayouts = initialSetupSteps.find((s) => s.id === "payouts")?.completed || false
  const hasOnePageSetup = initialSetupSteps.find((s) => s.id === "onepage")?.completed || false
  const mobileHandleLabel = creatorHandle.length > 14 ? `${creatorHandle.slice(0, 14)}...` : creatorHandle


  /* The purple bar's slides, worked out from the account. The bar itself,
     its timing and its state are AnnouncementBar, above. */
  const slides = useMemo(() => {
    const list: AnnouncementSlide[] = ["upgrade"]
    if (!allCompleted) list.push("steps")
    if (hasProducts && !hasPayouts) list.push("payouts")
    return list
  }, [allCompleted, hasProducts, hasPayouts])

  // Build substep data based on step completion
  const getSubstepData = (step: SetupStep) => {
    return {
      hasAvatar: step.id === "branding" ? (brandingDetail?.hasAvatar ?? step.completed) : false,
      hasName: step.id === "branding" ? (brandingDetail?.hasName ?? step.completed) : false,
      hasBio: step.id === "branding" ? (brandingDetail?.hasBio ?? step.completed) : false,
      hasProducts: step.id === "product" ? step.completed : false,
      hasPayouts: step.id === "payouts" ? step.completed : false,
      hasOnePage: step.id === "onepage" ? step.completed : false,
      hasOnePageBlock: step.id === "onepage" ? step.completed : false,
      hasFirstSale: step.id === "sale" ? step.completed : false,
    }
  }

  const handleStepClick = (stepId: string, e: React.MouseEvent) => {
    e.preventDefault()
    setExpandedStep(expandedStep === stepId ? null : stepId)
  }

  // ── Pull-to-refresh ───────────────────────────────────────────────────────
  // Wraps the dashboard's own scroll container so we can intercept touch events
  // with { passive: false } — the only reliable way to block iOS rubber-band
  // bounce on a child overflow-scroll element.
  const handlePullRefresh = useCallback(async () => {
    await fetchAnalytics(timeframe)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey])

  const { pullDistance, phase: pullPhase } = usePullToRefresh(scrollRef, handlePullRefresh)

  // Content translateY: slides down while pulling, snaps back when done.
  // Small offset (34px) when refreshing — just enough to show the 20px spinner
  // with breathing room, matching the compact iOS-style indicator.
  /**
   * The gap held open while refreshing. Shared with the indicator so the ring is
   * centred in the SAME gap the content opens — it used to be a literal 10px
   * against this 34, which was never actually centred and would have drifted
   * silently the moment either number was touched.
   */
  const REFRESH_HOLD = 34

  const contentTranslateY =
    pullPhase === "pulling" || pullPhase === "ready"
      ? pullDistance
      : pullPhase === "refreshing"
        ? REFRESH_HOLD
        : 0

  // Ultra-smooth spring-like ease for the snap-back / pin animation.
  // 0.4s with cubic-bezier(0.25,1,0.5,1) gives that native iOS feel:
  // fast start, gentle deceleration, no bounce.
  const contentTransition =
    pullPhase === "idle" || pullPhase === "refreshing"
      ? "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)"
      : "none"

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
          pullDistance={pullDistance}
          phase={pullPhase}
          topOffset={0}
          refreshHold={REFRESH_HOLD}
        />

        <div
          style={{
            transform: `translateY(${contentTranslateY}px)`,
            transition: contentTransition,
            willChange: "transform",
          }}
        >

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
        {copyNotice && (
          <div className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-4 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-[#111827] px-4 py-2 text-xs font-medium text-white shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 whitespace-nowrap">
            {copyNotice}
          </div>
        )}

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="mb-1 flex justify-end md:hidden">
              {creatorHandle && (
                <button
                  type="button"
                  onClick={() => setIsQuickAccessMobileOpen(true)}
                  className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#e5e7eb] bg-white/90 text-[12px] font-medium text-[#4b5563] transition-all cursor-pointer overflow-hidden"
                >
                  <span className="absolute -inset-px rounded-full opacity-40 pointer-events-none animate-[spin_12s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(139,92,246,0.30)_320deg,transparent_360deg)]" />
                  <span className="absolute inset-[1px] rounded-full bg-white/95" />
                  <span className="relative z-[1] inline-flex items-center gap-1.5">
                    @{mobileHandleLabel}
                    <ExternalLink className="h-3.5 w-3.5 text-[#9ca3af]" />
                  </span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">
                {t(`dashboard.greeting.${greetingPart}` as Parameters<typeof t>[0])}
                {greetingName ? `, ${greetingName}` : ""}
              </h1>
              {creatorHandle && (
                <div ref={profileAccessRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        setIsQuickAccessMobileOpen(true)
                        return
                      }
                      setIsProfileAccessOpen((v) => !v)
                    }}
                    className="hidden md:inline-flex relative items-center gap-1.5 px-3 py-1 rounded-full border border-[#e5e7eb] bg-white/90 text-[12px] font-medium text-[#4b5563] hover:text-[#111827] hover:border-[#d1d5db] hover:bg-white transition-all cursor-pointer overflow-hidden"
                  >
                    <span className="absolute -inset-px rounded-full opacity-45 pointer-events-none animate-[spin_12s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(139,92,246,0.30)_320deg,transparent_360deg)]" />
                    <span className="absolute inset-[1px] rounded-full bg-white/95" />
                    <span className="relative z-[1] inline-flex items-center gap-1.5">
                      @{creatorHandle}
                      <ExternalLink className="h-3.5 w-3.5 text-[#9ca3af]" />
                    </span>
                  </button>
                  {isProfileAccessVisible && (
                    <div className={`absolute left-0 top-full mt-2 w-[280px] sm:w-[320px] rounded-2xl border border-[#e5e7eb] bg-white shadow-xl p-2 z-50 origin-top-left transition-all duration-180 ease-out ${isProfileAccessAnimating ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-1 scale-[0.98]"}`}>
                      <p className="px-2 pt-1 pb-2 text-[11px] text-[#6b7280]">Quick access</p>
                      {/*
                        NO ACTION BUTTONS. There were two here, "View page" and
                        "Customize page", and they were removed on the owner's
                        instruction.

                        They also did not belong: this panel answers "what are
                        my addresses?", and every row in it is a thing to copy
                        and hand to somebody else. Opening the page is what the
                        row itself already does, and the editor is reached from
                        the nav — a pair of buttons on top of three addresses
                        made the one question it answers harder to read.
                      */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (hasOnePageSetup) {
                            openExternal(publicOnePageUrl || navOnePageUrl)
                          } else {
                            router.push("/app/onepage")
                          }
                          setIsProfileAccessOpen(false)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            if (hasOnePageSetup) {
                              openExternal(publicOnePageUrl || navOnePageUrl)
                            } else {
                              router.push("/app/onepage")
                            }
                            setIsProfileAccessOpen(false)
                          }
                        }}
                        className="w-full text-left rounded-xl p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]"><span className="w-5 h-5 rounded-full bg-[#8b5cf6] flex items-center justify-center"><ChainLinkIcon className="w-2.5 h-2.5" stroke="#ffffff" /></span>OnePage</div>
                        <div className="mt-1 flex items-center justify-between gap-2"><p className="text-[11px] text-[#6b7280] truncate">{hasOnePageSetup ? publicOnePageUrl : "Set up your OnePage to create a link"}</p><button type="button" onClick={(e) => { e.stopPropagation(); if (hasOnePageSetup) { copyQuickAccessUrl("onepage") } else { router.push("/app/onepage"); setIsProfileAccessOpen(false) } }} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all ${hasOnePageSetup ? (copiedTarget === "onepage" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e5e7eb] text-[#6b7280] bg-white") : "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]"}`}>{hasOnePageSetup ? (copiedTarget === "onepage" ? <Check className="h-3 w-3" /> : <CopyLinkIcon className="h-3 w-3" />) : <ArrowRight className="h-3 w-3" />}{hasOnePageSetup ? (copiedTarget === "onepage" ? "Copied" : "Copy") : "Set up"}</button></div>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          openExternal(publicStoreUrl || navStoreUrl)
                          setIsProfileAccessOpen(false)
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { openExternal(publicStoreUrl || navStoreUrl); setIsProfileAccessOpen(false) } }}
                        className="w-full text-left rounded-xl p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]"><img src={STORELIB_LOGO} alt="Storelib" width={20} height={20} className="w-5 h-5 shrink-0 object-contain" loading="eager" decoding="async" />Creator page</div>
                        <div className="mt-1 flex items-center justify-between gap-2"><p className="text-[11px] text-[#6b7280] truncate">{publicStoreUrl}</p><button type="button" onClick={(e) => { e.stopPropagation(); copyQuickAccessUrl("store") }} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all ${copiedTarget === "store" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e5e7eb] text-[#6b7280] bg-white"}`}>{copiedTarget === "store" ? <Check className="h-3 w-3" /> : <CopyLinkIcon className="h-3 w-3" />}{copiedTarget === "store" ? "Copied" : "Copy"}</button></div>
                      </div>
                      {/*
                        THE THIRD SURFACE, WHICH WAS NEVER LISTED.

                        Quick access held the creator page and the OnePage and
                        stopped, so the one address a creator is most likely to
                        be asked for by somebody else was the one they could
                        not find. It appears only when a site has actually been
                        PUBLISHED: every account is seeded with theme installs
                        on first visit, so listing it on existence would hand
                        people a link to a page nobody has made.
                      */}
                      {publicWebsiteUrl && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            openExternal(publicWebsiteUrl)
                            setIsProfileAccessOpen(false)
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { openExternal(publicWebsiteUrl); setIsProfileAccessOpen(false) } }}
                          className="w-full text-left rounded-xl p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]"><span className="w-5 h-5 rounded-full bg-[#1a1a2e] flex items-center justify-center"><MonitorSmartphone className="w-2.5 h-2.5 text-white" /></span>Website</div>
                          <div className="mt-1 flex items-center justify-between gap-2"><p className="text-[11px] text-[#6b7280] truncate">{publicWebsiteUrl.replace(/^https?:\/\//, "")}</p><button type="button" onClick={(e) => { e.stopPropagation(); copyQuickAccessUrl("website") }} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all ${copiedTarget === "website" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e5e7eb] text-[#6b7280] bg-white"}`}>{copiedTarget === "website" ? <Check className="h-3 w-3" /> : <CopyLinkIcon className="h-3 w-3" />}{copiedTarget === "website" ? "Copied" : "Copy"}</button></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-[14px] text-[#6b7280] mt-1">{t("dashboard.subtitle")}</p>
          </div>

          {/* Desktop: Timeframe Dropdown + Live Indicator */}
          <div className="hidden md:flex items-center gap-3">
            {/* The date picker every page in /app shares. */}
            <DateRangePicker value={period} onChange={setPeriod} today={dashToday} align="end" className="h-[38px] rounded-xl px-3.5" />
            {/* Live Indicator Pill - Desktop */}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[#f3f4f6] rounded-lg">
              <div
                className={`w-2 h-2 rounded-full ${
                  (liveVisitors ?? 0) > 0
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                    : "bg-gray-400"
                }`}
                style={{
                  animation: (liveVisitors ?? 0) > 0 ? "pulse-glow 2s ease-in-out infinite" : "none",
                }}
              />
              <span className={`text-[13px] font-medium ${(liveVisitors ?? 0) > 0 ? "text-emerald-600" : "text-gray-500"}`}>
                {liveVisitors == null ? <ShimmerBlock className="shimmer-wait inline-block h-[0.8em] w-[3.6em] rounded-full align-[-0.05em]" /> : `${liveVisitors} ${t("dashboard.liveVisitors")}`}
              </span>
            </div>
          </div>

          {/* Mobile: Live Indicator + Timeframe Button */}
          <div className="md:hidden flex items-center gap-2">
            {/* Live Indicator Pill - Mobile */}
            <div className="flex items-center gap-1.5 px-2.5 py-2 bg-[#f3f4f6] rounded-xl h-[38px]">
              <div
                className={`w-2 h-2 rounded-full ${
                  (liveVisitors ?? 0) > 0
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                    : "bg-gray-400"
                }`}
                style={{
                  animation: (liveVisitors ?? 0) > 0 ? "pulse-glow 2s ease-in-out infinite" : "none",
                }}
              />
              <span className={`text-[12px] font-medium ${(liveVisitors ?? 0) > 0 ? "text-emerald-600" : "text-gray-500"}`}>
                {liveVisitors == null ? <ShimmerBlock className="shimmer-wait inline-block h-[0.8em] w-[3.6em] rounded-full align-[-0.05em]" /> : `${liveVisitors} ${t("dashboard.liveVisitors")}`}
              </span>
            </div>
            <DateRangePicker value={period} onChange={setPeriod} today={dashToday} align="end" className="h-[38px] rounded-xl px-3" />
          </div>
        </div>

        {/* Stats Cards + Chart Section */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8 overflow-hidden">
          {/* KPI Metric Tabs - horizontally scrollable on mobile.
              The strip follows the chosen tab and arbitrates its own
              gestures; see components/app/use-tab-strip. */}
          <div ref={kpiStripRef} role="tablist" aria-label="Metric" className="relative flex overflow-x-auto scrollbar-hide md:grid md:grid-cols-4 divide-x divide-[#e5e7eb]/60" style={{
              /*
                BOTH AXES. This was `pan-x`, which does not mean "prefer
                horizontal" — it means vertical panning is not allowed here at
                all. So a thumb that landed on Views or Revenue and pulled down
                could not scroll the page, and the row looked frozen. With both
                named, the browser decides from the gesture: sideways scrolls
                the row, down scrolls the page.
              */
              /* Both axes stay permitted: use-tab-strip decides which of the
                 two this gesture is and hands back the ones that are the
                 page's, so naming one axis here would only take the other
                 away from it. */
              touchAction: 'pan-x pan-y',
              WebkitOverflowScrolling: 'touch',
            }}>
            {/* The four figures: components/app/metric-tab, the same tab Analytics draws. */}
            <MetricTab
              tab="views"
              className="flex-shrink-0 min-w-[130px] md:min-w-0"
              selected={openKPIModal === "views"}
              soft={isRefreshing && figuresReady}
              loading={!figuresReady}
              sample={showSampleData && !hasRealData}
              label={t("dashboard.views")}
              value={formatCompactNumber(displayAnalytics.periodViews)}
              change={<PercentChangeIndicator current={displayAnalytics.periodViews} previous={displayAnalytics.prevPeriodViews} />}
              foot={`${formatCompactNumber(displayAnalytics.totalViews)} ${t("dashboard.allTime")}`}
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
              value={`${Math.round(displayAnalytics.conversionRate)}%`}
              change={<PercentChangeIndicator current={displayAnalytics.conversionRate} previous={displayAnalytics.prevConversionRate} />}
              foot={t("dashboard.viewsToOrders")}
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
                before read as too much for one chart. `chartEvents == null`
                counts as waiting, because the read starts in an effect and
                `isChartLoading` alone left one empty frame first.
              */}
              {(() => {
                const chartWaiting = (chartEvents == null || isChartLoading) && displayChartData.length === 0
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
                  */}
                  <div
                    aria-busy={chartWaiting || undefined}
                    className={`transition-[opacity,filter] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${chartWaiting ? "opacity-60 blur-[1.5px]" : showSampleData && !hasRealData ? "opacity-50 blur-0" : "opacity-100 blur-0"}`}
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

        {/* Dashboard Banner — content changes based on subscription plan */}
        <div className="mb-8">
          <div className="relative overflow-hidden rounded-2xl">
            {/*
              `sizes`, because without it next/image builds its srcset from
              the `width` prop and a phone downloads the 1200px candidate —
              2400 on a 3x screen — for a box about 358px wide. That is a
              megapixel and a half decoded on the main thread for a banner
              a third of that. The number is what the box really is: the
              content column, which is the viewport under `sm` and 640px of
              it above.
            */}
            <Image
              src="https://images.unsplash.com/photo-1541367777708-7905fe3296c0?w=1200&h=300&fit=crop"
              alt=""
              width={1200}
              height={300}
              sizes="(max-width: 640px) 100vw, 640px"
              priority
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
            <div className="relative z-10 px-5 py-5 sm:px-8 sm:py-6">
              {subscriptionPlanId === "growth" || subscriptionPlanId === "pro" ? (
                /* Pro plan banner (internal ids "growth" and the earlier "pro") */
                <>
                  <p className="text-[16px] sm:text-[20px] font-medium text-white mb-1">Track what&apos;s working in real time</p>
                  <p className="text-[13px] sm:text-[14px] text-white/80 mb-3 sm:mb-4">Use your dashboard to optimize for more sales.</p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Link
                      href="/app/analytics"
                      className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg text-[12px] sm:text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      View analytics
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] sm:text-[15px] font-semibold text-white">Pro plan</span>
                  </div>
                  <p className="text-[14px] sm:text-[16px] text-white/90 mb-3 sm:mb-4">3% fees instead of 6%, and 25 GB of storage instead of 1 GB.</p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Link
                      href="/app/settings/billing/upgrade"
                      className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg text-[12px] sm:text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors"
                    >
                      Upgrade
                    </Link>
                    <button
                      onClick={() => {
                        if (isNativeApp()) {
                          openExternal("https://storelib.com/features")
                        } else {
                          window.open("/features", "_blank", "noopener,noreferrer")
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-[12px] sm:text-[13px] font-medium text-white hover:bg-white/20 transition-colors cursor-pointer"
                    >
                      Features
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Grid - Store Setup + Quick Actions */}
        <div className="grid gap-6 lg:grid-cols-[370px_1fr]">
          {/* Left Column - Store Setup Checklist */}
          <div id="store-setup-section" className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{t("dashboard.storeSetup")}</h2>
                <span className="text-[13px] font-medium text-[#6b7280] bg-[#f3f4f6] px-2.5 py-1 rounded-full">
                  {completedSteps}/{totalSteps}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#f3f4f6] rounded-full mb-5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa] rounded-full transition-all duration-500"
                  style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                />
              </div>

              {/* Steps List with Collapsible Substeps */}
              <div className="space-y-1">
                {initialSetupSteps.map((step) => {
                  const Icon = stepIcons[step.id] || Package
                  const isExpanded = expandedStep === step.id
                  const substeps = stepSubsteps[step.id] || []
                  const substepData = getSubstepData(step)

                  return (
                    <div key={step.id}>
                      <button
                        onClick={(e) => handleStepClick(step.id, e)}
                        className="group relative flex items-center gap-3 p-3 rounded-xl hover:bg-[#f9fafb] transition-all duration-150 w-full text-left"
                      >
                        {/* Checkmark or Progress circle */}
                        <div className="relative shrink-0">
                          {step.completed ? (
                            <div className="w-8 h-8 rounded-full bg-[#8b5cf6] flex items-center justify-center">
                              <Check className="h-4 w-4 text-white" strokeWidth={2.5} />
                            </div>
                          ) : (
                            <div className="relative">
                              <ProgressCircle progress={0} size={32} />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Icon className="h-3.5 w-3.5 text-[#9ca3af]" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-[13px] font-medium text-[#1a1a2e]`}
                          >
                            {step.title}
                          </p>
                          <p className="text-[11px] text-[#9ca3af] mt-0.5 truncate">{step.description}</p>
                        </div>

                        {/* Expand/Collapse Arrow */}
                        <ChevronDown
                          className={`h-4 w-4 text-[#d1d5db] shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        />

                        {/* Tooltip on hover - hidden on mobile, wider on desktop */}
                        <div className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                          <div className="bg-[#1a1a2e] text-white text-[12px] px-4 py-2.5 rounded-xl shadow-lg w-[220px] whitespace-normal leading-relaxed">
                            {step.tooltip}
                            <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-4 border-transparent border-r-[#1a1a2e]" />
                          </div>
                        </div>
                      </button>

                      {/* Collapsible Substeps */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-out ${
                          isExpanded ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
                        }`}
                      >
                        <div className="pl-11 pr-3 pb-2 space-y-1">
                          {substeps.map((substep, idx) => {
                            const isSubstepComplete = substep.check(substepData)
                            return (
                              <Link
                                key={idx}
                                href={substep.href}
                                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[#f5f3ff]/50 transition-colors"
                              >
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  isSubstepComplete
                                    ? "bg-[#8b5cf6] border-[#8b5cf6]"
                                    : "border-[#d1d5db]"
                                }`}>
                                  {isSubstepComplete && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                </div>
                                <span className={`text-[12px] ${
                                  isSubstepComplete ? "text-[#1a1a2e]" : "text-[#6b7280]"
                                }`}>
                                  {t(substep.labelKey as any)}
                                </span>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

          {/* Right Column - Quick Actions */}
          <div className="space-y-4">
            {/* Add a product card */}
            <Link
              href="/app/products/new"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl overflow-hidden shrink-0">
                <Image src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/iiii.png" alt="Create product" width={128} height={128} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    {t("dashboard.createProduct")}
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">{t("dashboard.createProductDesc")}</p>
              </div>
            </Link>

            {/* Market your products card */}
            <Link
              href="/app/onepage"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl overflow-hidden shrink-0">
                <Image src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/ooaw.png" alt="Edit OnePage" width={128} height={128} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    {t("dashboard.editOnePage")}
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">{t("dashboard.editOnePageDesc")}</p>
              </div>
            </Link>

            {/* View analytics card */}
            <Link
              href="/app/analytics"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl overflow-hidden shrink-0">
                <Image src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/naaly.png" alt="View analytics" width={128} height={128} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    {t("dashboard.viewAnalytics")}
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">{t("dashboard.viewAnalyticsDesc")}</p>
              </div>
            </Link>

            {/* Add Custom Domain card */}
            <Link
              href="/app/settings?tab=domains"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl overflow-hidden shrink-0">
                <Image src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/domani.png" alt="Add domain" width={128} height={128} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    Add Custom Domain
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">Connect your own domain to your store</p>
              </div>
            </Link>
          </div>
        </div>

      </div>

      {/* Dashboard Scrollbar Styles */}
      <style jsx>{`
        @keyframes laser-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
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
      <QuickAccessBottomSheet
        isOpen={isQuickAccessMobileOpen}
        onClose={() => setIsQuickAccessMobileOpen(false)}
        onePageUrl={hasOnePageSetup ? publicOnePageUrl : "Set up your OnePage to create a link"}
        storeUrl={publicStoreUrl}
        navOnePageUrl={hasOnePageSetup ? navOnePageUrl : undefined}
        navStoreUrl={navStoreUrl}
        isOnePageCopied={copiedTarget === "onepage"}
        isStoreCopied={copiedTarget === "store"}
        onCopyOnePage={() => copyQuickAccessUrl("onepage")}
        onCopyStore={() => copyQuickAccessUrl("store")}
        isOnePageReady={hasOnePageSetup}
        onSetupOnePage={() => router.push("/app/onepage")}
      />
    </div>
  )
}
