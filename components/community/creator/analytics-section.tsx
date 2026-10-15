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
 * THREE CHARTS, NOT ONE OF EVERYTHING. Growth (members, joins, leaves,
 * visits, the join rate), Activity (active members, posts, comments,
 * reactions, engagement) and, for a community that sells something, Paid
 * memberships (revenue, monthly revenue, subscribers, new, cancellations).
 * Then the lists: where visits came from, countries, devices, how people
 * joined, invite links, top posts, the busiest spaces, top contributors,
 * members who stayed, events, programs, and whether the store's Google
 * Analytics hears the community too.
 *
 * NOTHING DRAWN THAT WAS NOT COUNTED. Every number is the server's
 * (lib/communities/server/analytics-report.ts) from rows; a figure the
 * database cannot count yet (SQL part 184) is not shown, and one whose
 * counting began inside the period says from when.
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
import { LoadingLine } from "@/components/app/loading-line"
import { AnalyticsChartWithTooltip, type AnalyticsChartData } from "@/components/app/analytics-chart"
import { ChartLegend, CompareContext, PercentChangeIndicator } from "@/app/app/analytics/analytics-client"
import { ReportBody, ReportCard, ReportComparedContext, ReportEmpty, ReportList, ReportTabs, type ReportListRow } from "@/app/app/analytics/analytics-reports"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { boundsOf, compareBounds, compareRange, longDate, rangeLabel, type CompareValue } from "@/lib/date-range/range"
import { bucketLabel, bucketStarts, grainFor } from "@/lib/analytics/buckets"
import { countryName, sourceName } from "@/lib/analytics/reports"
import { reportNow } from "@/lib/analytics/report-cache"
import type { ActivityMetric, CommunityReport, Figure, GrowthMetric, Line, MoneyMetric, ReportRow } from "@/lib/communities/analytics-report"
import type { AnalyticsView, CommunityHead } from "./view-types"
import { Notice, card } from "./parts"

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

/** A visit's source in words: Storelib's own two first, then Storelib Analytics' names (Search, Instagram, Email...). */
function visitSourceName(key: string): string {
  if (key === "explore") return tt("Explore")
  if (key === "storelib") return tt("Your Storelib pages")
  return sourceName(key)
}

const DEVICE_LABEL: Record<string, string> = {
  get mobile() { return tt("Mobile") },
  get tablet() { return tt("Tablet") },
  get desktop() { return tt("Desktop") },
}

const REVENUE_FROM: Record<string, string> = {
  get memberships() { return tt("Memberships and purchases") },
  get programs() { return tt("Programs") },
  get tickets() { return tt("Event tickets") },
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
const pct = (v: number | null) => (v === null ? "–" : `${v > 0 && v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)}%`)

/* ── The question and its answer ─────────────────────────────────────── */

const PREVIOUS_PERIOD: CompareValue = { mode: "previous_period" }
/** A kept answer is shown at once while the page asks again; older than this, it is not shown at all. */
const KEEP_MS = 30 * 60_000
const FRESH_MS = 15_000
const kept = new Map<string, CommunityReport>()

function storageKey(communityId: string, key: string): string {
  return `sl_community_report:${communityId}:${key}`
}

function readKept(communityId: string, key: string): CommunityReport | null {
  const mem = kept.get(storageKey(communityId, key))
  if (mem) return mem
  try {
    const raw = window.sessionStorage.getItem(storageKey(communityId, key))
    if (!raw) return null
    const r = JSON.parse(raw) as CommunityReport
    return r && r.version === 1 && Date.now() - r.at < KEEP_MS ? r : null
  } catch {
    return null
  }
}

function keep(communityId: string, key: string, r: CommunityReport) {
  kept.set(storageKey(communityId, key), r)
  try {
    window.sessionStorage.setItem(storageKey(communityId, key), JSON.stringify(r))
  } catch {
    /* storage full or off: kept in memory for this visit */
  }
}

interface ReportState {
  data: CommunityReport | null
  loading: boolean
  /** What is on screen answers another period: it goes soft until the new one lands. */
  stale: boolean
  failed: boolean
}

/** The section's one read: a new period drops the one in flight; `refresh` asks the same again. */
function useCommunityReport(communityId: string, query: string, refresh: number): ReportState {
  const [state, setState] = React.useState<ReportState>(() => {
    const k = typeof window === "undefined" ? null : readKept(communityId, query)
    return { data: k, loading: !k, stale: false, failed: false }
  })
  const shownKey = React.useRef<string | null>(state.data ? query : null)
  React.useEffect(() => {
    const ctrl = new AbortController()
    const k = readKept(communityId, query)
    if (k && shownKey.current !== query) {
      shownKey.current = query
      setState({ data: k, loading: true, stale: false, failed: false })
    } else setState((s) => ({ ...s, loading: true, stale: shownKey.current !== query, failed: false }))
    if (k && Date.now() - k.at < FRESH_MS && refresh === 0) {
      setState((s) => ({ ...s, loading: false }))
      return () => ctrl.abort()
    }
    fetch(`/api/app/community/${communityId}/analytics?${query}`, { signal: ctrl.signal, headers: { Accept: "application/json" } })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as CommunityReport | null
        if (!res.ok || !body || body.version !== 1) throw new Error("bad answer")
        keep(communityId, query, body)
        shownKey.current = query
        setState({ data: body, loading: false, stale: false, failed: false })
      })
      .catch((e) => {
        if ((e as { name?: string })?.name === "AbortError") return
        setState((s) => ({ ...s, loading: false, failed: true }))
      })
    return () => ctrl.abort()
  }, [communityId, query, refresh])
  return state
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

