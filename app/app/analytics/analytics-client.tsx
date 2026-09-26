"use client"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ANALYTICS
 * ═══════════════════════════════════════════════════════════════════════════
 * The period picker, four figures, the chart of whichever figure is chosen,
 * and the reports under it.
 *
 * ONE ANSWER FOR THE WHOLE PAGE. Every number here comes from one read of
 * app/api/analytics/reports (useAnalyticsReports), counted on the server
 * from every row by lib/analytics/reports.ts. The figures on the tabs, the
 * chart and the cards under it are the same object, so they agree.
 *
 * They did not. The tabs and the chart were counted in this file, in the
 * browser, and five things were wrong with that:
 *
 *   a browser query stops at 1,000 rows, so "all time" was the first
 *   thousand views, and a busy month simply stopped counting;
 *   the Views figure counted one view per visitor per product while the
 *   chart counted every event, so the line did not add up to the number;
 *   hours were bucketed on the phone's clock and days on the creator's;
 *   orders that fell on no day of the chart were spread evenly across the
 *   days "so the chart always shows them", which is inventing a shape;
 *   and the days were sorted as dates in 2024, so a period across New Year
 *   put January before December.
 *
 * THERE IS NO COMPARISON CONTROL. Every percentage is against the period
 * just before, the same number of days ending the day before
 * (lib/date-range/range compareBounds), sent with the question. A link that
 * still says ?compare=none or a custom comparison is read as that too, so
 * nothing on the page is measured against something the page cannot show.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Link2, ShoppingBag, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { AnnouncementBarMobile } from "@/components/app/announcement-bar-mobile"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { usePeriodParams } from "@/components/app/use-period-params"
import { ProductPicker } from "@/components/app/product-picker"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { boundsOf, compareBounds, compareRange, rangeLabel, type CompareValue, type DateRange } from "@/lib/date-range/range"
import { bucketLabel, bucketStarts, grainFor, type Span } from "@/lib/analytics/buckets"
import { AnalyticsReports, useAnalyticsReports } from "./analytics-reports"
import { reportNow } from "@/lib/analytics/report-cache"
import { AnalyticsChartWithTooltip, CHART_COLORS } from "@/components/app/analytics-chart"
import { MetricTab } from "@/components/app/metric-tab"
import { TAB_STRIP_STYLE, useTabStrip } from "@/components/app/use-tab-strip"
import { HoverNote } from "@/components/app/help-label"
import { LoadingLine } from "@/components/app/loading-line"

/* The four figures in order, for the strip that scrolls them on a phone. */
const STORE_TAB_ORDER = ["views", "revenue", "orders", "conversion"] as const
const ONE_PAGE_TAB_ORDER = ["views", "clicks", "subscribers", "ctr"] as const
/* Each tab keeps its width in the phone's row, the home page's 130px. */
const STRIP_TAB = "flex-shrink-0 min-w-[130px] md:min-w-0"

interface Product {
  id: string
  title: string
  thumbnail_url?: string | null
}

interface AnalyticsClientProps {
  creatorId: string
  userId: string
  products: Product[]
}

interface TrendData {
  date: string
  views: number
  sales: number
  revenue: number
  clicks?: number
  subscribers?: number
  refunds?: number
  conversion?: number
  ctr?: number
  /** The same bucket of the period it is compared with. Absent with no comparison. */
  prev_views?: number
  prev_sales?: number
  prev_revenue?: number
  prev_refunds?: number
  prev_conversion?: number
}

type AnalyticsMode = "store" | "onepage"
type ChartMetricFilter = "all" | "views" | "orders" | "revenue" | "conversion"
type OnePageChartFilter = "all" | "views" | "clicks" | "subscribers" | "ctr"

interface Figure {
  value: number
  previous: number
  allTime: number | null
}

