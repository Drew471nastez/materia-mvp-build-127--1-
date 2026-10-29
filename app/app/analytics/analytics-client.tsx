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
 * THERE IS NO COMPARISON CONTROL ("get rid of the comparison selector").
 * Every percentage is against the period just before, the same number of
 * days ending the day before, cut at the same hour while the period is still
 * running (lib/date-range/range compareBounds), and All time against nothing.
 * Those very instants go to every read on the page: the chart and its cards,
 * the sales reports and the communities, so every "was" on it is the same
 * stretch of time.
 *
 * WHAT IS DRAWN FOLLOWS WHAT THE SELLER SELLS AND HAS (lib/analytics/
 * sections): shipping for one who sells something physical, downloads for
 * digital products, the OnePage's links for the OnePage, communities for one
 * who runs one. A seller of both kinds sees every figure for both together
 * and the split where it matters: the sales breakdown's Digital and Physical
 * columns, each top product named by its kind, and the Shipping card only
 * once the period has a physical order. There is no All / Digital /
 * Physical switch: "it doesn't make sense ... on mobile there are so many
 * things". An old link's `?kind=` is dropped from the address. A seller with
 * nothing to sell yet sees the visits and one line saying where sales will
 * be, not a row of zeros. And the reports they added, read on the server
 * with the page so they are on the first paint (./add-reports), as cards of
 * their own after the rest, with the Add report tile under the last of them.
 *
 * EXPORT, the last control in the period's row (no row of its own): a
 * dialog to choose the reports and the file, one CSV or a zip of CSVs
 * (./export-button, app/api/analytics/export).
 */

import { CommerceReports } from "./commerce-reports"
import { CommunityReports, type CommunityPlace } from "./community-reports"
import { AddReportButton, ReportPicker, reportActions, useAddedReports } from "./add-reports"
import { ExportButton } from "./export-button"
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { PULL_REFRESH_EVENT, PullToRefreshEvent, type PullRefreshDetail } from "@/components/ui/pull-to-refresh"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { TrendingDown, TrendingUp } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { TryProStrip } from "@/components/app/announcement-bar-mobile"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { usePeriodParams } from "@/components/app/use-period-params"
import { ProductPicker } from "@/components/app/product-picker"
import { PropertyPicker } from "@/components/app/property-picker"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { boundsOf, compareBounds, compareRange, rangeLabel, type CompareValue, type DateRange } from "@/lib/date-range/range"
import { kindOfProduct, modeFor, profileOf, reportOptions, reportShown, sectionsFor, sellsOf, type ReportId, type SalesMode } from "@/lib/analytics/sections"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { KindPicker } from "@/components/app/kind-picker"
import { EXPORT_REPORTS, type ExportReport } from "@/lib/analytics/export-csv"
import { propertyLabel } from "@/lib/analytics/properties"
import { bucketLabel, bucketStarts, grainFor, type Span } from "@/lib/analytics/buckets"
import { DEFAULT_PROPERTY, ownsProperty, parseProperty, propertyOptions, propertyParam, type CreatorProperties, type PropertySelector } from "@/lib/analytics/properties"
import { AnalyticsReports, ReportDetailHost, prefetchReports, useAnalyticsReports } from "./analytics-reports"
import { prefetchCommerce } from "./commerce-reports"
import { reportKey, reportNow } from "@/lib/analytics/report-cache"
import { ViewReport } from "./report-detail"
import { AnalyticsChartWithTooltip, CHART_COLORS, type AnalyticsChartData } from "@/components/app/analytics-chart"
import { MetricTab, MetricTabLine } from "@/components/app/metric-tab"
import { TAB_STRIP_STYLE, useTabStrip } from "@/components/app/use-tab-strip"
import { useEdgeFade } from "@/components/app/use-edge-fade"
import { StripArrow } from "@/components/app/strip-arrow"
import { HoverNote } from "@/components/app/help-label"
import { LoadingLine } from "@/components/app/loading-line"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { useStoreCurrency } from "@/lib/store/currency-context"
import { formatMinor } from "@/lib/markets/money"

