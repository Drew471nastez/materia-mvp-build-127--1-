"use client"

/**
 * ===========================================================================
 *  THE LINES OF BOTH TREND CHARTS, AND HOW ONE BECOMES THE NEXT
 * ===========================================================================
 * Drawn by the home page's chart and the Analytics chart, over the grid and
 * the dates recharts lays out. No recharts in here: the home page loads
 * recharts lazily, and its line should not wait for it.
 *
 * WHY THE LINE IS OURS. Recharts animates a line from the last numbers it
 * was given to the new ones. Tap Revenue, then Orders while Revenue is still
 * arriving, and recharts starts Orders from where Revenue was GOING, not
 * from where the line was: on the frame after the second tap the whole line
 * jumped, 23 to 30px against the 9px of an ordinary frame of the morph
 * (scripts/check-analytics-page.mjs). That is "something interfering with
 * the chart lines when I switch".
 *
 * Here the line is always drawn from where it is. Every change of numbers,
 * a tab, a period, a refresh or the first answer after the placeholder,
 * moves each point from its drawn position to its new one over MORPH_MS on
 * the iOS curve, and a change that lands mid move simply takes over from
 * that frame. The paths are written straight to the DOM once a frame, so a
 * morph renders nothing in React and a tab costs the same whatever else the
 * page is doing.
 *
 * The first numbers grow out of the floor, and the placeholder is the same
 * line lying on it in grey: the answer lifts it rather than replacing it.
 * The dot at the end of the line is part of the line and moves with it,
 * frame for frame.
 *
 * The curve is a held Catmull-Rom (monotonePath, round 65): rounded hills
 * rather than the monotone curve's flat tops, and never below the lowest
 * point, so a day with nothing does not dip below the axis.
 */
import * as React from "react"
import { MORPH_MS, morphEase } from "@/components/app/chart-morph"

/** The grey of a line that is not a number yet. */
export const PLACEHOLDER_STROKE = "#e5e7eb"

/*
  Round 65, the owner: "I don't like how it looks when it's that kind of flat". A monotone curve keeps the tangent
  flat at every peak and every run of equal days, so small counts (0, 1, 1, 0) drew mesas with flat tops and sharp
  V's on the floor. Now a Catmull-Rom curve (each point's tangent is the slope between its neighbours, at
  TENSION): a run of days rises and falls as a rounded hill. Its control points are held between the lowest point
  drawn (so a day with nothing never dips under the axis) and a little above the highest (HEADROOM of the range, so a
  peak rounds over rather than flattening, inside the room the chart keeps above its top value).
*/
const TENSION = 0.42
const HEADROOM = 0.08

/** A smooth path through the points: rounded hills, never below the lowest point (see above). The name is kept for its callers. */
export function monotonePath(xs: ArrayLike<number>, ys: ArrayLike<number>): string {
  const n = Math.min(xs.length, ys.length)
  if (n === 0) return ""
  const f = (v: number) => (Math.round(v * 10) / 10).toString()
  if (n === 1) return `M${f(xs[0])},${f(ys[0])}`
  if (n === 2) return `M${f(xs[0])},${f(ys[0])}L${f(xs[1])},${f(ys[1])}`
  /* SVG y grows downward: the floor is the largest y, the peak the smallest. */
  let floor = -Infinity
  let peak = Infinity
  for (let i = 0; i < n; i++) {
    if (ys[i] > floor) floor = ys[i]
    if (ys[i] < peak) peak = ys[i]
  }
  const ceiling = peak - (floor - peak) * HEADROOM
  /*
    The tangent at each point, in y per x: its neighbours' slope (the ends use their one neighbour), then made
    gentler until the control points on both sides of the point are inside [ceiling, floor]. Limiting the tangent,
    not each control point on its own, keeps the two controls in line with the point, so the curve has no corner.
  */
  const m: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(n - 1, i + 1)
    const dx = xs[b] - xs[a]
    let slope = dx ? ((ys[b] - ys[a]) / dx) * TENSION * 2 : 0
    for (const reach of [i > 0 ? -(xs[i] - xs[i - 1]) / 3 : 0, i < n - 1 ? (xs[i + 1] - xs[i]) / 3 : 0]) {
      const y = ys[i] + reach * slope
      if (y > floor && reach * slope !== 0) slope *= Math.max(0, (floor - ys[i]) / (reach * slope))
      else if (y < ceiling && reach * slope !== 0) slope *= Math.max(0, (ceiling - ys[i]) / (reach * slope))
    }
    m[i] = slope
  }
  let d = `M${f(xs[0])},${f(ys[0])}`
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3
    d += `C${f(xs[i] + dx)},${f(ys[i] + dx * m[i])},${f(xs[i + 1] - dx)},${f(ys[i + 1] - dx * m[i + 1])},${f(xs[i + 1])},${f(ys[i + 1])}`
  }
  return d
}

/** A line of `from`, stretched or squeezed to `count` points, so a period of another length can morph from it. */
function fit(from: number[], count: number, floor: number): number[] {
  if (from.length === count) return from
  if (from.length === 0) return new Array(count).fill(floor)
  return Array.from({ length: count }, (_, k) => from[Math.min(from.length - 1, Math.floor((k * from.length) / count))])
}

interface Drawn {
  lines: number[][]
  compared: number[] | null
}

export interface MorphLinesProps {
  /** The lines the tabs show, one number per point. Each keeps its slot, so a tab moves it. */
  lines: number[][]
  /** What they are compared with, dashed and quieter, or null. */
  compared?: number[] | null
  /** The number at the top of the plot. */
  top: number
  /** The plot inside the layer, in pixels: its left and right insets, its top and its height. */
  left: number
  right: number
  plotTop: number
  plotHeight: number
  /** A placeholder: the line lies on the floor in grey, with no fill and no dot. */
  loading?: boolean
  color: string
  comparedColor?: string
}

