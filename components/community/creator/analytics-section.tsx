"use client"

/**
 * ===========================================================================
 *  A COMMUNITY'S ANALYTICS
 * ===========================================================================
 * /app/community/<id>/analytics, drawn with /app Analytics' own pieces, so
 * it reads like that page and nothing here is a second design:
 *
 *   the period     components/app/date-range-picker in the address
 *                  (use-period-params): 7, 30 and 90 days, 12 months, a
 *                  range of one's own, compared with the period just before
 *   the figures    components/app/metric-tab, in the strip that scrolls
 *                  sideways on a phone (use-tab-strip), each with its change
 *                  against the period before (analytics-client's
 *                  PercentChangeIndicator, in its hover card)
 *   the chart      components/app/analytics-chart: the line, the dashed
 *                  period before, the scrub with its readout and its tap on
 *                  a phone, the legend under it
 *   the lists      the Analytics reports' cards, rows, tabs and empty lines
 *                  (app/app/analytics/analytics-reports.tsx)
 *
 * ROUND 33, THE OWNER: "a clear overview of the most important figures,
 * then sections." So, from the top:
 *
 *   THE PERIOD     the picker alone. The Google Analytics link that stood
 *                  beside it is gone: it said nothing about the period. A
 *                  connected Google Analytics is one quiet line at the foot
 *                  of Traffic; one that is not connected is not mentioned.
 *   OVERVIEW       six figures for the period, each against the period
 *                  before: members, active members, engagement, the join
 *                  rate (visits to joins), monthly revenue (or member churn
 *                  for a community that sells nothing) and churn. Each opens
 *                  the section it belongs to, on its own figure.
 *   SECTIONS       Growth, Traffic, Engagement, Content and, for a community
 *                  that sells something, Revenue: one under the next down a
 *                  single page, each named, each a chart of its figures with
 *                  its lists beneath it.
 *
 * ROUND 35, THE OWNER: "I dont like the analytics tabs Growth Traffic
 * Engagement Content Revenue. I want one consolidated dashboard." The row of
 * section tabs that used to sit under the overview is gone, and with it the
 * reason the figures at the top had to be doors: four subjects out of five
 * were behind a press, and the row was a second tab bar under the
 * community's own. Every section is now on the page. A figure at the top
 * still takes the page to its section and picks that figure's line, so the
 * overview reads as a summary of what is below rather than a menu. An
 * address ending in #traffic starts the page at Traffic, now by scrolling to
 * it.
 *
 * NOTHING DRAWN THAT WAS NOT COUNTED. Every number is the server's
 * (lib/communities/server/analytics-report.ts) from rows; a figure the
 * database cannot count yet (SQL part 184) is not shown, and one whose
 * counting began inside the period says from when.
 *
 * ROUND 32, THE OWNER: "accurate, smooth, clean, without the loading
 * stuff, the reloading bar above the charts." So:
 *
 *   NO BAR, NO BLUR    no progress line over a card and nothing goes soft
 *                      while the figures are being replaced. The minute's
 *                      refresh is the same question, asked quietly, and an
 *                      answer that brings nothing new changes nothing on
 *                      screen.
 *   ONE ANSWER SHOWN   the dates, the legend and the lines are always the
 *                      answer on screen, never the period being asked for.
 *                      When its answer lands the lines move to it in place
 *                      (components/app/morph-lines); only a wait longer than
 *                      WAIT_DIM_MS dims the cards a little.
 *   KEPT PER PERIOD    every answer is kept by its period in this browser for
 *                      KEEP_MS (lib/communities/client/report-cache), drawn
 *                      on the first frame of a return, and asked again behind
 *                      it once it is older than FRESH_MS. Opening the period
 *                      picker asks for the usual periods ahead.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { formatCurrency } from "@/lib/markets/money"
import { MetricTab } from "@/components/app/metric-tab"
import { TAB_STRIP_STYLE, useTabStrip } from "@/components/app/use-tab-strip"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { usePeriodParams } from "@/components/app/use-period-params"
import { AnalyticsChartWithTooltip, type AnalyticsChartData } from "@/components/app/analytics-chart"
import { ChartLegend, CompareContext, PercentChangeIndicator } from "@/app/app/analytics/analytics-client"
import { ReportBody, ReportCard, ReportComparedContext, ReportEmpty, ReportList, ReportTabs, type ReportListRow } from "@/app/app/analytics/analytics-reports"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { longDate, presetRange, rangeLabel, type PresetId } from "@/lib/date-range/range"
import { bucketLabel, bucketStarts, grainFor } from "@/lib/analytics/buckets"
import { countryName, sourceName } from "@/lib/analytics/reports"
import { reportNow } from "@/lib/analytics/report-cache"
import { askCommunityReport, communityAsk, keptCommunityReport, sameReport, warmCommunityReport, FRESH_MS, type CommunityAsk, type ShownReport } from "@/lib/communities/client/report-cache"
import type { ActivityMetric, CommunityReport, ContentMetric, Figure, GrowthMetric, Line, MoneyMetric, ReportRow, TrafficMetric } from "@/lib/communities/analytics-report"
import type { AnalyticsView, CommunityHead } from "./view-types"
import { Notice } from "./parts"
import { ROW_FILL } from "@/components/ui/fill-bar"

/* ── Words ───────────────────────────────────────────────────────────── */

const SOURCE_LABEL: Record<string, string> = {
  get free() { return tt("Joined for free") },
  get subscription() { return tt("Paid membership") },
  get purchase() { return tt("One time purchase") },
  get product() { return tt("Owns a product that includes it") },
  get invite() { return tt("Invite") },
  get manual() { return tt("Added by you or your team") },
  get platform() { return tt("Added by Storelib") },
}

/* The six answers a member picks from when they leave or cancel (lib/communities/leave-reasons.ts), in the owner's words. */
const REASON_LABEL: Record<string, string> = {
  get not_for_me() { return tt("Not for me") },
  get too_busy() { return tt("No time") },
  get too_expensive() { return tt("Too expensive") },
  get content() { return tt("Not enough useful posts") },
  get people() { return tt("The people") },
  get other() { return tt("Something else") },
  get none() { return tt("No reason given") },
}

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
}

/** A visit's source in words: Storelib's own three first, then Storelib Analytics' names (Search, Instagram, Email...). */
export function visitSourceName(key: string): string {
  if (key === "explore") return tt("Explore")
  if (key === "storelib") return tt("Your Storelib pages")
  if (key === "app") return tt("Storelib app")
  return sourceName(key)
}

const DEVICE_LABEL: Record<string, string> = {
  get mobile() { return tt("Mobile") },
  get tablet() { return tt("Tablet") },
  get desktop() { return tt("Desktop") },
}

/* ── Numbers ─────────────────────────────────────────────────────────── */

