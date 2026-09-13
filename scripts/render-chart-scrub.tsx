/**
 * THE REAL ANALYTICS CHART, WITH A REAL FINGER ON IT.
 *
 * Every previous answer about this gesture came from reading the source. I
 * was wrong twice that way — the hold that a resting thumb cancelled, and the
 * thirty pixel offset between the axis and the touch maths — so this mounts
 * the component the analytics page actually renders and lets a script press,
 * hold and drag on it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AnalyticsChartWithTooltip, type AnalyticsChartData } from "@/components/app/analytics-chart"

/** Fourteen days, with a shape that has a distinct value at every point. */
const data: AnalyticsChartData[] = Array.from({ length: 14 }, (_, i) => ({
  date: `Sep ${i + 1}`,
  views: (i + 1) * 3,
  sales: i,
  revenue: (i + 1) * 250,
  clicks: i * 2,
  conversion: i,
  ctr: i,
}))

/**
 * Which series to draw. Revenue is the interesting one: its ticks read
 * "$1.8k", so it is the case where the axis has to widen and the touch maths
 * has to widen with it.
 */
const metric = ((globalThis as unknown as { __metric?: string }).__metric ?? "views") as string

const host = document.getElementById("app")!
createRoot(host).render(
  <div style={{ width: 360, padding: 0 }}>
    <div style={{ background: "#fff", borderRadius: 16, padding: 8 }}>
      <AnalyticsChartWithTooltip
        chartDisplayData={data}
        analyticsMode="store"
        chartMetricFilter={metric}
        onePageChartFilter={metric}
        /* The whole point: the touch path, not the desktop hover path. */
        isTouchDevice
        formatPrice={(cents: number) => `$${(cents / 100).toFixed(2)}`}
      />
    </div>
  </div>,
)