// ── Sample data, shown only when the creator asks to see it ───────────────
const ANALYTICS_SAMPLE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const ANALYTICS_SAMPLE_TREND: TrendData[] = ANALYTICS_SAMPLE_DAYS.map((d, i) => ({
  date: d,
  views: [45, 78, 35, 92, 63, 88, 51][i],
  sales: [2, 5, 1, 7, 3, 6, 4][i],
  revenue: [1250, 3400, 900, 4500, 2500, 3800, 2000][i],
  clicks: [12, 22, 9, 31, 18, 28, 15][i],
  subscribers: [1, 2, 0, 3, 1, 2, 1][i],
  conversion: [2.1, 3.4, 1.2, 4.1, 2.6, 3.9, 3.1][i],
  ctr: [26, 28, 25, 33, 28, 31, 29][i],
}))
const SAMPLE_STORE: Record<"views" | "revenue" | "orders" | "conversion", Figure> = {
  views: { value: 452, previous: 380, allTime: 1660 },
  revenue: { value: 34500, previous: 28900, allTime: 125000 },
  orders: { value: 28, previous: 22, allTime: 95 },
  conversion: { value: 6.2, previous: 5.8, allTime: null },
}
const SAMPLE_ONEPAGE: Record<"views" | "clicks" | "subscribers" | "ctr", Figure> = {
  views: { value: 245, previous: 198, allTime: 890 },
  clicks: { value: 89, previous: 72, allTime: 312 },
  subscribers: { value: 12, previous: 9, allTime: 47 },
  ctr: { value: 36.3, previous: 36.4, allTime: null },
}

/** What every percentage on the page is measured against. */
const PREVIOUS_PERIOD: CompareValue = { mode: "previous_period" }

/** How long the figures are waited for before the page says it is counting: "after ~2.5 s a quiet line". */
export const COUNTING_NOTE_MS = 2500

/** One formatter for the page. Constructing an Intl.NumberFormat is not free. */
const USD_FORMAT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

/**
 * What the percentages are measured against: "Dec 1–Dec 31, 2025", the
 * period just before, or null for All time, which has nothing before it.
 */
const CompareContext = createContext<string | null>("the previous period")

