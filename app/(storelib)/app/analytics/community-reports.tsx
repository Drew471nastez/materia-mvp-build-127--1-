"use client"

/**
 * ===========================================================================
 *  COMMUNITIES, ON THE SELLER'S ANALYTICS
 * ===========================================================================
 * Every figure here is the communities' own answer: app/api/app/community/
 * <id>/analytics for the page's period, comparison and time zone (lib/
 * communities/server/analytics-report), one request a community, added up
 * for several by lib/communities/report-total. A community's visits are its
 * own beacon's (one a visitor a day), never added to the page views.
 *
 * TWO SIZES.
 *
 *   beside the rest   (All types) the Communities card (members now, who
 *                     joined, visits, each community) and Community revenue
 *   on their own      (Communities chosen, round 43, the owner: "show
 *                     everything necessary for communities") the page's
 *                     figure row and chart become the communities': members,
 *                     new members, active members, posts, payments received
 *                     and MRR, the chart of the one chosen; under it Growth
 *                     (joins, leaves, churn), Activity (active members,
 *                     posts, comments, reactions, engagement), Community
 *                     revenue, Busiest spaces, Top posts, How people joined
 *                     and the Communities list. A switcher picks one
 *                     community or all of them.
 *
 * Every card, and the figure chosen over the chart, opens its report in the
 * shared window (./report-detail): the whole list, the line over time, the
 * period before, each community's own share.
 *
 * MONEY. Payments received are the money paid in the period, less refunds
 * (the community's orders, programs and tickets); MRR is what the plans
 * being paid for bring in a month at the period's end, a yearly plan a
 * twelfth (lib/communities/membership-money). A yearly plan paid last month
 * is $83.33 of MRR and nothing received this month. MRR is the figure the
 * community list and its Overview show, read by the same code in the same
 * currency (round 43, tests/community-money-r43.test.ts). Communities that
 * report in two currencies are never added together.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { ReportBody, ReportCard, ReportChange, ReportComparedContext, ReportEmpty, ReportList, ReportTabs } from "./analytics-reports"
import { DetailBody, DetailPanel, OpenDetailContext, ViewReport, type DetailRow, type DetailSection, type DetailView } from "./report-detail"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { AppLink } from "@/components/app/app-link"
import { formatMinor } from "@/lib/markets/money"
import { MetricTab, MetricTabLine } from "@/components/app/metric-tab"
import { AnalyticsChartWithTooltip, type AnalyticsChartData } from "@/components/app/analytics-chart"
import { bucketLabel, bucketStarts } from "@/lib/analytics/buckets"
import { combineReports, type Combined } from "@/lib/communities/report-total"
import type { CommunityReport, Figure, Line } from "@/lib/communities/analytics-report"
import { fetchWithDeadline } from "@/lib/net/request"

export interface CommunityPlace {
  id: string
  name: string
  slug?: string | null
}

/* ── Words and numbers ───────────────────────────────────────────────── */

const n = (v: number | null | undefined) => (v === null || v === undefined ? "–" : Math.round(v).toLocaleString(appLocale()))
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${v.toLocaleString(appLocale(), { maximumFractionDigits: 1 })}%`)
const headline = (f: Figure | null | undefined) => {
  const value = f?.value ?? 0
  const previous = f?.previous ?? null
  return { value, previous: previous ?? 0, change: previous === null || previous === 0 ? null : (value - previous) / Math.abs(previous) }
}

const SOURCE_LABEL: Record<string, string> = {
  get free() { return tt("Joined for free") },
  get subscription() { return tt("Paid membership") },
  get purchase() { return tt("One time purchase") },
  get product() { return tt("Owns a product that includes it") },
  get invite() { return tt("Invite") },
  get manual() { return tt("Added by you or your team") },
  get platform() { return tt("Added by Storelib") },
}
const REASON_LABEL: Record<string, string> = {
  get not_for_me() { return tt("Not for me") },
  get too_busy() { return tt("No time") },
  get too_expensive() { return tt("Too expensive") },
  get not_useful() { return tt("Not enough useful posts") },
  get other() { return tt("Something else") },
  get none() { return tt("No reason given") },
}
const MONEY_SOURCE: Record<string, string> = {
  get memberships() { return tt("Memberships and purchases") },
  get programs() { return tt("Programs") },
  get tickets() { return tt("Event tickets") },
}

/* ── The answers ─────────────────────────────────────────────────────── */

type Answers = Record<string, CommunityReport | "failed">

/** Each community's answer for the page's question, one request each; the last answers stay drawn, softened, until the new ones come. */
function useCommunityAnswers(communities: CommunityPlace[], span: { start: number; end: number }, compare: { start: number; end: number } | null, timeZone: string, refresh: number) {
  const [answers, setAnswers] = React.useState<Answers>({})
  const [question, setQuestion] = React.useState("")
  const ask = `${span.start}|${span.end}|${compare?.start ?? ""}|${compare?.end ?? ""}|${timeZone}`
  const ids = communities.map((c) => c.id).join(",")
  React.useEffect(() => {
    let live = true
    const q = new URLSearchParams({ start: new Date(span.start).toISOString(), end: new Date(span.end).toISOString(), tz: timeZone })
    if (compare) {
      q.set("cstart", new Date(compare.start).toISOString())
      q.set("cend", new Date(compare.end).toISOString())
    }
    for (const c of communities) {
      /* Round AL: with an end (lib/net/request WAIT_MS.read): a community that never answers is "failed" with Try again, not a card waiting for ever. */
      fetchWithDeadline(`/api/app/community/${encodeURIComponent(c.id)}/analytics?${q}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: CommunityReport) => {
          if (!live) return
          setAnswers((a) => ({ ...a, [c.id]: d }))
          setQuestion(ask)
        })
        .catch(() => live && setAnswers((a) => ({ ...a, [c.id]: a[c.id] && a[c.id] !== "failed" ? a[c.id] : "failed" })))
    }
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, refresh, ids])
  return { answers, stale: !!question && question !== ask }
}

