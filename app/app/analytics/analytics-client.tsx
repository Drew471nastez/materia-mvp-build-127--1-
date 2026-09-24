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
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, Link2, ShoppingBag, Sparkles, TrendingDown, TrendingUp, Check } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { AnnouncementBarMobile } from "@/components/app/announcement-bar-mobile"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { usePeriodParams } from "@/components/app/use-period-params"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { boundsOf, compareBounds, compareRange, rangeLabel, type CompareValue, type DateRange } from "@/lib/date-range/range"
import { bucketLabel, bucketStarts, grainFor, type Span } from "@/lib/analytics/buckets"
import { AnalyticsReports, useAnalyticsReports } from "./analytics-reports"
import { AnalyticsChartWithTooltip, CHART_COLORS } from "@/components/app/analytics-chart"
import { MetricTab } from "@/components/app/metric-tab"

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
    return current > 0 ? <span className="text-[11px] font-medium text-[#9ca3af]" title={`None in ${against}`}>New</span> : null
  }
  const change = ((current - previous) / previous) * 100
  if (Math.round(change) === 0) return null
  const up = change > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${up ? "text-emerald-600" : "text-[#9ca3af]"}`}
      title={`${up ? "+" : "-"}${Math.round(Math.abs(change))}% compared with ${against}`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.round(Math.abs(change))}%
    </span>
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

/** Which line is which: the period in violet, what it is compared with in grey, dashed. */
function ChartLegend({ range, compare }: { range: DateRange; compare: DateRange | null }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px] text-[#6b7280]">
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <span className="h-[2px] w-4 rounded-full" style={{ background: CHART_COLORS.views }} aria-hidden />
        {rangeLabel(range)}
      </span>
      {compare && (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
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

export function AnalyticsClient({ products }: AnalyticsClientProps) {
  const router = useRouter()
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

  const initialMode = searchParams.get("mode") as AnalyticsMode | null
  const [analyticsMode, setAnalyticsModeState] = useState<AnalyticsMode>(initialMode === "onepage" ? "onepage" : "store")
  const setAnalyticsMode = useCallback(
    (mode: AnalyticsMode) => {
      setAnalyticsModeState(mode)
      const params = new URLSearchParams(searchParams.toString())
      params.set("mode", mode)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )
  const [chartMetricFilter, setChartMetricFilter] = useState<ChartMetricFilter>("views")
  const [onePageChartFilter, setOnePageChartFilter] = useState<OnePageChartFilter>("views")
  const [selectedProduct, setSelectedProduct] = useState("all")
  const [isProductsOpen, setIsProductsOpen] = useState(false)
  const [isProductsSheetOpen, setIsProductsSheetOpen] = useState(false)
  /* The shared sheet is the phone's (below 640px); wider than that, the menu. */
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const read = () => setIsPhone(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])

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
   * own last day when the period is still running.
   */
  const span = useMemo(() => boundsOf(period, timeZone, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period.start, period.end, period.preset, timeZone, tick])
  const against = useMemo(() => (isAllTime ? null : compareBounds(period, compare, timeZone, Date.now())),
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
  })
  const answer = reportsState.data
  const isRefreshing = reportsState.loading && !!answer

  /**
   * THE CHART CHANGES MODE WHEN THE DATA FOR THAT MODE ARRIVES. The tabs
   * highlight at once, because a tap should feel answered; the chart keeps
   * the series it has until the other mode's numbers are here, so one tap
   * draws once and never draws Store lines over One page numbers.
   */
  const trendMode: AnalyticsMode = answer?.mode ?? analyticsMode
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
  const figuresLoading = !sample && (analyticsMode === "store" ? !store : !onePage)
  const soft = isRefreshing || figuresLoading

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

  const productLabel = selectedProduct === "all" ? "All products" : products.find((p) => p.id === selectedProduct)?.title || "All products"

  useEffect(() => {
    if (!isProductsOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".products-dropdown")) setIsProductsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isProductsOpen])

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

  const productRow = (id: string, title: string, thumb?: string | null) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setSelectedProduct(id)
        setIsProductsSheetOpen(false)
      }}
      className="flex w-full min-h-[52px] cursor-pointer items-center gap-3 px-5 py-2 text-left text-[15px] text-[#1a1a2e] active:bg-[#f7f7f8]"
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#9ca3af]">
          <ShoppingBag className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {selectedProduct === id ? <Check className="h-4 w-4 shrink-0 text-[#8b5cf6]" /> : null}
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

          {analyticsMode === "store" && (
            <div className="relative products-dropdown">
              <button
                type="button"
                onClick={() => (isPhone ? setIsProductsSheetOpen(true) : setIsProductsOpen(!isProductsOpen))}
                className="inline-flex h-10 max-w-[200px] cursor-pointer items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 text-[13px] font-medium text-[#374151] shadow-sm transition-colors hover:bg-[#f9fafb] sm:max-w-[260px]"
              >
                <span className="truncate">{productLabel}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-200 ${isProductsOpen ? "rotate-180" : ""}`} />
              </button>
              {isProductsOpen && !isPhone && (
                <div className="absolute right-0 top-full z-50 mt-1 max-h-[300px] w-56 overflow-y-auto rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-lg">
                  {[{ id: "all", title: "All products" }, ...products].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedProduct(p.id); setIsProductsOpen(false) }}
                      className={`w-full truncate px-4 py-2.5 text-left text-[13px] transition-colors ${
                        selectedProduct === p.id ? "bg-[#f5f3ff] font-medium text-[#8b5cf6]" : "text-[#374151] hover:bg-[#f9fafb]"
                      }`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* The four figures and the chart of the one chosen */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div role="tablist" aria-label="Metric" className="grid grid-cols-2 gap-px bg-[#eef0f2] md:grid-cols-4">
            {analyticsMode === "store" ? (
              <>
                <MetricTab tab="views" label={t("analytics.totalViews")} value={formatCompactNumber(storeFigures.views.value)} change={changeOf(storeFigures.views)} selected={chartMetricFilter === "views"} soft={soft} sample={sample} foot={allTime(storeFigures.views, formatCompactNumber, "Pages opened")} onSelect={() => setChartMetricFilter("views")} />
                <MetricTab tab="revenue" label={t("analytics.totalRevenue")} value={formatPrice(storeFigures.revenue.value)} change={changeOf(storeFigures.revenue)} selected={chartMetricFilter === "revenue"} soft={soft} sample={sample} foot={allTime(storeFigures.revenue, formatPrice, "Less refunds")} onSelect={() => setChartMetricFilter("revenue")} />
                <MetricTab tab="orders" label={t("analytics.totalOrders")} value={formatCompactNumber(storeFigures.orders.value)} change={changeOf(storeFigures.orders)} selected={chartMetricFilter === "orders"} soft={soft} sample={sample} foot={allTime(storeFigures.orders, formatCompactNumber, "Paid and free")} onSelect={() => setChartMetricFilter("orders")} />
                <MetricTab tab="conversion" label={t("analytics.conversionRate")} value={formatRate(storeFigures.conversion.value)} change={changeOf(storeFigures.conversion)} selected={chartMetricFilter === "conversion"} soft={soft} sample={sample} foot="Visits that ordered" onSelect={() => setChartMetricFilter("conversion")} />
              </>
            ) : (
              <>
                <MetricTab tab="views" label={t("dashboard.views")} value={formatCompactNumber(onePageFigures.views.value)} change={changeOf(onePageFigures.views)} selected={onePageChartFilter === "views"} soft={soft} sample={sample} foot={allTime(onePageFigures.views, formatCompactNumber, "Visits")} onSelect={() => setOnePageChartFilter("views")} />
                <MetricTab tab="clicks" label={t("analytics.clicks")} value={formatCompactNumber(onePageFigures.clicks.value)} change={changeOf(onePageFigures.clicks)} selected={onePageChartFilter === "clicks"} soft={soft} sample={sample} foot={allTime(onePageFigures.clicks, formatCompactNumber, "Link taps")} onSelect={() => setOnePageChartFilter("clicks")} />
                <MetricTab tab="subscribers" label={t("analytics.subscribers")} value={formatCompactNumber(onePageFigures.subscribers.value)} change={changeOf(onePageFigures.subscribers)} selected={onePageChartFilter === "subscribers"} soft={soft} sample={sample} foot={allTime(onePageFigures.subscribers, formatCompactNumber, "Emails left")} onSelect={() => setOnePageChartFilter("subscribers")} />
                <MetricTab tab="ctr" label="CTR" value={formatRate(onePageFigures.ctr.value)} change={changeOf(onePageFigures.ctr)} selected={onePageChartFilter === "ctr"} soft={soft} sample={sample} foot={t("analytics.clicksToViews")} onSelect={() => setOnePageChartFilter("ctr")} />
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
                {trendMode === "store" && !chartIsLoading && !sample && (
                  <div className="mt-2">
                    <ChartLegend range={period} compare={comparedRange} />
                  </div>
                )}
              </div>
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

      {/*
        THE PRODUCT PICKER ON A PHONE is the shared sheet: drawn into the body
        above the navigation pill, from the bottom edge, and moved by the
        finger (components/ui/bottom-sheet).
      */}
      <BottomSheet isOpen={isProductsSheetOpen} onClose={() => setIsProductsSheetOpen(false)} title="Product">
        <div className="pb-2 pt-1">
          {productRow("all", "All products")}
          {products.map((p) => productRow(p.id, p.title, p.thumbnail_url))}
        </div>
      </BottomSheet>
    </div>
    </CompareContext.Provider>
  )
}
