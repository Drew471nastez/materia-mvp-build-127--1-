"use client"

/**
 * ===========================================================================
 *  A LINK'S STATS, DRAWN THE WAY ANALYTICS DRAWS THE ONEPAGE
 * ===========================================================================
 * A card's stats were two tinted boxes (blue and violet) over a recharts
 * LineChart with dots on every day, a dashed grid and a white tooltip box:
 * nothing like the OnePage chart on Analytics. Now they are that chart's own
 * parts: the figures are components/app/metric-tab (the grey line under the
 * chosen one), and the chart is components/app/analytics-chart in its OnePage
 * mode, so the gradient under the line, the line, the dot at its end, the
 * scale, the dates and the marker a finger or a pointer moves are the same.
 * A tab moves the line rather than replacing it.
 *
 * The figures are Analytics' own (lib/onepage/link-stats): the page's views
 * as the OnePage property counts them, this block's clicks (an email
 * block's sign-ups), and the click rate, clicks out of views. The chart's
 * points are the buckets Analytics draws for the same period, on the
 * creator's clock: hours for a day or two, days, then months.
 *
 * The one difference is the ink: the line is the app's near black rather
 * than the violet, as the owner asked for everything in the OnePage editor.
 */
import * as React from "react"
import { useSellerMoney } from "@/components/platform/price-currency"
import { AnalyticsChartWithTooltip, type AnalyticsChartData } from "@/components/app/analytics-chart"
import { MetricTab } from "@/components/app/metric-tab"
import { longDate } from "@/lib/date-range/range"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import type { BlockStats } from "@/lib/onepage/link-stats"
import { tipLabel } from "@/lib/onepage/tips"

/** The answer of /api/onepage/stats for a block; the older answer had only the first three. */
export type LinkStats = Pick<BlockStats, "total_clicks" | "total_views" | "chart_data"> & Partial<Omit<BlockStats, "total_clicks" | "total_views" | "chart_data">>

const INK = "#1a1a2e"
const HOUR = 3_600_000

/** "2026-09-20" as "Sep 20". A date with no time is a day, not a UTC midnight to move into the viewer's zone. */
function dayLabel(d: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d)
  const at = new Date(dateOnly ? `${d}T12:00:00Z` : d)
  if (Number.isNaN(at.getTime())) return d
  return at.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", ...(dateOnly ? { timeZone: "UTC" } : {}) }))
}

/** A bucket's start as the chart names it: an hour, a day or a month, by how far apart the buckets are. */
function bucketName(iso: string, step: number): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  if (step > 0 && step <= 2 * HOUR) return at.toLocaleTimeString(appLocale(), zoned({ hour: "numeric" }))
  if (step >= 27 * 24 * HOUR) return at.toLocaleDateString(appLocale(), zoned({ month: "short", year: "2-digit" }))
  return at.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric" }))
}