const n = (v: number) => Math.round(v).toLocaleString(appLocale())
/** The tab's number, as /app Analytics writes it: 1.2k, 12k, 1.4M. */
function compact(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (num >= 10_000) return `${Math.round(num / 1000)}k`
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return Math.round(num).toLocaleString(appLocale())
}
/** Money in the overview, where six figures share a row: whole units from 100 up ("$2,680"), so the number and its change fit. */
function wholeMoney(cents: number, currency: string): string {
  const major = (cents || 0) / 100
  return formatCurrency(major, currency.toUpperCase(), appLocale(), Math.abs(major) >= 100 ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {})
}
const pct = (v: number | null) => (v === null ? "–" : `${v > 0 && v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)}%`)

/* ── The question and its answer ─────────────────────────────────────── */

/**
 * How long a new period's answer may take before the cards dim a little. A
 * quicker one (most are, and a kept or asked ahead one is there at once)
 * shows nothing but the lines moving to it.
 */
export const WAIT_DIM_MS = 450
/** The periods the picker's first rows offer, asked ahead when it is opened. */
const AHEAD: PresetId[] = ["last_7_days", "last_30_days", "last_90_days", "last_12_months"]

interface ReportState {
  /** The answer on screen, with the period it was counted for. */
  shown: ShownReport | null
  /** Asking for a period other than the one on screen. */
  waiting: boolean
  failed: boolean
}

const noSubscription = () => () => {}

/**
 * The section's one read (lib/communities/client/report-cache). A kept
 * answer for the period goes on screen before the paint, sharp; under
 * FRESH_MS old nothing is asked. A new period keeps what is on screen until
 * its answer lands, and drops the request of a period left before it came.
 * `refresh` (the minute) asks the same question again, quietly: an answer
 * that brings nothing new does not even render.
 */
function useCommunityReport(ask: CommunityAsk, refresh: number): ReportState {
  /* Not while hydrating a full load: the server drew the section without a kept answer, and the first render matches it (the layout effect adopts it, still before the paint). */
  const hydrated = React.useSyncExternalStore(noSubscription, () => true, () => false)
  const [st, setSt] = React.useState<{ shown: ShownReport | null; asking: string; loading: boolean; failed: boolean }>(() => ({
    shown: hydrated ? keptCommunityReport(ask.question) : null,
    asking: ask.question,
    loading: true,
    failed: false,
  }))
  const latest = React.useRef(ask)
  latest.current = ask
  const polled = React.useRef(refresh)
  React.useLayoutEffect(() => {
    const a = latest.current
    const known = keptCommunityReport(a.question)
    setSt((s) => {
      if (known && (!s.shown || s.shown.question !== a.question || known.at > s.shown.at)) return { shown: known, asking: a.question, loading: true, failed: false }
      return s.asking === a.question && s.loading && !s.failed ? s : { ...s, asking: a.question, loading: true, failed: false }
    })
    const poll = polled.current !== refresh
    polled.current = refresh
    if (known && !poll && Date.now() - known.at < FRESH_MS) {
      setSt((s) => (s.asking === a.question ? { ...s, loading: false } : s))
      return
    }
    let live = true
    const { promise, release } = askCommunityReport(a)
    promise
      .then((next) => {
        if (!live) return
        setSt((s) => {
          /* NOTHING NEW, NOTHING DRAWN: the minute's refresh usually brings the same numbers. */
          if (s.shown && s.shown.question === next.question && sameReport(s.shown.report, next.report)) return s.loading || s.failed ? { ...s, loading: false, failed: false } : s
          return { shown: next, asking: next.question, loading: false, failed: false }
        })
      })
      .catch((e) => {
        if (!live || (e as { name?: string })?.name === "AbortError") return
        setSt((s) => ({ ...s, loading: false, failed: true }))
      })
    return () => {
      live = false
      release()
    }
  }, [ask.question, refresh])
  const waiting = st.loading && st.asking === ask.question && st.shown?.question !== ask.question
  return { shown: st.shown, waiting, failed: st.failed && st.shown?.question !== ask.question }
}

/* ── The chart ───────────────────────────────────────────────────────── */

type Kind = "count" | "money" | "percent"

/** One metric's line as the trend chart's rows: in its first slot whatever the metric is, so a tab moves the line rather than replacing it. */
function chartRows(labels: string[], line: Line | null, kind: Kind): AnalyticsChartData[] {
  return labels.map((date, i) => {
    const v = line?.current[i] ?? null
    const p = line?.previous ? line.previous[i] ?? null : undefined
    const row: AnalyticsChartData = { date, views: 0, sales: 0, revenue: 0 }
    if (kind === "count") row.views = v ?? 0
    if (kind === "money") row.revenue = v ?? 0
    if (kind === "percent") row.conversion = v
    if (p !== undefined) {
      if (kind === "count") row.prev_views = p ?? 0
      if (kind === "money") row.prev_revenue = p ?? 0
      if (kind === "percent") row.prev_conversion = p
    }
    return row
  })
}

const FILTER: Record<Kind, string> = { count: "views", money: "revenue", percent: "conversion" }

interface TabSpec<K extends string> {
  key: K
  label: string
  value: string
  foot: React.ReactNode
  figure: Figure | null
  kind: Kind
  /** A figure that should fall: its change is green when it does. */
  lowerIsBetter?: boolean
}

/** /app Analytics' card around its figures and chart (app/app/analytics/analytics-client), class for class. */
export const TREND_CARD = "relative bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
/** Each figure's room in the strip that scrolls sideways on a phone: /app Analytics' 130px. */
const STRIP_TAB = "flex-shrink-0 min-w-[130px]"
/** What /app Analytics adds to each report card (analytics-reports Grid's `soft`), so a card is the same element on both pages. */
const REPORT_CARD = "transition-[opacity,filter] duration-300"
/** /app Analytics' report grid: two columns from md, three from xl. */
const REPORT_GRID = "grid gap-4 md:grid-cols-2 xl:grid-cols-3"

/** The dates under a chart, for the period an answer was counted for, in the viewer's language. */
function labelsFor(span: { start: number; end: number }, timeZone: string, buckets: number | null): string[] {
  const grain = grainFor(span)
  const l = bucketStarts(span, grain, timeZone).map((s) => bucketLabel(s, grain, timeZone))
  return buckets !== null && buckets !== l.length ? Array.from({ length: buckets }, (_, i) => l[i] ?? "") : l
}

/** What every chart of the section shares: the answer's dates, its legend, what it is compared with, money in its currency. */
interface ChartFrame {
  labels: string[]
  cold: boolean
  legend: React.ReactNode
  compareLabel: string | null
  formatMoney: (cents: number) => string
}

/**
 * A FIGURE STRIP AND ITS CHART: Analytics' card, figure tabs over the trend
 * chart of the one chosen, the legend under it, and a quiet line when the
 * figure's counting began inside the period. No bar along its top and
 * nothing blurred: new numbers move the line and change the figures in
 * place. `cold` is the first visit with nothing kept, drawn as /app
 * Analytics draws it (the chart's frame with its dates, the figures soft).
 */