/* An answer to draw: whatever it lacks is drawn as a dash (lib/communities/report-total whole). */
const isReport = (a: CommunityReport | "failed" | undefined): a is CommunityReport => !!a && a !== "failed" && typeof a === "object" && !!a.figures

/** The chart's buckets, named in the viewer's zone. */
function labelsOf(span: { start: number; end: number }, c: Combined | null, timeZone: string): string[] {
  if (!c) return []
  return bucketStarts(span, c.grain, timeZone)
    .slice(0, c.buckets)
    .map((s) => bucketLabel(s, c.grain, timeZone))
}

const nums = (xs: (number | null)[] | null | undefined) => (xs ?? []).map((x) => x ?? 0)

/* ── The page's part ─────────────────────────────────────────────────── */

type MetricKey = "members" | "joined" | "active" | "posts" | "revenue" | "mrr"

export function CommunityReports({
  communities,
  span,
  compare,
  timeZone,
  refresh = 0,
  full = false,
  rangeText,
  againstText = null,
  legend = null,
}: {
  communities: CommunityPlace[]
  span: { start: number; end: number }
  compare: { start: number; end: number } | null
  timeZone: string
  refresh?: number
  /** Communities chosen on their own: the figures, the chart and every card. */
  full?: boolean
  /** The period and what it is compared with, as the page names them, under an opened report's title. */
  rangeText?: string
  againstText?: string | null
  /** The page's own legend under the chart (analytics-client ChartLegend), so both charts name their lines alike. */
  legend?: React.ReactNode
}) {
  const shown = React.useMemo(() => communities.slice(0, 12), [communities])
  const { answers, stale } = useCommunityAnswers(shown, span, compare, timeZone, refresh)
  const [picked, setPicked] = React.useState("all")
  const chosen = picked !== "all" && shown.some((c) => c.id === picked) ? picked : "all"
  const named = React.useMemo(
    () =>
      shown
        .filter((c) => chosen === "all" || c.id === chosen)
        .map((c) => ({ id: c.id, name: c.name, report: answers[c.id] }))
        .filter((x): x is { id: string; name: string; report: CommunityReport } => isReport(x.report)),
    [shown, chosen, answers],
  )
  const total = React.useMemo(() => combineReports(named), [named])
  const blank = !total
  const compared = compare !== null
  const money = React.useCallback((cents: number | null | undefined, currency?: string | null) => formatMinor(cents ?? 0, (currency || total?.money?.currency || "usd").toUpperCase(), appLocale()), [total?.money?.currency])
  const runsToNow = span.end >= Date.now() - 60_000
  const labels = React.useMemo(() => labelsOf(span, total, timeZone), [span, total, timeZone])

  /* ── Opened (./report-detail) ── */
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const openDetail = React.useCallback((id: string) => {
    setDetailId(id)
    setDetailOpen(true)
  }, [])
  const detailView = React.useMemo<DetailView | null>(() => (detailId && total ? viewOf(detailId, { total, labels, compared, money, runsToNow, several: named.length > 1 }) : null), [detailId, total, labels, compared, money, runsToNow, named.length])
  const range = rangeText ? (againstText ? tt("{range} compared with {against}", { range: rangeText, against: againstText }) : rangeText) : null

  const switcher =
    shown.length > 1 ? (
      <div className="orders-strip -mx-1 overflow-x-auto px-1" data-community-switch="">
        <ReportTabs label={tt("Community")} value={chosen} onChange={setPicked} options={[{ value: "all", label: tt("All communities") }, ...shown.map((c) => ({ value: c.id, label: c.name }))]} />
      </div>
    ) : null

  const soft = stale ? "opacity-60 transition-opacity duration-300" : "transition-opacity duration-300"
  const sells = !!total?.money || (total?.currencies.length ?? 0) > 1
  const cards = (
    <>
      {full ? <GrowthCard total={total} blank={blank} className={soft} /> : null}
      {full ? <ActivityCard total={total} blank={blank} className={soft} /> : null}
      {sells || !total ? <RevenueCard total={total} blank={blank} money={money} runsToNow={runsToNow} className={soft} hideWhileBlank={!full} /> : null}
      {full ? <SpacesCard total={total} blank={blank} className={soft} /> : null}
      {full ? <PostsCard total={total} blank={blank} className={soft} /> : null}
      {full ? <JoinsCard total={total} blank={blank} className={soft} /> : null}
      <CommunitiesCard communities={shown} answers={answers} className={soft} />
    </>
  )

  return (
    <OpenDetailContext.Provider value={openDetail}>
      <ReportComparedContext.Provider value={compared}>
        {full ? (
          <>
            {switcher}
            <Overview total={total} labels={labels} money={money} runsToNow={runsToNow} soft={stale} compareLabel={compared ? againstText : null} legend={legend} />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-community-cards="">
              {cards}
            </div>
          </>
        ) : (
          cards
        )}
      </ReportComparedContext.Provider>
      <DetailPanel open={detailOpen} onClose={() => setDetailOpen(false)} title={detailView?.title ?? ""} sub={range} panelKey={detailId ?? undefined}>
        <div data-detail-id={detailId ?? undefined}>{detailView ? <DetailBody view={detailView} compared={compared} /> : null}</div>
      </DetailPanel>
    </OpenDetailContext.Provider>
  )
}

