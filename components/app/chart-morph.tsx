"use client"

/**
 * ===========================================================================
 *  ONE LINE BECOMING THE NEXT, ON BOTH TREND CHARTS
 * ===========================================================================
 * Shared by the analytics trend chart (components/app/analytics-chart.tsx)
 * and the dashboard's KPI chart. No recharts in here: the dashboard loads
 * recharts lazily on purpose, and this module must not pull it in.
 *
 * What a metric tab did before, measured on the analytics chart:
 *
 *   THE LINE WAS REPLACED, NOT MOVED. Each metric was its own <Area>, drawn
 *   only while its tab was chosen, so a tap unmounted one series and
 *   mounted another. Recharts has nothing to animate between two series it
 *   has never seen together, so the new line simply appeared.
 *
 *   THE AXIS JUMPED SIDEWAYS. Its width was the widest label of the metric
 *   showing, so Views (0 5 10) and Revenue ($0 $600 $1.2k) put the plot at two
 *   different places and the whole chart shifted left or right on a tap.
 *
 *   THE GRID JUMPED UP AND DOWN. The scale chose three or four intervals
 *   per metric, so the lines themselves moved between tabs.
 *
 * So: one line slot that is given the next metric's numbers and moves every
 * point from where it is drawn to where it goes (components/app/morph-lines,
 * which took this over from recharts because recharts restarted a move from
 * where the last one was going), a scale with a fixed number of intervals
 * (the grid never moves, only the numbers on it), an axis as wide as the
 * widest label of EVERY metric the tabs can show, and those numbers
 * cross-faded rather than swapped.
 */
import * as React from "react"
import type { Scale } from "@/lib/analytics/chart-scale"

/** How long a line takes to become the next one. */
export const MORPH_MS = 600
/**
 * The iOS sheet curve: most of the way in the first third, then a long
 * settle. What makes a morph read as a physical thing arriving rather than a
 * tween. morphEase below is the same curve as a function of time.
 */
export const MORPH_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

/** Three gaps, four lines, whatever the metric: the grid is the same drawing on every tab. */
export const INTERVALS = 3

/**
 * A step an axis reads well in, from a finer set than 1, 2, 2.5, 5: with the
 * number of intervals fixed, a coarse step is what leaves a line sitting in
 * the bottom half of its card (6.9% drawn on 0 to 15%). Counts below ten
 * step in whole numbers.
 */
function fineStep(raw: number, integer: boolean): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / exp
  const pick = integer && exp < 10 ? [1, 2, 3, 4, 5, 6, 8, 10] : [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  const step = (pick.find((p) => f <= p + 1e-9) ?? 10) * exp
  return integer ? Math.max(1, Math.ceil(step - 1e-9)) : step
}

/**
 * A scale with exactly INTERVALS steps and headroom above the highest point.
 * Counts step in whole numbers; nothing at all is 0 to 3.
 */
export function fixedScale(max: number, integer: boolean): Scale {
  if (!(max > 0) || !Number.isFinite(max)) {
    return { step: 1, top: INTERVALS, ticks: Array.from({ length: INTERVALS + 1 }, (_, i) => i) }
  }
  const step = fineStep((max * 1.1) / INTERVALS, integer)
  const ticks = Array.from({ length: INTERVALS + 1 }, (_, i) => Number((step * i).toPrecision(12)))
  return { step, top: ticks[INTERVALS], ticks }
}

/**
 * THE AXIS NUMBERS, CROSS-FADED.
 *
 * Drawn over the chart rather than by recharts, which keys each tick by its
 * value and so replaces the text node outright when the value changes. Here
 * the old set fades out while the new set fades in, at the same heights,
 * because the grid they label does not move (fixedScale).
 *
 * Right-aligned in the gutter the plot reserves (`width`), with the same gap
 * to the plot the measured width allows for.
 */
