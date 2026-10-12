"use client"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ANALYTICS
 * ═══════════════════════════════════════════════════════════════════════════
 * The period, which of the creator's places is counted, four figures, the
 * chart of whichever figure is chosen, and the reports under it.
 *
 * ONE ANSWER FOR THE WHOLE PAGE. Every number here comes from one read of
 * app/api/analytics/reports (useAnalyticsReports), counted on the server
 * from every row by lib/analytics/reports.ts. The figures on the tabs, the
 * chart and the cards under it are the same object, so they agree, and
 * Home draws the same answer for All.
 *
 * ONE FILTER, AND IT STARTS ON ALL PAGES. All pages, the creator page, the
 * OnePage or a website (components/app/property-picker), listing only the
 * places the creator has and drawn only when there is more than one.
 *
 * The default is All pages and it is declared, not inferred: DEFAULT_PROPERTY
 * in lib/analytics/properties, which is what an address with no property, an
 * unreadable one, or one this creator cannot have all resolve to. A creator's
 * own choice overrides it and is kept exactly where it was, in the address as
 * `?property=` beside the period, so a link can open the page already
 * filtered (the Website and OnePage screens' summary lines do), and a reload
 * or a return keeps it. The old OnePage view (`?mode=onepage`) is the OnePage
 * property.
 *
 * THERE IS NO COMPARISON CONTROL. Every percentage is against the period
 * just before, the same number of days ending the day before
 * (lib/date-range/range compareBounds), sent with the question.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { PULL_REFRESH_EVENT, PullToRefreshEvent, type PullRefreshDetail } from "@/components/ui/pull-to-refresh"
import { useSearchParams } from "next/navigation"
import { TrendingDown, TrendingUp } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { TryProStrip } from "@/components/app/announcement-bar-mobile"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { usePeriodParams } from "@/components/app/use-period-params"
import { ProductPicker } from "@/components/app/product-picker"
import { PropertyPicker } from "@/components/app/property-picker"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { boundsOf, compareBounds, compareRange, rangeLabel, type CompareValue, type DateRange } from "@/lib/date-range/range"
import { bucketLabel, bucketStarts, grainFor, type Span } from "@/lib/analytics/buckets"
import { DEFAULT_PROPERTY, ownsProperty, parseProperty, propertyOptions, propertyParam, type CreatorProperties, type PropertySelector } from "@/lib/analytics/properties"
import { AnalyticsReports, useAnalyticsReports } from "./analytics-reports"
import { PhysicalAnalyticsCard } from "@/components/physical/analytics-card"
import { reportNow } from "@/lib/analytics/report-cache"
import { AnalyticsChartWithTooltip, CHART_COLORS, type AnalyticsChartData } from "@/components/app/analytics-chart"
import { MetricTab } from "@/components/app/metric-tab"
import { TAB_STRIP_STYLE, useTabStrip } from "@/components/app/use-tab-strip"
import { HoverNote } from "@/components/app/help-label"
import { LoadingLine } from "@/components/app/loading-line"

/* The four figures in order, for the strip that scrolls them on a phone. "views" is the Visitors tab. */
const TAB_ORDER = ["views", "revenue", "orders", "conversion"] as const
/* Each tab keeps its width in the phone's row, the home page's 130px. */
const STRIP_TAB = "flex-shrink-0 min-w-[130px] md:min-w-0"
/* The first line's name in the chart's readout. */
const SERIES_LABELS = { views: "Visitors" }

interface Product {
  id: string
  title: string
  thumbnail_url?: string | null
}

interface AnalyticsClientProps {
  creatorId: string
  userId: string
  products: Product[]
  /** The creator's places, read on the server (lib/analytics/report-read creatorProperties). */
  properties: CreatorProperties
}

type ChartMetricFilter = "views" | "orders" | "revenue" | "conversion"

interface Figure {
  /** Null only for a rate with nothing to divide by. */
  value: number | null
  previous: number | null
  allTime: number | null
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

function PercentChangeIndicator({ current, previous }: { current: number | null; previous: number | null }) {
  const against = useContext(CompareContext)
  if (against === null || current === null || previous === null) return null
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
 * (components/app/metric-tab): one row that scrolls sideways on a phone and
 * four columns from md up. This is the change beside each value.
 */
function changeOf(f: Figure) {
  return <PercentChangeIndicator current={f.value} previous={f.previous} />
}

/**
 * The property in the address, read once: `?property=`, or the old OnePage
 * view's `?mode=onepage`.
 *
 * Nothing in the address means the page's own default, All pages
 * (DEFAULT_PROPERTY, and the reasoning is beside it in
 * lib/analytics/properties). So does anything the address asks for that
 * cannot be honoured: a word that is not a place, or a place this creator
 * does not have (a website since deleted, a OnePage never made, somebody
 * else's link). The page never opens on a place nobody chose.
 */
function propertyFromAddress(params: URLSearchParams, properties: CreatorProperties): PropertySelector {
  const raw = params.get("property") ?? (params.get("mode") === "onepage" ? "onepage" : null)
  const p = parseProperty(raw)
  return ownsProperty(properties, p) ? p : DEFAULT_PROPERTY
}

export function AnalyticsClient({ products, userId, properties }: AnalyticsClientProps) {
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

  /*
    WHICH PLACE, KEPT IN THE ADDRESS THE WAY THE PERIOD IS: history.
    replaceState, not the router. A router navigation asks the server for
    the page again and puts it back under its loading skeleton; choosing a
    place is not a navigation. The old `?mode=` is rewritten to `?property=`
    once, on the first render's effect.
  */
  const options = useMemo(() => propertyOptions(properties), [properties])
  const [property, setPropertyState] = useState<PropertySelector>(() => propertyFromAddress(new URLSearchParams(searchParams.toString()), properties))
  const writeProperty = useCallback((p: PropertySelector) => {
    try {
      const url = new URL(window.location.href)
      const value = propertyParam(p)
      if (value) url.searchParams.set("property", value)
      else url.searchParams.delete("property")
      url.searchParams.delete("mode")
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    } catch {
      /* the address is a convenience; the page works without it */
    }
  }, [])
  const setProperty = useCallback(
    (p: PropertySelector) => {
      setPropertyState(p)
      writeProperty(p)
    },
    [writeProperty],
  )
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has("mode") || (url.searchParams.get("property") ?? null) !== propertyParam(property)) writeProperty(property)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [chartMetricFilter, setChartMetricFilter] = useState<ChartMetricFilter>("views")
  const [selectedProduct, setSelectedProduct] = useState("all")

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
  const propertyKey = propertyParam(property) ?? "all"

  const reportsState = useAnalyticsReports({
    start: safeSpan.start,
    end: safeSpan.end,
    compare: against,
    product: selectedProduct,
    property: propertyKey,
    refresh: tick,
    viewer: userId,
  })
  /*
    PULLED DOWN TO REFRESH (components/ui/pull-to-refresh.tsx, around the
    page under its purple bar, below): the same question as the minute's refresh, asked now,
    and the ring turns until its answer is in. The figures stay on screen
    and change in place, as they do every minute.
  */
  const pullWaiters = useRef<{ seen: boolean; resolve: () => void }[]>([])
  useEffect(() => {
    const onPull = (e: Event) => {
      const detail = (e as CustomEvent<PullRefreshDetail>).detail
      if (detail?.scope !== "app-analytics") return
      detail.done = new Promise<void>((resolve) => pullWaiters.current.push({ seen: false, resolve }))
      setTick((n) => n + 1)
    }
    window.addEventListener(PULL_REFRESH_EVENT, onPull)
    return () => window.removeEventListener(PULL_REFRESH_EVENT, onPull)
  }, [])
  useEffect(() => {
    if (reportsState.loading) {
      for (const w of pullWaiters.current) w.seen = true
      return
    }
    const done = pullWaiters.current.filter((w) => w.seen)
    pullWaiters.current = pullWaiters.current.filter((w) => !w.seen)
    for (const w of done) w.resolve()
  }, [reportsState.loading, tick])

  const answer = reportsState.data
  /*
    SOFT ONLY WHILE THE FIGURES ARE THE WRONG ONES: a new period, place or
    product is on its way. The minute refresh asks the same question again
    silently, and an answer that brings nothing new changes nothing on
    screen (analytics-reports useAnalyticsReports).
  */
  const isRefreshing = reportsState.stale

  /*
    WHAT THE PAGE IS WAITING FOR, AS THE PERSON SEES IT: the figures of this
    question (a first visit, or a new period, place or product, while the
    last ones stay on screen, blurred), or the lists under them once the
    figures are in. While either lasts, the app's slim progress line runs
    along the top of the figures' card (components/app/loading-line: nothing
    for 300ms), and after COUNTING_NOTE_MS a quiet line over the chart says
    what the wait is.
  */
  const waitingFigures = reportsState.loading && (!answer || reportsState.stale)
  const waitingLists = reportsState.loading && !!answer && !!answer.reports.partial
  const waitingKey = `${period.preset ?? ""}|${period.start}|${period.end}|${propertyKey}|${selectedProduct}`

  /* The row follows the chosen tab on a phone; the swipe itself is the browser's. */
  const metricStripRef = useTabStrip<HTMLDivElement>(chartMetricFilter, TAB_ORDER)
  const trendData = useMemo<AnalyticsChartData[]>(() => {
    if (!answer) return []
    const r = answer.reports
    const c = r.compared
    const percent = (x: number | null | undefined) => (x === null || x === undefined ? null : Number((x * 100).toFixed(2)))
    return r.visitors.series.labels.map((date: string, i: number) => ({
      date,
      views: r.visitors.series.current[i] ?? 0,
      sales: r.orders.series.current[i] ?? 0,
      revenue: r.sales.series.current[i] ?? 0,
      refunds: r.refunds.series.current[i] ?? 0,
      conversion: percent(r.conversion.series.current[i]),
      ...(c
        ? {
            prev_views: r.visitors.series.previous[i] ?? 0,
            prev_sales: r.orders.series.previous[i] ?? 0,
            prev_revenue: r.sales.series.previous[i] ?? 0,
            prev_refunds: r.refunds.series.previous[i] ?? 0,
            prev_conversion: percent(r.conversion.series.previous[i]),
          }
        : {}),
    }))
  }, [answer])

  /** A flat series across the selected range, drawn until the first answer lands. */
  const skeletonTrend = useMemo<AnalyticsChartData[]>(() => {
    return trendLabelsFor(safeSpan, timeZone)
      .slice(-TREND_SKELETON_MAX)
      .map((date) => ({ date, views: 0, sales: 0, revenue: 0 }))
  }, [safeSpan, timeZone])

  /** Nothing has arrived yet, so what is on screen is the placeholder. */
  const chartIsLoading = trendData.length === 0
  const chartDisplayData = useMemo(() => (chartIsLoading ? skeletonTrend : trendData).map((d) => ({ ...d })), [chartIsLoading, skeletonTrend, trendData])

  /* ── The four figures ─────────────────────────────────────────────────── */
  const figures = useMemo(() => {
    if (!answer) return null
    const r = answer.reports
    /* All time is known for every place together and every product (analytics_all_time). */
    const all = answer.allTime
    return {
      views: { value: r.visitors.value, previous: r.visitors.previous, allTime: null },
      revenue: { value: r.sales.value, previous: r.sales.previous, allTime: all?.salesCents ?? null },
      orders: { value: r.orders.value, previous: r.orders.previous, allTime: all?.orders ?? null },
      conversion: {
        value: r.conversion.value === null ? null : r.conversion.value * 100,
        previous: r.conversion.previous === null ? null : r.conversion.previous * 100,
        allTime: null,
      },
      pageViews: r.views.value,
    }
  }, [answer])

  const zero: Figure = { value: 0, previous: 0, allTime: null }
  const shown = figures ?? { views: zero, revenue: zero, orders: zero, conversion: { value: null, previous: null, allTime: null }, pageViews: 0 }
  /* Nothing has come back yet: the tabs draw soft (MetricTab `loading`) and clear to the real figures when they land. */
  const figuresLoading = !answer
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
  const formatRate = (pct: number | null) => (pct === null ? "–" : `${pct > 0 && pct < 10 ? pct.toFixed(1).replace(/\.0$/, "") : Math.round(pct)}%`)
  const allTime = (f: Figure, fmt: (n: number) => string, fallback: string) =>
    f.allTime === null ? fallback : `${fmt(f.allTime)} ${t("dashboard.allTime")}`

  return (
    <CompareContext.Provider value={compareLabel}>
    <div className="h-full overflow-y-auto page-scroll bg-[#fafafa] select-none overscroll-none app-page-enter" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none", overscrollBehavior: "none" } as React.CSSProperties}>
      {/* Try Pro at the top of the page (components/app/announcement-bar-mobile). */}
      <TryProStrip />

      {/*
        PULLED DOWN, THE PAGE UNDER THE PURPLE BAR MOVES, NOT THE BAR. The
        pull wrapped the whole page in page.tsx, the bar included, so a pull
        slid the bar down the screen and the spinner turned above it, over
        the gap it left. Round 12: "the pull to refresh indicator sits BELOW
        the purple announcement bar, like the /app home dashboard". The bar
        stays put; the room the pull opens, and the spinner in it, are under
        page's figures through the "app-analytics" event (no router.refresh
        here: a transition while the wrapper is translated duplicated the
        header and tabs).
      */}
      <PullToRefreshEvent scope="app-analytics">
      <div className="app-gutter py-6 max-w-[1200px] mx-auto space-y-6">
        <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">{t("analytics.title")}</h1>

        {/* The period and the place side by side, the product at the end. No comparison control.
            On a phone one row that scrolls sideways, as the figures below do: a longer label
            (a product's name, a custom range) never wraps it onto a second row and pushes
            the page down. */}
        <div className="orders-strip app-gutter-bleed flex items-center justify-between gap-2 overflow-x-auto sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0" data-analytics-controls="">
          <div className="flex shrink-0 items-center gap-2">
            <DateRangePicker value={period} onChange={setPeriod} today={today} />
            <PropertyPicker options={options} value={property} onChange={setProperty} />
          </div>

          {/* Which product: the date picker's button, list and sheet (components/app/product-picker). */}
          <div className="shrink-0">
            <ProductPicker products={products} value={selectedProduct} onChange={setSelectedProduct} align="end" />
          </div>
        </div>

        {/* The four figures and the chart of the one chosen */}
        <div className="relative bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden" aria-busy={waitingFigures || waitingLists}>
          <LoadingLine active={waitingFigures || waitingLists} />
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
            <MetricTab tab="views" className={STRIP_TAB} label={t("dashboard.visitors")} value={formatCompactNumber(shown.views.value ?? 0)} change={changeOf(shown.views)} selected={chartMetricFilter === "views"} soft={soft} loading={figuresLoading} foot={`${formatCompactNumber(shown.pageViews)} ${t("dashboard.pageViews")}`} onSelect={() => setChartMetricFilter("views")} />
            <MetricTab tab="revenue" className={STRIP_TAB} label={t("analytics.totalRevenue")} value={formatPrice(shown.revenue.value ?? 0)} change={changeOf(shown.revenue)} selected={chartMetricFilter === "revenue"} soft={soft} loading={figuresLoading} foot={allTime(shown.revenue, formatPrice, "Less refunds")} onSelect={() => setChartMetricFilter("revenue")} />
            <MetricTab tab="orders" className={STRIP_TAB} label={t("analytics.totalOrders")} value={formatCompactNumber(shown.orders.value ?? 0)} change={changeOf(shown.orders)} selected={chartMetricFilter === "orders"} soft={soft} loading={figuresLoading} foot={allTime(shown.orders, formatCompactNumber, "Paid and free")} onSelect={() => setChartMetricFilter("orders")} />
            <MetricTab tab="conversion" className={STRIP_TAB} label={t("analytics.conversionRate")} value={formatRate(shown.conversion.value)} change={changeOf(shown.conversion)} selected={chartMetricFilter === "conversion"} soft={soft} loading={figuresLoading} foot={t("dashboard.ordersPerVisitor")} onSelect={() => setChartMetricFilter("conversion")} />
          </div>

          <div className="border-t border-[#e5e7eb]/60 px-2 pt-7 pb-3 sm:px-4 sm:pb-4">
            <div className="relative">
              <div
                /* The placeholder is not blurred: the frame IS the loading
                   state. The blur belongs to a refetch, where real numbers
                   are being replaced and going soft says so. */
                className={`transition-[opacity,filter] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  chartIsLoading ? "opacity-100 blur-0" : isRefreshing ? "opacity-40 blur-[1.5px]" : "opacity-100 blur-0"
                }`}
              >
                <AnalyticsChartWithTooltip
                  chartDisplayData={chartDisplayData}
                  isLoading={chartIsLoading}
                  analyticsMode="store"
                  chartMetricFilter={chartMetricFilter}
                  onePageChartFilter="views"
                  formatPrice={formatPrice}
                  compareLabel={compareLabel}
                  seriesLabels={SERIES_LABELS}
                />
                {/* ALWAYS THERE, so nothing under it moves: its words are the period's, known before any number is. */}
                <div className="mt-2">
                  <ChartLegend range={period} compare={comparedRange} />
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
              {waitingFigures ? (
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
            </div>
          </div>
        </div>

        {/* The reports under the chart, from the same answer. */}
        <AnalyticsReports state={reportsState} property={property} />
        {/* Units, shipping, what is waiting to ship and stock: only while physical commerce is on. */}
        <PhysicalAnalyticsCard span={safeSpan} />
      </div>
      </PullToRefreshEvent>

    </div>
    </CompareContext.Provider>
  )
}