/* ── The figures and the chart ───────────────────────────────────────── */

interface MetricSpec {
  key: MetricKey
  label: string
  figure: Figure
  line: Line
  value: string
  foot: string
  format: (v: number) => string
}

function metricsOf(total: Combined | null, money: (c: number | null | undefined, cur?: string | null) => string, runsToNow: boolean): MetricSpec[] {
  const t = total
  const empty: Line = { current: [], previous: null }
  const fig = (f: Figure | undefined): Figure => f ?? { value: null, previous: null }
  const net = t ? (t.figures.joined.value ?? 0) - (t.figures.left.value ?? 0) : 0
  const out: MetricSpec[] = [
    { key: "members", label: tt("Members"), figure: fig(t?.figures.members), line: t?.lines.members ?? empty, value: n(t?.figures.members.value), foot: tt("Net {value}", { value: `${net > 0 ? "+" : ""}${n(net)}` }), format: n },
    { key: "joined", label: tt("New members"), figure: fig(t?.figures.joined), line: t?.lines.joined ?? empty, value: n(t?.figures.joined.value ?? 0), foot: tt("{left} left", { left: n(t?.figures.left.value ?? 0) }), format: n },
    { key: "active", label: tt("Active members"), figure: fig(t?.figures.active), line: t?.lines.active ?? empty, value: n(t?.figures.active.value), foot: tt("Churn rate {rate}", { rate: pct(t?.figures.churn.value) }), format: n },
    { key: "posts", label: tt("Posts"), figure: fig(t?.figures.posts), line: t?.lines.posts ?? empty, value: n(t?.figures.posts.value ?? 0), foot: tt("{n} comments", { n: n(t?.figures.comments.value ?? 0) }), format: n },
  ]
  if (!t || t.money) {
    const m = t?.money
    const fmt = (v: number) => money(v)
    out.push(
      { key: "revenue", label: tt("Payments received"), figure: fig(m?.revenue), line: m?.lines.revenue ?? empty, value: money(m?.revenue.value ?? 0), foot: tt("Less refunds"), format: fmt },
      { key: "mrr", label: runsToNow ? tt("MRR now") : tt("MRR at the end"), figure: fig(m?.mrr), line: m?.lines.mrr ?? empty, value: money(m?.mrr.value ?? 0), foot: tt("{n} paying", { n: n(m?.subscribers.value ?? 0) }), format: fmt },
    )
  }
  return out
}

/** One figure's line as the page chart's rows (components/app/analytics-chart): a count in the views slot, money in the revenue one. */
function chartRows(labels: string[], line: Line, money: boolean): AnalyticsChartData[] {
  return labels.map((date, i) => {
    const v = line.current[i] ?? 0
    const p = line.previous ? line.previous[i] ?? 0 : undefined
    const row: AnalyticsChartData = { date, views: 0, sales: 0, revenue: 0 }
    if (money) row.revenue = v
    else row.views = v
    if (p !== undefined) {
      if (money) row.prev_revenue = p
      else row.prev_views = p
    }
    return row
  })
}

/**
 * THE COMMUNITIES' FIGURES AND THEIR CHART, where the page's own are for the
 * rest: the same card, the same figure tabs and the same chart with its
 * dates, its axis and the period before dashed, its legend under it and the
 * way into the chosen figure's report beside the legend.
 */