/**
 * A FIGURE STRIP AND ITS CHART: Analytics' card, figure tabs over the trend
 * chart of the one chosen, the legend under it, and a quiet line when the
 * figure's counting began inside the period.
 */
function TrendCard<K extends string>({
  name,
  tabs,
  selected,
  onSelect,
  lines,
  labels,
  loading,
  soft,
  waiting,
  formatMoney,
  legend,
  note,
  detail,
  label,
  compareLabel,
}: {
  name: string
  tabs: TabSpec<K>[]
  selected: K
  onSelect: (k: K) => void
  lines: Partial<Record<K, Line>> | null
  labels: string[]
  loading: boolean
  soft: boolean
  waiting: boolean
  formatMoney: (cents: number) => string
  legend: React.ReactNode
  note?: React.ReactNode
  detail?: React.ReactNode
  label: string
  /** What the dashed line is, "Sep 1–Sep 30, 2026", or null for All time. */
  compareLabel: string | null
}) {
  const strip = useTabStrip<HTMLDivElement>(selected, tabs.map((t) => t.key))
  const tab = tabs.find((t) => t.key === selected) ?? tabs[0]
  const placeholder = loading || !lines
  const rows = React.useMemo(() => chartRows(labels, placeholder ? null : lines?.[tab.key] ?? null, tab.kind), [labels, placeholder, lines, tab.key, tab.kind])
  const seriesLabels = React.useMemo(() => ({ views: tab.label, revenue: tab.label, conversion: tab.label }), [tab.label])
  const cols = tabs.length >= 5 ? "lg:grid-cols-5" : tabs.length === 4 ? "md:grid-cols-4" : tabs.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"
  return (
    <section className={cn(card, "relative overflow-hidden")} data-trend={name} aria-label={label} aria-busy={waiting || undefined}>
      <LoadingLine active={waiting} />
      <div ref={strip} role="tablist" aria-label={label} data-scroll-x="" className={cn("relative flex divide-x divide-[#e5e7eb]/60 overflow-x-auto scrollbar-hide lg:grid", cols, tabs.length < 5 && "md:grid")} style={TAB_STRIP_STYLE}>
        {tabs.map((t) => (
          <MetricTab
            key={t.key}
            tab={t.key}
            className="flex-shrink-0 min-w-[132px] lg:min-w-0"
            label={t.label}
            value={t.value}
            change={t.figure ? <PercentChangeIndicator current={t.figure.value} previous={t.figure.previous} lowerIsBetter={t.lowerIsBetter} /> : null}
            foot={t.foot}
            selected={t.key === selected}
            soft={soft}
            loading={loading}
            onSelect={() => onSelect(t.key)}
          />
        ))}
      </div>
      <div className="border-t border-[#e5e7eb]/60 px-2 pb-3 pt-7 sm:px-4 sm:pb-4" data-chart-for={tab.key}>
        <div className={cn("transition-[opacity,filter] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)]", soft ? "opacity-40 blur-[1.5px]" : "opacity-100 blur-0")}>
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
        </div>
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

/* ── The section ─────────────────────────────────────────────────────── */

/**
 * `initial` is the earlier answer (the last 30 days from the nightly rows),
 * still accepted from a page that reads it; the section asks for the period
 * in the address itself, so it draws nothing from it.
 */
export function AnalyticsSection({ head }: { head: CommunityHead; initial?: AnalyticsView | null }) {
  const timeZone = React.useMemo(() => viewerTimeZone(), [])
  const { period, setPeriod, today } = usePeriodParams(timeZone, "last_30_days")
  const isAllTime = period.preset === "all_time"
  const comparedRange = isAllTime ? null : compareRange(period, PREVIOUS_PERIOD)
  const compareLabel = comparedRange ? rangeLabel(comparedRange) : null

  /* Asked again every minute while the page is on screen, as /app Analytics is. */
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setTick((x) => x + 1)
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const span = React.useMemo(() => {
    const b = boundsOf(period, timeZone, reportNow())
    return { start: b.start, end: Math.max(b.end, b.start + 1) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.start, period.end, period.preset, timeZone, tick])
  const against = React.useMemo(() => (isAllTime ? null : compareBounds(period, PREVIOUS_PERIOD, timeZone, reportNow())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period.start, period.end, period.preset, timeZone, tick])
  const query = React.useMemo(() => {
    const p = new URLSearchParams({ start: new Date(span.start).toISOString(), end: new Date(span.end).toISOString(), tz: timeZone })
    if (against) {
      p.set("cstart", new Date(against.start).toISOString())
      p.set("cend", new Date(against.end).toISOString())
    }
    return p.toString()
  }, [span, against, timeZone])
  const report = useCommunityReport(head.id, query, tick)
  const r = report.data
  const soft = report.stale && !!r
  const loading = !r
  const waiting = report.loading && (!r || report.stale)

  /* The dates along the chart, in the viewer's language, from the same buckets the server counted. */
  const labels = React.useMemo(() => {
    const grain = grainFor(span)
    const l = bucketStarts(span, grain, timeZone).map((s) => bucketLabel(s, grain, timeZone))
    return r && r.buckets !== l.length ? Array.from({ length: r.buckets }, (_, i) => l[i] ?? "") : l
  }, [span, timeZone, r])

  const currency = r?.money?.currency ?? "usd"
  const formatMoney = React.useCallback((cents: number) => formatCurrency((cents || 0) / 100, currency.toUpperCase(), appLocale()), [currency])
  const legend = <ChartLegend range={period} compare={comparedRange} />

  const [growthTab, setGrowthTab] = React.useState<GrowthMetric>("members")
  const [activityTab, setActivityTab] = React.useState<ActivityMetric>("active")
  const [moneyTab, setMoneyTab] = React.useState<MoneyMetric>("revenue")

  const f = r?.figures
  const counted = r?.counted ?? { visits: true, visitsByHour: true, active: true, engagement: true, detail: true }
  const since = (day: string | null | undefined) => (day ? tt("Counted since {date}.", { date: longDate(day) }) : null)
  const fig = (k: keyof NonNullable<typeof f>): Figure | null => (f ? f[k] : null)
  const count = (x: Figure | null) => (x && x.value !== null ? compact(x.value) : "–")

  const net = f ? (f.joined.value ?? 0) - (f.left.value ?? 0) : 0
  /** Members who left, as a share of the members there were when the period began. */
  const leftShare = (left: number, atStart: number) => (atStart > 0 ? Math.round((left / atStart) * 1000) / 10 : null)
  const growthTabs: TabSpec<GrowthMetric>[] = [
    { key: "members", label: tt("Members"), value: count(fig("members")), figure: fig("members"), kind: "count", foot: tt("Net {value}", { value: `${net > 0 ? "+" : ""}${n(net)}` }) },
    { key: "joined", label: tt("Joined"), value: count(fig("joined")), figure: fig("joined"), kind: "count", foot: tt("{left} left", { left: n(f?.left.value ?? 0) }) },
    { key: "left", label: tt("Left"), value: count(fig("left")), figure: fig("left"), kind: "count", lowerIsBetter: true, foot: tt("{rate} of members", { rate: pct(f && f.members.value !== null ? leftShare(f.left.value ?? 0, f.members.value - (f.joined.value ?? 0) + (f.left.value ?? 0)) : null) }) },
    ...(counted.visits
      ? [
          { key: "visits" as const, label: tt("Visits"), value: count(fig("visits")), figure: fig("visits"), kind: "count" as const, foot: tt("One a person a day") },
          { key: "joinRate" as const, label: tt("Join rate"), value: pct(fig("joinRate")?.value ?? null), figure: fig("joinRate"), kind: "percent" as const, foot: tt("Of visits from non-members") },
        ]
      : []),
  ]
  const shownGrowth = growthTabs.some((t) => t.key === growthTab) ? growthTab : "members"

  const membersEnd = f?.members.value ?? null
  const activeShare = f && f.active.value !== null && membersEnd ? Math.round((f.active.value / membersEnd) * 1000) / 10 : null
  const people = r?.people
  const activityTabs: TabSpec<ActivityMetric>[] = [
    { key: "active", label: tt("Active members"), value: count(fig("active")), figure: fig("active"), kind: "count", foot: tt("{rate} of members", { rate: pct(activeShare) }) },
    { key: "posts", label: tt("Posts"), value: count(fig("posts")), figure: fig("posts"), kind: "count", foot: counted.engagement && people ? tt("{n, plural, one {# person posted} other {# people posted}}", { n: people.posters }) : tt("In this period") },
    { key: "comments", label: tt("Comments"), value: count(fig("comments")), figure: fig("comments"), kind: "count", foot: counted.engagement && people ? tt("{n, plural, one {# person commented} other {# people commented}}", { n: people.commenters }) : tt("In this period") },
    { key: "reactions", label: tt("Reactions"), value: count(fig("reactions")), figure: fig("reactions"), kind: "count", foot: counted.engagement && people ? tt("{n, plural, one {# person reacted} other {# people reacted}}", { n: people.reactors }) : tt("In this period") },
    ...(counted.engagement ? [{ key: "engagement" as const, label: tt("Engagement"), value: pct(fig("engagement")?.value ?? null), figure: fig("engagement"), kind: "percent" as const, foot: tt("Posted, commented or reacted") }] : []),
  ]
  const shownActivity = activityTabs.some((t) => t.key === activityTab) ? activityTab : "active"

  const m = r?.money ?? null
  const runsToToday = period.end >= today
  const moneyTabs: TabSpec<MoneyMetric>[] = m
    ? [
        { key: "revenue", label: tt("Revenue"), value: formatMoney(m.figures.revenue.value ?? 0), figure: m.figures.revenue, kind: "money", foot: tt("Less refunds") },
        { key: "mrr", label: tt("Monthly revenue"), value: formatMoney(m.figures.mrr.value ?? 0), figure: m.figures.mrr, kind: "money", foot: runsToToday ? tt("Recurring, today") : tt("At the end of the period") },
        { key: "subscribers", label: tt("Active subscribers"), value: count(m.figures.subscribers), figure: m.figures.subscribers, kind: "count", foot: runsToToday ? tt("Paying now") : tt("At the end of the period") },
        { key: "newPaid", label: tt("New"), value: count(m.figures.newPaid), figure: m.figures.newPaid, kind: "count", foot: m.upgrades > 0 ? tt("{n} upgraded from free", { n: n(m.upgrades) }) : tt("Paid memberships started") },
        { key: "cancellations", label: tt("Cancellations"), value: count(m.figures.cancellations), figure: m.figures.cancellations, kind: "count", lowerIsBetter: true, foot: tt("Churn rate {rate}", { rate: pct(m.churnRate) }) },
      ]
    : []

  const moneyDetail = m ? <MoneyDetail tab={moneyTab} money={m} formatMoney={formatMoney} /> : null

  return (
    <CompareContext.Provider value={compareLabel}>
      <ReportComparedContext.Provider value={!isAllTime}>
        <div className="space-y-4" data-analytics="" aria-busy={waiting || undefined}>
          <div className="flex items-center justify-between gap-3" data-analytics-controls="">
            <DateRangePicker value={period} onChange={setPeriod} today={today} firstDay={r?.firstDay} />
            <GaLink ga={r?.ga ?? null} />
          </div>
          {report.failed && !r ? <Notice>{tt("The figures could not be loaded.")}</Notice> : null}

          <TrendCard
            name="growth"
            label={tt("Growth")}
            tabs={growthTabs}
            selected={shownGrowth}
            onSelect={setGrowthTab}
            lines={r ? r.lines : null}
            labels={labels}
            loading={loading}
            soft={soft}
            waiting={waiting}
            formatMoney={formatMoney}
            legend={legend}
            compareLabel={compareLabel}
            note={shownGrowth === "visits" || shownGrowth === "joinRate" ? (counted.visitsByHour ? since(r?.countedSince.visits) : tt("Visits older than three days are counted by day, not by hour.")) : null}
          />

          <TrendCard
            name="activity"
            label={tt("Activity")}
            tabs={activityTabs}
            selected={shownActivity}
            onSelect={setActivityTab}
            lines={r ? r.lines : null}
            labels={labels}
            loading={loading}
            soft={soft}
            waiting={waiting}
            formatMoney={formatMoney}
            legend={legend}
            compareLabel={compareLabel}
            note={shownActivity === "active" ? (r && !r.counted.active ? tt("Active members are counted by day, not by hour.") : since(r?.countedSince.active)) : null}
          />

          {m ? (
            <div data-revenue="">
              <TrendCard
                name="money"
                label={tt("Paid memberships")}
                tabs={moneyTabs}
                selected={moneyTab}
                onSelect={setMoneyTab}
                lines={m.lines}
                labels={labels}
                loading={loading}
                soft={soft}
                waiting={waiting}
                formatMoney={formatMoney}
                legend={legend}
                compareLabel={compareLabel}
                detail={moneyDetail}
              />
            </div>
          ) : null}

          {r?.eventMoney ? <EventMoneyCard events={r.eventMoney} /> : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-analytics-lists="">
            <Lists r={r} slug={head.slug} />
          </div>

          <GaCard ga={r?.ga ?? null} loading={loading} />
        </div>
      </ReportComparedContext.Provider>
    </CompareContext.Provider>
  )
}

/* ── Under the money chart: what the chosen figure is made of ────────── */

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

/* ── Event tickets: the same hairline grid as the figures ────────────── */

function EventMoneyCard({ events: e }: { events: NonNullable<CommunityReport["eventMoney"]> }) {
  const cash = (cents: number) => formatCurrency(cents / 100, e.currency.toUpperCase(), appLocale())
  const figures = [
    { label: tt("Tickets sold"), value: n(e.sold), sub: e.invited > 0 ? tt("{invited} given free", { invited: n(e.invited) }) : e.events === 1 ? tt("1 event") : tt("{events} events", { events: n(e.events) }) },
    { label: tt("Ticket revenue"), value: cash(e.grossCents), sub: tt("In this period") },
    { label: tt("Refunded"), value: cash(e.refundedCents), sub: e.refunds === 1 ? tt("1 refund") : tt("{refunds} refunds", { refunds: n(e.refunds) }) },
    { label: tt("Kept"), value: cash(e.netCents), sub: tt("Gross less refunds") },
  ]
  return (
    <section className={cn(card, "overflow-hidden")} aria-label={tt("Event tickets")} data-event-money="">
      <div className="grid grid-cols-2 gap-px bg-[#f1f2f4] sm:grid-cols-4">
        {figures.map((x) => (
          <div key={x.label} className="min-w-0 bg-white px-4 py-3.5" data-event-figure={x.label}>
            <p className="truncate text-[12px] font-medium text-[#6b7280]">{x.label}</p>
            <p className="mt-0.5 truncate text-[18px] font-semibold tabular-nums tracking-tight text-[#1a1a2e] sm:text-[22px]">{x.value}</p>
            <p className="truncate text-[11px] text-[#9ca3af]">{x.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── The lists ───────────────────────────────────────────────────────── */

type TrafficTab = "source" | "referrer"
type PostsTab = "posts" | "spaces"

function Lists({ r, slug }: { r: CommunityReport | null; slug: string }) {
  const [trafficTab, setTrafficTab] = React.useState<TrafficTab>("source")
  const [postsTab, setPostsTab] = React.useState<PostsTab>("posts")
  const blank = !r
  const rowsOf = (xs: ReportRow[], label: (k: string) => string) => ({
    rows: xs.map((x): ReportListRow => ({ key: x.key, label: label(x.key), value: x.value, note: x.note ?? null, code: x.key })),
    previous: xs.some((x) => x.previous !== undefined) ? Object.fromEntries(xs.map((x) => [x.key, x.previous ?? 0])) : undefined,
  })
  const notCounted = <ReportEmpty>{tt("Run SQL part 184 in Supabase to count where visits come from.")}</ReportEmpty>
  const t = r?.traffic ?? null
  const traffic = t ? rowsOf(t[trafficTab], trafficTab === "source" ? visitSourceName : (k) => k) : null
  const countries = t ? rowsOf(t.country, (k) => countryName(k)) : null
  const devices = t ? rowsOf(t.device, (k) => DEVICE_LABEL[k] ?? k) : null
  const share = (rows: ReportListRow[]) => {
    const all = rows.reduce((a, x) => a + x.value, 0)
    return rows.map((x) => ({ ...x, note: all ? `${Math.round((x.value / all) * 100)}%` : null }))
  }
  const counted = r?.counted
  return (
    <>
      <ReportCard
        card="traffic"
        title={tt("Traffic sources")}
        help={tt("How each visitor arrived, once a day: a search engine, a social app, Explore, another site, or typed in directly.")}
        tabs={<ReportTabs value={trafficTab} onChange={setTrafficTab} options={[{ value: "source", label: tt("Source") }, { value: "referrer", label: tt("Referrer") }]} />}
      >
        <ReportBody blank={blank} wait="list">
          {r ? (traffic ? <ReportList key={trafficTab} title={tt("Traffic sources")} rows={share(traffic.rows)} previous={traffic.previous} format={n} lead={{ icon: trafficTab }} empty={trafficTab === "source" ? tt("No visits in this period.") : tt("No visits from other websites in this period.")} /> : notCounted) : null}
        </ReportBody>
      </ReportCard>

      {/* Before part 184 one card says how to count visits; countries and devices wait for it rather than say it twice more. */}
      {!r || t ? (<>
      <ReportCard card="countries" title={tt("Countries")} help={tt("Where visits came from, from their connection.")}>
        <ReportBody blank={blank} wait="list">
          {r ? (countries ? <ReportList title={tt("Countries")} rows={share(countries.rows)} previous={countries.previous} format={n} lead={{ flag: true }} empty={tt("No locations recorded in this period.")} /> : notCounted) : null}
        </ReportBody>
      </ReportCard>

      <ReportCard card="devices" title={tt("Devices")} help={tt("The kind of device each visitor used.")}>
        <ReportBody blank={blank} wait="list">
          {r ? (devices ? <ReportList title={tt("Devices")} rows={share(devices.rows)} previous={devices.previous} format={n} lead={{ icon: "device" }} empty={tt("No visits in this period.")} /> : notCounted) : null}
        </ReportBody>
      </ReportCard>
      </>) : null}

      <ReportCard card="joins" title={tt("How people joined")} help={tt("Everyone who joined in this period, by how they came in.")}>
        <ReportBody blank={blank} wait="list">
          {r ? <ReportList title={tt("How people joined")} rows={r.joins.bySource.map((x) => ({ key: x.key, label: SOURCE_LABEL[x.key] ?? x.key, value: x.value }))} format={n} empty={tt("Nobody joined in this period.")} /> : null}
        </ReportBody>
      </ReportCard>

      <ReportCard
        card="posts"
        title={postsTab === "posts" ? tt("Top posts") : tt("Busiest spaces")}
        help={postsTab === "posts" ? tt("Posts made in this period, by likes and comments.") : tt("Posts and comments in each space in this period.")}
        tabs={counted?.detail ? <ReportTabs value={postsTab} onChange={setPostsTab} options={[{ value: "posts", label: tt("Posts") }, { value: "spaces", label: tt("Spaces") }]} /> : undefined}
      >
        <ReportBody blank={blank} wait="list">
          {r ? (
            postsTab === "posts" || !counted?.detail ? (
              <PostList posts={r.topPosts} slug={slug} />
            ) : (
              <ReportList key="spaces" title={tt("Busiest spaces")} rows={r.topSpaces.map((s) => ({ key: s.id, label: s.name, value: s.posts + s.comments, note: tt("{posts} posts, {comments} comments", { posts: n(s.posts), comments: n(s.comments) }) }))} format={n} empty={tt("No posts or comments in this period.")} />
            )
          ) : null}
        </ReportBody>
      </ReportCard>

      {r && counted?.detail ? (
        <ReportCard card="contributors" title={tt("Top contributors")} help={tt("Members who posted and commented most in this period. A post counts twice a comment.")}>
          <ReportBody blank={false} wait="list">
            <ReportList title={tt("Top contributors")} rows={r.contributors.map((c) => ({ key: c.userId, label: c.name, value: c.posts + c.comments, note: tt("{posts} posts, {comments} comments", { posts: n(c.posts), comments: n(c.comments) }) }))} format={n} empty={tt("Nobody posted or commented in this period.")} />
          </ReportBody>
        </ReportCard>
      ) : null}

      {r && counted?.detail ? (
        <ReportCard card="cohorts" title={tt("Members who stayed")} help={tt("Members who joined in each of the last six months: the share still in, with how many joined and how many were here in the last 30 days.")}>
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

      {r && r.joins.invites.length > 0 ? (
        <ReportCard card="invites" title={tt("Invite links")} help={tt("The links that brought the most people in during this period.")}>
          <ReportBody blank={false} wait="list">
            <ReportList title={tt("Invite links")} rows={r.joins.invites.map((x) => ({ key: x.key, label: x.label, value: x.value, note: x.note ? tt("Turned off") : null }))} format={n} empty="" />
          </ReportBody>
        </ReportCard>
      ) : null}

      {r && r.events.length > 0 ? (
        <ReportCard card="events" title={tt("Events")} help={tt("Events in this period, with how many said they are going and, where tickets were sold, how many were checked in.")}>
          <ReportBody blank={false} wait="list">
            <ReportList title={tt("Events")} rows={r.events.map((e) => ({ key: e.id, label: e.title, value: e.going, note: e.checkedIn === null ? shortDay(e.startsAt) : tt("{count} checked in", { count: n(e.checkedIn) }) }))} format={(v) => tt("{n} going", { n: n(v) })} empty="" />
          </ReportBody>
        </ReportCard>
      ) : null}

      {r && r.programs.length > 0 ? (
        <ReportCard card="programs" title={tt("Programs")} help={tt("Members who started each program, how many finished it, and their average progress.")}>
          <ReportBody blank={false} wait="list">
            <ReportList title={tt("Programs")} rows={r.programs.map((p) => ({ key: p.id, label: p.title, value: p.started, note: tt("{completed} finished, {percent}% average", { completed: n(p.completed), percent: p.percent }) }))} format={(v) => tt("{n} started", { n: n(v) })} empty="" />
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
              className="absolute inset-y-1 left-0 rounded-md bg-[linear-gradient(180deg,#f8f9fb_0%,#eff1f4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_0_1px_rgba(16,24,40,0.045),0_1px_2px_rgba(16,24,40,0.05)] group-hover:brightness-[0.975]"
              style={{ width: `${Math.max(2, ((p.reactions + p.comments) / max) * 100)}%` }}
            />
            <a href={`/community/${slug}/post/${p.id}`} target="_blank" rel="noopener noreferrer" className="relative flex h-10 min-w-0 items-center truncate pl-2.5 text-[13px] text-[#303036] hover:underline" title={p.title}>
              {p.title}
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

/* ── Google Analytics ────────────────────────────────────────────────── */

const GA_SETUP = "/app/integrations?integration=google-analytics"

/** Beside the period: whether the store's Google Analytics hears the community, and the way to it. */
function GaLink({ ga }: { ga: CommunityReport["ga"] | null }) {
  if (!ga) return null
  return (
    <a href={GA_SETUP} className="min-w-0 truncate text-[12.5px] text-[#6b7280] hover:text-[#1a1a2e] hover:underline max-sm:hidden" data-ga-link={ga.id ? "connected" : "off"}>
      {ga.id ? tt("Google Analytics: {id}", { id: ga.id }) : tt("Connect Google Analytics")}
    </a>
  )
}

function GaCard({ ga, loading }: { ga: CommunityReport["ga"] | null; loading: boolean }) {
  if (loading || !ga) return null
  const seen = ga.seenAt ? new Intl.DateTimeFormat(appLocale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(Date.parse(ga.seenAt)) : null
  return (
    <section className={cn(card, "flex items-center gap-3 px-4 py-3.5 sm:px-5")} data-ga={ga.id ? "connected" : "off"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/integrations/google-analytics.svg" alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Google Analytics")}</p>
        <p className="text-[13px] leading-snug text-[#6b7280]">
          {ga.id
            ? seen
              ? tt("This community's pages and joins go to {id}. Last data {time}.", { id: ga.id, time: seen })
              : tt("This community's pages and joins go to {id}.", { id: ga.id })
            : tt("Send this community's page views and joins to your own Google Analytics.")}
        </p>
      </div>
      <a href={GA_SETUP} className="inline-flex h-10 shrink-0 items-center rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f9fafb]">
        {ga.id ? tt("Manage") : tt("Connect")}
      </a>
    </section>
  )
}
