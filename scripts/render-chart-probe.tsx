/**
 * Mounts the REAL analytics chart in a real browser and measures what a hover
 * costs — not a reproduction of it, the component the page imports.
 *
 * Bundled for the browser by scripts/check-chart.mjs, loaded in Chromium,
 * driven with synthetic pointer events across the plot, and asked what a
 * screenshot cannot answer: how many nodes recharts is holding, how much of
 * the DOM it rewrites for one mouse move, and whether the crosshair, the
 * active dot and the tooltip box glide to the next point or teleport to it.
 */
import { createRoot } from "react-dom/client"
import { useState } from "react"

import { AnalyticsChartWithTooltip, type AnalyticsChartData } from "../components/app/analytics-chart"

const DAYS = 30
const data: AnalyticsChartData[] = Array.from({ length: DAYS }, (_, i) => ({
  date: `Sep ${i + 1}`,
  views: 40 + Math.round(30 * Math.sin(i / 3)),
  sales: 4 + (i % 5),
  revenue: 1200 + i * 90 + (i % 7) * 140,
  refunds: i % 9 === 0 ? 1 : 0,
  conversion: 3 + (i % 4),
  clicks: 20 + (i % 6),
  subscribers: 2 + (i % 3),
  ctr: 5 + (i % 3),
}))

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`

/**
 * THE COUNTER THE REAL PAGE ALSO HAS.
 *
 * The analytics page is one three-thousand-line component, so anything that
 * sets state on it re-renders the chart's parent. This button reproduces
 * exactly that: press it and the parent renders again with identical chart
 * props. A memoised chart ignores it; an unmemoised one rebuilds.
 */
function Harness() {
  const [, setTick] = useState(0)
  return (
    <div style={{ width: 720, padding: 16, fontFamily: "system-ui" }}>
      <button id="bump" onClick={() => setTick((t) => t + 1)}>bump the parent</button>
      <div id="chart">
        <AnalyticsChartWithTooltip
          chartDisplayData={data}
          analyticsMode="store"
          chartMetricFilter="all"
          onePageChartFilter="all"
          isTouchDevice={false}
          formatPrice={formatPrice}
        />
      </div>
    </div>
  )
}

// No StrictMode: it double-renders by design, which would hide the very
// difference this probe exists to measure.
createRoot(document.getElementById("root")!).render(<Harness />)