function Overview({ total, labels, money, runsToNow, soft, compareLabel, legend }: { total: Combined | null; labels: string[]; money: (c: number | null | undefined, cur?: string | null) => string; runsToNow: boolean; soft: boolean; compareLabel: string | null; legend: React.ReactNode }) {
  const [metric, setMetric] = React.useState<MetricKey>("members")
  const specs = metricsOf(total, money, runsToNow)
  const on = specs.find((s) => s.key === metric) ?? specs[0]
  const isMoney = on.key === "revenue" || on.key === "mrr"
  const rows = React.useMemo(() => chartRows(labels, on.line, isMoney), [labels, on.line, isMoney])
  const seriesLabels = React.useMemo(() => ({ views: on.label, revenue: on.label }), [on.label])
  const formatPrice = React.useCallback((cents: number) => money(cents), [money])
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-community-overview="" aria-busy={!total}>
      <div role="tablist" aria-label={tt("Metric")} data-scroll-x className={cn("relative flex divide-x divide-[#e5e7eb]/60 overflow-x-auto scrollbar-hide", specs.length === 6 ? "lg:grid lg:grid-cols-6" : "md:grid md:grid-cols-4")}>
        <MetricTabLine value={on.key} />
        {specs.map((s) => (
          <MetricTab
            key={s.key}
            tab={s.key}
            className={cn("min-w-[130px] flex-shrink-0", specs.length === 6 ? "lg:min-w-0" : "md:min-w-0")}
            label={s.label}
            value={s.value}
            change={<ReportChange h={headline(s.figure)} />}
            foot={s.foot}
            selected={s.key === on.key}
            soft={soft}
            loading={!total}
            onSelect={() => setMetric(s.key)}
            line={false}
          />
        ))}
      </div>
      <div className="border-t border-[#e5e7eb]/60 px-2 pb-3 pt-7 sm:px-4 sm:pb-4" data-chart-for={on.key}>
        <AnalyticsChartWithTooltip
          chartDisplayData={rows}
          isLoading={!total}
          analyticsMode="store"
          chartMetricFilter={isMoney ? "revenue" : "views"}
          onePageChartFilter="views"
          formatPrice={formatPrice}
          compareLabel={compareLabel}
          seriesLabels={seriesLabels}
        />
        <div className="mt-2 flex min-h-8 items-center justify-between gap-3 pl-2 sm:pl-0">
          <div className="min-w-0">{legend}</div>
          <ViewReport id={`metric:${on.key}`} label={on.label} className="mr-0" />
        </div>
      </div>
    </div>
  )
}

/* ── The cards ───────────────────────────────────────────────────────── */

