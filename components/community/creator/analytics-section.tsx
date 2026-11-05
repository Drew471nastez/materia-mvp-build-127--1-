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
 * ROUND 38, THE OWNER: "too many stats in the chart, 1 2 3 4 5 6 7 8. I
 * want to limit things up to 5 maximum." So the row holds five figures
 * (SHOWN_MAX): Members, Active members, Visitors, Engagement and Revenue
 * for a community that sells, Join rate for one that does not
 * (defaultShown). The others are one quiet menu away, at the row's end
 * (FigureMenu, the /app action list: a menu on a computer, a sheet on a
 * phone): choosing one puts it in place of the figure on screen, and the
 * row is kept for this browser (SHOWN_KEY). A figure opened from the
 * address (#churn) stands in the last place until another is chosen. The
 * same five on a phone, in the row that scrolls; the menu stays at its end.
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
import { ChartLegend, CompareContext, PercentChangeIndicator } from "@/app/(storelib)/app/analytics/analytics-client"
import { ReportBody, ReportCard, ReportComparedContext, ReportEmpty, ReportList, ReportTabs, type ReportListRow } from "@/app/(storelib)/app/analytics/analytics-reports"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { longDate, presetRange, rangeLabel, type PresetId } from "@/lib/date-range/range"
import { bucketLabel, bucketStarts, grainFor } from "@/lib/analytics/buckets"
import { countryName, sourceName } from "@/lib/analytics/reports"
import { reportNow } from "@/lib/analytics/report-cache"
import { askCommunityReport, communityAsk, keptCommunityReport, sameReport, warmCommunityReport, FRESH_MS, type CommunityAsk, type ShownReport } from "@/lib/communities/client/report-cache"
import type { CommunityReport, Figure, Line, ReportRow } from "@/lib/communities/analytics-report"
import { FIGURES, SHOWN_MAX, defaultShown, shownFigures, type FigureKey } from "@/lib/communities/analytics-figures"
import type { AnalyticsView, CommunityHead } from "./view-types"
import { MoreHorizontal } from "lucide-react"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"

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

/* The figures the chart can show, in the order of their tabs, and the five in the row (round 38): lib/communities/analytics-figures. */
export { FIGURES, SHOWN_MAX, defaultShown, shownFigures, type FigureKey }
const FIGURE_KEY = "storelib:community-analytics-figure"
/** The figures the owner put in the row, in their places, kept in this browser. */
const SHOWN_KEY = "storelib:community-analytics-shown"
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
/** Each figure's room: an equal share of the row, never under 124px, so five fit the page's width and a phone scrolls them sideways. */
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

/** The owner's row as kept in this browser; null until read, or with none kept. Never a reason for the page to break. */
function useSavedShown(): [string[] | null, (next: string[] | null) => void] {
  const [saved, setSaved] = React.useState<string[] | null>(null)
  React.useLayoutEffect(() => {
    try {
      const raw = window.localStorage.getItem(SHOWN_KEY)
      const xs = raw ? (JSON.parse(raw) as unknown) : null
      if (Array.isArray(xs) && xs.every((x) => typeof x === "string")) setSaved(xs.slice(0, SHOWN_MAX))
    } catch {
      /* Private window, or nothing kept: the defaults. */
    }
  }, [])
  const save = React.useCallback((next: string[] | null) => {
    setSaved(next)
    try {
      if (next) window.localStorage.setItem(SHOWN_KEY, JSON.stringify(next))
      else window.localStorage.removeItem(SHOWN_KEY)
    } catch {
      /* Kept for this visit only. */
    }
  }, [])
  return [saved, save]
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
  const [saved, saveShown] = useSavedShown()
  const tabs = React.useMemo(() => tabsOf(r, currency, drawnPeriod.end >= today), [r, currency, drawnPeriod.end, today])
  /* Before the first answer every tab but Revenue is drawn soft, so the row has its shape; a figure this community has no tab for falls back to Members. */
  const chosen = tabs.find((t) => t.key === figure) ?? tabs[0]
  const sells = tabs.some((t) => t.key === "revenue")
  const available = React.useMemo(() => tabs.map((t) => t.key), [tabs])
  const shownKeys = shownFigures(available, saved, sells, chosen.key)
  const shownKey = shownKeys.join(",")
  const row = React.useMemo(() => shownKey.split(",").map((k) => tabs.find((t) => t.key === k)).filter((t): t is TabSpec => !!t), [shownKey, tabs])
  /* A figure from the menu takes the place of the one on screen, and is the one on screen. */
  const swapIn = React.useCallback(
    (next: FigureKey) => {
      const row = shownFigures(available, saved, sells, chosen.key)
      const at = row.indexOf(chosen.key)
      if (!row.includes(next)) row[at >= 0 ? at : row.length - 1] = next
      saveShown(row.join(",") === defaultShown(available, sells).join(",") ? null : row)
      setFigure(next)
    },
    [available, saved, sells, chosen.key, saveShown, setFigure],
  )
  const resetShown = React.useCallback(() => {
    saveShown(null)
    const row = defaultShown(available, sells)
    if (!row.includes(chosen.key)) setFigure(row[0])
  }, [available, sells, chosen.key, saveShown, setFigure])

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
          {/*
            Round 39: a failed read says so beside the period, in the row's own height. Above the chart it pushed every
            card 56px down when it came (scripts/check-community-admin-round39.mjs: "after 57", CLS 0.02).
          */}
          <div className="flex min-w-0 items-center gap-3" data-analytics-controls="" onPointerDownCapture={warm} onFocusCapture={warm}>
            <DateRangePicker value={period} onChange={setPeriod} today={today} firstDay={r?.firstDay} />
            {report.failed ? (
              <p role="alert" data-analytics-failed="" className="min-w-0 truncate text-[13px] text-[#b42318]">
                {tt("The figures could not be loaded.")}
              </p>
            ) : null}
          </div>

          <div className={cn("mt-4", dim)} style={dimDelay} data-analytics-trends="">
            <FigureCard tabs={tabs} shown={row} custom={saved !== null && shownKey !== defaultShown(available, sells).join(",")} onSwap={swapIn} onReset={resetShown} chosen={chosen} onSelect={setFigure} labels={labels} cold={cold} formatMoney={formatMoney} compareLabel={compareLabel} legend={<ChartLegend range={drawnPeriod} compare={drawnCompared} />} />
          </div>

          <div className={cn("mt-4", dim)} style={dimDelay} data-analytics-lists="">
            <ReportGrid r={r} head={head} formatMoney={formatMoney} />
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
  /* Of the members other than the owner, when the answer leaves the owner out of Active members (part 274). */
  const membersBeside = membersEnd !== null && r?.ownerLeftOut ? Math.max(0, membersEnd - 1) : membersEnd
  const activeShare = f && f.active.value !== null && membersBeside ? Math.round((f.active.value / membersBeside) * 1000) / 10 : null
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
  shown,
  custom,
  onSwap,
  onReset,
  chosen,
  onSelect,
  labels,
  cold,
  formatMoney,
  compareLabel,
  legend,
}: {
  /** Every figure this answer has: the axis is as wide on each. */
  tabs: TabSpec[]
  /** The five in the row. */
  shown: TabSpec[]
  /** The row is the owner's own, not the defaults. */
  custom: boolean
  onSwap: (k: FigureKey) => void
  onReset: () => void
  chosen: TabSpec
  onSelect: (k: FigureKey) => void
  labels: string[]
  cold: boolean
  formatMoney: (cents: number) => string
  compareLabel: string | null
  legend: React.ReactNode
}) {
  const strip = useTabStrip<HTMLDivElement>(chosen.key, shown.map((t) => t.key))
  const hidden = tabs.filter((t) => !shown.some((x) => x.key === t.key))
  const rows = React.useMemo(() => chartRows(labels, cold ? null : chosen.line, chosen.kind), [labels, cold, chosen.line, chosen.kind])
  const seriesLabels = React.useMemo(() => ({ views: chosen.label, revenue: chosen.label, conversion: chosen.label }), [chosen.label])
  const axisMax = React.useMemo(() => (cold ? undefined : axisMaxOf(tabs)), [cold, tabs])
  const noteRoom = tabs.some((t) => t.note)
  return (
    <section className={TREND_CARD} data-trend="figures" aria-label={tt("Figures")}>
      <div className="flex">
      <div ref={strip} role="tablist" aria-label={tt("Figures")} data-scroll-x="" data-shown={shown.map((t) => t.key).join(" ")} className="relative flex min-w-0 flex-1 divide-x divide-[#e5e7eb]/60 overflow-x-auto scrollbar-hide" style={TAB_STRIP_STYLE}>
        {shown.map((t) => (
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
      {hidden.length ? <FigureMenu chosen={chosen} hidden={hidden} cold={cold} custom={custom} onSwap={onSwap} onReset={onReset} /> : null}
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

/**
 * THE OTHER FIGURES, at the end of the row: the /app action list (a menu on
 * a computer, a sheet on a phone), each with its number for the period.
 * Choosing one puts it in place of the figure on screen. Outside the row's
 * scroll, so a phone always has it at hand.
 */
function FigureMenu({ chosen, hidden, cold, custom, onSwap, onReset }: { chosen: TabSpec; hidden: TabSpec[]; cold: boolean; custom: boolean; onSwap: (k: FigureKey) => void; onReset: () => void }) {
  const items = React.useMemo<ActionMenuItem[]>(() => {
    const out: ActionMenuItem[] = hidden.map((t, i) => ({ id: `figure-${t.key}`, label: t.label, hint: cold ? undefined : t.value, section: i === 0 ? tt("In place of {figure}", { figure: chosen.label }) : undefined, onClick: () => onSwap(t.key) }))
    if (custom) out.push({ id: "figures-default", label: tt("Default figures"), separatorBefore: true, onClick: onReset })
    return out
  }, [hidden, cold, custom, chosen.label, onSwap, onReset])
  return (
    <div className="flex shrink-0 items-stretch border-l border-[#e5e7eb]/60">
      <ResponsiveActionMenu
        title={tt("Other figures")}
        items={items}
        menuWidth="w-60"
        trigger={
          <button
            type="button"
            data-figure-menu=""
            aria-label={tt("Other figures")}
            title={tt("Other figures")}
            className="grid w-11 cursor-pointer place-items-center text-[#9ca3af] outline-none transition-colors duration-150 hover:bg-[#f8f9fa] hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_rgba(139,92,246,0.4)] active:bg-[#f1f2f4] data-[state=open]:bg-[#f8f9fa] data-[state=open]:text-[#1a1a2e] [-webkit-tap-highlight-color:transparent]"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        }
      />
    </div>
  )
}

/* ── The reports under the chart ─────────────────────────────────────── */

/*
  ROUND 39, THE OWNER: "Add more important stuff to the analytics, ensure the
  modals and tabs are similar to the /app Analytics page, smooth clean, more
  tabs ... source, site, country, device all smooth clean, better." Round 37
  had one details card under the chart, following the figure chosen. Now the
  chart keeps the top, and under it is /app Analytics' grid of report cards
  (app/app/analytics/analytics-reports.tsx ReportsView: one column on a
  phone, two from 768px, three from 1280px), each a ReportCard with its own
  switcher (the one white pill that slides), its rows (the grey fill, the
  marks: a source's logo, a country's flag, a device), five rows and View all
  (the /app dialog, with a search for a long list), in a body of one fixed
  height, so a switch or an answer moves nothing on the page:

    Visitors          Source, Site, Country, Device
    Joins             how people joined, the invite links that brought them
    Revenue           by source, by plan, the paid members (a community that sells)
    Retention         of the members who joined each month: still members, still here
    Active members    new and returning, here lately
    Why members left  the members' reasons, the paid members' (a community that sells)
    Top posts         the posts, the spaces
    Top members       who posted and commented most, who took part
    Event attendance  going, checked in (Calendar on)
    Program progress  how far, finished, started (Learn on)

  Which cards there are follows the community (head), not the answer, so the
  grid is the same before and after the figures land. Every number is the
  server's (lib/communities/server/analytics-report.ts), as before.
*/

interface ReportTab {
  value: string
  label: string
  body: React.ReactNode
}

interface ReportSpec {
  card: string
  title: string
  help: string
  tabs: ReportTab[]
}

/**
 * ONE REPORT: Analytics' card, its switcher when it has more than one list,
 * and the list chosen in the fixed body (ReportBody: the grey shimmer until
 * the first answer, the rows crossfading in over it). A switch swaps the
 * rows in place, in the same frame: same height, no motion but the pill.
 */
function Report({ spec, waiting }: { spec: ReportSpec; waiting: boolean }) {
  const [picked, setPicked] = React.useState<string | null>(null)
  const current = spec.tabs.find((t) => t.value === picked) ?? spec.tabs[0]
  return (
    <ReportCard
      card={spec.card}
      title={spec.title}
      help={spec.help}
      tabs={spec.tabs.length > 1 ? <ReportTabs label={spec.title} value={current.value} onChange={setPicked} options={spec.tabs.map((t) => ({ value: t.value, label: t.label }))} /> : undefined}
    >
      <div data-report={spec.card} data-report-tab={current.value} className="contents">
        <ReportBody blank={waiting} wait="list">
          <React.Fragment key={current.value}>{current.body ?? <ReportEmpty>{tt("Not counted for this period.")}</ReportEmpty>}</React.Fragment>
        </ReportBody>
      </div>
    </ReportCard>
  )
}

/** The grid of reports under the chart (round 39). */
function ReportGrid({ r, head, formatMoney }: { r: CommunityReport | null; head: CommunityHead; formatMoney: (c: number) => string }) {
  const specs = reportSpecs(r, head, formatMoney)
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-reports={specs.map((s) => s.card).join(" ")}>
      {specs.map((s) => (
        <Report key={s.card} spec={s} waiting={!r} />
      ))}
    </div>
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

const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/** The reports this community has, in the grid's order, each with its lists (empty bodies while `r` is null). */
export function reportSpecs(r: CommunityReport | null, head: CommunityHead, formatMoney: (c: number) => string): ReportSpec[] {
  const detail = r?.counted.detail ?? true
  const out: ReportSpec[] = []
  const body = (make: (r: CommunityReport) => React.ReactNode): React.ReactNode => (r ? make(r) : null)

  /* Visitors: where they came from, the site that sent them, their country, their device. */
  if (!r || r.traffic) {
    const t = r?.traffic ?? null
    const list = (value: string, label: string, title: string, rows: ReportRow[] | undefined, name: (k: string) => string, lead: Parameters<typeof ReportList>[0]["lead"], empty: string): ReportTab => {
      const x = rows ? rowsOf(rows, name) : null
      return { value, label, body: x ? <ReportList title={title} rows={share(x.rows)} previous={x.previous} format={n} lead={lead} empty={empty} /> : null }
    }
    out.push({
      card: "visitors",
      title: tt("Visitors"),
      help: tt("How each visitor arrived, once a day: a search engine, a social app, Explore, another site, or typed in directly. Then the site that sent them, their country and their device."),
      tabs: [
        list("source", tt("Source"), tt("Traffic sources"), t?.source, visitSourceName, { icon: "source" }, tt("No visits in this period.")),
        list("referrer", tt("Site"), tt("Referrers"), t?.referrer, (k) => k, { icon: "referrer" }, tt("No visits from other websites in this period.")),
        list("country", tt("Country"), tt("Countries"), t?.country, (k) => countryName(k), { flag: true }, tt("No locations recorded in this period.")),
        list("device", tt("Device"), tt("Devices"), t?.device, (k) => DEVICE_LABEL[k] ?? k, { icon: "device" }, tt("No visits in this period.")),
      ],
    })
  }

  /* Joins: how people joined, and the invite links that brought them in. */
  const joins: ReportTab[] = [
    {
      value: "how",
      label: tt("How they joined"),
      body: body((r) => <ReportList title={tt("How people joined")} rows={share(r.joins.bySource.map((x) => ({ key: x.key, label: SOURCE_LABEL[x.key] ?? x.key, value: x.value })))} format={n} empty={tt("Nobody joined in this period.")} />),
    },
  ]
  if (!r || r.joins.invites.length > 0) {
    joins.push({ value: "invites", label: tt("Invites"), body: body((r) => <ReportList title={tt("Invite links")} rows={r.joins.invites.map((x) => ({ key: x.key, label: x.label, value: x.value, note: x.note ? tt("Turned off") : null }))} format={n} empty={tt("No invite link was used in this period.")} />) })
  }
  out.push({ card: "joins", title: tt("Joins"), help: tt("How the people who joined in this period got in: for free, by paying, by an invite, or added by you or your team. Invites: the links that brought them."), tabs: joins })

  /* Revenue, for a community that sells (the head's paid access before the answer, the answer's money after). */
  const m = r?.money ?? null
  if (r ? m !== null : head.access === "paid") {
    const runs = m ? m.figures.subscribers.value ?? 0 : 0
    out.push({
      card: "revenue",
      title: tt("Revenue"),
      help: tt("Where this period's money came from, less refunds: memberships and purchases, programs, event tickets. By plan: each plan by the name it is sold under, with the members paying for it at the end of the period."),
      tabs: [
        {
          value: "from",
          label: tt("By source"),
          body: m ? (
            <>
              <ReportList title={tt("Revenue")} rows={m.bySource.map((x) => ({ key: x.key, label: REVENUE_FROM[x.key] ?? x.key, value: x.cents }))} format={formatMoney} empty={tt("No payments in this period.")} />
              {m.refunds.count > 0 ? <p className="mt-auto truncate pt-2 text-[12px] text-[#6b7280]" data-refunds="">{tt("{count, plural, one {# payment} other {# payments}} refunded in this period, {total} in all.", { count: m.refunds.count, total: formatMoney(m.refunds.totalCents) })}</p> : null}
            </>
          ) : null,
        },
        {
          value: "plan",
          label: tt("By plan"),
          body: m ? (
            <ReportList
              title={tt("Revenue by plan")}
              rows={(m.byPlan ?? []).map((x) => ({ key: x.key, label: x.label || tt("Plan"), value: x.cents, note: x.paying > 0 ? tt("{n} paying", { n: n(x.paying) }) : null }))}
              previous={m.byPlan?.some((x) => x.previous !== undefined) ? Object.fromEntries((m.byPlan ?? []).map((x) => [x.key, x.previous ?? 0])) : undefined}
              format={formatMoney}
              empty={tt("No plan sold in this period.")}
            />
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
      ],
    })
  }

  /* Retention: of the members who joined each month, how many are still members, and how many of those are still here. */
  if (detail) {
    const cohortRows = (r: CommunityReport, of: "stayed" | "active") =>
      r.cohorts.map((c) => ({ key: c.month, label: monthLabel(c.month), value: pctOf(of === "stayed" ? c.stayed : c.active, c.joined), note: of === "stayed" ? tt("{stayed} of {joined}", { stayed: n(c.stayed), joined: n(c.joined) }) : tt("{active} of {joined}", { active: n(c.active), joined: n(c.joined) }) }))
    out.push({
      card: "retention",
      title: tt("Retention"),
      help: tt("The members who joined in each month. Still members: how many have not left. Still active: how many were here in the last 30 days."),
      tabs: [
        { value: "stayed", label: tt("Still members"), body: body((r) => <ReportList title={tt("Members who stayed")} rows={cohortRows(r, "stayed")} format={(v) => `${v}%`} empty={tt("Nobody joined in these months.")} />) },
        { value: "active", label: tt("Still active"), body: body((r) => <ReportList title={tt("Members still active")} rows={cohortRows(r, "active")} format={(v) => `${v}%`} empty={tt("Nobody joined in these months.")} />) },
      ],
    })
  }

  /* Active members: new and returning, and here lately. */
  const active: ReportTab[] = []
  if (!r || r.activeSplit) {
    active.push({
      value: "split",
      label: tt("New and returning"),
      body: body((r) =>
        r.activeSplit ? (
          <ReportList
            title={tt("New and returning")}
            rows={share([
              { key: "new", label: tt("New members"), value: r.activeSplit.new },
              { key: "returning", label: tt("Returning members"), value: r.activeSplit.returning },
            ]).filter((x) => x.value > 0)}
            format={n}
            empty={tt("Nobody was active in this period.")}
          />
        ) : null,
      ),
    })
  }
  active.push({
    value: "lately",
    label: tt("Lately"),
    body: body((r) => (
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
    )),
  })
  out.push({ card: "active", title: tt("Active members"), help: tt("Members who opened the community or did something in it. New: they joined in this period. Lately: who was here in the last day, week and month."), tabs: active })

  /* Why members left: the members' own reasons, and the paid members' when they cancelled. */
  const left: ReportTab[] = []
  if (!r || r.leaveReasons) {
    left.push({
      value: "left",
      label: tt("Members"),
      body: body((r) => (r.leaveReasons ? <ReportList title={tt("Why members left")} rows={r.leaveReasons.map((x) => ({ key: x.reason, label: reasonLabel(x.reason), value: x.count }))} format={n} empty={(r.figures.left.value ?? 0) === 0 ? tt("Nobody left in this period.") : tt("Nobody said why.")} /> : null)),
    })
  }
  if (r ? m !== null : head.access === "paid") {
    left.push({ value: "why", label: tt("Paid members"), body: m ? <ReportList title={tt("Why they cancelled")} rows={m.reasons.map((x) => ({ key: x.reason, label: reasonLabel(x.reason), value: x.count }))} format={n} empty={(m.figures.cancellations.value ?? 0) === 0 ? tt("Nobody cancelled in this period.") : tt("Nobody said why.")} /> : null })
  }
  if (left.length) out.push({ card: "left", title: tt("Why members left"), help: tt("The reason each member picked when they left, and each paid member when they cancelled."), tabs: left })

  /* Top posts, and the spaces they were in. */
  const posts: ReportTab[] = [{ value: "posts", label: tt("Posts"), body: body((r) => <PostList posts={r.topPosts} slug={head.slug} />) }]
  if (detail) {
    posts.push({
      value: "spaces",
      label: tt("Spaces"),
      body: body((r) => <ReportList title={tt("Busiest spaces")} rows={r.topSpaces.map((s) => ({ key: s.id, label: s.name, value: s.posts + s.comments, note: tt("{posts} posts, {comments} comments", { posts: n(s.posts), comments: n(s.comments) }) }))} format={n} empty={tt("No posts or comments in this period.")} />),
    })
  }
  out.push({ card: "posts", title: tt("Top posts"), help: tt("The posts of this period that drew the most likes and comments, and the spaces with the most posts and comments."), tabs: posts })

  /* Top members: who posted and commented most, and how many took part at all. */
  if (detail) {
    out.push({
      card: "contributors",
      title: tt("Top members"),
      help: tt("The members who posted and commented the most in this period. Took part: how many members posted, commented or reacted."),
      tabs: [
        {
          value: "top",
          label: tt("Most active"),
          body: body((r) => <ReportList title={tt("Top contributors")} rows={r.contributors.map((c) => ({ key: c.userId, label: c.name, value: c.posts + c.comments, note: tt("{posts} posts, {comments} comments", { posts: n(c.posts), comments: n(c.comments) }) }))} format={n} empty={tt("Nobody posted or commented in this period.")} />),
        },
        {
          value: "people",
          label: tt("Took part"),
          body: body((r) => (
            <ReportList
              title={tt("Took part")}
              rows={[
                { key: "posted", label: tt("Posted"), value: r.people.posters },
                { key: "commented", label: tt("Commented"), value: r.people.commenters },
                { key: "reacted", label: tt("Reacted"), value: r.people.reactors },
              ].filter((x) => x.value > 0)}
              format={n}
              empty={tt("Nobody posted, commented or reacted in this period.")}
            />
          )),
        },
      ],
    })
  }

  /* Event attendance, with Calendar on: who said they are going, and who was checked in at the door. */
  if (head.eventsEnabled) {
    const em = r?.eventMoney ?? null
    out.push({
      card: "events",
      title: tt("Event attendance"),
      help: tt("The events of this period: how many members said they are going, and how many tickets were checked in at the door."),
      tabs: [
        {
          value: "going",
          label: tt("Going"),
          body: body((r) => (
            <>
              <ReportList title={tt("Event attendance")} rows={r.events.map((e) => ({ key: e.id, label: e.title, value: e.going, note: shortDay(e.startsAt) }))} format={n} empty={tt("No events in this period.")} />
              {em && em.sold > 0 ? <p className="mt-auto truncate pt-2 text-[12px] text-[#6b7280]" data-tickets="">{tt("{count, plural, one {# ticket} other {# tickets}} sold, {total} after refunds.", { count: em.sold, total: formatCurrency(em.netCents / 100, (em.currency || "usd").toUpperCase(), appLocale()) })}</p> : null}
            </>
          )),
        },
        {
          value: "checked",
          label: tt("Checked in"),
          body: body((r) => <ReportList title={tt("Checked in")} rows={r.events.filter((e) => e.checkedIn !== null).map((e) => ({ key: e.id, label: e.title, value: e.checkedIn ?? 0, note: tt("of {going} going", { going: n(e.going) }) }))} format={n} empty={tt("No tickets were checked in in this period.")} />),
        },
      ],
    })
  }

  /* Program progress, with Learn on: how far the members who started are, who finished, who started. */
  if (head.classroomEnabled && detail) {
    out.push({
      card: "programs",
      title: tt("Program progress"),
      help: tt("Each program: how far the members who started it are on average, how many finished it, and how many started it."),
      tabs: [
        { value: "progress", label: tt("Progress"), body: body((r) => <ReportList title={tt("Program progress")} rows={r.programs.map((p) => ({ key: p.id, label: p.title, value: Math.round(p.percent), note: tt("{done} of {started} finished", { done: n(p.completed), started: n(p.started) }) }))} format={(v) => `${v}%`} empty={tt("Nobody started a program yet.")} />) },
        { value: "finished", label: tt("Finished"), body: body((r) => <ReportList title={tt("Finished")} rows={r.programs.filter((p) => p.completed > 0).map((p) => ({ key: p.id, label: p.title, value: p.completed, note: tt("{share} of who started", { share: `${pctOf(p.completed, p.started)}%` }) }))} format={n} empty={tt("Nobody finished a program yet.")} />) },
        { value: "started", label: tt("Started"), body: body((r) => <ReportList title={tt("Started")} rows={r.programs.map((p) => ({ key: p.id, label: p.title, value: p.started, note: p.lessons > 0 ? tt("{n} lessons done in this period", { n: n(p.lessons) }) : null }))} format={n} empty={tt("Nobody started a program yet.")} />) },
      ],
    })
  }
  return out
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

/**
 * Top posts: Analytics' rows (round 39: it was a list of its own), each its
 * likes and comments together, the two beside its title, the title opening
 * the post in a new tab, and View all for the rest.
 */
function PostList({ posts, slug }: { posts: CommunityReport["topPosts"]; slug: string }) {
  return (
    <ReportList
      title={tt("Top posts")}
      rows={posts.map((p) => ({
        key: p.id,
        label: p.title,
        value: p.reactions + p.comments,
        note: `${tt("{n, plural, one {# like} other {# likes}}", { n: p.reactions })} · ${tt("{n, plural, one {# comment} other {# comments}}", { n: p.comments })}`,
        href: `/community/${slug}/post/${p.id}`,
      }))}
      format={n}
      empty={tt("No reactions or comments in this period yet.")}
    />
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