function TrendCard<K extends string>({
  name,
  tabs,
  selected,
  onSelect,
  lines,
  frame,
  note,
  detail,
  label,
}: {
  name: string
  tabs: TabSpec<K>[]
  selected: K
  onSelect: (k: K) => void
  lines: Partial<Record<K, Line>> | null
  frame: ChartFrame
  note?: React.ReactNode
  detail?: React.ReactNode
  label: string
}) {
  const { labels, cold, formatMoney, legend, compareLabel } = frame
  const strip = useTabStrip<HTMLDivElement>(selected, tabs.map((t) => t.key))
  const tab = tabs.find((t) => t.key === selected) ?? tabs[0]
  const placeholder = cold || !lines
  const rows = React.useMemo(() => chartRows(labels, placeholder ? null : lines?.[tab.key] ?? null, tab.kind), [labels, placeholder, lines, tab.key, tab.kind])
  const seriesLabels = React.useMemo(() => ({ views: tab.label, revenue: tab.label, conversion: tab.label }), [tab.label])
  /* Four figures are /app Analytics' four columns from md; five need lg to fit, and scroll sideways below it. */
  const cols = tabs.length >= 5 ? "lg:grid lg:grid-cols-5" : tabs.length === 4 ? "md:grid md:grid-cols-4" : tabs.length === 3 ? "md:grid md:grid-cols-3" : "md:grid md:grid-cols-2"
  const wide = tabs.length >= 5 ? "lg:min-w-0" : "md:min-w-0"
  return (
    <section className={TREND_CARD} data-trend={name} aria-label={label}>
      <div ref={strip} role="tablist" aria-label={label} data-scroll-x="" className={cn("relative flex divide-x divide-[#e5e7eb]/60 overflow-x-auto scrollbar-hide", cols)} style={TAB_STRIP_STYLE}>
        {tabs.map((t) => (
          <MetricTab
            key={t.key}
            tab={t.key}
            className={cn(STRIP_TAB, wide)}
            label={t.label}
            value={t.value}
            change={t.figure ? <PercentChangeIndicator current={t.figure.value} previous={t.figure.previous} lowerIsBetter={t.lowerIsBetter} /> : null}
            foot={t.foot}
            selected={t.key === selected}
            loading={cold}
            onSelect={() => onSelect(t.key)}
          />
        ))}
      </div>
      <div className="border-t border-[#e5e7eb]/60 px-2 pt-7 pb-3 sm:px-4 sm:pb-4" data-chart-for={tab.key}>
        <AnalyticsChartWithTooltip
          chartDisplayData={rows}
          isLoading={placeholder}
          analyticsMode="store"
          chartMetricFilter={FILTER[tab.kind]}
          onePageChartFilter="views"
          formatPrice={formatMoney}
          compareLabel={compareLabel}
          seriesLabels={seriesLabels}
        />
        <div className="mt-2">{legend}</div>
        {note ? <p className="mt-2 text-center text-[12px] text-[#9ca3af]" data-trend-note="">{note}</p> : null}
      </div>
      {detail ? (
        <div className="border-t border-[#e5e7eb]/60 px-4 py-3.5 text-[13.5px] leading-relaxed text-[#4b5563] sm:px-5" data-revenue-detail={tab.key}>
          {detail}
        </div>
      ) : null}
    </section>
  )
}

/* ── The sections ────────────────────────────────────────────────────── */

export type SectionId = "growth" | "traffic" | "engagement" | "content" | "revenue"
const SECTIONS: readonly SectionId[] = ["growth", "traffic", "engagement", "content", "revenue"]

function sectionName(id: SectionId): string {
  if (id === "growth") return tt("Growth")
  if (id === "traffic") return tt("Traffic")
  if (id === "engagement") return tt("Engagement")
  if (id === "content") return tt("Content")
  return tt("Revenue")
}

/**
 * AN ADDRESS ENDING IN #traffic STARTS THE PAGE AT TRAFFIC. A browser does
 * that itself for a page it was served, but these sections are drawn in the
 * browser, so at the moment it looks for the element the hash names there is
 * nothing there yet. One scroll when the sections first exist, with no
 * animation, so the page simply begins where it was asked to.
 */