function PercentChangeIndicator({ current, previous }: { current: number; previous: number }) {
  const against = useContext(CompareContext)
  if (against === null) return null
  if (previous === 0) {
    /* Nothing before is not "+100%": it is new, or it is still nothing. */
    return current > 0 ? (
      <HoverNote className="text-[11px] font-medium text-[#9ca3af]" note={`None in ${against}`}>
        New
      </HoverNote>
    ) : null
  }
  const change = ((current - previous) / previous) * 100
  if (Math.round(change) === 0) return null
  const up = change > 0
  /* What it is measured against, in the card every hover note uses (components/app/help-label). */
  return (
    <HoverNote
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${up ? "text-emerald-600" : "text-[#9ca3af]"}`}
      note={`${up ? "+" : "-"}${Math.round(Math.abs(change))}% compared with ${against}`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.round(Math.abs(change))}%
    </HoverNote>
  )
}

/**
 * ===========================================================================
 *  THE DATES THE CHART PLOTS, WORKED OUT IN ONE PLACE
 * ===========================================================================
 * The chart is drawn before the answer arrives: its own grid, its own dates
 * and a flat grey line, rather than a white box. Those dates are made here
 * by the same functions the server labels its buckets with
 * (lib/analytics/buckets), so the placeholder and the series that replaces
 * it have exactly the same x categories and the line grows out of the
 * baseline instead of the plot being swapped.
 */
function trendLabelsFor(span: Span, timeZone: string): string[] {
  const grain = grainFor(span)
  return bucketStarts(span, grain, timeZone).map((s) => bucketLabel(s, grain, timeZone))
}

/**
 * How many points the PLACEHOLDER may draw. All time starts in 2020; a
 * placeholder nobody will look at for more than a moment has no business
 * laying out thousands of ticks before the page has painted.
 */
const TREND_SKELETON_MAX = 90

/**
 * Which line is which: the period in violet, what it is compared with in grey,
 * dashed. One page draws no dashed line, so there the second entry keeps its
 * place without showing: the legend is the same size in both modes and
 * nothing centred in it, or under it, moves when the mode changes.
 */
function ChartLegend({ range, compare, compareShown = true }: { range: DateRange; compare: DateRange | null; compareShown?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px] text-[#6b7280]">
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <span className="h-[2px] w-4 rounded-full" style={{ background: CHART_COLORS.views }} aria-hidden />
        {rangeLabel(range)}
      </span>
      {compare && (
        <span className="inline-flex items-center gap-1.5 tabular-nums" style={{ visibility: compareShown ? undefined : "hidden" }} aria-hidden={compareShown ? undefined : true}>
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: CHART_COLORS.compared }} aria-hidden />
          {rangeLabel(compare)}
        </span>
      )}
    </div>
  )
}

/**
 * The figures above the chart are the home page's tabs
 * (components/app/metric-tab): four of them in a two by two grid on a phone
 * and a row on anything wider, every figure on screen at once, with nothing
 * to swipe to and nothing hidden past the edge. This is the change beside
 * each value.
 */
function changeOf(f: Figure) {
  return <PercentChangeIndicator current={f.value} previous={f.previous} />
}

export function AnalyticsClient({ products, userId }: AnalyticsClientProps) {
  const searchParams = useSearchParams()
  const { t } = useLanguage()

  /**
   * THE PERIOD, from the shared picker, kept in the address
   * (components/app/use-period-params.ts). Days are the creator's days:
   * lib/date-range/range.ts. It is compared with the period just before.
   */
  const timeZone = useMemo(() => viewerTimeZone(), [])
  const { period, setPeriod, today } = usePeriodParams(timeZone, "last_7_days")
  const compare = PREVIOUS_PERIOD
  /* "All time" is compared with nothing: there is no before the beginning. */
  const isAllTime = period.preset === "all_time"
  const comparedRange = isAllTime ? null : compareRange(period, compare)
  const compareLabel = comparedRange ? rangeLabel(comparedRange) : null

  const [analyticsMode, setAnalyticsModeState] = useState<AnalyticsMode>(() => (searchParams.get("mode") === "onepage" ? "onepage" : "store"))
  /*
    THE MODE IS KEPT IN THE ADDRESS THE WAY THE PERIOD IS: history.replaceState,
    not the router. `router.replace` is a navigation. It asked the server for
    the page again and, because the address was a new one, Next put the page
    back under its loading skeleton and mounted it afresh: every Store / One
    page tap was the whole page going blank, the chart starting again from
    its placeholder and every figure read again. That was the reload.
  */
  const setAnalyticsMode = useCallback((mode: AnalyticsMode) => {
    setAnalyticsModeState(mode)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("mode", mode)
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    } catch {
      /* the address is a convenience; the page works without it */
    }
  }, [])
  const [chartMetricFilter, setChartMetricFilter] = useState<ChartMetricFilter>("views")
  const [onePageChartFilter, setOnePageChartFilter] = useState<OnePageChartFilter>("views")
  const [selectedProduct, setSelectedProduct] = useState("all")

  /* Sample data toggle — session only, resets on page refresh */
  const [showSampleData, setShowSampleData] = useState(false)

  /* Asked again every minute, so a sale shows up without a reload. */
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  /**
   * The period's instants: whole days on the creator's clock, the last one
   * running to now. And the comparison's, cut at the same point into its
   * own last day when the period is still running. "Now" is rounded up to
   * the next ten seconds (reportNow), so the page asks the question a
   * prefetch from the sidebar just asked, and is answered from memory.
   */
  const span = useMemo(() => boundsOf(period, timeZone, reportNow()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period.start, period.end, period.preset, timeZone, tick])
  const against = useMemo(() => (isAllTime ? null : compareBounds(period, compare, timeZone, reportNow())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period.start, period.end, period.preset, timeZone, tick])
  const safeSpan = useMemo(() => ({ start: span.start, end: Math.max(span.end, span.start + 1) }), [span])

  const reportsState = useAnalyticsReports({
    start: safeSpan.start,
    end: safeSpan.end,
    compare: against,
    product: analyticsMode === "store" ? selectedProduct : "all",
    mode: analyticsMode,
    refresh: tick,
    viewer: userId,
  })
  const answer = reportsState.data
  /*
    SOFT ONLY WHILE THE FIGURES ARE THE WRONG ONES: a new period, product or
    mode is on its way. The minute refresh asks the same question again, and
    it used to blur the chart, the four figures and every card for the
    length of the request, once a minute, for numbers that were almost
    always unchanged. It is silent now, and an answer that brings nothing
    new changes nothing on screen (analytics-reports useAnalyticsReports).
  */
  const isRefreshing = reportsState.stale

  /*
    WHAT THE PAGE IS WAITING FOR, AS THE PERSON SEES IT. "It shows those
    numbers blurred, which is okay, but it takes too much to load the data,
    without showing some feedback." The figures of this question (a first
    visit, or a new period, product or mode, while the last ones stay on
    screen, blurred), or the lists under them once the figures are in. The
    minute's silent refresh of the same question is neither, and neither is
    a kept answer being checked behind the page (lib/analytics/report-cache).

    While either lasts, the app's slim progress line runs along the top of
    the figures' card (components/app/loading-line: nothing for 300ms). And
    when the figures have taken COUNTING_NOTE_MS, a quiet line over the chart
    says what the wait is: the visits of a long period being counted.
  */
  const waitingFigures = reportsState.loading && (!answer || reportsState.stale)
  const waitingLists = reportsState.loading && !!answer && answer.mode === "store" && !!answer.reports.partial
  const waitingKey = `${period.preset ?? ""}|${period.start}|${period.end}|${analyticsMode}|${selectedProduct}`

  /**
   * THE CHART CHANGES MODE WHEN THE DATA FOR THAT MODE ARRIVES. The tabs
   * highlight at once, because a tap should feel answered; the chart keeps
   * the series it has until the other mode's numbers are here, so one tap
   * draws once and never draws Store lines over One page numbers.
   */
  const trendMode: AnalyticsMode = answer?.mode ?? analyticsMode
  /* The row follows the chosen tab on a phone; the swipe itself is the browser's. */
  const metricStripRef = useTabStrip<HTMLDivElement>(
    trendMode === "store" ? chartMetricFilter : onePageChartFilter,
    trendMode === "store" ? STORE_TAB_ORDER : ONE_PAGE_TAB_ORDER,
  )
  const trendData = useMemo<TrendData[]>(() => {
    if (!answer) return []
    if (answer.mode === "store") {
      const r = answer.reports
      const c = r.compared
      return r.views.series.labels.map((date, i) => ({
        date,
        views: r.views.series.current[i] ?? 0,
        sales: r.orders.series.current[i] ?? 0,
        revenue: r.sales.series.current[i] ?? 0,
        refunds: r.refunds.series.current[i] ?? 0,
        conversion: Number(((r.conversion.series.current[i] ?? 0) * 100).toFixed(2)),
        ...(c
          ? {
              prev_views: r.views.series.previous[i] ?? 0,
              prev_sales: r.orders.series.previous[i] ?? 0,
              prev_revenue: r.sales.series.previous[i] ?? 0,
              prev_refunds: r.refunds.series.previous[i] ?? 0,
              prev_conversion: Number(((r.conversion.series.previous[i] ?? 0) * 100).toFixed(2)),
            }
          : {}),
      }))
    }
    const r = answer.reports
    return r.views.series.labels.map((date, i) => ({
      date,
      views: r.views.series.current[i] ?? 0,
      sales: 0,
      revenue: 0,
      clicks: r.clicks.series.current[i] ?? 0,
      subscribers: r.subscribers.series.current[i] ?? 0,
      ctr: Number(((r.ctr.series.current[i] ?? 0) * 100).toFixed(2)),
    }))
  }, [answer])

  /** A flat series across the selected range, drawn until the first answer lands. */
  const skeletonTrend = useMemo<TrendData[]>(() => {
    return trendLabelsFor(safeSpan, timeZone)
      .slice(-TREND_SKELETON_MAX)
      .map((date) => ({ date, views: 0, sales: 0, revenue: 0, clicks: 0, subscribers: 0 }))
  }, [safeSpan, timeZone])

  /** Nothing has arrived yet, so what is on screen is the placeholder. */
  const chartIsLoading = trendData.length === 0
  const rawChartData = useMemo(() => (chartIsLoading ? skeletonTrend : trendData).map((d) => ({ ...d })), [chartIsLoading, skeletonTrend, trendData])

  /* ── The four figures ─────────────────────────────────────────────────── */
  const store = useMemo(() => {
    if (!answer || answer.mode !== "store") return null
    const r = answer.reports
    const all = answer.allTime
    return {
      views: { value: r.views.value, previous: r.views.previous, allTime: all?.views ?? null },
      revenue: { value: r.sales.value, previous: r.sales.previous, allTime: all?.salesCents ?? null },
      orders: { value: r.orders.value, previous: r.orders.previous, allTime: all?.orders ?? null },
      conversion: { value: r.conversion.value * 100, previous: r.conversion.previous * 100, allTime: null },
    } satisfies Record<string, Figure>
  }, [answer])
  const onePage = useMemo(() => {
    if (!answer || answer.mode !== "onepage") return null
    const r = answer.reports
    const all = answer.allTime
    return {
      views: { value: r.views.value, previous: r.views.previous, allTime: all?.views ?? null },
      clicks: { value: r.clicks.value, previous: r.clicks.previous, allTime: all?.clicks ?? null },
      subscribers: { value: r.subscribers.value, previous: r.subscribers.previous, allTime: all?.subscribers ?? null },
      ctr: { value: r.ctr.value * 100, previous: r.ctr.previous * 100, allTime: null },
    } satisfies Record<string, Figure>
  }, [answer])

  const hasRealData = !!answer && (answer.mode === "store"
    ? (answer.allTime?.views ?? 0) > 0 || (answer.allTime?.orders ?? 0) > 0
    : (answer.allTime?.views ?? 0) > 0 || (answer.allTime?.clicks ?? 0) > 0)
  const sample = showSampleData && !hasRealData

  const zero: Figure = { value: 0, previous: 0, allTime: null }
  const storeFigures = sample ? SAMPLE_STORE : store ?? { views: zero, revenue: zero, orders: zero, conversion: zero }
  const onePageFigures = sample ? SAMPLE_ONEPAGE : onePage ?? { views: zero, clicks: zero, subscribers: zero, ctr: zero }
  /* Nothing has come back yet. The figures on screen are the mode of the answer (trendMode), so a switch never shows zeros. */
  const figuresLoading = !sample && !answer
  /* Before the first answer the tabs draw their figures soft (MetricTab
     `loading`), and clear to the real ones when it lands; after it, a
     figure being replaced goes soft the same way. */
  const soft = isRefreshing && !figuresLoading

  /*
    STABLE, because the chart below is memoised and this is one of its props.
    A new function identity on every render would re-render recharts each
    time anything on this page changed.
  */
  const formatPrice = useCallback((cents: number) => USD_FORMAT.format(cents / 100), [])
  const formatCompactNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    if (num >= 10_000) return `${Math.round(num / 1000)}k`
    if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}k`
    return Math.round(num).toLocaleString("en-US")
  }
  const formatRate = (pct: number) => `${pct > 0 && pct < 10 ? pct.toFixed(1).replace(/\.0$/, "") : Math.round(pct)}%`
  const allTime = (f: Figure, fmt: (n: number) => string, fallback: string) =>
    f.allTime === null ? fallback : `${fmt(f.allTime)} ${t("dashboard.allTime")}`

  const chartDisplayData = useMemo(
    () => (sample ? ANALYTICS_SAMPLE_TREND : rawChartData),
    [sample, rawChartData],
  )

  const modeButton = (mode: AnalyticsMode, size: "sm" | "md") => (
    <button
      key={mode}
      onClick={() => setAnalyticsMode(mode)}
      className={`flex items-center gap-1.5 rounded-full font-medium transition-all duration-200 cursor-pointer ${
        size === "sm" ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-[13px]"
      } ${analyticsMode === mode ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"}`}
    >
      {mode === "store" ? <ShoppingBag className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
      {mode === "store" ? t("analytics.store") : t("nav.onepage")}
    </button>
  )

  return (
    <CompareContext.Provider value={compareLabel}>
    <div className="h-full overflow-y-auto page-scroll bg-[#fafafa] select-none overscroll-none app-page-enter" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none", overscrollBehavior: "none" } as React.CSSProperties}>
      {/* Announcement Bar — fixed above black header on mobile */}
      <AnnouncementBarMobile>
        <div className="max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center">
          <span className="text-[12px] md:text-[14px] text-white/90">
            <span className="font-semibold text-white">Try Pro</span>
            <span className="hidden md:inline">, our most popular plan for content creators and businesses.</span>
          </span>
          <Link
            href="/upgrade"
            className="relative inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-gray-900 to-black text-white text-[11px] md:text-[13px] font-medium rounded-full transition-all shrink-0 overflow-hidden group"
          >
            <span className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/50 transition-colors" />
            <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 relative z-10" />
            <span className="relative z-10">Upgrade</span>
          </Link>
        </div>
      </AnnouncementBarMobile>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Title, with the Store / OnePage switch beside it on a phone */}
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">{t("analytics.title")}</h1>
          <div className="flex sm:hidden items-center bg-[#f3f4f6] rounded-full p-0.5">
            {modeButton("store", "sm")}
            {modeButton("onepage", "sm")}
          </div>
        </div>

        {/* The period, the mode on a wider screen, and the product. No comparison control. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DateRangePicker value={period} onChange={setPeriod} today={today} />
            <div className="hidden sm:flex items-center bg-[#f3f4f6] rounded-full p-0.5">
              {modeButton("store", "md")}
              {modeButton("onepage", "md")}
            </div>
          </div>

          {/* Which product: the date picker's button, list and sheet (components/app/product-picker). */}
          {analyticsMode === "store" && (
            <ProductPicker products={products} value={selectedProduct} onChange={setSelectedProduct} align="end" />
          )}
        </div>

        {/* The four figures and the chart of the one chosen */}
        <div className="relative bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden" aria-busy={waitingFigures || waitingLists}>
          <LoadingLine active={waitingFigures || waitingLists} />
          {/*
            THE FIGURES OF THE ANSWER ON SCREEN, like the chart under them. A
            switch to One page used to put its four tabs up at once reading
            zero, softened, until its numbers came: four zeros flashing on
            every switch. The Store figures stay, softened, until the One page
            ones are here, and then the row changes once.
          */}
          {/* One row that scrolls sideways on a phone, like the home page's
              (components/app/use-tab-strip), and four columns from md up. */}
          <div
            ref={metricStripRef}
            role="tablist"
            aria-label="Metric"
            data-scroll-x
            className="relative flex divide-x divide-[#e5e7eb]/60 overflow-x-auto scrollbar-hide md:grid md:grid-cols-4"
            style={TAB_STRIP_STYLE}
          >
            {trendMode === "store" ? (
              <>
                <MetricTab tab="views" className={STRIP_TAB} label={t("analytics.totalViews")} value={formatCompactNumber(storeFigures.views.value)} change={changeOf(storeFigures.views)} selected={chartMetricFilter === "views"} soft={soft} loading={figuresLoading} sample={sample} foot={allTime(storeFigures.views, formatCompactNumber, "Pages opened")} onSelect={() => setChartMetricFilter("views")} />
                <MetricTab tab="revenue" className={STRIP_TAB} label={t("analytics.totalRevenue")} value={formatPrice(storeFigures.revenue.value)} change={changeOf(storeFigures.revenue)} selected={chartMetricFilter === "revenue"} soft={soft} loading={figuresLoading} sample={sample} foot={allTime(storeFigures.revenue, formatPrice, "Less refunds")} onSelect={() => setChartMetricFilter("revenue")} />
                <MetricTab tab="orders" className={STRIP_TAB} label={t("analytics.totalOrders")} value={formatCompactNumber(storeFigures.orders.value)} change={changeOf(storeFigures.orders)} selected={chartMetricFilter === "orders"} soft={soft} loading={figuresLoading} sample={sample} foot={allTime(storeFigures.orders, formatCompactNumber, "Paid and free")} onSelect={() => setChartMetricFilter("orders")} />
                <MetricTab tab="conversion" className={STRIP_TAB} label={t("analytics.conversionRate")} value={formatRate(storeFigures.conversion.value)} change={changeOf(storeFigures.conversion)} selected={chartMetricFilter === "conversion"} soft={soft} loading={figuresLoading} sample={sample} foot="Visits that ordered" onSelect={() => setChartMetricFilter("conversion")} />
              </>
            ) : (
              <>
                <MetricTab tab="views" className={STRIP_TAB} label={t("dashboard.views")} value={formatCompactNumber(onePageFigures.views.value)} change={changeOf(onePageFigures.views)} selected={onePageChartFilter === "views"} soft={soft} loading={figuresLoading} sample={sample} foot={allTime(onePageFigures.views, formatCompactNumber, "Visits")} onSelect={() => setOnePageChartFilter("views")} />
                <MetricTab tab="clicks" className={STRIP_TAB} label={t("analytics.clicks")} value={formatCompactNumber(onePageFigures.clicks.value)} change={changeOf(onePageFigures.clicks)} selected={onePageChartFilter === "clicks"} soft={soft} loading={figuresLoading} sample={sample} foot={allTime(onePageFigures.clicks, formatCompactNumber, "Link taps")} onSelect={() => setOnePageChartFilter("clicks")} />
                <MetricTab tab="subscribers" className={STRIP_TAB} label={t("analytics.subscribers")} value={formatCompactNumber(onePageFigures.subscribers.value)} change={changeOf(onePageFigures.subscribers)} selected={onePageChartFilter === "subscribers"} soft={soft} loading={figuresLoading} sample={sample} foot={allTime(onePageFigures.subscribers, formatCompactNumber, "Emails left")} onSelect={() => setOnePageChartFilter("subscribers")} />
                <MetricTab tab="ctr" className={STRIP_TAB} label="CTR" value={formatRate(onePageFigures.ctr.value)} change={changeOf(onePageFigures.ctr)} selected={onePageChartFilter === "ctr"} soft={soft} loading={figuresLoading} sample={sample} foot={t("analytics.clicksToViews")} onSelect={() => setOnePageChartFilter("ctr")} />
              </>
            )}
          </div>

          <div className="border-t border-[#e5e7eb]/60 px-2 pt-7 pb-3 sm:px-4 sm:pb-4">
            <div className="relative">
              <div
                /* The placeholder is not blurred: the frame IS the loading
                   state. The blur belongs to a refetch, where real numbers
                   are being replaced and going soft says so. */
                className={`transition-[opacity,filter] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  chartIsLoading
                    ? "opacity-100 blur-0"
                    : isRefreshing
                      ? "opacity-40 blur-[1.5px]"
                      : sample
                        ? "opacity-50 blur-0"
                        : "opacity-100 blur-0"
                }`}
              >
                <AnalyticsChartWithTooltip
                  chartDisplayData={chartDisplayData}
                  isLoading={chartIsLoading}
                  /* The mode the data is, not the mode the tabs are. See trendMode. */
                  analyticsMode={trendMode}
                  chartMetricFilter={chartMetricFilter}
                  onePageChartFilter={onePageChartFilter}
                  formatPrice={formatPrice}
                  compareLabel={sample ? null : compareLabel}
                />
                {/*
                  ALWAYS THERE, so nothing under it moves. It came and went
                  with the answer and with the mode (One page has no dashed
                  line), and every card below it jumped by its height when it
                  did. Its words are the period's, known before any number is;
                  over sample numbers it keeps its place and says nothing.
                */}
                <div className="mt-2" style={{ visibility: sample ? "hidden" : undefined }}>
                  <ChartLegend range={period} compare={comparedRange} compareShown={trendMode === "store"} />
                </div>
              </div>
              {/*
                COUNTING, SAID ONCE THE WAIT IS LONG. Only while the figures
                themselves are on their way, over the chart they will draw,
                so nothing on the page moves for it. In after
                COUNTING_NOTE_MS (CSS, so a quick answer never shows it and no
                timer runs), and keyed on the question, so a new period
                starts the wait again. Gone the moment the figures land.
              */}
              {waitingFigures && !sample ? (
                <div
                  key={waitingKey}
                  role="status"
                  data-counting-note=""
                  className="pointer-events-none absolute inset-x-0 top-[38%] z-10 flex justify-center px-4 opacity-0"
                  style={{ animation: `skeleton-reveal 260ms ease-out ${COUNTING_NOTE_MS}ms forwards` }}
                >
                  <span className="rounded-md bg-white/85 px-2 py-0.5 text-center text-[13px] text-[#6b7280]">Counting visits for this range</span>
                </div>
              ) : null}
              {!hasRealData && !chartIsLoading && (
                <div className="absolute -top-6 right-2 flex items-center gap-1.5 z-10">
                  <span className="text-[11px] text-[#9ca3af]">{showSampleData ? "Sample data" : "No activity yet"}</span>
                  <button
                    onClick={() => setShowSampleData((prev) => !prev)}
                    className={`relative inline-flex h-4 w-7 rounded-full transition-colors cursor-pointer ${showSampleData ? "bg-[#c4b5fd]" : "bg-[#e9ecef]"}`}
                    aria-label={showSampleData ? "Hide sample data" : "Show sample data"}
                  >
                    <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm my-0.5 transition-transform ${showSampleData ? "translate-x-3.5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* The reports under the chart, from the same answer. */}
        <AnalyticsReports
          start={new Date(safeSpan.start)}
          end={new Date(safeSpan.end)}
          product={analyticsMode === "store" ? selectedProduct : "all"}
          mode={analyticsMode}
          state={reportsState}
        />
      </div>

    </div>
    </CompareContext.Provider>
  )
}
