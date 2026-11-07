/**
 * BOTH TREND CHARTS, MOUNTED FOR A POINTER AND A FINGER.
 *
 * The chart at the top of the home page and the chart under the Analytics
 * tabs, the real components, with thirty days of numbers and, on Analytics,
 * the period before as the dashed line. scripts/check-chart-feel.mjs moves a
 * mouse and a finger across each and measures what the page does per move.
 *
 * Which chart is mounted comes from the address: ?chart=home or
 * ?chart=analytics.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AnalyticsChartWithTooltip, type AnalyticsChartData } from "@/components/app/analytics-chart"
import { DashboardTrendChart } from "@/components/app/dashboard-client"
import { LanguageProvider } from "@/lib/i18n/context"

const days = Array.from({ length: 30 }, (_, i) => `Sep ${i + 1}`)
/* ?empty=1: a store with nothing yet, every point zero (scripts/check-chart-empty-al.mjs). */
const EMPTY = new URLSearchParams(location.search).get("empty") === "1"
const wave = (i: number, k: number) => (EMPTY ? 0 : Math.round(20 + 14 * Math.sin(i / 3 + k) + (i % 5) * 3))

const analytics: AnalyticsChartData[] = days.map((date, i) => ({
  date,
  views: wave(i, 0),
  sales: Math.round(wave(i, 1) / 6),
  revenue: wave(i, 2) * 180,
  conversion: Number((wave(i, 3) / 9).toFixed(2)),
  prev_views: wave(i, 1.4),
  prev_sales: Math.round(wave(i, 2) / 7),
  prev_revenue: wave(i, 0.5) * 160,
  prev_conversion: Number((wave(i, 2) / 10).toFixed(2)),
}))

const home = {
  views: days.map((label, i) => ({ label, value: wave(i, 0) })),
  revenue: days.map((label, i) => ({ label, value: (wave(i, 2) * 180) / 100 })),
  orders: days.map((label, i) => ({ label, value: Math.round(wave(i, 1) / 6), refunds: i % 9 === 0 ? 1 : 0 })),
  conversion: days.map((label, i) => ({ label, value: Number((wave(i, 3) / 9).toFixed(2)) })),
}

const which = new URLSearchParams(location.search).get("chart") ?? "analytics"
const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`

function Harness() {
  const [metric, setMetric] = React.useState("views")
  ;(window as unknown as { __metric: (m: string) => void }).__metric = setMetric
  return (
    <div style={{ padding: "24px 16px", maxWidth: 1136, margin: "0 auto" }}>
      <div style={{ height: 120 }} />
      <div id="card" className="rounded-2xl border border-[#e5e7eb]/60 bg-white px-2 pb-3 pt-7 sm:px-4 sm:pb-4">
        {which === "home" ? (
          <DashboardTrendChart
            displayChartData={home[metric as keyof typeof home]}
            openKPIModal={metric as "views"}
            widthFrom={home}
            t={(k: string) => ({ "dashboard.views": "Views", "dashboard.orders": "Orders", "dashboard.revenue": "Revenue", "dashboard.conversionRate": "Conversion rate" })[k] ?? k}
          />
        ) : (
          <AnalyticsChartWithTooltip
            chartDisplayData={analytics}
            analyticsMode="store"
            chartMetricFilter={metric}
            onePageChartFilter="views"
            formatPrice={formatPrice}
            compareLabel="Aug 2–31, 2026"
          />
        )}
      </div>
      <div style={{ height: 1400 }} />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Harness />
  </LanguageProvider>,
)