export function MorphLines({
  lines,
  compared = null,
  top,
  left,
  right,
  plotTop,
  plotHeight,
  loading = false,
  color,
  comparedColor = "#b8bcc6",
}: MorphLinesProps) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const areaRefs = React.useRef<Array<SVGPathElement | null>>([])
  const lineRefs = React.useRef<Array<SVGPathElement | null>>([])
  const dotRefs = React.useRef<Array<SVGCircleElement | null>>([])
  const comparedRef = React.useRef<SVGPathElement>(null)
  const gradient = `trend-fill-${React.useId().replace(/:/g, "")}`

  const floor = plotTop + plotHeight
  const yOf = (v: number) => plotTop + (1 - Math.max(0, Number.isFinite(v) ? v : 0) / (top || 1)) * plotHeight

  /* Where every point is going, in pixels. A placeholder goes to the floor. */
  const target: Drawn = {
    lines: lines.map((vs) => vs.map((v) => (loading ? floor : yOf(v)))),
    compared: compared && !loading ? compared.map((v) => yOf(v)) : null,
  }
  const sig = JSON.stringify([target.lines, target.compared, left, right])

  const st = React.useRef({
    width: 0,
    drawn: null as Drawn | null,
    sig: "",
    raf: 0,
    geo: { left, right, floor, loading },
  })
  st.current.geo = { left, right, floor, loading }

  /** Write a frame: every path and every dot, straight to the DOM. */
  const draw = React.useCallback((d: Drawn | null) => {
    if (!d) return
    const { width, geo } = st.current
    if (width <= 0) return
    const plot = Math.max(0, width - geo.left - geo.right)
    const xsFor = (n: number) => Array.from({ length: n }, (_, i) => (n <= 1 ? geo.left + plot / 2 : geo.left + (i / (n - 1)) * plot))
    d.lines.forEach((ys, k) => {
      const xs = xsFor(ys.length)
      const line = monotonePath(xs, ys)
      lineRefs.current[k]?.setAttribute("d", line)
      const area = areaRefs.current[k]
      if (area) area.setAttribute("d", ys.length > 1 && !geo.loading ? `${line}L${xs[xs.length - 1].toFixed(1)},${geo.floor}L${xs[0].toFixed(1)},${geo.floor}Z` : "")
      const dot = dotRefs.current[k]
      if (dot) {
        const shown = ys.length > 1 && !geo.loading
        dot.setAttribute("visibility", shown ? "visible" : "hidden")
        if (shown) dot.setAttribute("transform", `translate(${xs[xs.length - 1].toFixed(1)} ${ys[ys.length - 1].toFixed(1)})`)
      }
    })
    const c = comparedRef.current
    if (c) c.setAttribute("d", d.compared && d.compared.length > 1 ? monotonePath(xsFor(d.compared.length), d.compared) : "")
  }, [])

  /* The width, before the first paint and on every resize: a resize redraws where things are, it does not morph. */
  React.useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      st.current.width = svg.getBoundingClientRect().width
      draw(st.current.drawn)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [draw])

  /* New numbers: from wherever the line is drawn now, to where they go. */
  React.useLayoutEffect(() => {
    const s = st.current
    if (s.sig === sig) return
    s.sig = sig
    const to = target
    const was = s.drawn
    const from: Drawn = {
      lines: to.lines.map((ys, k) => fit(was?.lines[k] ?? [], ys.length, floor)),
      compared: to.compared ? fit(was?.compared ?? was?.lines[0] ?? [], to.compared.length, floor) : null,
    }
    cancelAnimationFrame(s.raf)
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (still || (loading && !was)) {
      s.drawn = to
      draw(to)
      return
    }
    const t0 = performance.now()
    const mix = (a: number[], b: number[], k: number) => b.map((v, i) => a[i] + (v - a[i]) * k)
    const step = () => {
      const k = morphEase(Math.min(1, (performance.now() - t0) / MORPH_MS))
      s.drawn = {
        lines: to.lines.map((ys, i) => mix(from.lines[i], ys, k)),
        compared: to.compared && from.compared ? mix(from.compared, to.compared, k) : null,
      }
      draw(s.drawn)
      if (k < 1) s.raf = requestAnimationFrame(step)
    }
    step()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, draw])

  React.useEffect(() => () => cancelAnimationFrame(st.current.raf), [])

  return (
    <svg
      ref={svgRef}
      aria-hidden
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        ref={comparedRef}
        data-trend-compared
        className="trend-compared"
        fill="none"
        stroke={comparedColor}
        strokeWidth={1.5}
        strokeDasharray="5 4"
        strokeLinecap="round"
      />
      {lines.map((_, k) => (
        <g key={k}>
          <path
            ref={(el) => {
              areaRefs.current[k] = el
            }}
            className="trend-area"
            fill={`url(#${gradient})`}
            stroke="none"
          />
          <path
            ref={(el) => {
              lineRefs.current[k] = el
            }}
            data-trend-line
            className="trend-line"
            fill="none"
            stroke={loading ? PLACEHOLDER_STROKE : color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </g>
      ))}
      {lines.map((_, k) => (
        <circle
          key={`end-${k}`}
          ref={(el) => {
            dotRefs.current[k] = el
          }}
          data-chart-end-dot
          visibility="hidden"
          r={3.5}
          cx={0}
          cy={0}
          fill={color}
          stroke="#fff"
          strokeWidth={2}
        />
      ))}
    </svg>
  )
}
