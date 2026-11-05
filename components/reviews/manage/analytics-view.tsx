"use client"

/**
 * STORELIB REVIEWS › ANALYTICS. For the period the store picks (the same
 * picker every /app page uses), against the period before it of the same
 * length:
 *
 *   readings     reviews received, the average of the published ones, the
 *                share from verified buyers, requests sent, response rate
 *   volume       reviews received in each day, week or month
 *   rating       the average of what was published in each
 *   stars        how the published ones spread over the five ratings
 *   funnel       requests sent, delivered and opened (when the mail provider
 *                reports them), and reviewed
 *
 * Added up on the server by lib/reviews/manage (periodTotals, reviewSeries,
 * funnelFrom), the functions the overview's numbers come from too. Charts
 * are recharts in the Analytics page's violet, with its grid and type.
 */
import * as React from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, appTimeZone } from "@/lib/i18n/format"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { CHART_COLORS } from "@/components/app/analytics-chart"
import { resolveValue, todayIn, type RangeValue } from "@/lib/date-range/range"
import { changePercent, type Bucket, type PeriodTotals, type RequestFunnel, type SeriesPoint } from "@/lib/reviews/manage"
import { CARD, CARD_HEAD, Distribution, H3, MUTED, Placeholder, formatCount, useRead, ReadFailed } from "./parts"

interface Analytics {
  from: string
  to: string
  bucket: Bucket
  series: SeriesPoint[]
  current: PeriodTotals
  previous: PeriodTotals
  funnel: RequestFunnel
  previousFunnel: RequestFunnel
  capped: boolean
}

const VIOLET = CHART_COLORS.views
const GRID = "#eef0f2"
const AXIS = { fontSize: 11, fill: "#9ca3af" }

