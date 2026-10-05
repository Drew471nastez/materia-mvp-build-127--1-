"use client"

/**
 * ===========================================================================
 *  ANALYTICS
 * ===========================================================================
 * The last 30 or 90 days of a community, from the rows the nightly rollup
 * wrote (community_daily_stats), with today so far counted live beside
 * them. Each chart is one measure on its own axis, a single series named by
 * its title, in the violet the Analytics reports use, with a tooltip on
 * every day. Nothing is drawn that was not counted.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { money } from "@/lib/memberships/state"
import { MetricTab } from "@/components/app/metric-tab"
import { TAB_STRIP_STYLE, useTabStrip } from "@/components/app/use-tab-strip"
import { HelpLabel } from "@/components/app/help-label"
import type { AnalyticsView, CommunityHead, EventMoneyStats, MoneyAndGrowth, RevenueStats } from "./view-types"
import { FilterTabs, Notice, card, errorText, send } from "./parts"

const LINE = "#8b5cf6"

function dayLabel(day: string, withYear = false): string {
  const t = Date.parse(`${day}T12:00:00Z`)
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(t)
}

/** A nice top for the axis: 1, 2 or 5 times a power of ten, at least the largest value. */
function niceMax(v: number): number {
  if (v <= 4) return 4
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

/** One measure per day: bars for counts that happen, a line for a level that persists. */
export function DayChart({ points, kind, name }: { points: { day: string; value: number }[]; kind: "bars" | "line"; name: string }) {
  const [hover, setHover] = React.useState<number | null>(null)
  /* Drawn at the width it is shown at, so the axis words are 11px on every screen rather than shrunk with the picture. */
  const box = React.useRef<HTMLDivElement>(null)
  const [W, setW] = React.useState(640)
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setW(Math.max(240, Math.round(el.getBoundingClientRect().width)))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 176
  const pad = { l: 46, r: 8, t: 10, b: 22 }
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const n = Math.max(1, points.length)
  const step = iw / n
  const x = (i: number) => pad.l + step * i + step / 2
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(n / Math.max(3, Math.floor(W / 90)))
  const bw = Math.max(2, Math.min(18, step - 2))
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("")
  const h = hover !== null ? points[hover] : null

  return (
    <div ref={box} className="relative" data-chart={name}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y select-none"
        role="img"
        aria-label={`${name}, ${points.length} days`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          const i = Math.floor((px - pad.l) / step)
          setHover(i >= 0 && i < n ? i : null)
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eef0f2" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize="11" fill="#9ca3af" className="tabular-nums">
              {Number.isInteger(t) ? t.toLocaleString("en-US") : t.toFixed(1)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.day} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#9ca3af">
              {dayLabel(p.day)}
            </text>
          ) : null,
        )}
        {kind === "bars"
          ? points.map((p, i) => {
              const top = y(p.value)
              const height = pad.t + ih - top
              return height > 0 ? <path key={p.day} d={`M${x(i) - bw / 2},${pad.t + ih}V${top + Math.min(4, height)}q0,-${Math.min(4, height)} ${Math.min(4, bw / 2)},-${Math.min(4, height)}H${x(i) + bw / 2 - Math.min(4, bw / 2)}q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, height)}V${pad.t + ih}Z`} fill={LINE} opacity={hover === null || hover === i ? 1 : 0.45} /> : null
            })
          : (
            <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
        {hover !== null && h ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="#c9ccd2" strokeWidth={1} strokeDasharray="3 3" />
            {kind === "line" ? <circle cx={x(hover)} cy={y(h.value)} r={4.5} fill={LINE} stroke="#fff" strokeWidth={2} /> : null}
          </g>
        ) : null}
      </svg>
      {h && hover !== null ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-[12px] shadow-[0_6px_18px_-6px_rgba(17,24,39,0.2)]"
          style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%` }}
        >
          <span className="text-[#6b7280]">{dayLabel(h.day, true)}</span> <span className="font-semibold tabular-nums text-[#1a1a2e]">{h.value.toLocaleString("en-US")}</span>
        </div>
      ) : null}
    </div>
  )
}

function ChartCard({ title, total, children }: { title: string; total?: string; children: React.ReactNode }) {
  return (
    <section className={cn(card, "px-4 pb-3 pt-4 sm:px-5")}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-[#1a1a2e]">{title}</h2>
        {total ? <p className="text-[13px] tabular-nums text-[#6b7280]">{total}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function AnalyticsSection({ head, initial }: { head: CommunityHead; initial: AnalyticsView }) {
  const [data, setData] = React.useState(initial)
  const [days, setDays] = React.useState<"30" | "90">(String(initial.days) === "90" ? "90" : "30")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const choose = async (d: "30" | "90") => {
    setDays(d)
    setLoading(true)
    const res = await send<AnalyticsView>(`/api/app/community/${head.id}/analytics?days=${d}`, "GET")
    setLoading(false)
    if (!res.ok) return setError(errorText(res.data.error, "The figures could not be loaded."))
    setError(null)
    setData(res.data)
  }

  const t = data.totals
  const tiles = [
    { label: "Members now", value: data.live.members, sub: data.live.newToday ? `${data.live.newToday} joined today` : "None joined today yet" },
    ...(data.money ? [{ label: "Active members", value: data.money.active.last30, sub: `${data.money.active.last7.toLocaleString("en-US")} in the last 7 days` }] : []),
    { label: "Joined", value: t.newMembers, sub: `${t.left} left` },
    { label: "Posts", value: t.posts, sub: `${data.live.postsToday} today` },
    { label: "Comments", value: t.comments, sub: `${data.live.commentsToday} today` },
    { label: "Reactions", value: t.reactions },
    ...(data.money ? [] : [{ label: "RSVPs", value: t.rsvps }]),
  ]

  return (
    <div className="space-y-4" data-analytics="" aria-busy={loading || undefined}>
      <div className="flex items-center justify-between gap-3">
        <FilterTabs value={days} onChange={(d) => void choose(d)} label="Period" tabs={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
        <p className="text-[12.5px] text-[#9ca3af] max-sm:hidden">Up to yesterday, plus today so far</p>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {!data.rolledUp ? <Notice tone="info">The daily figures start after the first nightly count. Today&rsquo;s numbers below are live.</Notice> : null}

      {data.money?.revenue ? <RevenueCard revenue={data.money.revenue} days={data.days} /> : null}
      {data.money?.events ? <EventMoneyCard events={data.money.events} days={data.days} /> : null}

      <section className={cn(card, "overflow-hidden")} aria-label="Totals">
        <div className="grid grid-cols-2 gap-px bg-[#f1f2f4] sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((x) => (
            <div key={x.label} className="bg-white px-4 py-3.5">
              <p className="truncate text-[12.5px] font-medium text-[#6b7280]">{x.label}</p>
              <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums text-[#1a1a2e]">{x.value.toLocaleString("en-US")}</p>
              {x.sub ? <p className="mt-0.5 truncate text-[12px] text-[#9ca3af]">{x.sub}</p> : null}
            </div>
          ))}
        </div>
      </section>

      {data.rolledUp ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Members">
            <DayChart points={data.series.members} kind="line" name="Members" />
          </ChartCard>
          <ChartCard title="Active members" total="who visited that day">
            <DayChart points={data.series.activeMembers} kind="line" name="Active members" />
          </ChartCard>
          <ChartCard title="New members" total={`${t.newMembers.toLocaleString("en-US")} in ${data.days} days`}>
            <DayChart points={data.series.newMembers} kind="bars" name="New members" />
          </ChartCard>
          <ChartCard title="Posts" total={`${t.posts.toLocaleString("en-US")} in ${data.days} days`}>
            <DayChart points={data.series.posts} kind="bars" name="Posts" />
          </ChartCard>
        </div>
      ) : null}

      {data.money ? <JoinsCards money={data.money} /> : null}

      <section className={cn(card, "px-4 py-4 sm:px-5")}>
        <h2 className="text-[14px] font-semibold text-[#1a1a2e]">Most liked posts</h2>
        {data.topPosts.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-[#6b7280]">No reactions or comments in this period yet.</p>
        ) : (
          <ol className="mt-2 divide-y divide-[#f1f2f4]">
            {data.topPosts.map((p, i) => (
              <li key={p.id} className="flex min-h-11 items-center gap-3 py-0.5">
                <span className="w-5 shrink-0 text-[13px] tabular-nums text-[#9ca3af]">{i + 1}</span>
                <a href={`/community/${head.slug}/post/${p.id}`} target="_blank" rel="noopener noreferrer" className="flex min-h-10 min-w-0 flex-1 items-center truncate text-[14px] text-[#1a1a2e] hover:underline">
                  {p.title}
                </a>
                <span className="shrink-0 text-[12.5px] tabular-nums text-[#6b7280]">
                  {p.reactions} {p.reactions === 1 ? "like" : "likes"} · {p.comments} {p.comments === 1 ? "comment" : "comments"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

/* ── Revenue and joins (round 13, lib/communities/server/stats.ts) ──────── */

/*
  THE /app ANALYTICS LOOK. The revenue strip is the Analytics page's own
  figure tabs (components/app/metric-tab, in the strip that scrolls sideways
  on a phone, components/app/use-tab-strip), and the lists under it draw
  their rows the way that page's reports do (app/app/analytics/analytics-
  reports.tsx Row: a quiet grey bar behind the name, the figure at the end).
  A tab chooses what the panel under the strip explains, so every tab does
  something: there is no daily revenue series to chart.
*/
const REVENUE_TABS = ["mrr", "subscribers", "new", "cancellations", "churn", "refunds"] as const
type RevenueTab = (typeof REVENUE_TABS)[number]

const SOURCE_LABEL: Record<string, string> = {
  free: "Joined for free",
  subscription: "Paid membership",
  purchase: "One time purchase",
  product: "Owns a product that includes it",
  invite: "Invite",
  manual: "Added by you or your team",
  platform: "Added by Storelib",
}

const REASON_LABEL: Record<string, string> = {
  too_expensive: "Too expensive",
  not_using: "Not using it enough",
  missing_features: "Missing something they wanted",
  content: "The content",
  found_alternative: "Found something else",
  temporary: "Taking a break",
  other: "Other",
  none: "No reason given",
}

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
}

const STRIP_TAB = "flex-shrink-0 min-w-[132px] md:min-w-0"

function RevenueCard({ revenue: r, days }: { revenue: RevenueStats; days: number }) {
  const [tab, setTab] = React.useState<RevenueTab>("mrr")
  const strip = useTabStrip<HTMLDivElement>(tab, REVENUE_TABS)
  const cash = (cents: number) => money(cents, r.currency)
  const n = (v: number) => v.toLocaleString("en-US")
  const period = `${days} days`
  return (
    <section className={cn(card, "overflow-hidden")} aria-label="Revenue" data-revenue="">
      <div ref={strip} role="tablist" aria-label="Revenue figures" data-scroll-x="" className="relative flex divide-x divide-[#e5e7eb]/60 overflow-x-auto scrollbar-hide md:grid md:grid-cols-6" style={TAB_STRIP_STYLE}>
        <MetricTab tab="mrr" className={STRIP_TAB} label="Monthly revenue" value={cash(r.mrrCents)} foot="Recurring, today" selected={tab === "mrr"} onSelect={() => setTab("mrr")} />
        <MetricTab tab="subscribers" className={STRIP_TAB} label="Active subscribers" value={n(r.activeSubscribers)} foot="Paying now" selected={tab === "subscribers"} onSelect={() => setTab("subscribers")} />
        <MetricTab tab="new" className={STRIP_TAB} label="New" value={n(r.newSubscribers)} foot={`In ${period}`} selected={tab === "new"} onSelect={() => setTab("new")} />
        <MetricTab tab="cancellations" className={STRIP_TAB} label="Cancellations" value={n(r.cancellations)} foot={`In ${period}`} selected={tab === "cancellations"} onSelect={() => setTab("cancellations")} />
        <MetricTab tab="churn" className={STRIP_TAB} label="Churn rate" value={r.churnRate === null ? "–" : `${r.churnRate}%`} foot={`Over ${period}`} selected={tab === "churn"} onSelect={() => setTab("churn")} />
        <MetricTab tab="refunds" className={STRIP_TAB} label="Refunds" value={cash(r.refunds.totalCents)} foot={r.refunds.count === 1 ? "1 refund" : `${n(r.refunds.count)} refunds`} selected={tab === "refunds"} onSelect={() => setTab("refunds")} />
      </div>
      <div className="border-t border-[#e5e7eb]/60 px-4 py-3.5 text-[13.5px] leading-relaxed text-[#4b5563] sm:px-5" data-revenue-detail={tab}>
        {tab === "mrr" ? <p>What the {n(r.activeSubscribers)} active subscriptions bring in a month. A yearly plan counts as a twelfth of its price.</p> : null}
        {tab === "subscribers" ? <p>Members paying now, including anyone whose card is being retried. Somebody who cancelled keeps access until their period ends and is not counted.</p> : null}
        {tab === "new" ? <p>{r.newSubscribers === 0 ? `Nobody started a paid membership in the last ${period}.` : `${n(r.newSubscribers)} paid ${r.newSubscribers === 1 ? "membership" : "memberships"} started in the last ${period}.`}</p> : null}
        {tab === "cancellations" ? <Reasons revenue={r} period={period} /> : null}
        {tab === "churn" ? <p>{r.churnRate === null ? "There were no paying members at the start of this period, so there is no rate yet." : `${n(r.cancellations)} of the members paying at the start of the last ${period} cancelled.`}</p> : null}
        {tab === "refunds" ? <p>{r.refunds.count === 0 ? `No refunds in the last ${period}.` : `${n(r.refunds.count)} ${r.refunds.count === 1 ? "payment" : "payments"} refunded in the last ${period}, ${cash(r.refunds.totalCents)} in all.`}</p> : null}
      </div>
    </section>
  )
}

/*
  EVENT TICKETS. The same hairline grid of figures as Totals above, so money
  from tickets reads beside the membership figures rather than as a second
  dashboard. Every number is a sum of ticket rows; the line under them says
  in words what the period took.
*/
function EventMoneyCard({ events: e, days }: { events: EventMoneyStats; days: number }) {
  const cash = (cents: number) => money(cents, e.currency)
  const n = (v: number) => v.toLocaleString("en-US")
  const figures = [
    { label: "Tickets sold", value: n(e.sold), sub: e.invited > 0 ? `${n(e.invited)} given free` : e.events === 1 ? "1 event" : `${n(e.events)} events` },
    { label: "Ticket revenue", value: cash(e.grossCents), sub: `In ${days} days` },
    { label: "Refunded", value: cash(e.refundedCents), sub: e.refunds === 1 ? "1 refund" : `${n(e.refunds)} refunds` },
    { label: "Kept", value: cash(e.netCents), sub: "Gross less refunds" },
  ]
  return (
    <section className={cn(card, "overflow-hidden")} aria-label="Event tickets" data-event-money="">
      <div className="grid grid-cols-2 gap-px bg-[#f1f2f4] sm:grid-cols-4">
        {figures.map((x) => (
          <div key={x.label} className="bg-white px-4 py-3.5" data-event-figure={x.label}>
            <p className="truncate text-[12.5px] font-medium text-[#6b7280]">{x.label}</p>
            <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums text-[#1a1a2e]">{x.value}</p>
            <p className="mt-0.5 truncate text-[12px] text-[#9ca3af]">{x.sub}</p>
          </div>
        ))}
      </div>
      <p className="border-t border-[#e5e7eb]/60 px-4 py-3 text-[13.5px] leading-relaxed text-[#4b5563] sm:px-5">
        {e.sold === 0
          ? `No tickets were bought in the last ${days} days.`
          : `${n(e.sold)} ${e.sold === 1 ? "ticket" : "tickets"} bought in the last ${days} days${e.invited > 0 ? `, and ${n(e.invited)} given free` : ""}. Money reaches your payouts the way a membership does.`}
      </p>
    </section>
  )
}

function Reasons({ revenue: r, period }: { revenue: RevenueStats; period: string }) {
  if (r.cancellations === 0) return <p>Nobody cancelled in the last {period}.</p>
  if (r.reasons.length === 0) return <p>{r.cancellations.toLocaleString("en-US")} cancelled in the last {period}. Nobody said why.</p>
  return <BarList rows={r.reasons.map((x) => ({ key: x.reason, label: reasonLabel(x.reason), value: x.count }))} />
}

function BarList({ rows, empty }: { rows: { key: string; label: string; value: number; note?: string }[]; empty?: string }) {
  if (rows.length === 0) return <p className="py-4 text-center text-[13px] text-[#6b7280]">{empty}</p>
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ol data-bar-list="">
      {rows.map((r) => (
        <li key={r.key} className="flex h-10 items-center gap-3" data-row-key={r.key}>
          <div className="relative flex h-8 min-w-0 flex-1 items-center">
            <div aria-hidden className="absolute inset-y-0 left-0 rounded-md bg-[linear-gradient(180deg,#f8f9fb_0%,#eff1f4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_0_1px_rgba(16,24,40,0.045),0_1px_2px_rgba(16,24,40,0.05)]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            <span className="relative min-w-0 truncate pl-2.5 text-[13px] text-[#303036]" title={r.label}>
              {r.label}
            </span>
            {r.note ? <span className="relative shrink-0 truncate pl-2 pr-2 text-[12px] text-[#9ca3af]">{r.note}</span> : null}
          </div>
          <span className="shrink-0 text-[13px] font-medium tabular-nums text-[#1a1a2e]">{r.value.toLocaleString("en-US")}</span>
        </li>
      ))}
    </ol>
  )
}

function ListCard({ title, help, children, name }: { title: string; help: string; children: React.ReactNode; name: string }) {
  return (
    <section data-card={name} className={cn(card, "flex min-w-0 flex-col")}>
      <header className="flex min-h-[48px] items-center px-4 pt-3.5 sm:px-5">
        <HelpLabel as="h3" label={title} description={help} className="max-w-full truncate text-[14px] font-semibold text-[#1a1a2e]" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-1 sm:px-5">{children}</div>
    </section>
  )
}

function JoinsCards({ money: m }: { money: MoneyAndGrowth }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-joins="">
      <ListCard name="joins" title="How people joined" help={`Everyone who joined in the last ${m.days} days, by how they came in.`}>
        <BarList rows={m.joins.bySource.map((x) => ({ key: x.source, label: SOURCE_LABEL[x.source] ?? x.source, value: x.count }))} empty={`Nobody joined in the last ${m.days} days.`} />
      </ListCard>
      <ListCard name="invites" title="Invite links" help={`The links that brought the most people in during the last ${m.days} days.`}>
        <BarList rows={m.joins.invites.map((x) => ({ key: x.id, label: x.label, value: x.uses, note: x.revoked ? "Turned off" : undefined }))} empty="No one joined through an invite in this period." />
      </ListCard>
    </div>
  )
}
