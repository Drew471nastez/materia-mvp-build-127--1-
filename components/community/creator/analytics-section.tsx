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
 *   the details    one of the Analytics reports' cards, its tabs, rows and
 *                  empty lines (app/app/analytics/analytics-reports.tsx)
 *
 * ROUND 37, THE OWNER: "I don't like the design of the Growth / Traffic /
 * Engagement / Content / Revenue, and I don't like those sitting in between,
 * under the chart there. What's the point of the upper stats? Keep only the
 * chart and the switchers, but very smooth clean." So, from the top:
 *
 *   THE PERIOD     the picker alone.
 *   ONE CHART      /app Analytics' card: a row of figure tabs over the chart
 *                  of the one chosen. Members, New members, Active members,
 *                  Visitors, Join rate, Engagement, Churn and, for a
 *                  community that sells, Revenue; each its number for the
 *                  period and its change against the period before. A tab
 *                  moves the line to its figure (components/app/morph-lines,
 *                  600ms, none with reduced motion), the axis keeps its width
 *                  (axisMax) and nothing above or below the chart changes
 *                  size, so the page never jumps. The six figures that stood
 *                  above it and the five sections' tabs are gone: the tabs
 *                  are the overview.
 *   DETAILS        one quiet card under the chart that follows the figure
 *                  chosen: Members shows how people joined and why they
 *                  left, Visitors where they came from (source, site,
 *                  country, device), Engagement the top posts and the people
 *                  behind them, Revenue where the money came from and the
 *                  paid members. Always the same height (the reports' fixed
 *                  body), so choosing a figure never moves the page.
 *
 * NOTHING DRAWN THAT WAS NOT COUNTED. Every number is the server's
 * (lib/communities/server/analytics-report.ts) from rows; a figure the
 * database cannot count yet (SQL part 184) has no tab, and one whose
 * counting began inside the period says from when, under the chart.
 *
 * ROUND 32, THE OWNER: "accurate, smooth, clean, without the loading
 * stuff." Still so: no progress line and no blur while figures are replaced;
 * the dates, the legend and the lines are always the answer on screen; a
 * kept answer (lib/communities/client/report-cache) is drawn on the first
 * frame of a return; only a wait longer than WAIT_DIM_MS dims the cards.
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
import type { CommunityReport, Figure, Line, ReportRow } from "@/lib/communities/analytics-report"
import type { AnalyticsView, CommunityHead } from "./view-types"
import { Notice } from "./parts"

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
/** Money in a tab, where eight figures share a row: whole units from 100 ("$2,680"), compact from 10,000 ("$12K"). */
function tabMoney(cents: number, currency: string): string {
  const major = (cents || 0) / 100
  const code = currency.toUpperCase()
  if (Math.abs(major) >= 10_000) {
    try {
      return new Intl.NumberFormat(appLocale(), { style: "currency", currency: code, notation: "compact", maximumFractionDigits: 1 }).format(major)
    } catch {
      /* An engine without compact notation: whole units. */
    }
  }
  return formatCurrency(major, code, appLocale(), Math.abs(major) >= 100 ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {})
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

/* ── The figures ─────────────────────────────────────────────────────── */

/** The figures the chart can show, in the order of their tabs. */
export type FigureKey = "members" | "joined" | "active" | "visitors" | "joinRate" | "engagement" | "churn" | "revenue"
export const FIGURES: readonly FigureKey[] = ["members", "joined", "active", "visitors", "joinRate", "engagement", "churn", "revenue"]
const FIGURE_KEY = "storelib:community-analytics-figure"
/** Round 33's section addresses (#traffic, #growth...), still opening the figure they were about. */
const OLD_HASH: Record<string, FigureKey> = { growth: "members", traffic: "visitors", engagement: "engagement", content: "engagement", revenue: "revenue" }

type Kind = "count" | "money" | "percent"
const FILTER: Record<Kind, string> = { count: "views", money: "revenue", percent: "conversion" }

interface TabSpec {
  key: FigureKey
  label: string
  value: string
  /** What the figure is, in a few words: the name's hover note. */
  hint: string
  figure: Figure | null
  line: Line | null
  kind: Kind
  /** A figure that should fall: its change is green when it does. */
  lowerIsBetter?: boolean
  /** A quiet line under the chart while this figure is chosen: when its counting began. */
  note?: string | null
}

/** One figure's line as the trend chart's rows: in its kind's slot, so a tab moves the line rather than replacing it. */
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

/** Whether a figure has a change to show against the period before (PercentChangeIndicator's own rule: something to compare with, and not a round 0%). */
function hasChange(f: Figure): boolean {
  if (f.value === null || f.previous === null) return false
  if (f.previous === 0) return f.value > 0
  return Math.round(((f.value - f.previous) / f.previous) * 100) !== 0
}

/** The highest point each kind reaches on any tab, so the axis is as wide on every tab. */
function axisMaxOf(tabs: TabSpec[]): Partial<Record<Kind, number>> {
  const out: Partial<Record<Kind, number>> = {}
  for (const t of tabs) {
    for (const xs of [t.line?.current ?? [], t.line?.previous ?? []]) for (const x of xs) if (typeof x === "number") out[t.kind] = Math.max(out[t.kind] ?? 0, x)
  }
  return out
}

/** /app Analytics' card around its figures and chart (app/app/analytics/analytics-client), class for class. */
export const TREND_CARD = "relative bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
/** Each figure's room: an equal share of the row, never under 124px, so eight fit the page's width and a phone scrolls them sideways. */
const STRIP_TAB = "min-w-[124px] flex-1 basis-0 shrink-0"

/** The dates under a chart, for the period an answer was counted for, in the viewer's language. */
function labelsFor(span: { start: number; end: number }, timeZone: string, buckets: number | null): string[] {
  const grain = grainFor(span)
  const l = bucketStarts(span, grain, timeZone).map((s) => bucketLabel(s, grain, timeZone))
  return buckets !== null && buckets !== l.length ? Array.from({ length: buckets }, (_, i) => l[i] ?? "") : l
}

/** The figure on screen: Members until the tab or the address says otherwise; kept for the tab, never a reason for the page to break. */
function useFigure(): [FigureKey, (k: FigureKey) => void] {
  const [key, setKey] = React.useState<FigureKey>("members")
  React.useLayoutEffect(() => {
    const hash = window.location.hash.replace(/^#/, "")
    let kept: string | null = null
    try {
      kept = window.sessionStorage.getItem(FIGURE_KEY)
    } catch {
      /* Private window: Members it is. */
    }
    const pick = FIGURES.includes(hash as FigureKey) ? (hash as FigureKey) : OLD_HASH[hash] ?? (FIGURES.includes(kept as FigureKey) ? (kept as FigureKey) : null)
    if (pick) setKey(pick)
  }, [])
  const choose = React.useCallback((next: FigureKey) => {
    setKey(next)
    try {
      window.sessionStorage.setItem(FIGURE_KEY, next)
    } catch {
      /* Kept for this visit only. */
    }
  }, [])
  return [key, choose]
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

  const [figure, setFigure] = useFigure()
  const tabs = React.useMemo(() => tabsOf(r, currency, drawnPeriod.end >= today), [r, currency, drawnPeriod.end, today])
  /* Before the first answer every tab but Revenue is drawn soft, so the row has its shape; a figure this community has no tab for falls back to Members. */
  const chosen = tabs.find((t) => t.key === figure) ?? tabs[0]

  /*
    A NEW PERIOD THAT TAKES A WHILE. What is on screen stays sharp and where
    it is; only after WAIT_DIM_MS does it dim a little (opacity, on the
    compositor: nothing moves, nothing blurs, no bar), and it clears the
    moment the answer lands.
  */
  const dim = cn("transition-opacity ease-[cubic-bezier(0.32,0.72,0,1)]", report.waiting && r ? "opacity-60 duration-300" : "opacity-100 duration-200")
  const dimDelay = { transitionDelay: report.waiting && r ? `${WAIT_DIM_MS}ms` : "0ms" }

  return (
    <CompareContext.Provider value={compareLabel}>
      <ReportComparedContext.Provider value={drawnCompared !== null}>
        <div ref={root} data-analytics="" data-figure={chosen.key} data-waiting={report.waiting ? "true" : "false"}>
          <div className="flex items-center gap-3" data-analytics-controls="" onPointerDownCapture={warm} onFocusCapture={warm}>
            <DateRangePicker value={period} onChange={setPeriod} today={today} firstDay={r?.firstDay} />
          </div>
          {report.failed ? (
            <div className="mt-4">
              <Notice>{tt("The figures could not be loaded.")}</Notice>
            </div>
          ) : null}

          <div className={cn("mt-4", dim)} style={dimDelay} data-analytics-trends="">
            <FigureCard tabs={tabs} chosen={chosen} onSelect={setFigure} labels={labels} cold={cold} formatMoney={formatMoney} compareLabel={compareLabel} legend={<ChartLegend range={drawnPeriod} compare={drawnCompared} />} />
          </div>

          <div className={cn("mt-4", dim)} style={dimDelay} data-analytics-lists="">
            <Details figure={chosen.key} r={r} slug={head.slug} formatMoney={formatMoney} />
          </div>

          <GaLine ga={r?.ga ?? null} />
        </div>
      </ReportComparedContext.Provider>
    </CompareContext.Provider>
  )
}

/** The tabs this answer has: a figure the database cannot count yet has none; Revenue only for a community that sells. */
function tabsOf(r: CommunityReport | null, currency: string, runsToToday: boolean): TabSpec[] {
  const f = r?.figures
  const counted = r?.counted ?? { visits: true, visitsByHour: true, active: true, engagement: true, detail: true }
  const fig = (k: keyof NonNullable<typeof f>): Figure | null => (f ? f[k] ?? null : null)
  const count = (x: Figure | null) => (x && x.value !== null ? compact(x.value) : "–")
  const rateOf = (x: Figure | null) => pct(x?.value ?? null)
  const line = (k: keyof NonNullable<typeof f>): Line | null => (r ? r.lines[k] ?? null : null)
  const since = (day: string | null | undefined) => (day ? tt("Counted since {date}.", { date: longDate(day) }) : null)
  const net = f ? (f.joined.value ?? 0) - (f.left.value ?? 0) : 0
  const membersEnd = f?.members.value ?? null
  const activeShare = f && f.active.value !== null && membersEnd ? Math.round((f.active.value / membersEnd) * 1000) / 10 : null
  const visitNote = r && !counted.visitsByHour ? tt("Visits older than three days are counted by day, not by hour.") : since(r?.countedSince.visits)
  const m = r?.money ?? null
  const out: TabSpec[] = [
    { key: "members", label: tt("Members"), value: count(fig("members")), figure: fig("members"), line: line("members"), kind: "count", hint: tt("Net {value}", { value: `${net > 0 ? "+" : ""}${n(net)}` }) },
    { key: "joined", label: tt("New members"), value: count(fig("joined")), figure: fig("joined"), line: line("joined"), kind: "count", hint: tt("{left} left", { left: n(f?.left.value ?? 0) }) },
    {
      key: "active",
      label: tt("Active members"),
      value: count(fig("active")),
      figure: fig("active"),
      line: line("active"),
      kind: "count",
      hint: tt("{rate} of members", { rate: pct(activeShare) }),
      note: r && !r.counted.active ? tt("Active members are counted by day, not by hour.") : since(r?.countedSince.active),
    },
  ]
  if (counted.visits) {
    out.push(
      { key: "visitors", label: tt("Visitors"), value: count(fig("visits")), figure: fig("visits"), line: line("visits"), kind: "count", hint: tt("{n} not members yet", { n: compact(f?.prospects.value ?? 0) }), note: visitNote },
      { key: "joinRate", label: tt("Join rate"), value: rateOf(fig("joinRate")), figure: fig("joinRate"), line: line("joinRate"), kind: "percent", hint: tt("Of visitors who were not members"), note: visitNote },
    )
  }
  if (counted.engagement) out.push({ key: "engagement", label: tt("Engagement"), value: rateOf(fig("engagement")), figure: fig("engagement"), line: line("engagement"), kind: "percent", hint: tt("Posted, commented or reacted") })
  out.push({ key: "churn", label: tt("Churn"), value: rateOf(fig("churn")), figure: fig("churn"), line: line("churn"), kind: "percent", lowerIsBetter: true, hint: tt("Of members at the start") })
  if (m) {
    const mrr = m.figures.mrr.value ?? 0
    out.push({
      key: "revenue",
      label: tt("Revenue"),
      value: tabMoney(m.figures.revenue.value ?? 0, currency),
      figure: m.figures.revenue,
      line: m.lines.revenue,
      kind: "money",
      hint: mrr > 0 ? (runsToToday ? tt("{amount} a month now", { amount: tabMoney(mrr, currency) }) : tt("{amount} a month at the end", { amount: tabMoney(mrr, currency) })) : tt("Less refunds"),
    })
  }
  return out
}

/* ── The chart ───────────────────────────────────────────────────────── */

/**
 * THE FIGURES AND THEIR CHART: /app Analytics' card, the figure tabs over
 * the trend chart of the one chosen and the legend under it. One chart for
 * every figure, never mounted again: a tab hands it another line, which it
 * moves to, and the axis is as wide on every tab (axisMax). The quiet line
 * under the legend (when a figure's counting began) has its room whenever
 * any tab of this answer has something to say there, so a tab never makes
 * the card taller or shorter. `cold` is the first visit with nothing kept:
 * the chart's frame with its dates, the figures soft.
 */
function FigureCard({
  tabs,
  chosen,
  onSelect,
  labels,
  cold,
  formatMoney,
  compareLabel,
  legend,
}: {
  tabs: TabSpec[]
  chosen: TabSpec
  onSelect: (k: FigureKey) => void
  labels: string[]
  cold: boolean
  formatMoney: (cents: number) => string
  compareLabel: string | null
  legend: React.ReactNode
}) {
  const strip = useTabStrip<HTMLDivElement>(chosen.key, tabs.map((t) => t.key))
  const rows = React.useMemo(() => chartRows(labels, cold ? null : chosen.line, chosen.kind), [labels, cold, chosen.line, chosen.kind])
  const seriesLabels = React.useMemo(() => ({ views: chosen.label, revenue: chosen.label, conversion: chosen.label }), [chosen.label])
  const axisMax = React.useMemo(() => (cold ? undefined : axisMaxOf(tabs)), [cold, tabs])
  const noteRoom = tabs.some((t) => t.note)
  return (
    <section className={TREND_CARD} data-trend="figures" aria-label={tt("Figures")}>
      <div ref={strip} role="tablist" aria-label={tt("Figures")} data-scroll-x="" className="relative flex divide-x divide-[#e5e7eb]/60 overflow-x-auto scrollbar-hide" style={TAB_STRIP_STYLE}>
        {tabs.map((t) => (
          <MetricTab
            key={t.key}
            tab={t.key}
            className={STRIP_TAB}
            label={<span title={t.hint}>{t.label}</span>}
            value={t.value}
            change={null}
            foot={t.figure && !cold && compareLabel !== null && hasChange(t.figure) ? <PercentChangeIndicator current={t.figure.value} previous={t.figure.previous} lowerIsBetter={t.lowerIsBetter} /> : "\u00a0"}
            selected={t.key === chosen.key}
            loading={cold}
            onSelect={() => onSelect(t.key)}
          />
        ))}
      </div>
      <div className="border-t border-[#e5e7eb]/60 px-2 pt-7 pb-3 sm:px-4 sm:pb-4" data-chart-for={chosen.key}>
        <AnalyticsChartWithTooltip
          chartDisplayData={rows}
          isLoading={cold}
          analyticsMode="store"
          chartMetricFilter={FILTER[chosen.kind]}
          onePageChartFilter="views"
          formatPrice={formatMoney}
          compareLabel={compareLabel}
          seriesLabels={seriesLabels}
          axisMax={axisMax}
        />
        <div className="mt-2">{legend}</div>
        {noteRoom ? (
          <p className="mt-1.5 h-[18px] truncate text-center text-[12px] leading-[18px] text-[#9ca3af]" data-trend-note="">
            {chosen.note ?? ""}
          </p>
        ) : null}
      </div>
    </section>
  )
}

/* ── The details under the chart ─────────────────────────────────────── */

type Group = "members" | "active" | "visitors" | "engagement" | "revenue"

function groupOf(k: FigureKey): Group {
  if (k === "members" || k === "joined" || k === "churn") return "members"
  if (k === "visitors" || k === "joinRate") return "visitors"
  if (k === "active" || k === "engagement" || k === "revenue") return k
  return "members"
}

interface DetailTab {
  value: string
  label: string
  body: React.ReactNode
}

/**
 * WHAT THE CHOSEN FIGURE IS MADE OF, in one card: Analytics' report card
 * with its tabs, the rows of the one chosen. It follows the figure (Members,
 * New members and Churn share the members' lists; Visitors and Join rate
 * the visitors'), keeps its own tab while the figure stays in the same
 * group, and is always the same height (ReportBody), so nothing under the
 * chart moves when a figure is chosen. Its rows come in with a quick fade.
 */
function Details({ figure, r, slug, formatMoney }: { figure: FigureKey; r: CommunityReport | null; slug: string; formatMoney: (c: number) => string }) {
  const group = groupOf(figure)
  const tabs = detailTabs(group, r, slug, formatMoney)
  /* Churn opens on why members left, New members on how they joined; chosen in the same render, so the card never shows the other list first. */
  const preferred = figure === "churn" ? "left" : figure === "joined" ? "joined" : null
  const [st, setSt] = React.useState<{ figure: FigureKey; picked: Record<Group, string | null> }>(() => ({ figure, picked: { members: preferred, active: null, visitors: null, engagement: null, revenue: null } }))
  if (st.figure !== figure) setSt({ figure, picked: preferred ? { ...st.picked, members: preferred } : st.picked })
  const picked = st.picked
  const setPicked = (fn: (p: Record<Group, string | null>) => Record<Group, string | null>) => setSt((s) => ({ ...s, picked: fn(s.picked) }))
  const current = tabs.find((t) => t.value === picked[group]) ?? tabs[0]
  const title = { members: tt("Members"), active: tt("Active members"), visitors: tt("Visitors"), engagement: tt("Engagement"), revenue: tt("Revenue") }[group]
  const help = {
    members: tt("How people joined in this period, why members left, and who stayed."),
    active: tt("Members who opened the community or did something in it."),
    visitors: tt("How each visitor arrived, once a day: a search engine, a social app, Explore, another site, or typed in directly."),
    engagement: tt("The posts that drew the most likes and comments, and the members behind them."),
    revenue: tt("Where this period's money came from, and the members paying for the community."),
  }[group]
  return (
    <ReportCard
      card="details"
      title={title}
      help={help}
      className="transition-[opacity,filter] duration-300"
      tabs={<ReportTabs value={current.value} onChange={(v) => setPicked((p) => ({ ...p, [group]: v }))} options={tabs.map((t) => ({ value: t.value, label: t.label }))} />}
    >
      <div data-details={group} data-details-tab={current.value} className="contents">
        <ReportBody blank={!r} wait="list">
          <div key={`${group}:${current.value}`} className="flex h-full flex-col motion-safe:animate-[fade-in_180ms_ease-out]">
            {current.body}
          </div>
        </ReportBody>
      </div>
    </ReportCard>
  )
}

function rowsOf(xs: ReportRow[], label: (k: string) => string): { rows: ReportListRow[]; previous: Record<string, number> | undefined } {
  return {
    rows: xs.map((x): ReportListRow => ({ key: x.key, label: label(x.key), value: x.value, note: x.note ?? null, code: x.key })),
    previous: xs.some((x) => x.previous !== undefined) ? Object.fromEntries(xs.map((x) => [x.key, x.previous ?? 0])) : undefined,
  }
}

/** Each row's share of the list, beside its name. */
function share(rows: ReportListRow[]): ReportListRow[] {
  const all = rows.reduce((a, x) => a + x.value, 0)
  return rows.map((x) => ({ ...x, note: all ? `${Math.round((x.value / all) * 100)}%` : null }))
}

function detailTabs(group: Group, r: CommunityReport | null, slug: string, formatMoney: (c: number) => string): DetailTab[] {
  const detail = r?.counted.detail ?? true
  if (group === "members") {
    const out: DetailTab[] = [
      {
        value: "joined",
        label: tt("Joined"),
        body: r ? <ReportList title={tt("How people joined")} rows={r.joins.bySource.map((x) => ({ key: x.key, label: SOURCE_LABEL[x.key] ?? x.key, value: x.value }))} format={n} empty={tt("Nobody joined in this period.")} /> : null,
      },
    ]
    if (!r || r.leaveReasons) {
      out.push({
        value: "left",
        label: tt("Left"),
        body: r?.leaveReasons ? <ReportList title={tt("Why members left")} rows={r.leaveReasons.map((x) => ({ key: x.reason, label: reasonLabel(x.reason), value: x.count }))} format={n} empty={(r.figures.left.value ?? 0) === 0 ? tt("Nobody left in this period.") : tt("Nobody said why.")} /> : null,
      })
    }
    if (r && r.joins.invites.length > 0) {
      out.push({ value: "invites", label: tt("Invites"), body: <ReportList title={tt("Invite links")} rows={r.joins.invites.map((x) => ({ key: x.key, label: x.label, value: x.value, note: x.note ? tt("Turned off") : null }))} format={n} empty="" /> })
    }
    if (r && detail && r.cohorts.length > 0) {
      out.push({
        value: "stayed",
        label: tt("Stayed"),
        body: (
          <ReportList
            title={tt("Members who stayed")}
            rows={r.cohorts.map((c) => ({ key: c.month, label: monthLabel(c.month), value: c.joined ? Math.round((c.stayed / c.joined) * 100) : 0, note: tt("{joined} joined, {active} active", { joined: n(c.joined), active: n(c.active) }) }))}
            format={(v) => `${v}%`}
            empty=""
          />
        ),
      })
    }
    return out
  }
  if (group === "active") {
    const split = r?.activeSplit ?? null
    const out: DetailTab[] = []
    if (!r || split) {
      out.push({
        value: "split",
        label: tt("New and returning"),
        body: split ? (
          <ReportList
            title={tt("New and returning")}
            rows={share([
              { key: "new", label: tt("New members"), value: split.new },
              { key: "returning", label: tt("Returning members"), value: split.returning },
            ]).filter((x) => x.value > 0)}
            format={n}
            empty={tt("Nobody was active in this period.")}
          />
        ) : null,
      })
    }
    out.push({
      value: "lately",
      label: tt("Lately"),
      body: r ? (
        <ReportList
          title={tt("Here lately")}
          rows={[
            { key: "1", label: tt("Last 24 hours"), value: r.live.active1 },
            { key: "7", label: tt("Last 7 days"), value: r.live.active7 },
            { key: "30", label: tt("Last 30 days"), value: r.live.active30, note: r.live.stickiness !== null ? tt("{rate} here every day", { rate: pct(r.live.stickiness) }) : null },
          ].filter((x) => x.value > 0)}
          format={n}
          empty={tt("Nobody was here in the last 30 days.")}
        />
      ) : null,
    })
    return out
  }
  if (group === "visitors") {
    const t = r?.traffic ?? null
    const list = (value: string, label: string, rows: ReportRow[] | undefined, name: (k: string) => string, lead: Parameters<typeof ReportList>[0]["lead"], empty: string): DetailTab => {
      const x = rows ? rowsOf(rows, name) : null
      return { value, label, body: x ? <ReportList title={label} rows={share(x.rows)} previous={x.previous} format={n} lead={lead} empty={empty} /> : null }
    }
    return [
      list("source", tt("Source"), t?.source, visitSourceName, { icon: "source" }, tt("No visits in this period.")),
      list("referrer", tt("Site"), t?.referrer, (k) => k, { icon: "referrer" }, tt("No visits from other websites in this period.")),
      list("country", tt("Country"), t?.country, (k) => countryName(k), { flag: true }, tt("No locations recorded in this period.")),
      list("device", tt("Device"), t?.device, (k) => DEVICE_LABEL[k] ?? k, { icon: "device" }, tt("No visits in this period.")),
    ]
  }
  if (group === "engagement") {
    const out: DetailTab[] = [{ value: "posts", label: tt("Posts"), body: r ? <PostList posts={r.topPosts} slug={slug} /> : null }]
    if (!r || detail) {
      out.push({
        value: "people",
        label: tt("People"),
        body: r ? <ReportList title={tt("Top contributors")} rows={r.contributors.map((c) => ({ key: c.userId, label: c.name, value: c.posts + c.comments, note: tt("{posts} posts, {comments} comments", { posts: n(c.posts), comments: n(c.comments) }) }))} format={n} empty={tt("Nobody posted or commented in this period.")} /> : null,
      })
      out.push({
        value: "spaces",
        label: tt("Spaces"),
        body: r ? <ReportList title={tt("Busiest spaces")} rows={r.topSpaces.map((s) => ({ key: s.id, label: s.name, value: s.posts + s.comments, note: tt("{posts} posts, {comments} comments", { posts: n(s.posts), comments: n(s.comments) }) }))} format={n} empty={tt("No posts or comments in this period.")} /> : null,
      })
    }
    if (r && r.events.length > 0) {
      out.push({
        value: "events",
        label: tt("Events"),
        body: <ReportList title={tt("Events")} rows={r.events.map((e) => ({ key: e.id, label: e.title, value: e.going, note: e.checkedIn === null ? shortDay(e.startsAt) : tt("{count} checked in", { count: n(e.checkedIn) }) }))} format={(v) => tt("{n} going", { n: n(v) })} empty="" />,
      })
    }
    return out
  }
  /* Revenue */
  const m = r?.money ?? null
  const runs = m ? m.figures.subscribers.value ?? 0 : 0
  return [
    {
      value: "from",
      label: tt("By source"),
      body: m ? (
        <>
          <ReportList title={tt("Revenue")} rows={m.bySource.map((x) => ({ key: x.key, label: REVENUE_FROM[x.key] ?? x.key, value: x.cents }))} format={formatMoney} empty={tt("No payments in this period.")} />
          {m.refunds.count > 0 ? <p className="mt-auto pt-2 text-[12px] text-[#6b7280]" data-refunds="">{tt("{count, plural, one {# payment} other {# payments}} refunded in this period, {total} in all.", { count: m.refunds.count, total: formatMoney(m.refunds.totalCents) })}</p> : null}
        </>
      ) : null,
    },
    {
      value: "paid",
      label: tt("Paid members"),
      body: m ? (
        <ReportList
          title={tt("Paid members")}
          rows={[
            { key: "paying", label: tt("Paying"), value: runs, note: (m.figures.mrr.value ?? 0) > 0 ? tt("{amount} a month", { amount: formatMoney(m.figures.mrr.value ?? 0) }) : null },
            { key: "new", label: tt("Started paying"), value: m.figures.newPaid.value ?? 0, note: m.upgrades > 0 ? tt("{n} upgraded from free", { n: n(m.upgrades) }) : null },
            { key: "cancelled", label: tt("Cancelled"), value: m.figures.cancellations.value ?? 0, note: m.churnRate !== null ? tt("Churn rate {rate}", { rate: pct(m.churnRate) }) : null },
          ].filter((x) => x.value > 0)}
          format={n}
          empty={tt("Nobody pays for the community yet.")}
        />
      ) : null,
    },
    {
      value: "why",
      label: tt("Cancellations"),
      body: m ? <ReportList title={tt("Why they cancelled")} rows={m.reasons.map((x) => ({ key: x.reason, label: reasonLabel(x.reason), value: x.count }))} format={n} empty={(m.figures.cancellations.value ?? 0) === 0 ? tt("Nobody cancelled in this period.") : tt("Nobody said why.")} /> : null,
    },
  ]
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

/* ── Google Analytics: one quiet line under the details, only when connected ── */

const GA_SETUP = "/app/integrations?integration=google-analytics"

function GaLine({ ga }: { ga: CommunityReport["ga"] | null }) {
  if (!ga?.id) return null
  const seen = ga.seenAt ? new Intl.DateTimeFormat(appLocale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(Date.parse(ga.seenAt)) : null
  return (
    <p className="mt-3 px-1 text-[12.5px] leading-snug text-[#6b7280]" data-ga="connected">
      {seen ? tt("This community's pages and joins go to {id}. Last data {time}.", { id: ga.id, time: seen }) : tt("This community's pages and joins go to {id}.", { id: ga.id })}{" "}
      <a href={GA_SETUP} className="inline-flex h-10 items-center text-[#1a1a2e] underline-offset-2 hover:underline sm:h-auto">
        {tt("Manage")}
      </a>
    </p>
  )
}