/* The four figures that always show, in order. A seller can add more (./add-reports). "views" is the Visitors tab. */
const CORE_TABS = ["views", "revenue", "orders", "conversion"] as const
/* A seller with nothing to sell yet: the visits, not three figures of zero sales. */
const TRAFFIC_TABS = ["views", "pageviews", "clicks"] as const
/* Each tab keeps its width in the phone's row, the home page's 130px. */
const STRIP_TAB = "flex-shrink-0 min-w-[130px] md:min-w-0"
/* The first line's name in the chart's readout. */
const SERIES_LABELS = { get views() { return tt("Visitors") } }

interface Product {
  id: string
  title: string
  thumbnail_url?: string | null
  type?: string | null
}

interface AnalyticsClientProps {
  creatorId: string
  userId: string
  products: Product[]
  /** The creator's places, read on the server (lib/analytics/report-read creatorProperties). */
  properties: CreatorProperties
  /** The communities the seller runs, published or archived (a draft has had no visitor). */
  communities?: CommunityPlace[]
  /** The reports the seller added, read on the server; null when none were ever saved there. */
  savedReports?: ReportId[] | null
}

type ChartMetricFilter = "views" | "orders" | "revenue" | "conversion" | "pageviews" | "clicks"

interface Figure {
  /** Null only for a rate with nothing to divide by. */
  value: number | null
  previous: number | null
  allTime: number | null
}

/** What every percentage on the page is measured against. */
const PREVIOUS_PERIOD: CompareValue = { mode: "previous_period" }
type AnalyticsView = "all" | "digital" | "physical" | "communities"

/** How long a switch may take before the figures on screen dim: a quicker answer, or one kept, swaps them with no dim. */
export const SOFT_AFTER_MS = 150

/** True once `on` has stayed true for `ms`; false the moment it is not. */
function useLateFlag(on: boolean, ms: number): boolean {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!on) {
      setLate(false)
      return
    }
    const t = window.setTimeout(() => setLate(true), ms)
    return () => window.clearTimeout(t)
  }, [on, ms])
  return on && late
}

/** How long the figures are waited for before the page says it is counting: "after ~2.5 s a quiet line". */
export const COUNTING_NOTE_MS = 2500

/** One formatter for the page. Constructing an Intl.NumberFormat is not free. */

/**
 * What the percentages are measured against: "Dec 1–Dec 31, 2025", the
 * period just before, or null for All time, which has nothing before it.
 */
export const CompareContext = createContext<string | null>("the previous period")