/** The days of a period, for the placeholder before the first answer: the same dates the answer will have. */
function daysOf(start: string, end: string): string[] {
  const a = Date.parse(`${start}T12:00:00Z`)
  const b = Date.parse(`${end}T12:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return []
  const out: string[] = []
  for (let t = a; t <= b && out.length < 400; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

/** What a click is on this block. */
export type LinkStatsKind = "clicks" | "opens" | "signups"

export function LinkStatsChart({
  stats,
  loading,
  kind = "clicks",
  start,
  end,
  endIsToday,
}: {
  stats: LinkStats | null
  loading: boolean
  kind?: LinkStatsKind
  start: string
  end: string
  endIsToday: boolean
}) {
  const formatPrice = useSellerMoney()
  const [metric, setMetric] = React.useState<"views" | "clicks" | "ctr">("clicks")
  const first = loading && !stats
  const data = React.useMemo<AnalyticsChartData[]>(() => {
    if (stats) {
      const points = stats.chart_data
      const step = points.length > 1 ? Date.parse(points[1].date) - Date.parse(points[0].date) : 24 * HOUR
      return points.map((d) => ({
        date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? dayLabel(d.date) : bucketName(d.date, step),
        views: d.views,
        clicks: d.clicks,
        ctr: typeof d.ctr === "number" ? d.ctr : d.views > 0 ? Math.round((d.clicks / d.views) * 10_000) / 100 : 0,
        sales: 0,
        revenue: 0,
      }))
    }
    return daysOf(start, end).map((d) => ({ date: dayLabel(d), views: 0, clicks: 0, ctr: 0, sales: 0, revenue: 0 }))
  }, [stats, start, end])
  const count = (n: number | undefined) => (n ?? 0).toLocaleString(appLocale())
  const clicksLabel = kind === "signups" ? tt("Submissions") : kind === "opens" ? tt("Opens") : tt("Clicks")
  const rateLabel = kind === "signups" ? tt("Conversion") : tt("Click rate")
  const labels = React.useMemo(() => ({ clicks: clicksLabel, ctr: rateLabel }), [clicksLabel, rateLabel])
  const rate = stats ? (stats.click_rate ?? (stats.total_views > 0 ? Math.round((stats.total_clicks / stats.total_views) * 10_000) / 100 : null)) : null
  const rateText = rate === null ? "0%" : `${rate.toLocaleString(appLocale(), { maximumFractionDigits: rate < 10 ? 1 : 0 })}%`

  return (
    <div data-link-stats="" className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-busy={loading}>
      <div role="tablist" aria-label={tt("Metric")} className="grid grid-cols-3 divide-x divide-[#e5e7eb]/60">
        <MetricTab tab="views" label={tt("Views")} value={count(stats?.total_views)} foot={tt("Times it was seen")} selected={metric === "views"} loading={first} soft={loading && !first} onSelect={() => setMetric("views")} />
        <MetricTab tab="clicks" label={clicksLabel} value={count(stats?.total_clicks)} foot={kind === "signups" ? tt("Emails left") : kind === "opens" ? tt("Times it was opened") : tt("Taps on it")} selected={metric === "clicks"} loading={first} soft={loading && !first} onSelect={() => setMetric("clicks")} />
        <MetricTab tab="ctr" label={rateLabel} value={rateText} foot={kind === "signups" ? tt("Of views") : tt("Clicks per view")} selected={metric === "ctr"} loading={first} soft={loading && !first} onSelect={() => setMetric("ctr")} />
      </div>
      <div className="border-t border-[#e5e7eb]/60 px-2 pb-3 pt-6 sm:px-3">
        <div className={cn("transition-[opacity,filter] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)]", loading && !first ? "opacity-40 blur-[1.5px]" : "opacity-100 blur-0")}>
          <AnalyticsChartWithTooltip
            chartDisplayData={data}
            isLoading={first}
            analyticsMode="onepage"
            chartMetricFilter="views"
            onePageChartFilter={metric}
            formatPrice={formatPrice}
            color={INK}
            seriesLabels={labels}
          />
        </div>
        <div className="mt-2 flex justify-between px-1 text-[11px] text-[#9ca3af]">
          <span>{longDate(start)}</span>
          <span>{endIsToday ? tt("Now") : longDate(end)}</span>
        </div>
      </div>
      {stats?.tips ? <TipsBySource tips={stats.tips} /> : null}
    </div>
  )
}

/*
  Round AS: a tips block's tips in the period, and where the tippers came from (lib/analytics/tip-sources): the site
  that sent them to the page (Instagram, TikTok), or Direct.
*/
function TipsBySource({ tips }: { tips: NonNullable<BlockStats["tips"]> }) {
  const locale = appLocale()
  const top = tips.from.slice(0, 5)
  return (
    <div data-link-stats-tips="" className="border-t border-[#e5e7eb]/60 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Tips")}</span>
        <span className="text-[13px] tabular-nums text-[#1a1a2e]">
          {tipLabel(tips.cents, tips.currency, locale)} <span className="text-[12px] text-[#9ca3af]">· {tt("{count, plural, one {# tip} other {# tips}}", { count: tips.count })}</span>
        </span>
      </div>
      {top.length ? (
        <ul className="mt-2 space-y-1.5" aria-label={tt("Where tippers came from")}>
          {top.map((f) => (
            <li key={f.key} data-tip-from={f.key} className="flex items-center justify-between gap-3 text-[12.5px] text-[#4b5563]">
              <span className="min-w-0 truncate">{f.key === "direct" ? tt("Direct") : f.label}</span>
              <span className="shrink-0 tabular-nums">
                {tipLabel(f.cents, tips.currency, locale)} <span className="text-[#9ca3af]">· {f.count}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
