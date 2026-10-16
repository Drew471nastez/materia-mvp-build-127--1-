"use client"

/**
 * ===========================================================================
 *  REVIEWS › ANALYTICS
 * ===========================================================================
 * One row of controls above everything it scopes: the period (7, 30 or 90
 * days, 12 months, or two dates) and, always, the period of the same length
 * before it, which every figure is compared with. Then the figures in one
 * strip, and four charts (./review-charts.tsx), each with its numbers as a
 * table a press away.
 *
 * The rows come once per period (/api/app/reviews/analytics); every number
 * is counted here by lib/reviews/analytics.ts, the same arithmetic the tests
 * check. While a new period loads the page keeps the last one, dimmed.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatNumber, formatPercent } from "@/lib/i18n/format"
import { RANGE_KEYS, change, distribution, granularityFor, reviewSeries, summarize, type Period, type RangeKey, type ReviewPoint, type RequestPoint } from "@/lib/reviews/analytics"
import { card } from "@/app/app/orders/order-parts"
import { ACCENT, COMPARED, Distribution, Funnel, Legend, RatingTrend, VolumeChart, slotLabel } from "./review-charts"
import { REVIEWS_BODY } from "./reviews-nav"

export interface AnalyticsData {
  range: RangeKey
  period: Period
  previous: Period
  reviews: ReviewPoint[]
  requests: (RequestPoint & { due_at?: string | null })[]
  capped: boolean
}

const RANGE_LABEL: Record<(typeof RANGE_KEYS)[number], () => string> = {
  "7d": () => tt("7 days"),
  "30d": () => tt("30 days"),
  "90d": () => tt("90 days"),
  "12m": () => tt("12 months"),
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

export function ReviewsAnalytics({ initial }: { initial: AnalyticsData }) {
  const [data, setData] = React.useState(initial)
  const [range, setRange] = React.useState<RangeKey>(initial.range)
  const [from, setFrom] = React.useState(iso(initial.period.from))
  const [to, setTo] = React.useState(iso(initial.period.to - 1))
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const ask = React.useRef(0)

  const load = async (key: RangeKey, a?: string, b?: string) => {
    const n = ++ask.current
    setLoading(true)
    setError(null)
    const q = new URLSearchParams({ range: key, ...(key === "custom" && a && b ? { from: a, to: b } : {}) })
    const res = await fetch(`/api/app/reviews/analytics?${q}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null)
    const next = res?.ok ? ((await res.json().catch(() => null)) as AnalyticsData | null) : null
    if (n !== ask.current) return
    setLoading(false)
    if (!next) return setError(tt("The numbers did not load. Check your connection and try again."))
    setData(next)
    setFrom(iso(next.period.from))
    setTo(iso(next.period.to - 1))
  }

  const g = granularityFor(data.period)
  const now = summarize(data.reviews, data.requests, data.period)
  const before = summarize(data.reviews, data.requests, data.previous)
  const series = reviewSeries(data.reviews, data.period, g)
  const prevSeries = reviewSeries(data.reviews, data.previous, g)
  const inNow = data.reviews.filter((r) => Date.parse(r.created_at) >= data.period.from && Date.parse(r.created_at) < data.period.to)
  const inBefore = data.reviews.filter((r) => Date.parse(r.created_at) >= data.previous.from && Date.parse(r.created_at) < data.previous.to)
  const dist = distribution(inNow.map((r) => r.rating))
  const distBefore = distribution(inBefore.map((r) => r.rating))
  const comparedWith = tt("Compared with {from} to {to}", { from: slotLabel(data.previous.from, "day"), to: slotLabel(data.previous.to - 1, "day") })

  return (
    <div className={REVIEWS_BODY} data-reviews-analytics="">
      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={tt("Period")}>
        <div className="orders-strip flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-[#eceef1] p-1">
          {[...RANGE_KEYS, "custom" as const].map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={range === k}
              onClick={() => {
                setRange(k)
                if (k !== "custom") void load(k)
              }}
              className={cn("h-9 shrink-0 rounded-lg px-3 text-[13.5px] font-medium transition-colors md:h-8 md:text-[13px]", range === k ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#4b5563] hover:text-[#1a1a2e]")}
              data-range={k}
            >
              {k === "custom" ? tt("Dates") : RANGE_LABEL[k]()}
            </button>
          ))}
        </div>
        {range === "custom" ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void load("custom", from, to)
            }}
          >
            <label className="sr-only" htmlFor="ra-from">
              {tt("From")}
            </label>
            <input id="ra-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-lg border border-[#e3e4e8] bg-white px-2.5 text-[16px] text-[#1a1a2e] md:h-8 md:text-[13px]" />
            <span className="text-[13px] text-[#6b7280]">{tt("to")}</span>
            <label className="sr-only" htmlFor="ra-to">
              {tt("To")}
            </label>
            <input id="ra-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-lg border border-[#e3e4e8] bg-white px-2.5 text-[16px] text-[#1a1a2e] md:h-8 md:text-[13px]" />
            <button type="submit" className="h-10 rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-medium text-white md:h-8">
              {tt("Show")}
            </button>
          </form>
        ) : null}
        <p className="text-[13px] text-[#6b7280] md:ml-auto">{comparedWith}</p>
      </div>

      {error ? <p className="mt-3 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">{error}</p> : null}

      <div className={cn("transition-opacity duration-150", loading && "opacity-55")} aria-busy={loading}>
        <section aria-label={tt("Figures")} className={cn(card, "mt-3 grid grid-cols-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-6")} data-analytics-figures="">
          <Figure label={tt("Reviews")} value={formatNumber(now.count)} delta={change(now.count, before.count)} kind="count" />
          <Figure label={tt("Average rating")} value={now.average === null ? tt("None") : formatNumber(now.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} delta={change(now.average, before.average)} kind="rating" />
          <Figure label={tt("Verified purchases")} value={now.verifiedShare === null ? tt("None") : formatPercent(now.verifiedShare, 0)} delta={change(now.verifiedShare, before.verifiedShare)} kind="share" />
          <Figure label={tt("With photos or video")} value={now.mediaShare === null ? tt("None") : formatPercent(now.mediaShare, 0)} delta={change(now.mediaShare, before.mediaShare)} kind="share" />
          <Figure label={tt("Emails delivered")} value={now.funnel.deliveryRate === null ? tt("None sent") : formatPercent(now.funnel.deliveryRate, 0)} delta={change(now.funnel.deliveryRate, before.funnel.deliveryRate)} kind="share" />
          <Figure label={tt("Emails that led to a review")} value={now.funnel.submissionRate === null ? tt("None sent") : formatPercent(now.funnel.submissionRate, 0)} delta={change(now.funnel.submissionRate, before.funnel.submissionRate)} kind="share" />
        </section>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <ChartCard
            title={tt("Reviews written")}
            legend={<Legend items={[{ label: tt("This period"), color: ACCENT }, { label: tt("The period before"), color: COMPARED, line: true }]} />}
            table={
              <Table
                head={[tt("Period"), tt("Reviews"), tt("The period before")]}
                rows={series.map((s, i) => [slotLabel(s.start, g, g === "month"), formatNumber(s.count), formatNumber(prevSeries[i]?.count ?? 0)])}
              />
            }
          >
            <VolumeChart series={series} previous={prevSeries} granularity={g} />
          </ChartCard>
          <ChartCard
            title={tt("Average rating")}
            legend={<Legend items={[{ label: tt("This period"), color: ACCENT, line: true }, { label: tt("The period before"), color: COMPARED, line: true }]} />}
            table={
              <Table
                head={[tt("Period"), tt("Average"), tt("Reviews")]}
                rows={series.map((s) => [slotLabel(s.start, g, g === "month"), s.average === null ? tt("None") : formatNumber(s.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), formatNumber(s.count)])}
              />
            }
          >
            {now.count ? <RatingTrend series={series} previous={prevSeries} granularity={g} /> : <EmptyChart />}
          </ChartCard>
          <ChartCard
            title={tt("Ratings")}
            table={<Table head={[tt("Rating"), tt("Reviews"), tt("Share"), tt("The period before")]} rows={dist.map((d, i) => [tt("{n, plural, one {# star} other {# stars}}", { n: d.stars }), formatNumber(d.count), formatPercent(d.share, 0), formatNumber(distBefore[i]?.count ?? 0)])} />}
          >
            {now.count ? <Distribution rows={dist} previous={distBefore} /> : <EmptyChart />}
          </ChartCard>
          <ChartCard
            title={tt("Request emails")}
            table={
              <Table
                head={[tt("This period"), tt("Emails")]}
                rows={[
                  [tt("Emails that went"), formatNumber(now.funnel.sent)],
                  [tt("Not delivered"), formatNumber(now.funnel.failed)],
                  [tt("Reminders"), formatNumber(now.funnel.reminders)],
                  [tt("Led to a review"), formatNumber(now.funnel.reviewed)],
                  [tt("Stopped before sending"), formatNumber(now.funnel.stopped)],
                ]}
              />
            }
          >
            {now.funnel.sent + now.funnel.failed ? (
              <>
                <Funnel sent={now.funnel.sent} failed={now.funnel.failed} reviewed={now.funnel.reviewed} />
                <p className="mt-3 text-[13px] text-[#6b7280]">
                  {tt("{reminders} reminders went. {stopped} stopped before sending (already reviewed, turned emails off, cancelled).", { reminders: formatNumber(now.funnel.reminders), stopped: formatNumber(now.funnel.stopped) })}
                </p>
              </>
            ) : (
              <EmptyChart text={tt("No request emails were due in this period.")} />
            )}
          </ChartCard>
        </div>
        {data.capped ? <p className="mt-3 text-[13px] text-[#6b7280]">{tt("This period has more than 20,000 reviews or emails. The figures count the first 20,000; pick a shorter period for exact ones.")}</p> : null}
      </div>
    </div>
  )
}

function Figure({ label, value, delta, kind }: { label: string; value: string; delta: { delta: number | null; relative: number | null }; kind: "count" | "rating" | "share" }) {
  const d = delta.delta
  const text =
    d === null
      ? tt("Nothing to compare")
      : d === 0
        ? tt("Same as before")
        : kind === "count"
          ? delta.relative === null
            ? tt("{n} more than before", { n: formatNumber(d) })
            : `${d > 0 ? "+" : ""}${formatPercent(delta.relative, 0)}`
          : kind === "rating"
            ? `${d > 0 ? "+" : ""}${formatNumber(d, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
            : tt("{n} points", { n: `${d > 0 ? "+" : ""}${formatNumber(Math.round(d * 100))}` })
  const tone = d === null || d === 0 ? "text-[#9ca3af]" : d > 0 ? "text-[#067647]" : "text-[#b42318]"
  return (
    <div className="min-w-0 border-b border-r border-[#f1f2f4] px-4 py-3.5 sm:px-5" data-figure={label}>
      <p className="truncate text-[12.5px] text-[#6b7280]">{label}</p>
      <p className="mt-1 truncate text-[22px] font-semibold leading-7 text-[#1a1a2e]">{value}</p>
      <p className={cn("mt-0.5 truncate text-[12.5px] tabular-nums", tone)}>{text}</p>
    </div>
  )
}

function ChartCard({ title, legend, table, children }: { title: string; legend?: React.ReactNode; table: React.ReactNode; children: React.ReactNode }) {
  const [asTable, setAsTable] = React.useState(false)
  return (
    <section className={cn(card, "min-w-0 p-4 sm:p-5")} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{title}</h2>
        <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} className="h-8 rounded-lg px-2.5 text-[12.5px] font-medium text-[#4b5563] hover:bg-[#f4f5f7]">
          {asTable ? tt("Chart") : tt("Table")}
        </button>
      </div>
      {asTable ? table : children}
      {!asTable && legend ? <div className="mt-3">{legend}</div> : null}
    </section>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="max-h-[260px] overflow-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-white">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn("border-b border-[#f1f2f4] py-1.5 font-medium text-[#6b7280]", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[#f7f7f8] last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn("py-1.5 text-[#1a1a2e]", j > 0 && "text-right tabular-nums")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyChart({ text }: { text?: string }) {
  return <p className="flex h-[200px] items-center justify-center rounded-xl bg-[#fafbfb] px-6 text-center text-[13px] text-[#6b7280]">{text ?? tt("No reviews were written in this period.")}</p>
}
