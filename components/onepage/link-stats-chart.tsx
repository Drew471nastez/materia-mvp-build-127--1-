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

export interface LinkStats {
  total_clicks: number
  total_views: number
  chart_data: { date: string; clicks: number; views: number }[]
}

const INK = "#1a1a2e"

/** "2026-09-20" as "Sep 20". A date with no time is a day, not a UTC midnight to move into the viewer's zone. */
function dayLabel(d: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d)
  const at = new Date(dateOnly ? `${d}T12:00:00Z` : d)
  if (Number.isNaN(at.getTime())) return d
  return at.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", ...(dateOnly ? { timeZone: "UTC" } : {}) }))
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


export function LinkStatsChart({
  stats,
  loading,
  clicksLabel,
  start,
  end,
  endIsToday,
}: {
  stats: LinkStats | null
  loading: boolean
  /** What a click is on this block: Clicks, Submissions, Opens. */
  clicksLabel: string
  start: string
  end: string
  endIsToday: boolean
}) {
  const formatPrice = useSellerMoney()
  const [metric, setMetric] = React.useState<"views" | "clicks">("clicks")
  const first = loading && !stats
  const data = React.useMemo<AnalyticsChartData[]>(() => {
    if (stats) return stats.chart_data.map((d) => ({ date: dayLabel(d.date), views: d.views, clicks: d.clicks, sales: 0, revenue: 0 }))
    return daysOf(start, end).map((d) => ({ date: dayLabel(d), views: 0, clicks: 0, sales: 0, revenue: 0 }))
  }, [stats, start, end])
  const count = (n: number | undefined) => (n ?? 0).toLocaleString(appLocale())
  const labels = React.useMemo(() => ({ clicks: clicksLabel }), [clicksLabel])

  return (
    <div data-link-stats="" className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-busy={loading}>
      <div role="tablist" aria-label={tt("Metric")} className="grid grid-cols-2 divide-x divide-[#e5e7eb]/60">
        <MetricTab tab="views" label={tt("Views")} value={count(stats?.total_views)} foot={tt("Times it was seen")} selected={metric === "views"} loading={first} soft={loading && !first} onSelect={() => setMetric("views")} />
        <MetricTab tab="clicks" label={clicksLabel} value={count(stats?.total_clicks)} foot={clicksLabel === "Clicks" ? tt("Taps on it") : clicksLabel === "Opens" ? tt("Times it was opened") : tt("Emails left")} selected={metric === "clicks"} loading={first} soft={loading && !first} onSelect={() => setMetric("clicks")} />
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
    </div>
  )
}