/** A short figure row: a name, a number, the change. */
function Rows({ rows }: { rows: Array<{ key: string; label: string; value: string; h?: ReturnType<typeof headline> | null }> }) {
  return (
    <dl className="divide-y divide-[#f1f2f4]">
      {rows.map((r) => (
        <div key={r.key} data-line={r.key} className="flex h-[37px] items-center justify-between gap-3 text-[13.5px]">
          <dt className="min-w-0 truncate text-[#374151]">{r.label}</dt>
          <dd className="flex shrink-0 items-baseline gap-2">
            {r.h ? <ReportChange h={r.h} /> : null}
            <span className="min-w-[56px] text-right font-medium tabular-nums text-[#1a1a2e]">{r.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Big({ value, h }: { value: string; h: ReturnType<typeof headline> }) {
  return (
    <div className="flex h-9 items-baseline gap-2.5" data-figure="">
      <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{value}</span>
      <ReportChange h={h} />
    </div>
  )
}

function GrowthCard({ total, blank, className }: { total: Combined | null; blank: boolean; className?: string }) {
  const f = total?.figures
  return (
    <ReportCard card="community-growth" detail={{ id: "growth" }} title={tt("Growth")} help={tt("Who joined and who left in this period, and churn: the members there at the start who left, over the members there were then.")} className={className}>
      <ReportBody blank={blank} wait="figure">
        {f ? (
          <>
            <Big value={n(f.joined.value ?? 0)} h={headline(f.joined)} />
            <p className="-mt-1 mb-2 text-[12px] text-[#6b7280]">{tt("New members")}</p>
            <Rows
              rows={[
                { key: "left", label: tt("Left"), value: n(f.left.value ?? 0) },
                { key: "churn", label: tt("Churn"), value: pct(f.churn.value) },
                { key: "members", label: tt("Members at the end"), value: n(f.members.value), h: headline(f.members) },
              ]}
            />
          </>
        ) : null}
      </ReportBody>
    </ReportCard>
  )
}

function ActivityCard({ total, blank, className }: { total: Combined | null; blank: boolean; className?: string }) {
  const f = total?.figures
  return (
    <ReportCard card="community-activity" detail={{ id: "activity" }} title={tt("Activity")} help={tt("Members who opened a community or did something in it, never you, and what they posted, commented and reacted in this period.")} className={className}>
      <ReportBody blank={blank} wait="figure">
        {f ? (
          <>
            <Big value={n(f.active.value)} h={headline(f.active)} />
            <p className="-mt-1 mb-2 text-[12px] text-[#6b7280]">{tt("Active members")}</p>
            <Rows
              rows={[
                { key: "posts", label: tt("Posts"), value: n(f.posts.value ?? 0), h: headline(f.posts) },
                { key: "comments", label: tt("Comments"), value: n(f.comments.value ?? 0), h: headline(f.comments) },
                { key: "engagement", label: tt("Engagement"), value: pct(f.engagement.value) },
              ]}
            />
          </>
        ) : null}
      </ReportBody>
    </ReportCard>
  )
}

function RevenueCard({ total, blank, money, runsToNow, className, hideWhileBlank }: { total: Combined | null; blank: boolean; money: (c: number | null | undefined, cur?: string | null) => string; runsToNow: boolean; className?: string; hideWhileBlank?: boolean }) {
  if (blank && hideWhileBlank) return null
  const m = total?.money ?? null
  return (
    <ReportCard
      card="community-money"
      detail={m ? { id: "revenue" } : undefined}
      title={tt("Community revenue")}
      help={tt("Payments received is the money paid in this period, less refunds. MRR is what the plans being paid for bring in a month, a yearly plan counted as a twelfth.")}
      className={className}
    >
      <ReportBody blank={blank} wait="figure">
        {total && !m ? (
          <ReportEmpty>{tt("Your communities sell in more than one currency. Choose one community to see its revenue.")}</ReportEmpty>
        ) : m ? (
          <div className="flex h-full flex-col" data-community-money="">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[24px] font-bold tracking-tight tabular-nums text-[#1a1a2e]" data-money-received="">{money(m.revenue.value ?? 0)}</span>
              <ReportChange h={headline(m.revenue)} />
            </div>
            <p className="text-[12px] text-[#6b7280]">{tt("Payments received")}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[#f1f2f4] pt-3">
              <div className="min-w-0">
                <dt className="truncate text-[12px] text-[#6b7280]">{runsToNow ? tt("MRR now") : tt("MRR at the end")}</dt>
                <dd className="text-[16px] font-semibold tabular-nums text-[#1a1a2e]" data-money-mrr="">{money(m.mrr.value ?? 0)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="truncate text-[12px] text-[#6b7280]">{tt("Paying members")}</dt>
                <dd className="text-[16px] font-semibold tabular-nums text-[#1a1a2e]">{n(m.subscribers.value ?? 0)}</dd>
              </div>
            </dl>
            <div className="mt-3 min-h-0 flex-1">
              <ReportList title={tt("Community revenue")} rows={m.bySource.slice(0, 3).map((x) => ({ key: x.key, label: MONEY_SOURCE[x.key] ?? x.key, value: x.cents }))} format={(v) => money(v)} empty={tt("No payments in this period.")} />
            </div>
          </div>
        ) : null}
      </ReportBody>
    </ReportCard>
  )
}

function SpacesCard({ total, blank, className }: { total: Combined | null; blank: boolean; className?: string }) {
  return (
    <ReportCard card="community-spaces" detail={{ id: "spaces" }} title={tt("Busiest spaces")} help={tt("The spaces with the most posts and comments in this period.")} className={className}>
      <ReportBody blank={blank} wait="list">
        {total ? <ReportList title={tt("Busiest spaces")} rows={total.topSpaces.map((s) => ({ key: s.key, label: s.label, value: s.posts + s.comments, note: [s.community, tt("{posts} posts, {comments} comments", { posts: n(s.posts), comments: n(s.comments) })].filter(Boolean).join(" · ") }))} format={n} empty={tt("No posts or comments in this period.")} /> : null}
      </ReportBody>
    </ReportCard>
  )
}

function PostsCard({ total, blank, className }: { total: Combined | null; blank: boolean; className?: string }) {
  return (
    <ReportCard card="community-posts" detail={{ id: "posts" }} title={tt("Top posts")} help={tt("The posts of this period that drew the most likes and comments.")} className={className}>
      <ReportBody blank={blank} wait="list">
        {total ? <ReportList title={tt("Top posts")} rows={total.topPosts.map((p) => ({ key: p.key, label: p.title, value: p.reactions + p.comments, note: [p.community, tt("{reactions} likes, {comments} comments", { reactions: n(p.reactions), comments: n(p.comments) })].filter(Boolean).join(" · ") }))} format={n} empty={tt("No reactions or comments in this period yet.")} /> : null}
      </ReportBody>
    </ReportCard>
  )
}

function JoinsCard({ total, blank, className }: { total: Combined | null; blank: boolean; className?: string }) {
  return (
    <ReportCard card="community-joins" detail={{ id: "joins" }} title={tt("How people joined")} help={tt("How the people who joined in this period got in: for free, by paying, by an invite, or added by you or your team.")} className={className}>
      <ReportBody blank={blank} wait="list">
        {total ? <ReportList title={tt("How people joined")} rows={total.joinSources.map((s) => ({ key: s.key, label: SOURCE_LABEL[s.key] ?? s.key, value: s.value }))} format={n} empty={tt("Nobody joined in this period.")} /> : null}
      </ReportBody>
    </ReportCard>
  )
}

/** Each community, its members now, who joined and its visits, and the way into its own Analytics. */
function CommunitiesCard({ communities, answers, className }: { communities: CommunityPlace[]; answers: Answers; className?: string }) {
  const list = communities.slice(0, 6)
  const blank = list.every((c) => !answers[c.id])
  return (
    <ReportCard
      card="communities"
      detail={{ id: "communities" }}
      title={tt("Communities")}
      help={tt("Each community's members now, who joined in this period and its visits, one a visitor a day. Open a community for its full analytics.")}
      className={className}
    >
      <ReportBody blank={blank} wait="list">
        <div className="flex h-full flex-col">
          <div className="flex h-7 items-center gap-2 text-[11.5px] font-medium text-[#9ca3af]">
            <span className="min-w-0 flex-1" />
            <span className="w-14 text-right">{tt("Members")}</span>
            <span className="w-14 text-right">{tt("Joined")}</span>
            <span className="w-14 text-right">{tt("Visits")}</span>
          </div>
          <ol className="divide-y divide-[#f1f2f4]">
            {list.map((c) => {
              const a = answers[c.id]
              const d = isReport(a) ? a : null
              const joined = headline(d?.figures?.joined)
              return (
                <li key={c.id} data-community={c.id} className="flex h-12 items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <AppLink href={`/app/community/${c.id}/analytics`} className="block truncate font-medium text-[#1a1a2e] hover:underline">
                      {c.name}
                    </AppLink>
                    <span className="block h-4 truncate text-[12px] text-[#9ca3af]">
                      {a === "failed" ? (
                        tt("Could not be read")
                      ) : d && joined.change !== null ? (
                        <span className="inline-flex items-baseline gap-1.5">
                          {tt("Joins")}
                          <ReportChange h={joined} />
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="w-14 text-right tabular-nums text-[#1a1a2e]">{d ? n(d.live?.members ?? d.figures?.members?.value) : ""}</span>
                  <span className="w-14 text-right tabular-nums text-[#1a1a2e]">{d ? n(d.figures?.joined?.value) : ""}</span>
                  <span className="w-14 text-right tabular-nums text-[#1a1a2e]">{d ? n(d.figures?.visits?.value) : ""}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </ReportBody>
    </ReportCard>
  )
}

/* ── A card, opened ──────────────────────────────────────────────────── */

interface ViewContext {
  total: Combined
  labels: string[]
  compared: boolean
  money: (c: number | null | undefined, cur?: string | null) => string
  runsToNow: boolean
  several: boolean
}

/** Every bucket as a row: this period and the period before at the same point. */
function overTime(line: Line, labels: string[], format: (v: number) => string, compared: boolean): DetailSection {
  return {
    title: tt("Over time"),
    format,
    rows: labels.map((label, i) => ({ key: `${i}`, label, value: line.current[i] ?? 0, previous: compared && line.previous ? line.previous[i] ?? 0 : undefined })),
  }
}

function chartOf(line: Line, labels: string[], format: (v: number) => string, label: string, compared: boolean, integer = true): DetailView["chart"] {
  return { labels, current: nums(line.current).slice(0, labels.length), previous: compared && line.previous ? nums(line.previous).slice(0, labels.length) : [], format, integer, label }
}

const figureOf = (f: Figure, format: (v: number) => string, note?: string | null): DetailView["figure"] => ({ value: f.value === null ? "–" : format(f.value), now: f.value, before: f.previous, beforeText: f.previous === null ? undefined : format(f.previous), note: note ?? null })

function viewOf(id: string, x: ViewContext): DetailView | null {
  const { total: t, labels, compared, money, runsToNow, several } = x
  const fm = (v: number) => money(v)
  const each = (pick: (e: Combined["each"][number]) => number | null, format: (v: number) => string, title = tt("By community")): DetailSection[] =>
    several ? [{ title, format, bars: true, rows: t.each.map((e) => ({ key: e.id, label: e.name, value: pick(e) ?? 0, text: pick(e) === null ? "–" : undefined })).sort((a, b) => b.value - a.value) }] : []
  const m = t.money
  switch (id) {
    case "metric:members":
      return { title: tt("Members"), figure: figureOf(t.figures.members, n), chart: chartOf(t.lines.members, labels, n, tt("Members"), compared), sections: [overTime(t.lines.members, labels, n, compared), ...each((e) => e.members, n)], help: tt("Members at the end of each day, or each hour or month: members now, less who joined after it, plus who left after it.") }
    case "metric:joined":
      return { title: tt("New members"), figure: figureOf(t.figures.joined, n, tt("{left} left", { left: n(t.figures.left.value ?? 0) })), chart: chartOf(t.lines.joined, labels, n, tt("New members"), compared), sections: [overTime(t.lines.joined, labels, n, compared), ...each((e) => e.joined, n)] }
    case "metric:active":
      return { title: tt("Active members"), figure: figureOf(t.figures.active, n), chart: chartOf(t.lines.active, labels, n, tt("Active members"), compared), sections: [overTime(t.lines.active, labels, n, compared), { title: tt("Here lately"), format: n, rows: [{ key: "1", label: tt("Last 24 hours"), value: t.live.active1 }, { key: "7", label: tt("Last 7 days"), value: t.live.active7 }, { key: "30", label: tt("Last 30 days"), value: t.live.active30 }] }, ...each((e) => e.active, n)], help: tt("Members who opened the community or did something in it. New: they joined in this period. Lately: who was here in the last day, week and month.") }
    case "metric:posts":
      return { title: tt("Posts"), figure: figureOf(t.figures.posts, n, tt("{n} comments", { n: n(t.figures.comments.value ?? 0) })), chart: chartOf(t.lines.posts, labels, n, tt("Posts"), compared), sections: [overTime(t.lines.posts, labels, n, compared), ...each((e) => e.posts, n)] }
    case "metric:revenue":
    case "revenue": {
      if (!m) return null
      const plans: DetailRow[] = m.byPlan.map((p) => ({ key: p.key, label: p.label || tt("Plan"), value: p.cents, previous: compared ? p.previous : undefined, note: [p.community, p.paying > 0 ? tt("{n} paying", { n: n(p.paying) }) : null].filter(Boolean).join(" · ") || null }))
      return {
        title: id === "revenue" ? tt("Community revenue") : tt("Payments received"),
        figure: figureOf(m.revenue, fm, tt("Less refunds")),
        chart: chartOf(m.lines.revenue, labels, fm, tt("Payments received"), compared, false),
        sections: [
          {
            title: tt("Paid members"),
            format: n,
            rows: [
              { key: "mrr", label: runsToNow ? tt("MRR now") : tt("MRR at the end"), value: m.mrr.value ?? 0, text: fm(m.mrr.value ?? 0), previous: compared && m.mrr.previous !== null ? m.mrr.previous : undefined, previousText: compared && m.mrr.previous !== null ? fm(m.mrr.previous) : undefined },
              { key: "paying", label: tt("Paying"), value: m.subscribers.value ?? 0, previous: compared ? m.subscribers.previous ?? undefined : undefined },
              { key: "new", label: tt("Started paying"), value: m.newPaid.value ?? 0, previous: compared ? m.newPaid.previous ?? undefined : undefined, note: m.upgrades > 0 ? tt("{n} upgraded from free", { n: n(m.upgrades) }) : null },
              { key: "cancelled", label: tt("Cancelled"), value: m.cancellations.value ?? 0, previous: compared ? m.cancellations.previous ?? undefined : undefined, invert: true },
              { key: "churn", label: tt("Churn rate"), value: m.churnRate ?? 0, text: pct(m.churnRate), invert: true },
              { key: "refunds", label: tt("Refunds"), value: m.refunds.totalCents, text: fm(m.refunds.totalCents), note: m.refunds.count > 0 ? tt("{count, plural, one {# payment} other {# payments}}", { count: m.refunds.count }) : null, invert: true },
            ],
          },
          { title: tt("By source"), format: fm, bars: true, empty: tt("No payments in this period."), rows: m.bySource.map((s) => ({ key: s.key, label: MONEY_SOURCE[s.key] ?? s.key, value: s.cents })) },
          { title: tt("Revenue by plan"), format: fm, bars: true, empty: tt("No plan sold in this period."), rows: plans },
          ...each((e) => e.revenue, fm),
          ...(m.reasons.length ? [{ title: tt("Why they cancelled"), format: n, bars: true, rows: m.reasons.map((r) => ({ key: r.reason, label: REASON_LABEL[r.reason] ?? r.reason, value: r.count })) }] : []),
          overTime(m.lines.revenue, labels, fm, compared),
        ],
        help: tt("Payments received is the money paid in this period, less refunds. MRR is what the plans being paid for bring in a month, a yearly plan counted as a twelfth."),
      }
    }
    case "metric:mrr": {
      if (!m) return null
      return {
        title: runsToNow ? tt("MRR now") : tt("MRR at the end"),
        figure: figureOf(m.mrr, fm, tt("{n} paying", { n: n(m.subscribers.value ?? 0) })),
        chart: chartOf(m.lines.mrr, labels, fm, tt("MRR"), compared, false),
        sections: [overTime(m.lines.mrr, labels, fm, compared), ...each((e) => e.mrr, fm)],
        help: tt("What the plans being paid for bring in a month, at the end of each day: a monthly plan its price, a yearly plan a twelfth of it. Free trials are not counted until they pay."),
      }
    }
    case "growth":
      return {
        title: tt("Growth"),
        figure: figureOf(t.figures.joined, n, tt("New members")),
        chart: chartOf(t.lines.joined, labels, n, tt("New members"), compared),
        sections: [
          {
            title: tt("This period"),
            format: n,
            rows: [
              { key: "joined", label: tt("New members"), value: t.figures.joined.value ?? 0, previous: compared ? t.figures.joined.previous ?? undefined : undefined },
              { key: "left", label: tt("Left"), value: t.figures.left.value ?? 0, previous: compared ? t.figures.left.previous ?? undefined : undefined, invert: true },
              { key: "churn", label: tt("Churn"), value: t.figures.churn.value ?? 0, text: pct(t.figures.churn.value), previous: compared && t.figures.churn.previous !== null ? t.figures.churn.previous : undefined, previousText: compared ? pct(t.figures.churn.previous) : undefined, invert: true },
              { key: "members", label: tt("Members at the end"), value: t.figures.members.value ?? 0, previous: compared ? t.figures.members.previous ?? undefined : undefined },
            ],
          },
          { title: tt("How people joined"), format: n, bars: true, empty: tt("Nobody joined in this period."), rows: t.joinSources.map((s) => ({ key: s.key, label: SOURCE_LABEL[s.key] ?? s.key, value: s.value })) },
          { title: tt("Why members left"), format: n, bars: true, empty: tt("Nobody said why."), rows: t.leaveReasons.map((r) => ({ key: r.reason, label: REASON_LABEL[r.reason] ?? r.reason, value: r.count })) },
          ...each((e) => e.joined, n, tt("New members by community")),
        ],
        help: tt("Who joined and who left in this period, and churn: the members there at the start who left, over the members there were then."),
      }
    case "activity":
      return {
        title: tt("Activity"),
        figure: figureOf(t.figures.active, n, tt("Active members")),
        chart: chartOf(t.lines.active, labels, n, tt("Active members"), compared),
        sections: [
          {
            title: tt("This period"),
            format: n,
            rows: [
              { key: "active", label: tt("Active members"), value: t.figures.active.value ?? 0, previous: compared ? t.figures.active.previous ?? undefined : undefined },
              { key: "posts", label: tt("Posts"), value: t.figures.posts.value ?? 0, previous: compared ? t.figures.posts.previous ?? undefined : undefined },
              { key: "comments", label: tt("Comments"), value: t.figures.comments.value ?? 0, previous: compared ? t.figures.comments.previous ?? undefined : undefined },
              { key: "reactions", label: tt("Reactions"), value: t.figures.reactions.value ?? 0, previous: compared ? t.figures.reactions.previous ?? undefined : undefined },
              { key: "engagement", label: tt("Engagement"), value: t.figures.engagement.value ?? 0, text: pct(t.figures.engagement.value), previous: compared && t.figures.engagement.previous !== null ? t.figures.engagement.previous : undefined, previousText: compared ? pct(t.figures.engagement.previous) : undefined },
            ],
          },
          { title: tt("Busiest spaces"), format: n, bars: true, empty: tt("No posts or comments in this period."), rows: t.topSpaces.map((s) => ({ key: s.key, label: s.label, value: s.posts + s.comments, note: s.community || null })) },
          ...each((e) => e.active, n, tt("Active members by community")),
        ],
        help: tt("Members who opened a community or did something in it, never you, and what they posted, commented and reacted in this period."),
      }
    case "spaces":
      return { title: tt("Busiest spaces"), sections: [{ title: tt("Spaces"), format: n, bars: true, valueLabel: tt("Posts and comments"), empty: tt("No posts or comments in this period."), rows: t.topSpaces.map((s) => ({ key: s.key, label: s.label, value: s.posts + s.comments, note: [s.community, tt("{posts} posts, {comments} comments", { posts: n(s.posts), comments: n(s.comments) })].filter(Boolean).join(" · ") })) }], help: tt("The spaces with the most posts and comments in this period.") }
    case "posts":
      return { title: tt("Top posts"), sections: [{ title: tt("Posts"), format: n, bars: true, valueLabel: tt("Likes and comments"), empty: tt("No reactions or comments in this period yet."), rows: t.topPosts.map((p) => ({ key: p.key, label: p.title, value: p.reactions + p.comments, note: [p.community, tt("{reactions} likes, {comments} comments", { reactions: n(p.reactions), comments: n(p.comments) })].filter(Boolean).join(" · ") })) }], help: tt("The posts of this period that drew the most likes and comments.") }
    case "joins":
      return { title: tt("How people joined"), figure: figureOf(t.figures.joined, n, tt("New members")), sections: [{ title: tt("How they joined"), format: n, bars: true, empty: tt("Nobody joined in this period."), rows: t.joinSources.map((s) => ({ key: s.key, label: SOURCE_LABEL[s.key] ?? s.key, value: s.value })) }], help: tt("How the people who joined in this period got in: for free, by paying, by an invite, or added by you or your team.") }
    case "communities":
      return {
        title: tt("Communities"),
        sections: [
          { title: tt("Members"), format: n, bars: true, rows: t.each.map((e) => ({ key: e.id, label: e.name, value: e.members ?? 0 })).sort((a, b) => b.value - a.value) },
          { title: tt("New members"), format: n, bars: true, rows: t.each.map((e) => ({ key: e.id, label: e.name, value: e.joined ?? 0, note: e.left ? tt("{left} left", { left: n(e.left) }) : null })).sort((a, b) => b.value - a.value) },
          { title: tt("Active members"), format: n, bars: true, rows: t.each.map((e) => ({ key: e.id, label: e.name, value: e.active ?? 0, text: e.active === null ? "–" : undefined })).sort((a, b) => b.value - a.value) },
          { title: tt("Visits"), format: n, bars: true, rows: t.each.map((e) => ({ key: e.id, label: e.name, value: e.visits ?? 0, text: e.visits === null ? "–" : undefined })).sort((a, b) => b.value - a.value) },
          ...(t.each.some((e) => e.revenue !== null)
            ? [{ title: tt("Payments received"), format: n, bars: true, rows: t.each.filter((e) => e.revenue !== null).map((e) => ({ key: e.id, label: e.name, value: e.revenue ?? 0, text: money(e.revenue, e.currency), note: e.mrr ? tt("{amount} a month", { amount: money(e.mrr, e.currency) }) : null })).sort((a, b) => b.value - a.value) }]
            : []),
        ],
        help: tt("Each community's members now, who joined in this period and its visits, one a visitor a day. Open a community for its full analytics."),
      }
    default:
      return null
  }
}