export function AxisLabels({
  labels,
  top,
  height,
  width,
  gap = 8,
  fontSize = 11,
  inside = false,
}: {
  /** Bottom first, as the ticks are. */
  labels: string[]
  /** Where the top tick is drawn, and how far below it the bottom one is. */
  top: number
  height: number
  width: number
  gap?: number
  fontSize?: number
  /**
   * INSIDE THE PLOT (round 49, the owner: "the left column of numbers takes
   * too much space"): each number sits on its own grid line at the plot's
   * left, just above it, with no gutter reserved, and the floor's 0 is left
   * out (the floor says it). A white halo keeps a line that crosses one
   * readable. `width` is then not used.
   */
  inside?: boolean
}) {
  const sig = labels.join("|")
  const [layers, setLayers] = React.useState<{ sig: string; labels: string[]; state: "still" | "in" | "out" }[]>(() => [
    { sig, labels, state: "still" },
  ])
  /* Decided during the render that receives the new labels, so no frame
     ever shows the new numbers at full strength on the old ones. */
  if (layers[layers.length - 1].sig !== sig) {
    setLayers([
      ...layers.filter((l) => l.state !== "out" && l.sig !== sig).map((l) => ({ ...l, state: "out" as const })),
      { sig, labels, state: "in" },
    ])
  }
  React.useEffect(() => {
    if (!layers.some((l) => l.state === "out")) return
    const t = window.setTimeout(() => setLayers((ls) => ls.filter((l) => l.state !== "out")), 280)
    return () => window.clearTimeout(t)
  }, [layers])

  const n = labels.length
  if (inside) {
    return (
      <div aria-hidden data-chart-axis="inside" className="pointer-events-none absolute inset-x-0 top-0 z-[1]" style={{ height: top + height }}>
        {layers.map((l) => (
          <div key={l.sig} className={l.state === "in" ? "chart-axis-in" : l.state === "out" ? "chart-axis-out" : undefined} style={{ position: "absolute", inset: 0 }}>
            {l.labels.map((text, i) =>
              i === 0 && n > 1 ? null : (
                <span
                  key={i}
                  className="chart-axis-label tabular-nums"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: top + (n <= 1 ? height : (1 - i / (n - 1)) * height) - fontSize - 4,
                    fontSize,
                    lineHeight: `${fontSize + 1}px`,
                    color: "#9ca3af",
                    whiteSpace: "nowrap",
                    textShadow: "0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff",
                  }}
                >
                  {text}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div aria-hidden data-chart-axis className="pointer-events-none absolute left-0 top-0" style={{ width: Math.max(0, width - gap), height: top + height }}>
      {layers.map((l) => (
        <div key={l.sig} className={l.state === "in" ? "chart-axis-in" : l.state === "out" ? "chart-axis-out" : undefined} style={{ position: "absolute", inset: 0 }}>
          {l.labels.map((text, i) => (
            <span
              key={i}
              className="chart-axis-label tabular-nums"
              style={{
                position: "absolute",
                right: 0,
                top: top + (n <= 1 ? height : (1 - i / (n - 1)) * height),
                transform: "translateY(-50%)",
                fontSize,
                lineHeight: `${fontSize + 1}px`,
                color: "#9ca3af",
                whiteSpace: "nowrap",
              }}
            >
              {text}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * MORPH_EASE as a function of time, for the lines drawn by hand (both trend
 * charts, components/app/morph-lines, and the report cards): the x of the
 * curve solved for t by Newton's method, then its y.
 */
export function morphEase(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const [x1, y1, x2, y2] = [0.32, 0.72, 0, 1]
  const bx = (u: number) => 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u ** 2 * (1 - u) + u ** 3
  const dx = (u: number) => 3 * x1 * (1 - u) ** 2 + 6 * (x2 - x1) * u * (1 - u) + 3 * (1 - x2) * u ** 2
  let u = t
  for (let i = 0; i < 8; i++) {
    const d = dx(u)
    if (Math.abs(d) < 1e-6) break
    u = Math.min(1, Math.max(0, u - (bx(u) - t) / d))
  }
  return 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u ** 2 * (1 - u) + u ** 3
}