function bucketLabel(key: string, bucket: Bucket): string {
  const d = new Date(`${key}T00:00:00Z`)
  try {
    return d.toLocaleDateString(appLocale(), bucket === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" })
  } catch {
    return key
  }
}

function Delta({ now, before, points = false, compare }: { now: number; before: number; points?: boolean; compare: boolean }) {
  if (!compare) return null
  if (points) {
    const d = Math.round((now - before) * 10) / 10
    if (!before || !d) return <span className="text-[12px] text-[#9ca3af]">{before ? tt("same as before") : tt("nothing before")}</span>
    return <span className={cn("text-[12px] font-medium", d > 0 ? "text-[#067647]" : "text-[#b42318]")}>{d > 0 ? `+${d}` : d}</span>
  }
  const pct = changePercent(now, before)
  if (pct === null) return <span className="text-[12px] text-[#9ca3af]">{tt("nothing before")}</span>
  if (pct === 0) return <span className="text-[12px] text-[#9ca3af]">{tt("same as before")}</span>
  return <span className={cn("text-[12px] font-medium", pct > 0 ? "text-[#067647]" : "text-[#b42318]")}>{pct > 0 ? `+${pct}%` : `${pct}%`}</span>
}

export function AnalyticsView() {
  const today = React.useMemo(() => todayIn(appTimeZone(), Date.now()), [])
  const [period, setPeriod] = React.useState<RangeValue>(() => resolveValue({ preset: "last_30_days" }, today))
  const [compare, setCompare] = React.useState(true)
  const { data, error, loading, reload } = useRead<Analytics>(`/api/app/reviews/analytics?from=${period.start}&to=${period.end}`)
  const series = React.useMemo(() => (data?.series ?? []).map((p) => ({ ...p, label: bucketLabel(p.key, data?.bucket ?? "day") })), [data])

  const c = data?.current
  const p = data?.previous
  const f = data?.funnel
  const pf = data?.previousFunnel
  const steps = f
    ? [
        { label: tt("Sent"), value: f.sent as number | null },
        { label: tt("Delivered"), value: f.delivered },
        { label: tt("Opened"), value: f.opened },
        { label: tt("Reviewed"), value: f.submitted as number | null },
      ]
    : []

  return (
    <div className="space-y-4 sm:space-y-5" data-reviews-analytics="">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={period} onChange={setPeriod} today={today} />
        <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-[#4b5563] hover:bg-[#f1f2f4]">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
          {tt("Compare with the period before")}
        </label>
        {loading && data ? <span className="text-[12px] text-[#9ca3af]">{tt("Updating")}</span> : null}
      </div>

      {error && !data ? <ReadFailed error={error} onRetry={reload} /> : null}

      <section className={cn(CARD, "grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-5 sm:p-5", loading && data && "opacity-70")} aria-label={tt("Readings")}>
        {c && p && f && pf ? (
          <>
            <Reading label={tt("Reviews received")} value={formatCount(c.received)} delta={<Delta now={c.received} before={p.received} compare={compare} />} />
            <Reading label={tt("Average rating")} value={c.published ? c.average.toFixed(1) : "–"} delta={<Delta now={c.average} before={p.average} points compare={compare} />} />
            <Reading label={tt("From verified buyers")} value={c.received ? `${c.verifiedShare}%` : "–"} delta={<Delta now={c.verifiedShare} before={p.verifiedShare} points compare={compare} />} />
            <Reading label={tt("Requests sent")} value={formatCount(f.sent)} delta={<Delta now={f.sent} before={pf.sent} compare={compare} />} />
            <Reading label={tt("Response rate")} value={f.sent ? `${f.responseRate}%` : "–"} delta={<Delta now={f.responseRate} before={pf.responseRate} points compare={compare} />} />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <Placeholder key={i} className="h-12" />)
        )}
      </section>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <section className={cn(CARD, "overflow-hidden")} aria-labelledby="ra-volume">
          <div className={CARD_HEAD}>
            <h3 id="ra-volume" className={H3}>
              {tt("Reviews received")}
            </h3>
          </div>
          <div className="h-[220px] px-2 pb-3 pt-4">
            {data ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
                  <Tooltip cursor={{ fill: "#f4f5f7" }} contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v) => [formatCount(Number(v)), tt("Reviews")]} />
                  <Bar dataKey="received" fill={VIOLET} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Placeholder className="h-full" />
            )}
          </div>
        </section>

        <section className={cn(CARD, "overflow-hidden")} aria-labelledby="ra-rating">
          <div className={CARD_HEAD}>
            <h3 id="ra-rating" className={H3}>
              {tt("Average rating")}
            </h3>
          </div>
          <div className="h-[220px] px-2 pb-3 pt-4">
            {data ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={AXIS} tickLine={false} axisLine={false} width={40} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v) => [v === null || v === undefined ? "–" : Number(v).toFixed(1), tt("Average")]} />
                  <Line type="monotone" dataKey="average" stroke={VIOLET} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Placeholder className="h-full" />
            )}
          </div>
        </section>

        <section className={cn(CARD, "overflow-hidden")} aria-labelledby="ra-stars">
          <div className={CARD_HEAD}>
            <h3 id="ra-stars" className={H3}>
              {tt("Ratings")}
            </h3>
            {c ? <span className={MUTED}>{tt("{n, plural, one {# published review} other {# published reviews}}", { n: c.published })}</span> : null}
          </div>
          <div className="px-4 py-4 sm:px-5">{c ? <Distribution rows={c.distribution} total={c.published} /> : <Placeholder className="h-28" />}</div>
        </section>

        <section className={cn(CARD, "overflow-hidden")} aria-labelledby="ra-funnel">
          <div className={CARD_HEAD}>
            <h3 id="ra-funnel" className={H3}>
              {tt("Review requests")}
            </h3>
          </div>
          <div className="space-y-2.5 px-4 py-4 sm:px-5" data-reviews-funnel="">
            {f ? (
              steps.map((s) => (
                <div key={s.label} className="grid grid-cols-[84px_minmax(0,1fr)_64px] items-center gap-3 text-[13px]">
                  <span className="text-[#4b5563]">{s.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-[#f1f2f4]">
                    {s.value !== null ? <span className="block h-full rounded-full" style={{ width: `${f.sent ? Math.min(100, (s.value / f.sent) * 100) : 0}%`, background: VIOLET }} /> : null}
                  </span>
                  <span className="text-right tabular-nums text-[#1a1a2e]">{s.value === null ? <span className="text-[#9ca3af]" title={tt("Not reported by the mail provider yet")}>{tt("n/a")}</span> : formatCount(s.value)}</span>
                </div>
              ))
            ) : (
              <Placeholder className="h-28" />
            )}
            <p className="pt-1 text-[12px] text-[#9ca3af]">{tt("Counted by when each request was sent. Opens are counted when the buyer's email app reports them.")}</p>
          </div>
        </section>
      </div>
      {data?.capped ? <p className={MUTED}>{tt("This period has more reviews than one chart reads. Pick a shorter period for exact numbers.")}</p> : null}
    </div>
  )
}

function Reading({ label, value, delta }: { label: string; value: string; delta: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[12.5px] text-[#6b7280]">{label}</p>
      <p className="mt-0.5 text-[22px] font-semibold leading-7 tabular-nums text-[#1a1a2e]">{value}</p>
      <div className="h-4">{delta}</div>
    </div>
  )
}