/** `lowerIsBetter`: a figure that should fall (members who left, cancellations) is green when it falls, grey when it rises. */
export function PercentChangeIndicator({ current, previous, lowerIsBetter = false }: { current: number | null; previous: number | null; lowerIsBetter?: boolean }) {
  const against = useContext(CompareContext)
  if (against === null || current === null || previous === null) return null
  if (previous === 0) {
    /* Nothing before is not "+100%": it is new, or it is still nothing. */
    return current > 0 ? (
      <HoverNote className="text-[11px] font-medium text-[#9ca3af]" note={tt("None in {against}", { against })}>
        {tt("New")}
      </HoverNote>
    ) : null
  }
  /* Against a negative period (a week of refunds) the change is measured by its size (lib/analytics/percent). */
  const change = ((current - previous) / Math.abs(previous)) * 100
  if (Math.round(change) === 0) return null
  const up = change > 0
  /* What it is measured against, in the card every hover note uses (components/app/help-label). */
  return (
    <HoverNote
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${up !== lowerIsBetter ? "text-emerald-600" : "text-[#9ca3af]"}`}
      note={tt("{value}{value2}% compared with {against}", { value: up ? "+" : "-", value2: Math.round(Math.abs(change)), against })}
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
export function ChartLegend({ range, compare, align = "center" }: { range: DateRange; compare: DateRange | null; align?: "center" | "start" }) {
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-[#6b7280] ${align === "center" ? "justify-center" : ""}`}>
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

export function AnalyticsClient({ products, userId, creatorId, properties, communities = [], savedReports = null }: AnalyticsClientProps) {
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
  /* What this seller sells and has, and so which sections are drawn for what is chosen (lib/analytics/sections). */
  const profile = useMemo(() => profileOf({ products, onePageId: properties.onePageId, websites: properties.websites, communities: communities.length }), [products, properties, communities.length])
  const sells = sellsOf(profile)
  /*
    WHAT IS LOOKED AT: ALL, DIGITAL, PHYSICAL OR COMMUNITIES (round 24, the owner: "a pill shape where I can switch in
    between the digital products, communities, and physical sales, but only physical sales if they sell physical ...
    dynamically"). Only what the seller has is offered (KIND_PILLS below), and the row is drawn only when there is
    more than one thing to choose. Digital and Physical narrow every figure and card to that kind (the reports' own
    `kind`); Communities shows the communities' reports alone under the chart. Kept in the address as `?kind=`.
  */
  const physicalOn = usePhysicalCommerceEnabled()
  const kindPills = useMemo(() => {
    const out: { value: AnalyticsView; label: string }[] = []
    if (profile.digital || profile.membership) out.push({ value: "digital", label: tt("Digital") })
    if (profile.physical && physicalOn) out.push({ value: "physical", label: tt("Physical") })
    if (communities.length > 0) out.push({ value: "communities", label: tt("Communities") })
    return out.length >= 2 || (out.length === 1 && out[0].value === "communities") ? [{ value: "all" as AnalyticsView, label: tt("All types") }, ...out] : []
  }, [profile.digital, profile.membership, profile.physical, physicalOn, communities.length])
  const [view, setViewState] = useState<AnalyticsView>(() => {
    const raw = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("kind")
    return raw === "digital" || raw === "physical" || raw === "communities" ? raw : "all"
  })
  const shownView: AnalyticsView = kindPills.some((k) => k.value === view) ? view : "all"
  const setView = useCallback((next: AnalyticsView) => {
    setViewState(next)
    try {
      const url = new URL(window.location.href)
      if (next === "all") url.searchParams.delete("kind")
      else url.searchParams.set("kind", next)
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    } catch {
      /* the address is a convenience */
    }
  }, [])
  const mode: SalesMode = shownView === "digital" || shownView === "physical" ? modeFor(profile, shownView) : "all"
  const communitiesOnly = shownView === "communities"
  const chosenProduct = selectedProduct === "all" ? null : products.find((p) => p.id === selectedProduct) ?? null
  const sections = sectionsFor(profile, { property: propertyParam(property) ?? "all", productKind: chosenProduct ? kindOfProduct(chosenProduct.type) : null, mode })
  /* The reports the seller added: cards of their own after the rest, never more tabs on the chart. */
  const [added, saveAdded] = useAddedReports(creatorId, savedReports)
  const reportChoices = useMemo(() => reportOptions(profile), [profile])
  const shownAdded = added.filter((id) => reportShown(id, profile, { property: propertyParam(property) ?? "all", productKind: chosenProduct ? kindOfProduct(chosenProduct.type) : null, mode }))
  const actions = reportActions(added, saveAdded)
  const [picking, setPicking] = useState(false)
  /* A report just added is brought into view once it is on screen, wherever the picker was opened from. */
  const reveal = useRef<ReportId | null>(null)
  const saveFromPicker = useCallback(
    (next: ReportId[]) => {
      reveal.current = next.find((id) => !added.includes(id)) ?? null
      saveAdded(next)
    },
    [added, saveAdded],
  )
  useLayoutEffect(() => {
    const id = reveal.current
    if (!id) return
    reveal.current = null
    const el = document.querySelector<HTMLElement>(`[data-card="${id}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" })
  }, [added])
  /* The chart is these four, or the visits alone for a seller with nothing to sell yet. Added reports are cards under it, never more tabs here. */
  const tabOrder: readonly ChartMetricFilter[] = sells === "none" ? TRAFFIC_TABS : CORE_TABS

  /* Asked again every minute, so a sale shows up without a reload. Not while
     the tab or the app is in the background: coming back asks at once when a
     minute has gone by, so what is on screen is as fresh as it was before. */
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let last = Date.now()
    const again = () => {
      if (document.visibilityState === "hidden") return
      if (Date.now() - last < 59_000) return
      last = Date.now()
      setTick((n) => n + 1)
    }
    const id = setInterval(again, 60_000)
    document.addEventListener("visibilitychange", again)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", again)
    }
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

  const storeCurrency = useStoreCurrency()
  const exportQuery = useMemo(() => {
    const q = new URLSearchParams({ start: new Date(safeSpan.start).toISOString(), end: new Date(safeSpan.end).toISOString(), tz: timeZone, product: selectedProduct, property: propertyKey })
    if (against) {
      q.set("cstart", new Date(against.start).toISOString())
      q.set("cend", new Date(against.end).toISOString())
    } else q.set("compare", "none")
    return q.toString()
  }, [safeSpan, against, timeZone, selectedProduct, propertyKey])
  const exportName = `storelib-analytics-${period.start}-to-${period.end}`
  /* The reports the dialog lists: what this page draws for what is chosen. */
  const exportOptions = useMemo<ExportReport[]>(
    () => EXPORT_REPORTS.filter((id) => (id === "sales" ? sections.sales : id === "products" ? sections.topProducts : id === "subscribers" ? sections.subscribers : true)),
    [sections.sales, sections.topProducts, sections.subscribers],
  )
  const exportRange = `${rangeLabel(period)} · ${propertyLabel(properties, property)}${chosenProduct ? ` · ${chosenProduct.title}` : ""}`
  /* The page's question as the reports ask it: an opened report asks its rows' own lines with it (analytics-reports ReportDetailHost). */
  const rowsQuestion = useMemo(
    () => reportKey({ start: safeSpan.start, end: safeSpan.end, compare: against, product: selectedProduct, property: propertyKey, timeZone, currency: storeCurrency, kind: mode }),
    [safeSpan, against, selectedProduct, propertyKey, timeZone, storeCurrency, mode],
  )
  const reportsState = useAnalyticsReports({
    start: safeSpan.start,
    end: safeSpan.end,
    compare: against,
    product: selectedProduct,
    property: propertyKey,
    refresh: tick,
    viewer: userId,
    currency: storeCurrency,
    kind: mode,
  })
  /*
    READ AHEAD ON INTENT (round 41): a pointer resting on Digital, Physical or All, or a finger landing on it, starts
    that view's figures and sales reports, so the tap that follows is usually answered from memory. A question already
    answered recently, or on its way, asks nothing more (lib/analytics/report-cache joins it).
  */
  const warmView = useCallback(
    (v: AnalyticsView) => {
      if (v === shownView || v === "communities") return
      const kind = v === "all" ? "all" : modeFor(profile, v)
      prefetchReports({ start: safeSpan.start, end: safeSpan.end, compare: against, product: selectedProduct, property: propertyKey, currency: storeCurrency, kind }, userId)
      prefetchCommerce({ start: safeSpan.start, end: safeSpan.end, compare: against, product: selectedProduct, property: propertyKey, timeZone, currency: storeCurrency, kind }, userId)
    },
    [shownView, profile, safeSpan, against, selectedProduct, propertyKey, storeCurrency, timeZone, userId],
  )
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
    DIMMED ONLY ONCE THE WAIT IS FELT (round 41, the owner: "switching ... sometimes takes too long or flashes"). An
    answer kept for the question, or one that lands within SOFT_AFTER_MS, replaces the figures with no dim at all:
    the figures used to blur and fade for every switch, even the ones answered from memory, and the next frame swapped
    them sharp, which is the flash. A longer wait dims them slightly, in place, until the new ones land.
  */
  const softLate = useLateFlag(isRefreshing, SOFT_AFTER_MS)

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
  const waitingKey = `${period.preset ?? ""}|${period.start}|${period.end}|${propertyKey}|${selectedProduct}|${mode}`

  /* The row follows the chosen tab on a phone; the swipe itself is the browser's. */
  const metricStripRef = useTabStrip<HTMLDivElement>(chartMetricFilter, tabOrder)
  const pickersRef = useEdgeFade<HTMLDivElement>()
  const revealRef = useRevealCards()
  /*
    Round 41: the 260ms fade from 25% that used to play on every new answer is gone. Played over figures that were
    already dimmed to 60%, it dipped them darker first and then up, and over figures answered from memory it was the
    only thing that moved: both read as a flash. The figures now go from dimmed (only after SOFT_AFTER_MS) to sharp by
    their own opacity transition. Was round 25: A NEW PERIOD ARRIVES, IT IS NOT CUT IN (round 25, the owner: "time frame apply on Orders and Analytics: a smooth
    reveal"). When the figures of another period, place, product or kind are on screen (landed, or read from what was
    kept, which used to swap with no wait and no fade at all), the figures and the cards already holding the answer
    come in from a shade over 260ms, as a new period's orders do (app/globals.css .orders-reveal): opacity only, the
    ones on screen only. Cards still on their way fade back in by themselves as theirs land (analytics-reports `soft`).
  */
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
      pageViews: r.views.series.current[i] ?? 0,
      clicks: r.linkClicks?.series.current[i] ?? 0,
      conversion: percent(r.conversion.series.current[i]),
      ...(c
        ? {
            prev_views: r.visitors.series.previous[i] ?? 0,
            prev_sales: r.orders.series.previous[i] ?? 0,
            prev_revenue: r.sales.series.previous[i] ?? 0,
            prev_refunds: r.refunds.series.previous[i] ?? 0,
            prev_pageViews: r.views.series.previous[i] ?? 0,
            prev_clicks: r.linkClicks?.series.previous[i] ?? 0,
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
      pageviews: { value: r.views.value, previous: r.views.previous, allTime: null },
      refunds: {
        value: (r.refunds?.series.current ?? []).reduce((a, b) => a + b, 0),
        previous: (r.refunds?.series.previous ?? []).reduce((a, b) => a + b, 0),
        allTime: null,
      },
      clicks: {
        value: r.linkClicks?.value ?? 0,
        previous: (r.linkClicks?.series.previous ?? []).reduce((a, b) => a + b, 0),
        allTime: null,
      },
      pageViews: r.views.value,
      visits: r.sessions?.value ?? 0,
    }
  }, [answer])

  const zero: Figure = { value: 0, previous: 0, allTime: null }
  const shown = figures ?? { views: zero, revenue: zero, orders: zero, conversion: { value: null, previous: null, allTime: null }, pageviews: zero, refunds: zero, clicks: zero, pageViews: 0, visits: 0 }
  /* Nothing has come back yet: the tabs draw soft (MetricTab `loading`) and clear to the real figures when they land. */
  const figuresLoading = !answer
  const soft = softLate && !figuresLoading

  /*
    STABLE, because the chart below is memoised and this is one of its props.
    A new function identity on every render would re-render recharts each
    time anything on this page changed.
  */
  /* In the store's own currency (Settings › Languages & Currency), as its prices and orders are: a store in lei reads lei, never dollars. */
  /* Minor units in the store's own decimals: a yen store's ¥2,500 is 2500, never ¥25. */
  const formatPrice = useCallback((cents: number) => formatMinor(cents, storeCurrency, appLocale()), [storeCurrency])
  const formatCompactNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    if (num >= 10_000) return `${Math.round(num / 1000)}k`
    if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}k`
    return Math.round(num).toLocaleString(appLocale())
  }
  const formatRate = (pct: number | null) => (pct === null ? "–" : `${pct > 0 && pct < 10 ? pct.toFixed(1).replace(/\.0$/, "") : Math.round(pct)}%`)
  const allTime = (f: Figure, fmt: (n: number) => string, fallback: string) =>
    f.allTime === null ? fallback : `${fmt(f.allTime)} ${t("dashboard.allTime")}`

  return (
    <CompareContext.Provider value={compareLabel}>
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] select-none overscroll-none app-page-enter" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none", overscrollBehavior: "none" } as React.CSSProperties}>
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
      {/* Every card and every figure opens its report beside the page (./report-detail, analytics-reports ReportDetailHost). */}
      <ReportDetailHost state={reportsState} range={rangeLabel(period)} against={compareLabel} question={rowsQuestion}>
      <div ref={revealRef} className="app-gutter py-6 max-w-[1200px] mx-auto space-y-6">
        {/* The heading alone. Add report is the tile under the last card; Export is the last control in the row below. */}
        <div className="flex items-center gap-3" data-analytics-head="">
          <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">{t("analytics.title")}</h1>
        </div>

        {/* THE FILTERS, ONE ROW IN ONE ORDER (the owner: "arrange the whole control area with UX in mind"): the
            period, the place, the product, then what is shown (All types, Digital, Physical, Communities), and
            Export, the one action, at the row's end. Round 42 (the owner: "like the Emails subscribers filters"):
            every filter is the Emails toolbar's chip, 28px, small text and a chevron, dashed while it is at its
            default (All pages, All products, All types) and filled once it narrows the page, so a glance says
            which filters are on; the period always is (app/globals.css [data-filter-chips]).
            On a phone the filters are ONE row that scrolls sideways, with momentum and no bar, fading where it is
            cut (components/app/use-edge-fade), and Export stays put at its right end as an icon, so it never
            scrolls off the screen. On a computer they sit together from the left and Export says its name. Each
            picker opens its sheet through a portal, so the scroller clips none of them. The 4px around the
            strip are the chips' rings. */}
        <div className="flex items-center gap-2" data-analytics-controls="" data-filter-chips="">
          <div
            ref={pickersRef}
            data-scroll-x
            className="orders-strip edge-fade -my-1 -ml-[var(--app-gutter)] flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain py-1 pl-[var(--app-gutter)] pr-1 [&>*]:shrink-0 touch-pan-x touch-pan-y sm:-ml-1 sm:pl-1"
            data-analytics-pickers=""
          >
            <DateRangePicker value={period} onChange={setPeriod} today={today} />
            <PropertyPicker options={options} value={property} onChange={setProperty} />
            {/* Which product: the date picker's button, list and sheet (components/app/product-picker). */}
            {products.length ? <ProductPicker products={products} value={selectedProduct} onChange={setSelectedProduct} align="start" /> : null}
            {/* What is shown, when there is a choice: one chip like the others, its list in a popover or the sheet (components/app/kind-picker). A pointer resting on a row reads it ahead. */}
            {kindPills.length ? <KindPicker options={kindPills} value={shownView} onChange={setView} onIntent={warmView} allLabel={tt("All types")} /> : null}
          </div>
          <ExportButton query={exportQuery} name={exportName} options={exportOptions} range={exportRange} />
        </div>

        {/* The four figures and the chart of the one chosen */}
        <div className="relative bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden" aria-busy={waitingFigures || waitingLists}>
          <LoadingLine active={waitingFigures || waitingLists} />
          {/* One row that scrolls sideways on a phone, like the home page's
              (components/app/use-tab-strip), and four columns from md up. */}
          <div
            ref={metricStripRef}
            role="tablist"
            aria-label={tt("Metric")}
            data-scroll-x
            className={`relative flex divide-x divide-[#e5e7eb]/60 overflow-x-auto scrollbar-hide md:grid ${tabOrder.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4"}`}
            style={TAB_STRIP_STYLE}
          >
            {/* One grey line for the row, sliding to the tab chosen (components/app/metric-tab MetricTabLine). */}
            <MetricTabLine value={chartMetricFilter} />
            {tabOrder.map((tab) => {
              const spec = {
                /* With the page views a tab of their own (nothing to sell yet), the visitors' line says their visits instead. */
                views: { label: t("dashboard.visitors"), value: formatCompactNumber(shown.views.value ?? 0), change: changeOf(shown.views), foot: sells === "none" ? tt("{count, plural, one {# visit} other {# visits}}", { count: shown.visits }) : `${formatCompactNumber(shown.pageViews)} ${t("dashboard.pageViews")}` },
                pageviews: { label: tt("Page views"), value: formatCompactNumber(shown.pageviews.value ?? 0), change: changeOf(shown.pageviews), foot: tt("Pages opened") },
                clicks: { label: tt("Link clicks"), value: formatCompactNumber(shown.clicks.value ?? 0), change: changeOf(shown.clicks), foot: tt("Links tapped") },
                revenue: { label: t("analytics.totalRevenue"), value: formatPrice(shown.revenue.value ?? 0), change: changeOf(shown.revenue), foot: allTime(shown.revenue, formatPrice, tt("Less refunds")) },
                orders: { label: t("analytics.totalOrders"), value: formatCompactNumber(shown.orders.value ?? 0), change: changeOf(shown.orders), foot: allTime(shown.orders, formatCompactNumber, tt("Paid and free")) },
                conversion: { label: t("analytics.conversionRate"), value: formatRate(shown.conversion.value), change: changeOf(shown.conversion), foot: t("dashboard.ordersPerVisitor") },
              }[tab]
              return <MetricTab key={tab} tab={tab} className={STRIP_TAB} label={spec.label} value={spec.value} change={spec.change} selected={chartMetricFilter === tab} soft={soft} loading={figuresLoading} foot={spec.foot} onSelect={() => setChartMetricFilter(tab)} line={false} />
            })}
            {/* More figures that way: the home chart's arrow, which pages the row along and turns back at its end. */}
            <StripArrow className="md:hidden" />
          </div>

          <div className="border-t border-[#e5e7eb]/60 px-2 pt-7 pb-3 sm:px-4 sm:pb-4">
            <div className="relative">
              <div
                /* The placeholder is not blurred: the frame IS the loading
                   state. The blur belongs to a refetch, where real numbers
                   are being replaced and going soft says so. */
                data-chart-soft=""
                className={`transition-opacity duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  chartIsLoading ? "opacity-100" : softLate ? "opacity-60" : "opacity-100"
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
                <div className="mt-2 flex min-h-8 items-center justify-between gap-3 pl-2 sm:pl-0">
                  <ChartLegend range={period} compare={comparedRange} align="start" />
                  {/* The figure chosen, opened: its line, every day of it and what makes it up (./report-detail). */}
                  <ViewReport id={`metric:${chartMetricFilter}`} className="mr-0" />
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
                  <span className="rounded-md bg-white/85 px-2 py-0.5 text-center text-[13px] text-[#6b7280]">{tt("Counting visits for this range")}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* The store's sales reports, for the same period, comparison, place and product as the chart (./commerce-reports). Physical sales are in the chart, the figures and Top products like any other sale; shipping and fulfilment only for a seller who ships or has a published website. */}
        {communitiesOnly ? (
          <CommunityReports communities={communities} span={safeSpan} compare={against} timeZone={timeZone} refresh={tick} />
        ) : sections.sales ? (
          <CommerceReports
            span={safeSpan}
            compare={against}
            timeZone={timeZone}
            product={selectedProduct}
            property={propertyKey}
            showShipping={sections.shipping}
            showFulfillment={sections.fulfillment}
            showKinds={sections.productKinds}
            kind={mode}
            viewer={userId}
            refresh={tick}
            rangeText={rangeLabel(period)}
            againstText={compareLabel}
          />
        ) : (
          <p data-no-sales="" className="rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-4 text-[14px] text-[#6b7280] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {tt("Sales, orders and customers show here after your first product.")}{" "}
            <Link href="/app/products/new" className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">{tt("Add a product")}</Link>
          </p>
        )}
        {/* The reports under the chart, from the same answer, with the communities and the reports the seller added. */}
        {communitiesOnly ? null : <AnalyticsReports
          state={reportsState}
          property={property}
          sections={sections}
          extra={sections.communities ? <CommunityReports communities={communities} span={safeSpan} compare={against} timeZone={timeZone} refresh={tick} /> : null}
          added={{ ids: shownAdded, ...actions }}
        />}
        {/* The grid's last tile, the full width: where the next report goes. */}
        <AddReportButton marker="add-more" label={tt("Add report")} onClick={() => setPicking(true)} />

        <ReportPicker open={picking} onOpenChange={setPicking} options={reportChoices} added={added} onSave={saveFromPicker} />
      </div>
      </ReportDetailHost>
      </PullToRefreshEvent>

    </div>
    </CompareContext.Provider>
  )
}

/**
 * THE CARDS COME UP AS THEY ARE REACHED (round 23). Every report card (`section[data-card]`) under the screen when it
 * is first seen here waits (`data-reveal="wait"`, app/globals.css) until a sliver of it is in the page's scroller,
 * then rises in and its bars grow. A card already on screen is never touched, so the first paint is the page as it
 * is; cards that arrive later (a report added, a property switched) are taken as they mount. Under reduced motion,
 * nothing waits.
 */
/*
  A CHART'S LINE DRAWS ITSELF IN as its card arrives (round 24, "the chart lines should appear very smooth and clean"):
  each solid line of the card's charts runs from its first point to its last over 900ms, by its own length as a dash,
  and is put back as it was once it has. A dashed line (the period before) is left as it is, and comes in with the card.
*/
function drawLines(card: HTMLElement) {
  card.querySelectorAll<SVGPathElement>("svg path").forEach((path) => {
    const cs = getComputedStyle(path)
    if (cs.stroke === "none" || (cs.strokeDasharray && cs.strokeDasharray !== "none") || (cs.fill !== "none" && cs.fill !== "rgba(0, 0, 0, 0)")) return
    let length = 0
    try {
      length = path.getTotalLength()
    } catch {
      return
    }
    if (!(length > 4)) return
    path.style.transition = "none"
    path.style.strokeDasharray = `${length}`
    path.style.strokeDashoffset = `${length}`
    path.getBoundingClientRect()
    path.style.transition = "stroke-dashoffset 900ms cubic-bezier(0.33, 1, 0.68, 1)"
    path.style.strokeDashoffset = "0"
    window.setTimeout(() => {
      path.style.transition = ""
      path.style.strokeDasharray = ""
      path.style.strokeDashoffset = ""
    }, 960)
  })
}

function useRevealCards() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root || typeof IntersectionObserver === "undefined") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const scroller = root.closest<HTMLElement>(".page-scroll")
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          ;(e.target as HTMLElement).removeAttribute("data-reveal")
          drawLines(e.target as HTMLElement)
          io.unobserve(e.target)
        }
      },
      { root: scroller, rootMargin: "0px 0px -6% 0px", threshold: 0.01 },
    )
    const arm = (el: HTMLElement) => {
      if (el.hasAttribute("data-reveal-armed") || el.parentElement?.closest("section[data-card]")) return
      el.setAttribute("data-reveal-armed", "")
      const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight
      if (el.getBoundingClientRect().top < bottom) return
      el.setAttribute("data-reveal", "wait")
      io.observe(el)
    }
    const armAll = () => root.querySelectorAll<HTMLElement>("section[data-card]").forEach(arm)
    armAll()
    /* Once a frame at most: the chart's morph changes the page every frame while it runs. */
    let queued = 0
    const mo = new MutationObserver(() => {
      if (!queued) queued = requestAnimationFrame(() => ((queued = 0), armAll()))
    })
    mo.observe(root, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      io.disconnect()
      cancelAnimationFrame(queued)
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => el.removeAttribute("data-reveal"))
    }
  }, [])
  return ref
}