function useHashSection(root: React.RefObject<HTMLDivElement | null>) {
  React.useEffect(() => {
    const id = window.location.hash.replace(/^#/, "")
    if (!SECTIONS.includes(id as SectionId)) return
    root.current?.querySelector(`[data-analytics-section="${id}"]`)?.scrollIntoView({ block: "start" })
  }, [root])
}

/**
 * `initial` is the earlier answer (the last 30 days from the nightly rows),
 * still accepted from a page that reads it; the section asks for the period
 * in the address itself, so it draws nothing from it.
 */
export function AnalyticsSection({ head }: { head: CommunityHead; initial?: AnalyticsView | null }) {
  const timeZone = React.useMemo(() => viewerTimeZone(), [])
  const { period, setPeriod, today } = usePeriodParams(timeZone, "last_30_days")
  const root = React.useRef<HTMLDivElement>(null)

  /*
    Asked again every minute while the section is on screen, as /app
    Analytics is: not while the tab is in the background, and not while the
    community shell holds this section hidden behind another.
  */
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && root.current?.offsetParent) setTick((x) => x + 1)
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  /* The question: the period, its instants (now rounded up to ten seconds) and the period before; the same question for every minute of a running period. */
  const ask = React.useMemo(
    () => communityAsk(head.id, period, timeZone, reportNow()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [head.id, period.start, period.end, period.preset, timeZone, tick],
  )
  const report = useCommunityReport(ask, tick)
  const shown = report.shown
  const r = shown?.report ?? null
  const cold = !r

  /*
    EVERYTHING DRAWN IS THE ANSWER ON SCREEN: its dates, its legend and what
    it is compared with, so the lines and their dates always agree. The
    picker says the period chosen; the rest follows when its answer lands.
  */
  const drawnPeriod = shown?.period ?? period
  const drawnCompared = shown ? shown.compared : ask.compared
  const compareLabel = drawnCompared ? rangeLabel(drawnCompared) : null
  const labels = React.useMemo(() => labelsFor(shown?.span ?? ask.span, timeZone, r ? r.buckets : null), [shown, ask.span, timeZone, r])
  const legend = <ChartLegend range={drawnPeriod} compare={drawnCompared} />

  /* Opening the picker asks for its usual periods ahead, so the one chosen is usually here already. */
  const warmed = React.useRef(0)
  const warm = React.useCallback(() => {
    if (Date.now() - warmed.current < 60_000) return
    warmed.current = Date.now()
    const now = reportNow()
    for (const id of AHEAD) {
      if (id === period.preset) continue
      warmCommunityReport(communityAsk(head.id, { preset: id, ...presetRange(id, today) }, timeZone, now))
    }
  }, [head.id, period.preset, today, timeZone])

  const currency = r?.money?.currency ?? "usd"
  const formatMoney = React.useCallback((cents: number) => formatCurrency((cents || 0) / 100, currency.toUpperCase(), appLocale()), [currency])
  const frame: ChartFrame = { labels, cold, legend, compareLabel, formatMoney }

  useHashSection(root)
  const [growthTab, setGrowthTab] = React.useState<GrowthMetric>("members")
  const [trafficTab, setTrafficTab] = React.useState<TrafficMetric>("visits")
  const [activityTab, setActivityTab] = React.useState<ActivityMetric>("active")
  const [contentTab, setContentTab] = React.useState<ContentMetric>("posts")
  const [moneyTab, setMoneyTab] = React.useState<MoneyMetric>("revenue")

  const f = r?.figures
  const counted = r?.counted ?? { visits: true, visitsByHour: true, active: true, engagement: true, detail: true }
  const since = (day: string | null | undefined) => (day ? tt("Counted since {date}.", { date: longDate(day) }) : null)
  const fig = (k: keyof NonNullable<typeof f>): Figure | null => (f ? f[k] ?? null : null)
  const count = (x: Figure | null) => (x && x.value !== null ? compact(x.value) : "–")
  const rateOf = (x: Figure | null) => pct(x?.value ?? null)

  const net = f ? (f.joined.value ?? 0) - (f.left.value ?? 0) : 0
  const m = r?.money ?? null
  const sells = !!m || !!r?.eventMoney

  /* ── Growth ── */
  const growthTabs: TabSpec<GrowthMetric>[] = [
    { key: "members", label: tt("Members"), value: count(fig("members")), figure: fig("members"), kind: "count", foot: tt("Net {value}", { value: `${net > 0 ? "+" : ""}${n(net)}` }) },
    { key: "joined", label: tt("Joined"), value: count(fig("joined")), figure: fig("joined"), kind: "count", foot: tt("{left} left", { left: n(f?.left.value ?? 0) }) },
    { key: "left", label: tt("Left"), value: count(fig("left")), figure: fig("left"), kind: "count", lowerIsBetter: true, foot: tt("{rate} of members", { rate: rateOf(fig("churn")) }) },
    { key: "churn", label: tt("Member churn"), value: rateOf(fig("churn")), figure: fig("churn"), kind: "percent", lowerIsBetter: true, foot: tt("Of members at the start") },
  ]

  /* ── Traffic ── */
  const trafficTabs: TabSpec<TrafficMetric>[] = [
    { key: "visits", label: tt("Visits"), value: count(fig("visits")), figure: fig("visits"), kind: "count", foot: tt("One a person a day") },
    { key: "prospects", label: tt("From non-members"), value: count(fig("prospects")), figure: fig("prospects"), kind: "count", foot: tt("Not members yet") },
    { key: "joinRate", label: tt("Join rate"), value: rateOf(fig("joinRate")), figure: fig("joinRate"), kind: "percent", foot: tt("Of visits from non-members") },
  ]

  /* ── Engagement ── */
  const membersEnd = f?.members.value ?? null
  const activeShare = f && f.active.value !== null && membersEnd ? Math.round((f.active.value / membersEnd) * 1000) / 10 : null
  const activityTabs: TabSpec<ActivityMetric>[] = [
    { key: "active", label: tt("Active members"), value: count(fig("active")), figure: fig("active"), kind: "count", foot: tt("{rate} of members", { rate: pct(activeShare) }) },
    ...(counted.engagement
      ? [
          { key: "engagement" as const, label: tt("Engagement"), value: rateOf(fig("engagement")), figure: fig("engagement"), kind: "percent" as const, foot: tt("Posted, commented or reacted") },
          { key: "rsvps" as const, label: tt("Event RSVPs"), value: count(fig("rsvps")), figure: fig("rsvps"), kind: "count" as const, foot: tt("In this period") },
          { key: "lessons" as const, label: tt("Lessons completed"), value: count(fig("lessons")), figure: fig("lessons"), kind: "count" as const, foot: tt("In this period") },
        ]
      : []),
  ]
  const shownActivity = activityTabs.some((t) => t.key === activityTab) ? activityTab : "active"

  /* ── Content ── */
  const people = r?.people
  const contentTabs: TabSpec<ContentMetric>[] = [
    { key: "posts", label: tt("Posts"), value: count(fig("posts")), figure: fig("posts"), kind: "count", foot: counted.engagement && people ? tt("{n, plural, one {# person posted} other {# people posted}}", { n: people.posters }) : tt("In this period") },
    { key: "comments", label: tt("Comments"), value: count(fig("comments")), figure: fig("comments"), kind: "count", foot: counted.engagement && people ? tt("{n, plural, one {# person commented} other {# people commented}}", { n: people.commenters }) : tt("In this period") },
    { key: "reactions", label: tt("Reactions"), value: count(fig("reactions")), figure: fig("reactions"), kind: "count", foot: counted.engagement && people ? tt("{n, plural, one {# person reacted} other {# people reacted}}", { n: people.reactors }) : tt("In this period") },
  ]

  /* ── Revenue ── */
  const runsToToday = drawnPeriod.end >= today
  const moneyTabs: TabSpec<MoneyMetric>[] = m
    ? [
        { key: "revenue", label: tt("Revenue"), value: formatMoney(m.figures.revenue.value ?? 0), figure: m.figures.revenue, kind: "money", foot: tt("Less refunds") },
        { key: "mrr", label: tt("Monthly revenue"), value: formatMoney(m.figures.mrr.value ?? 0), figure: m.figures.mrr, kind: "money", foot: runsToToday ? tt("Recurring, today") : tt("At the end of the period") },
        { key: "subscribers", label: tt("Active subscribers"), value: count(m.figures.subscribers), figure: m.figures.subscribers, kind: "count", foot: runsToToday ? tt("Paying now") : tt("At the end of the period") },
        { key: "newPaid", label: tt("New"), value: count(m.figures.newPaid), figure: m.figures.newPaid, kind: "count", foot: m.upgrades > 0 ? tt("{n} upgraded from free", { n: n(m.upgrades) }) : tt("Paid memberships started") },
        { key: "cancellations", label: tt("Cancellations"), value: count(m.figures.cancellations), figure: m.figures.cancellations, kind: "count", lowerIsBetter: true, foot: tt("Churn rate {rate}", { rate: pct(m.churnRate) }) },
      ]
    : []

  /*
    THE OVERVIEW: six figures, each taking the page to its own section and
    choosing the line that figure draws there. A press moves the page, it
    does not hide the rest of it, and a reader who has asked for less motion
    is simply put there.
  */
  const goTo = (id: SectionId, tab?: () => void) => () => {
    tab?.()
    const el = root.current?.querySelector(`[data-analytics-section="${id}"]`)
    const still = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" })
  }
  const overview: OverviewFigure[] = [
    { key: "members", label: tt("Members"), value: count(fig("members")), figure: fig("members"), foot: tt("Net {value}", { value: `${net > 0 ? "+" : ""}${n(net)}` }), onOpen: goTo("growth", () => setGrowthTab("members")) },
    { key: "active", label: tt("Active members"), value: count(fig("active")), figure: fig("active"), foot: tt("{rate} of members", { rate: pct(activeShare) }), onOpen: goTo("engagement", () => setActivityTab("active")) },
    ...(counted.engagement ? [{ key: "engagement", label: tt("Engagement"), value: rateOf(fig("engagement")), figure: fig("engagement"), foot: tt("Members who took part"), onOpen: goTo("engagement", () => setActivityTab("engagement")) }] : []),
    ...(counted.visits ? [{ key: "joinRate", label: tt("Join rate"), value: rateOf(fig("joinRate")), figure: fig("joinRate"), foot: tt("{n, plural, one {# visit} other {# visits}}", { n: fig("visits")?.value ?? 0 }), onOpen: goTo("traffic", () => setTrafficTab("joinRate")) }] : []),
    ...(m ? [{ key: "mrr", label: tt("Monthly revenue"), value: wholeMoney(m.figures.mrr.value ?? 0, currency), figure: m.figures.mrr, foot: tt("{n, plural, one {# paying member} other {# paying members}}", { n: m.figures.subscribers.value ?? 0 }), onOpen: goTo("revenue", () => setMoneyTab("mrr")) }] : []),
    { key: "churn", label: tt("Member churn"), value: rateOf(fig("churn")), figure: fig("churn"), lowerIsBetter: true, foot: m ? tt("Churn rate {rate}", { rate: pct(m.churnRate) }) : tt("{left} left", { left: n(f?.left.value ?? 0) }), onOpen: goTo("growth", () => setGrowthTab("churn")) },
  ]

  /*
    A NEW PERIOD THAT TAKES A WHILE. What is on screen stays sharp and where
    it is; only after WAIT_DIM_MS does it dim a little (opacity, on the
    compositor: nothing moves, nothing blurs, no bar), and it clears the
    moment the answer lands.
  */
  const dim = cn("transition-opacity ease-[cubic-bezier(0.32,0.72,0,1)]", report.waiting && r ? "opacity-60 duration-300" : "opacity-100 duration-200")
  const dimDelay = { transitionDelay: report.waiting && r ? `${WAIT_DIM_MS}ms` : "0ms" }
  const sections = SECTIONS.filter((s) => s !== "revenue" || !r || sells)

  return (
    <CompareContext.Provider value={compareLabel}>
      <ReportComparedContext.Provider value={drawnCompared !== null}>
        <div ref={root} className="space-y-4" data-analytics="" data-waiting={report.waiting ? "true" : "false"}>
          <div className="flex items-center gap-3" data-analytics-controls="" onPointerDownCapture={warm} onFocusCapture={warm}>
            <DateRangePicker value={period} onChange={setPeriod} today={today} firstDay={r?.firstDay} />
          </div>
          {report.failed ? <Notice>{tt("The figures could not be loaded.")}</Notice> : null}

          <div className={dim} style={dimDelay} data-analytics-trends="">
            <Overview figures={overview} cold={cold} />
          </div>

          {sections.map((id) => (
            <SectionBlock key={id} id={id}>
              <div className={cn("space-y-4", dim)} style={dimDelay} data-analytics-trends="" data-analytics-panel={id}>
                {id === "growth" ? <TrendCard name="growth" label={tt("Growth")} tabs={growthTabs} selected={growthTab} onSelect={setGrowthTab} lines={r ? r.lines : null} frame={frame} /> : null}
                {id === "traffic" ? (
                  counted.visits ? (
                    <TrendCard
                      name="traffic"
                      label={tt("Traffic")}
                      tabs={trafficTabs}
                      selected={trafficTab}
                      onSelect={setTrafficTab}
                      lines={r ? r.lines : null}
                      frame={frame}
                      note={counted.visitsByHour ? since(r?.countedSince.visits) : tt("Visits older than three days are counted by day, not by hour.")}
                    />
                  ) : (
                    <Notice tone="info">{tt("Run SQL part 184 in Supabase to count where visits come from.")}</Notice>
                  )
                ) : null}
                {id === "engagement" ? (
                  <>
                    <TrendCard
                      name="activity"
                      label={tt("Engagement")}
                      tabs={activityTabs}
                      selected={shownActivity}
                      onSelect={setActivityTab}
                      lines={r ? r.lines : null}
                      frame={frame}
                      note={shownActivity === "active" ? (r && !r.counted.active ? tt("Active members are counted by day, not by hour.") : since(r?.countedSince.active)) : null}
                    />
                    {r ? <LiveCard live={r.live} /> : null}
                  </>
                ) : null}
                {id === "content" ? <TrendCard name="content" label={tt("Content")} tabs={contentTabs} selected={contentTab} onSelect={setContentTab} lines={r ? r.lines : null} frame={frame} /> : null}
                {id === "revenue" ? (
                  <>
                    {m ? (
                      <div data-revenue="">
                        <TrendCard name="money" label={tt("Paid memberships")} tabs={moneyTabs} selected={moneyTab} onSelect={setMoneyTab} lines={m.lines} frame={frame} detail={<MoneyDetail tab={moneyTab} money={m} formatMoney={formatMoney} />} />
                      </div>
                    ) : null}
                    {r?.eventMoney ? <EventMoneyCard events={r.eventMoney} /> : null}
                  </>
                ) : null}
              </div>

              <div className={cn(REPORT_GRID, dim)} style={dimDelay} data-analytics-lists="" data-analytics-cards="">
                <Lists r={r} slug={head.slug} section={id} />
              </div>

              {id === "traffic" ? <GaLine ga={r?.ga ?? null} /> : null}
            </SectionBlock>
          ))}
        </div>
      </ReportComparedContext.Provider>
    </CompareContext.Provider>
  )
}

/* ── A section of the page ───────────────────────────────────────────── */

/**
 * ONE SUBJECT, NAMED, with its chart and its lists under the name. The name
 * is a word in the page, not a tab and not a card of its own: a card around
 * a card is exactly what the sections are not. It is also the anchor the
 * overview's figures and an address ending in #traffic scroll to, with room
 * above it so the community's own tabs do not sit on the heading.
 */
function SectionBlock({ id, children }: { id: SectionId; children: React.ReactNode }) {
  return (
    <section id={id} data-analytics-section={id} aria-labelledby={`${id}-name`} className="scroll-mt-4 space-y-4 pt-2">
      <h3 id={`${id}-name`} className="px-1 text-[15px] font-semibold text-[#1a1a2e]">
        {sectionName(id)}
      </h3>
      {children}
    </section>
  )
}

/* ── The overview ────────────────────────────────────────────────────── */

interface OverviewFigure {
  key: string
  label: string
  value: string
  figure: Figure | null
  foot: React.ReactNode
  lowerIsBetter?: boolean
  onOpen: () => void
}

/**
 * THE PERIOD IN SIX FIGURES, in the figure tab's own type (components/app/
 * metric-tab: the label, the number with its change, the quiet line under
 * it), on the figures' card. All of them at once: two to a row on a phone,
 * three from md, six in a row from lg, so nothing hides off the side. Each
 * opens its section on its own figure. Before the first answer the numbers
 * are faint until it lands, and nothing is blurred.
 */
function Overview({ figures, cold }: { figures: OverviewFigure[]; cold: boolean }) {
  const cols = figures.length >= 6 ? "lg:grid-cols-6" : figures.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"
  return (
    <section className={TREND_CARD} aria-label={tt("Overview")} data-overview="">
      <div className={cn("grid grid-cols-2 gap-px bg-[#e5e7eb]/60 md:grid-cols-3", cols)}>
        {figures.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={x.onOpen}
            data-kpi={x.key}
            className="min-w-0 cursor-pointer bg-white px-3 py-3 text-left transition-colors duration-200 pointer-fine:hover:bg-[#fafafa] sm:px-4 sm:py-3.5"
          >
            <span className="block truncate text-[11px] font-medium text-[#6b7280] sm:text-[12px]">{x.label}</span>
            <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
              <span className={cn("truncate text-[18px] font-semibold tabular-nums tracking-tight text-[#1a1a2e] transition-opacity duration-[700ms] sm:text-[22px]", cold ? "opacity-30" : "opacity-100")}>{x.value}</span>
              {x.figure && !cold ? <PercentChangeIndicator current={x.figure.value} previous={x.figure.previous} lowerIsBetter={x.lowerIsBetter} /> : null}
            </span>
            <span className="block truncate text-[10px] text-[#9ca3af] sm:text-[11px]">{x.foot}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* ── Engagement: who is here now ─────────────────────────────────────── */

/** Distinct members here in the last day, week and month (DAU, WAU, MAU) and how many of the month's come every day. Today's, whatever the period. */
function LiveCard({ live }: { live: CommunityReport["live"] }) {
  const figures = [
    { key: "dau", label: tt("Last 24 hours"), value: n(live.active1) },
    { key: "wau", label: tt("Last 7 days"), value: n(live.active7) },
    { key: "mau", label: tt("Last 30 days"), value: n(live.active30) },
    { key: "stickiness", label: tt("Stickiness"), value: pct(live.stickiness) },
  ]
  return (
    <section className={TREND_CARD} aria-label={tt("Active members")} data-live="">
      <div className="grid grid-cols-2 gap-px bg-[#e5e7eb]/60 md:grid-cols-4">
        {figures.map((x) => (
          <div key={x.key} className="min-w-0 bg-white px-3 py-3 sm:px-4 sm:py-3.5" data-live-figure={x.key}>
            <p className="truncate text-[11px] font-medium text-[#6b7280] sm:text-[12px]">{x.label}</p>
            <p className="mt-0.5 truncate text-[18px] font-semibold tabular-nums tracking-tight text-[#1a1a2e] sm:text-[22px]">{x.value}</p>
            <p className="truncate text-[10px] text-[#9ca3af] sm:text-[11px]">{x.key === "stickiness" ? tt("Daily over monthly members") : tt("Members here, counted today")}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Under the money chart: what the chosen figure is made of ────────── */

const REVENUE_FROM: Record<string, string> = {
  get memberships() { return tt("Memberships and purchases") },
  get programs() { return tt("Programs") },
  get tickets() { return tt("Event tickets") },
}

function MoneyDetail({ tab, money: m, formatMoney }: { tab: MoneyMetric; money: NonNullable<CommunityReport["money"]>; formatMoney: (c: number) => string }) {
  if (tab === "revenue") {
    if (!m.bySource.length) return <p>{tt("No payments in this period.")}</p>
    return (
      <div>
        <ReportList title={tt("Revenue")} rows={m.bySource.map((x) => ({ key: x.key, label: REVENUE_FROM[x.key] ?? x.key, value: x.cents }))} format={formatMoney} empty="" />
        {m.refunds.count > 0 ? <p className="mt-1 text-[12.5px] text-[#6b7280]">{tt("{count, plural, one {# payment} other {# payments}} refunded in this period, {total} in all.", { count: m.refunds.count, total: formatMoney(m.refunds.totalCents) })}</p> : null}
      </div>
    )
  }
  if (tab === "mrr" || tab === "subscribers") return <p>{tt("Members paying at the end of each day, from their memberships' own dates. A yearly plan counts as a twelfth of its price.")}</p>
  if (tab === "newPaid") return <p>{m.upgrades > 0 ? tt("{n, plural, one {# member was} other {# members were}} already in for free before paying.", { n: m.upgrades }) : tt("Nobody who started paying was a free member before.")}</p>
  if (m.reasons.length === 0) return <p>{(m.figures.cancellations.value ?? 0) === 0 ? tt("Nobody cancelled in this period.") : tt("Nobody said why.")}</p>
  return <ReportList title={tt("Why they cancelled")} rows={m.reasons.map((x) => ({ key: x.reason, label: reasonLabel(x.reason), value: x.count }))} format={n} empty="" />
}

/* ── Event tickets: the figures' own strip, without a chart ──────────── */

function EventMoneyCard({ events: e }: { events: NonNullable<CommunityReport["eventMoney"]> }) {
  const cash = (cents: number) => formatCurrency(cents / 100, e.currency.toUpperCase(), appLocale())
  const figures = [
    { label: tt("Tickets sold"), value: n(e.sold), sub: e.invited > 0 ? tt("{invited} given free", { invited: n(e.invited) }) : e.events === 1 ? tt("1 event") : tt("{events} events", { events: n(e.events) }) },
    { label: tt("Ticket revenue"), value: cash(e.grossCents), sub: tt("In this period") },
    { label: tt("Refunded"), value: cash(e.refundedCents), sub: e.refunds === 1 ? tt("1 refund") : tt("{refunds} refunds", { refunds: n(e.refunds) }) },
    { label: tt("Kept"), value: cash(e.netCents), sub: tt("Gross less refunds") },
  ]
  return (
    <section className={TREND_CARD} aria-label={tt("Event tickets")} data-event-money="">
      {/* MetricTab's type and room (components/app/metric-tab), as figures to read rather than tabs to press. */}
      <div data-scroll-x="" className="relative flex divide-x divide-[#e5e7eb]/60 overflow-x-auto scrollbar-hide md:grid md:grid-cols-4" style={TAB_STRIP_STYLE}>
        {figures.map((x) => (
          <div key={x.label} className={cn(STRIP_TAB, "bg-white px-3 py-3 sm:px-4 sm:py-3.5 md:min-w-0")} data-event-figure={x.label}>
            <p className="truncate text-[11px] font-medium text-[#6b7280] sm:text-[12px]">{x.label}</p>
            <p className="mt-0.5 truncate text-[18px] font-semibold tabular-nums tracking-tight text-[#1a1a2e] sm:text-[22px]">{x.value}</p>
            <p className="truncate text-[10px] text-[#9ca3af] sm:text-[11px]">{x.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── The lists ───────────────────────────────────────────────────────── */

type SourceTab = "source" | "referrer"

function Lists({ r, slug, section }: { r: CommunityReport | null; slug: string; section: SectionId }) {
  const [sourceTab, setSourceTab] = React.useState<SourceTab>("source")
  const blank = !r
  const rowsOf = (xs: ReportRow[], label: (k: string) => string) => ({
    rows: xs.map((x): ReportListRow => ({ key: x.key, label: label(x.key), value: x.value, note: x.note ?? null, code: x.key })),
    previous: xs.some((x) => x.previous !== undefined) ? Object.fromEntries(xs.map((x) => [x.key, x.previous ?? 0])) : undefined,
  })
  const share = (rows: ReportListRow[]) => {
    const all = rows.reduce((a, x) => a + x.value, 0)
    return rows.map((x) => ({ ...x, note: all ? `${Math.round((x.value / all) * 100)}%` : null }))
  }
  const counted = r?.counted

  if (section === "growth") {
    const split = r?.activeSplit ?? null
    return (
      <>
        <ReportCard className={REPORT_CARD} card="joins" title={tt("How people joined")} help={tt("Everyone who joined in this period, by how they came in.")}>
          <ReportBody blank={blank} wait="list">
            {r ? <ReportList title={tt("How people joined")} rows={r.joins.bySource.map((x) => ({ key: x.key, label: SOURCE_LABEL[x.key] ?? x.key, value: x.value }))} format={n} empty={tt("Nobody joined in this period.")} /> : null}
          </ReportBody>
        </ReportCard>

        {!r || split ? (
          <ReportCard className={REPORT_CARD} card="new-returning" title={tt("New and returning")} help={tt("Members active in this period: those who joined in it, and those who were members before it.")}>
            <ReportBody blank={blank} wait="list">
              {split ? (
                <ReportList
                  title={tt("New and returning")}
                  rows={share([
                    { key: "new", label: tt("New members"), value: split.new },
                    { key: "returning", label: tt("Returning members"), value: split.returning },
                  ]).filter((x) => x.value > 0)}
                  format={n}
                  empty={tt("Nobody was active in this period.")}
                />
              ) : null}
            </ReportBody>
          </ReportCard>
        ) : null}

        {r && counted?.detail ? (
          <ReportCard className={REPORT_CARD} card="cohorts" title={tt("Members who stayed")} help={tt("Members who joined in each of the last six months: the share still in, with how many joined and how many were here in the last 30 days.")}>
            <ReportBody blank={false} wait="list">
              <ReportList
                title={tt("Members who stayed")}
                rows={r.cohorts.map((c) => ({ key: c.month, label: monthLabel(c.month), value: c.joined ? Math.round((c.stayed / c.joined) * 100) : 0, note: tt("{joined} joined, {active} active", { joined: n(c.joined), active: n(c.active) }) }))}
                format={(v) => `${v}%`}
                empty={tt("Nobody joined in the last six months.")}
              />
            </ReportBody>
          </ReportCard>
        ) : null}

        {r && r.leaveReasons ? (
          <ReportCard className={REPORT_CARD} card="leave-reasons" title={tt("Why members left")} help={tt("The reason each member gave when they left in this period.")}>
            <ReportBody blank={false} wait="list">
              <ReportList title={tt("Why members left")} rows={r.leaveReasons.map((x) => ({ key: x.reason, label: reasonLabel(x.reason), value: x.count }))} format={n} empty={(r.figures.left.value ?? 0) === 0 ? tt("Nobody left in this period.") : tt("Nobody said why.")} />
            </ReportBody>
          </ReportCard>
        ) : null}

        {r && r.joins.invites.length > 0 ? (
          <ReportCard className={REPORT_CARD} card="invites" title={tt("Invite links")} help={tt("The links that brought the most people in during this period.")}>
            <ReportBody blank={false} wait="list">
              <ReportList title={tt("Invite links")} rows={r.joins.invites.map((x) => ({ key: x.key, label: x.label, value: x.value, note: x.note ? tt("Turned off") : null }))} format={n} empty="" />
            </ReportBody>
          </ReportCard>
        ) : null}
      </>
    )
  }

  if (section === "traffic") {
    const t = r?.traffic ?? null
    if (r && !t) return null
    const sources = t ? rowsOf(t[sourceTab], sourceTab === "source" ? visitSourceName : (k) => k) : null
    const countries = t ? rowsOf(t.country, (k) => countryName(k)) : null
    const devices = t ? rowsOf(t.device, (k) => DEVICE_LABEL[k] ?? k) : null
    return (
      <>
        <ReportCard
          className={REPORT_CARD}
          card="traffic"
          title={tt("Traffic sources")}
          help={tt("How each visitor arrived, once a day: a search engine, a social app, Explore, another site, or typed in directly.")}
          tabs={<ReportTabs value={sourceTab} onChange={setSourceTab} options={[{ value: "source", label: tt("Source") }, { value: "referrer", label: tt("Referrer") }]} />}
        >
          <ReportBody blank={blank} wait="list">
            {sources ? <ReportList key={sourceTab} title={tt("Traffic sources")} rows={share(sources.rows)} previous={sources.previous} format={n} lead={{ icon: sourceTab }} empty={sourceTab === "source" ? tt("No visits in this period.") : tt("No visits from other websites in this period.")} /> : null}
          </ReportBody>
        </ReportCard>
        <ReportCard className={REPORT_CARD} card="countries" title={tt("Countries")} help={tt("Where visits came from, from their connection.")}>
          <ReportBody blank={blank} wait="list">
            {countries ? <ReportList title={tt("Countries")} rows={share(countries.rows)} previous={countries.previous} format={n} lead={{ flag: true }} empty={tt("No locations recorded in this period.")} /> : null}
          </ReportBody>
        </ReportCard>
        <ReportCard className={REPORT_CARD} card="devices" title={tt("Devices")} help={tt("The kind of device each visitor used.")}>
          <ReportBody blank={blank} wait="list">
            {devices ? <ReportList title={tt("Devices")} rows={share(devices.rows)} previous={devices.previous} format={n} lead={{ icon: "device" }} empty={tt("No visits in this period.")} /> : null}
          </ReportBody>
        </ReportCard>
        {/* Only where there is something to show: before part 221 the presses are not counted at all, and a nought would say nobody pressed. */}
        {r && r.linkPresses && r.linkPresses.length > 0 ? (
          <ReportCard className={REPORT_CARD} card="link-presses" title={tt("Link presses")} help={tt("Presses on the links you give members, counted once a member a day.")}>
            <ReportBody blank={false} wait="list">
              <ReportList
                title={tt("Link presses")}
                rows={r.linkPresses.map((l) => ({ key: l.id, label: l.label ?? tt("A link you have since removed"), value: l.presses, note: tt("{n, plural, one {# member} other {# members}}", { n: l.members }) }))}
                format={n}
                empty={tt("Nobody pressed a link in this period.")}
              />
            </ReportBody>
          </ReportCard>
        ) : null}
      </>
    )
  }

  if (section === "revenue") {
    const money = r?.money ?? null
    if (!money) return null
    const plans = money.byPlan
    const trials = money.trials
    const anyTrial = trials.started > 0 || trials.converted > 0 || trials.lost > 0 || trials.onTrial > 0
    return (
      <>
        {plans.length > 0 ? (
          <ReportCard className={REPORT_CARD} card="plans" title={tt("Monthly revenue by plan")} help={tt("What each plan brings in a month, at the end of the period, with the members paying for it.")}>
            <ReportBody blank={false} wait="list">
              <ReportList
                title={tt("Monthly revenue by plan")}
                rows={plans.map((x) => ({ key: x.productId, label: x.name ?? tt("Unnamed plan"), value: x.cents, note: tt("{n, plural, one {# member} other {# members}}", { n: x.members }) }))}
                format={(v) => wholeMoney(v, money.currency)}
                empty={tt("Nobody is paying at the end of this period.")}
              />
            </ReportBody>
          </ReportCard>
        ) : null}
        {anyTrial ? (
          <ReportCard className={REPORT_CARD} card="trials" title={tt("Free trials")} help={tt("Trials that began in this period, and what happened to the ones that ended in it.")}>
            <ReportBody blank={false} wait="list">
              <ReportList
                title={tt("Free trials")}
                rows={[
                  { key: "started", label: tt("Began"), value: trials.started },
                  { key: "converted", label: tt("Went on to pay"), value: trials.converted },
                  { key: "lost", label: tt("Ended without paying"), value: trials.lost },
                  { key: "onTrial", label: tt("Still on trial"), value: trials.onTrial },
                ].filter((x) => x.value > 0)}
                format={n}
                empty={tt("No trials in this period.")}
              />
            </ReportBody>
          </ReportCard>
        ) : null}
      </>
    )
  }

  if (section === "engagement") {
    return (
      <>
        {!r || counted?.detail ? (
          <ReportCard className={REPORT_CARD} card="contributors" title={tt("Top contributors")} help={tt("Members who posted and commented most in this period. A post counts twice a comment.")}>
            <ReportBody blank={blank} wait="list">
              {r ? <ReportList title={tt("Top contributors")} rows={r.contributors.map((c) => ({ key: c.userId, label: c.name, value: c.posts + c.comments, note: tt("{posts} posts, {comments} comments", { posts: n(c.posts), comments: n(c.comments) }) }))} format={n} empty={tt("Nobody posted or commented in this period.")} /> : null}
            </ReportBody>
          </ReportCard>
        ) : null}

        <ReportCard className={REPORT_CARD} card="events" title={tt("Events")} help={tt("Events in this period, with how many said they are going and, where tickets were sold, how many were checked in.")}>
          <ReportBody blank={blank} wait="list">
            {r ? <ReportList title={tt("Events")} rows={r.events.map((e) => ({ key: e.id, label: e.title, value: e.going, note: e.checkedIn === null ? shortDay(e.startsAt) : tt("{count} checked in", { count: n(e.checkedIn) }) }))} format={(v) => tt("{n} going", { n: n(v) })} empty={tt("No events in this period.")} /> : null}
          </ReportBody>
        </ReportCard>

        {r && r.programs.length > 0 ? (
          <ReportCard className={REPORT_CARD} card="programs" title={tt("Programs")} help={tt("Members who started each program, how many finished it, and their average progress.")}>
            <ReportBody blank={false} wait="list">
              <ReportList title={tt("Programs")} rows={r.programs.map((p) => ({ key: p.id, label: p.title, value: p.started, note: tt("{completed} finished, {percent}% average", { completed: n(p.completed), percent: p.percent }) }))} format={n} empty="" />
            </ReportBody>
          </ReportCard>
        ) : null}
      </>
    )
  }

  /* Content */
  return (
    <>
      <ReportCard className={REPORT_CARD} card="posts" title={tt("Top posts")} help={tt("Posts made in this period, by likes and comments.")}>
        <ReportBody blank={blank} wait="list">
          {r ? <PostList posts={r.topPosts} slug={slug} /> : null}
        </ReportBody>
      </ReportCard>
      {!r || counted?.detail ? (
        <ReportCard className={REPORT_CARD} card="spaces" title={tt("Busiest spaces")} help={tt("Posts and comments in each space in this period.")}>
          <ReportBody blank={blank} wait="list">
            {r ? <ReportList key="spaces" title={tt("Busiest spaces")} rows={r.topSpaces.map((s) => ({ key: s.id, label: s.name, value: s.posts + s.comments, note: tt("{posts} posts, {comments} comments", { posts: n(s.posts), comments: n(s.comments) }) }))} format={n} empty={tt("No posts or comments in this period.")} /> : null}
          </ReportBody>
        </ReportCard>
      ) : null}
    </>
  )
}

function monthLabel(month: string): string {
  const t = Date.parse(`${month}-15T12:00:00Z`)
  try {
    return new Intl.DateTimeFormat(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" }).format(t)
  } catch {
    return month
  }
}

function shortDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat(appLocale(), { month: "short", day: "numeric" }).format(Date.parse(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

/** Top posts: the rows of a list, each opening its post in a new tab. */
function PostList({ posts, slug }: { posts: CommunityReport["topPosts"]; slug: string }) {
  if (posts.length === 0) return <ReportEmpty>{tt("No reactions or comments in this period yet.")}</ReportEmpty>
  const max = Math.max(1, ...posts.map((p) => p.reactions + p.comments))
  return (
    <ol className="mt-0.5" data-list="">
      {posts.slice(0, 5).map((p) => (
        <li key={p.id} className="group flex h-10 items-center gap-3" data-row-key={p.id}>
          <div className="relative flex h-10 min-w-0 flex-1 items-center">
            <div
              aria-hidden
              data-bar=""
              className={cn(ROW_FILL, "inset-y-1")}
              style={{ width: `${Math.max(2, ((p.reactions + p.comments) / max) * 100)}%` }}
            />
            <a href={`/community/${slug}/post/${p.id}`} target="_blank" rel="noopener noreferrer" className="relative flex h-10 min-w-0 items-center pl-2.5 text-[13px] text-[#303036] hover:underline" title={p.title}>
              {/* The ellipsis is the text's own: a flex box clips its words without one. */}
              <span className="min-w-0 truncate">{p.title}</span>
            </a>
          </div>
          <span className="shrink-0 text-[12.5px] tabular-nums text-[#6b7280]">
            {tt("{n, plural, one {# like} other {# likes}}", { n: p.reactions })} · {tt("{n, plural, one {# comment} other {# comments}}", { n: p.comments })}
          </span>
        </li>
      ))}
    </ol>
  )
}

/* ── Google Analytics: one quiet line under Traffic, only when connected ── */

const GA_SETUP = "/app/integrations?integration=google-analytics"

function GaLine({ ga }: { ga: CommunityReport["ga"] | null }) {
  if (!ga?.id) return null
  const seen = ga.seenAt ? new Intl.DateTimeFormat(appLocale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(Date.parse(ga.seenAt)) : null
  return (
    <p className="px-1 text-[12.5px] leading-snug text-[#6b7280]" data-ga="connected">
      {seen ? tt("This community's pages and joins go to {id}. Last data {time}.", { id: ga.id, time: seen }) : tt("This community's pages and joins go to {id}.", { id: ga.id })}{" "}
      <a href={GA_SETUP} className="inline-flex h-10 items-center text-[#1a1a2e] underline-offset-2 hover:underline sm:h-auto">
        {tt("Manage")}
      </a>
    </p>
  )
}
