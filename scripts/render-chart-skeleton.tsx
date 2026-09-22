/**
 * The REAL analytics chart in three states, side by side, so the difference
 * between them is measured rather than described:
 *
 *   empty      the series the page had before its fetch returned: `[]`
 *   loading    the placeholder series, with isLoading on
 *   loaded     the placeholder replaced by numbers, which is the transition
 *              the line has to grow through
 *
 * The third one starts in the loading state and is switched by the probe, so
 * what is measured is the CHANGE, not two charts that happen to differ.
 */
import { createRoot } from "react-dom/client"
import { useState } from "react"

import { AnalyticsChartWithTooltip, type AnalyticsChartData } from "../components/app/analytics-chart"

const DAYS = 7
const labels = Array.from({ length: DAYS }, (_, i) => `Sep ${i + 15}`)

const blank = (date: string): AnalyticsChartData => ({
  date, views: 0, sales: 0, revenue: 0, refunds: 0, conversion: 0, clicks: 0, subscribers: 0, ctr: 0,
})

/** What analytics-client's skeletonTrend builds: the dates, and zeros. */
const placeholder: AnalyticsChartData[] = labels.map(blank)

/** And what arrives. Same dates, so the line grows rather than being replaced. */
const loaded: AnalyticsChartData[] = labels.map((date, i) => ({
  ...blank(date),
  views: 12 + i * 9,
  sales: 1 + (i % 3),
  revenue: 900 + i * 220,
  conversion: 2 + (i % 4),
}))

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`

function One({ id, data, loading }: { id: string; data: AnalyticsChartData[]; loading: boolean }) {
  return (
    <div id={id} style={{ width: 380 }}>
      <AnalyticsChartWithTooltip
        chartDisplayData={data}
        analyticsMode="store"
        chartMetricFilter="views"
        onePageChartFilter="all"
        isTouchDevice={false}
        formatPrice={formatPrice}
        isLoading={loading}
      />
    </div>
  )
}

function Harness() {
  /* The probe flips this, which is the moment under test. */
  const [arrived, setArrived] = useState(false)
  ;(window as unknown as Record<string, unknown>).__arrive = () => setArrived(true)

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", display: "flex", gap: 16 }}>
      {/* The series the page actually had: nothing at all. */}
      <One id="empty" data={[]} loading={false} />
      {/* The placeholder, and the same chart once its numbers land. */}
      <One id="live" data={arrived ? loaded : placeholder} loading={!arrived} />
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<Harness />)
