"use client"

/**
 * ===========================================================================
 *  THE ANALYTICS TREND CHART
 * ===========================================================================
 * Lifted out of app/app/analytics/analytics-client.tsx, and — as with the
 * sidebar — the lifting is half the fix.
 *
 * analytics-client.tsx is a single three-thousand-line component. The chart
 * was declared beside it and rendered as a plain child, so EVERY state change
 * anywhere on that page re-rendered the chart: a dropdown opening, a range
 * button, a poll landing, a hover on a stat card. Recharts answers a
 * re-render by walking its whole element tree and recomputing every scale,
 * every path and every dot.
 *
 * At module scope and behind React.memo the chart re-renders when its own
 * inputs change and at no other time. Measured in Chromium: a parent render
 * with identical props now costs the chart zero DOM mutations, against a full
 * recharts pass before.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ComponentProps } from "react"
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Line, ReferenceLine,
} from "recharts"

import { hapticTap } from "@/lib/native-bridge"
import { CHART_ANIM_MS } from "@/lib/chart-motion"
import { GlidingActiveDot, GlidingCursor } from "@/components/app/chart-glide"

// Chart colors - matching reference image
/**
 * ===========================================================================
 *  ONE NUMBER FOR WHERE THE PLOT STARTS
 * ===========================================================================
 * The chart's left inset was written down twice: once as the y axis's
 * `width`, and once as a literal `rect.left + 40` in the maths that turns a
 * finger's x position into a data point. Two copies of a number that had to
 * agree — and when the axis was removed, only one of them changed. So every
 * touch landed thirty pixels from where it looked like it landed and the
 * tooltip trailed the finger by most of a column. That is the "clunky".
 *
 * The axis is told this, the chart's margin is told this, and so is the
 * touch maths. They cannot drift apart again.
 */
/**
 * THE AXIS IS ONLY AS WIDE AS ITS WIDEST NUMBER. See dashboard-client for
 * why a flat 40 was wrong: on a 320px phone it spent an eighth of the chart
 * on the characters "0", "1", "2".
 */
function plotLeftFor(labels: string[]): number {
  const longest = labels.reduce((a, b) => (b.length > a.length ? b : a), "")
  return Math.max(22, Math.min(46, longest.length * 7 + 10))
}
/** The right margin. */
const PLOT_RIGHT = 10

/** See dashboard-client: the percentages resolve against the box's own width. */
function shiftFor(x: number, track: number): string {
  return `translateX(clamp(8px, calc(${x.toFixed(1)}px - 50%), calc(${track}px - 100% - 8px))) translateZ(0)`
}
/** Room above for the active dot: six pixels of radius plus its white ring. */
const PLOT_TOP = 10

export const CHART_COLORS = {
  views: "#8b5cf6",
  clicks: "#a78bfa",
  orders: "#8b5cf6",
  revenue: "#3b82f6",
  refunds: "#f59e0b",
}

/**
 * Isolated chart component — mirrors dashboard's ChartWithLongPressTooltip exactly.
 * All touch/animation state lives HERE so scrubbing only re-renders the chart,
 * not the entire analytics page (which is 3000+ lines of JSX).
 */
export interface AnalyticsChartData {
  date: string
  views: number
  sales: number
  revenue: number
  clicks?: number
  subscribers?: number
  refunds?: number
  conversion?: number
  ctr?: number
  prev_views?: number
  prev_sales?: number
  prev_revenue?: number
  prev_refunds?: number
  prev_conversion?: number
}

/**
 * The key of the comparison series for one metric filter, or null. Drawn
 * only when one metric is showing: four solid lines and four dashed ones on
 * one plot is a drawing nobody can read.
 */
function previousKeyFor(filter: string): keyof AnalyticsChartData | null {
  if (filter === "views") return "prev_views"
  if (filter === "orders") return "prev_sales"
  if (filter === "revenue") return "prev_revenue"
  if (filter === "conversion") return "prev_conversion"
  return null
}

function AnalyticsChartWithTooltipInner({
  chartDisplayData,
  analyticsMode,
  chartMetricFilter,
  onePageChartFilter,
  isTouchDevice,
  formatPrice,
  isLoading = false,
  compareLabel = null,
}: {
  chartDisplayData: AnalyticsChartData[]
  analyticsMode: "store" | "onepage"
  chartMetricFilter: string
  onePageChartFilter: string
  isTouchDevice: boolean
  formatPrice: (cents: number) => string
  /**
   * The series is the placeholder, not the answer. The chart still draws its
   * grid, its dates and a line resting on the axis — what it does not do is
   * dress that line up as data: no colour, no fill, no points, and nothing
   * to press. When the real series arrives this goes false, the stroke fades
   * to the metric's colour and the line grows into shape.
   */
  isLoading?: boolean
  /** What the dashed line is, "Dec 1–Dec 31, 2025", or null for no comparison. */
  compareLabel?: string | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipActiveRef = useRef(false)
  const [tooltipActive, setTooltipActive] = useState(false)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const directionLockRef = useRef<"horizontal" | "vertical" | null>(null)
  /** Whether this gesture has actually gone sideways, rather than intending to. */
  const scrubbedRef = useRef(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const rafRef = useRef<number | null>(null)
  /** One tick per point crossed, not one per frame. */
  const lastHapticIndexRef = useRef<number | null>(null)
  /**
   * WHERE THE THUMB IS NOW, which is not where it started.
   *
   * This line was missing, and nothing caught it: next.config.mjs sets
   * `ignoreBuildErrors`, so a production build compiled a component that
   * threw `lastTouchXRef is not defined` on the first line of every
   * touchstart. The hold timer below was never even scheduled, and once the
   * scrub did start by dragging, every touchmove threw before it could queue
   * a frame — so the reading froze on the day the gesture began and the
   * tooltip stopped following the finger.
   *
   * That is the whole of "I hold and try to move left or right and it just
   * loses the hold" on the analytics page. Reading this file against
   * dashboard-client three times did not find it. scripts/check-chart-scrub.mjs
   * found it on its first run, because it presses the chart.
   */
  const lastTouchXRef = useRef(0)
  const [shouldAnimate, setShouldAnimate] = useState(true)

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE DRAW-IN IS DECIDED BY THE RENDER THAT RECEIVES THE DATA
   * ═══════════════════════════════════════════════════════════════════════
   * This was an effect, and an effect runs AFTER the render it belongs to.
   * So the sequence was: new series arrives, the chart renders with
   * `isAnimationActive` still holding whatever it held — false, once the
   * mount's own window had expired — recharts draws the finished shape in
   * one frame, and only then does the effect set the flag back to true, for
   * an animation that has nothing left to play.
   *
   * On the analytics page that is every load. The chart mounts against its
   * placeholder, the window closes 690ms later, and the fetch lands after
   * that. Measured in scripts/check-chart-skeleton.mjs: the line passed
   * through two shapes, the flat one and the final one, which is a swap.
   *
   * Setting state during a render of the same component is React's own
   * escape hatch for exactly this: it re-runs the component before anything
   * is committed, so recharts never sees the render with the flag down. The
   * guard keeps it to the renders where the series actually changed.
   *
   * THE SERIES ONLY, same as dashboard-client. The metric filters were
   * dependencies here too, so switching to Revenue fired once immediately —
   * redrawing with the OLD numbers still in it — and again when the new ones
   * arrived. Two draws, the first of the wrong thing. A metric changing is a
   * request for data, not the arrival of any.
   */
  const seenSeriesRef = useRef(chartDisplayData)
  if (seenSeriesRef.current !== chartDisplayData) {
    seenSeriesRef.current = chartDisplayData
    if (!shouldAnimate) setShouldAnimate(true)
  }

  /*
    Play the draw-in once, then switch it off so hover updates are not
    re-animated. The timer has to outlast the longest series — 600ms begun at
    90ms — or the chart freezes mid-draw, and it restarts whenever a new
    series arrives while one is still playing.
  */
  useEffect(() => {
    if (!shouldAnimate) return
    const timer = setTimeout(() => setShouldAnimate(false), CHART_ANIM_MS)
    return () => clearTimeout(timer)
  }, [shouldAnimate, chartDisplayData])

  /*
    ── WHAT A PLACEHOLDER LINE LOOKS LIKE ──────────────────────────────────
    The shape of the card is right from the first frame, and nothing in it
    claims to be a number. Grey, no fill under it, no dots on it. The stroke
    transitions in CSS, so the change from this to the real colour is a fade
    rather than a swap.
  */
  const SKELETON_STROKE = "#e5e7eb"
  const lineStroke = (colour: string) => (isLoading ? SKELETON_STROKE : colour)
  const lineFill = (gradient: string) => (isLoading ? "none" : gradient)
  const lineDot = (colour: string) => (isLoading ? false : makeDot(colour))
  const lineActiveDot = (colour: string) => (isLoading ? false : makeActiveDot(colour))
  /* Nothing to draw in while it is flat; the draw-in belongs to the arrival. */
  const lineAnimates = isLoading ? false : shouldAnimate

  /** One formatter, used to draw the ticks and to measure how wide they are. */
  const axisTick = useCallback((v: number) => {
    if (chartMetricFilter === "conversion" || onePageChartFilter === "ctr") return `${v}%`
    if (chartMetricFilter === "revenue") return `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
  }, [chartMetricFilter, onePageChartFilter])

  /**
   * The series actually drawn below, in one place, so the axis is measured
   * against the numbers on it rather than against a key this data never had.
   */
  const visibleKeys = useMemo<(keyof AnalyticsChartData)[]>(() => {
    if (analyticsMode === "store") {
      const k: (keyof AnalyticsChartData)[] = []
      if (chartMetricFilter === "all" || chartMetricFilter === "views") k.push("views")
      if (chartMetricFilter === "all" || chartMetricFilter === "orders") k.push("sales")
      if (chartMetricFilter === "all" || chartMetricFilter === "orders" || chartMetricFilter === "revenue") k.push("refunds")
      if (chartMetricFilter === "all" || chartMetricFilter === "revenue") k.push("revenue")
      if (chartMetricFilter === "conversion") k.push("conversion")
      return k
    }
    const k: (keyof AnalyticsChartData)[] = []
    if (onePageChartFilter === "all" || onePageChartFilter === "views") k.push("views")
    if (onePageChartFilter === "all" || onePageChartFilter === "clicks") k.push("clicks")
    if (onePageChartFilter === "all" || onePageChartFilter === "subscribers") k.push("subscribers")
    if (onePageChartFilter === "ctr") k.push("ctr")
    return k
  }, [analyticsMode, chartMetricFilter, onePageChartFilter])

  /**
   * THE AXIS IS AS WIDE AS THE NUMBERS ON IT.
   *
   * Copied across from dashboard-client, where the series is `{ date, value }`
   * — and left reading `d.value`, which nothing in AnalyticsChartData is. So
   * the top of the range came back 0 on every chart, the widest label it
   * measured was "0", and the axis was pinned at its 22px floor no matter
   * what was plotted. On revenue that meant "$2.5k" drawn into 22px of room.
   *
   * The touch maths reads the same variable, so it stayed honest — measured
   * with the bug in place, every position still resolved to the right day.
   * What broke was only what you see: on revenue, four of the five numbers
   * were cut off by up to 15px. scripts/check-chart-scrub.mjs holds both
   * halves of that.
   */
  const plotLeft = useMemo(() => {
    const top = chartDisplayData.reduce(
      (m, d) => visibleKeys.reduce((n, k) => Math.max(n, typeof d[k] === "number" ? (d[k] as number) : 0), m),
      0,
    )
    return plotLeftFor([axisTick(0), axisTick(top / 2), axisTick(top)])
  }, [chartDisplayData, visibleKeys, axisTick])

  const getIndexFromTouch = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el || !chartDisplayData.length) return null
    const rect = el.getBoundingClientRect()
    const chartLeft = rect.left + plotLeft
    const chartRight = rect.right - PLOT_RIGHT
    const chartWidth = chartRight - chartLeft
    const x = clientX - chartLeft
    const ratio = Math.max(0, Math.min(1, x / chartWidth))
    return Math.round(ratio * (chartDisplayData.length - 1))
  }, [chartDisplayData.length])

/**
 * Horizontal engages sooner than vertical gives up.
 *
 * One threshold for both meant a deliberate sideways drag had to travel as
 * far as a scroll before anything happened, which is the "hard to get into
 * it". Eight pixels is past a resting thumb's tremor and well short of a
 * gesture; vertical keeps twelve, because cancelling a hold by mistake costs
 * more than starting a scroll a few pixels late.
 *
 * At module scope because two branches of touchMoveHandler read them now:
 * the one that decides what a gesture IS, and the one that decides a hold
 * has turned into a scroll after all.
 */
const SLOP_X = 8
const SLOP_Y = 12

  /**
   * =========================================================================
   *  THE PRESS IS OURS TO WATCH, NOT OURS TO CANCEL
   * =========================================================================
   * This opened with e.preventDefault(), to refuse the platform's own long
   * press recogniser for selection and the callout.
   *
   * Cancelling a touchstart also refuses the browser's scrolling for the
   * whole gesture, which is the reason this chart had to scroll the page by
   * hand. The callout is a CSS matter: -webkit-touch-callout: none and
   * user-select: none on the container, both already there, are what stop
   * it, and they stop it without taking the scroll as well.
   *
   * The listener stays native and non-passive, because touchMoveHandler
   * still has to be able to cancel a move once the scrub is ours, and React
   * registers touch listeners passively on its root.
   */
  const touchStartHandler = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    scrubbedRef.current = false
    lastTouchXRef.current = touch.clientX
    directionLockRef.current = null
    longPressTimerRef.current = setTimeout(() => {
      /**
       * A HOLD IS A HOLD EVEN THOUGH A THUMB IS NEVER STILL. The old test
       * bailed unless nothing had been decided, and five pixels of tremor
       * leaning vertical decided it — which was most holds. See
       * dashboard-client for the whole story.
       */
      if (directionLockRef.current === "vertical") return
      directionLockRef.current = "horizontal"
      tooltipActiveRef.current = true
      setTooltipActive(true)
      const idx = getIndexFromTouch(lastTouchXRef.current)
      lastHapticIndexRef.current = idx
      setActiveIndex(idx)
      hapticTap("medium")
    }, 100)
  }, [getIndexFromTouch])


  const touchMoveHandler = useCallback((e: TouchEvent) => {
    if (!touchStartPosRef.current) return
    const touch = e.touches[0]

    if (tooltipActiveRef.current) {
      /**
       * =====================================================================
       *  A HOLD THAT TURNS INTO A SCROLL IS A SCROLL
       * =====================================================================
       * The hold fires 100ms after a finger lands, whether or not that finger
       * is going anywhere. A thumb that starts down the screen SLOWLY — under
       * twelve pixels in that first tenth of a second — had the tooltip open
       * under it before it had travelled far enough to be called a scroll,
       * and from that moment every move was cancelled here and the page did
       * not move at all.
       *
       * It is the other side of the change that gave this band its scrolling
       * back: nothing cancels a touchstart any more, so the browser WOULD
       * pan, and this was the one thing still stopping it.
       *
       * So the tooltip lets go when the finger has travelled past the
       * vertical slop and has NEVER gone meaningfully sideways. Nothing is
       * cancelled on the way out, so the browser has not been refused and can
       * still take the gesture.
       *
       * IT CANNOT ASK THE DIRECTION LOCK, which was the first attempt. The
       * hold timer sets the lock to "horizontal" the moment it fires, before
       * a finger has moved at all, so after any hold the lock says horizontal
       * whether or not anything was scrubbed — and a guard reading it never
       * ran. `scrubbedRef` is the honest version of that question: it is set
       * by movement, not by intent.
       */
      const outX = Math.abs(touch.clientX - touchStartPosRef.current.x)
      const outY = Math.abs(touch.clientY - touchStartPosRef.current.y)
      if (outX > SLOP_X) scrubbedRef.current = true
      if (!scrubbedRef.current && outY > SLOP_Y) {
        directionLockRef.current = "vertical"
        tooltipActiveRef.current = false
        lastHapticIndexRef.current = null
        setTooltipActive(false)
        setActiveIndex(null)
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const clientX = touch.clientX
      lastTouchXRef.current = clientX
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        /* Follows the thumb every frame; the values snap. See dashboard-client. */
        const el = containerRef.current
        const box = tooltipRef.current
        if (el && box) {
          const rect = el.getBoundingClientRect()
          const left = plotLeft
          const right = rect.width - PLOT_RIGHT
          const x = Math.max(left, Math.min(right, clientX - rect.left))
          box.style.transform = shiftFor(x, rect.width)
        }
        const idx = getIndexFromTouch(clientX)
        if (idx !== null && idx !== lastHapticIndexRef.current) {
          lastHapticIndexRef.current = idx
          hapticTap("light")
        }
        setActiveIndex(idx)
      })
      return
    }

    /** Per axis, and large enough that a resting thumb cannot cross it. */
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x)
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y)
    /**
     * Horizontal engages sooner than vertical gives up.
     *
     * One threshold for both meant a deliberate sideways drag had to travel
     * as far as a scroll before anything happened, which is the "hard to get
     * into it". Eight pixels is past a resting thumb's tremor and well short
     * of a gesture; vertical keeps twelve, because cancelling a hold by
     * mistake costs more than starting a scroll a few pixels late.
     */
    if (directionLockRef.current === null && (dx > SLOP_X || dy > SLOP_Y)) {
      if (dx > dy) {
        directionLockRef.current = "horizontal"
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
        tooltipActiveRef.current = true
        setTooltipActive(true)
        hapticTap("light")
        e.preventDefault()
        e.stopPropagation()
        const idx = getIndexFromTouch(touch.clientX)
        setActiveIndex(idx)
      } else if (dy > dx * 1.4) {
        /*
         * Decisively vertical: a scroll, and the browser is already doing
         * it. touch-action is pan-y and no move in this gesture has been
         * cancelled, so the page is moving on the compositor. All that is
         * left here is to record the lock, so the hold timer does not fire
         * into a gesture that has become a scroll.
         */
        directionLockRef.current = "vertical"
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
      }
      /* Ambiguous: decide nothing, and let the hold timer have its chance. */
    } else if (directionLockRef.current === "horizontal") {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [getIndexFromTouch])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener("touchstart", touchStartHandler, { passive: false })
    el.addEventListener("touchmove", touchMoveHandler, { passive: false })
    return () => {
      el.removeEventListener("touchstart", touchStartHandler)
      el.removeEventListener("touchmove", touchMoveHandler)
    }
  }, [touchStartHandler, touchMoveHandler])

  /**
   * The first placement of the tooltip is a cut; every one after it glides.
   * Set in an effect, so it flips only once the DOM actually holds that first
   * position — enabling the transition any earlier is what made the box swoop
   * in from the edge on every activation. Same as dashboard-client.
   */

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    touchStartPosRef.current = null
    directionLockRef.current = null
    tooltipActiveRef.current = false
    lastHapticIndexRef.current = null
    setTooltipActive(false)
    setActiveIndex(null)
  }, [])

  const activePoint = activeIndex != null && activeIndex >= 0 && activeIndex < chartDisplayData.length
    ? chartDisplayData[activeIndex] : null

  /** Where the point actually is: the plot area, not the whole card. */
  const tooltipX = (): number => {
    const track = containerRef.current?.offsetWidth ?? 0
    if (!track || activeIndex == null || chartDisplayData.length < 2) return track / 2
    const plotWidth = track - plotLeft - PLOT_RIGHT
    return plotLeft + (activeIndex / (chartDisplayData.length - 1)) * plotWidth
  }

  /*
    THE TOUCH TOOLTIP MOVES IN PIXELS, NOT PER CENT.

    `left: <n>%` is a layout property: every value the finger produced made the
    browser lay the element out again and repaint it, on the main thread, at
    touch frequency — while that same thread was busy handing recharts a new
    active index. The same position expressed as a translate is a compositor
    transform. The clamp maths is unchanged; only its unit is.
  */
  /**
   * ANCHORED AT THE EDGES, NOT CENTRED AND CLIPPED.
   *
   * The clamp this replaces divided by the tooltip's own width, read from a
   * ref that is null on the render which first shows it — so the width came
   * back 0, the clamp did nothing, and `translateX(-50%)` pushed half the
   * box outside the card at the first and last points. No measurement here:
   * near an edge the box anchors to that edge, which is the flip a menu does
   * near the side of a screen, and nothing centred on a point can overflow
   * because nothing near an edge is centred. Same as dashboard-client.
   */
  /**
   * =========================================================================
   *  CSS RESOLVES THE BOX'S OWN WIDTH. WE NEVER MEASURE IT.
   * =========================================================================
   * Two earlier attempts at this were wrong in the same way — both needed
   * the tooltip's width and could not have it in time.
   *
   *   1. `Math.min(containerWidth - half, ...)` read `tooltipRef.offsetWidth`
   *      during the render that first CREATES the tooltip. The ref is null
   *      then, so half was 0, the clamp did nothing, and translateX(-50%)
   *      pushed half the box off the card. That is the "p 6 / ews: 3" in the
   *      screenshot.
   *   2. Anchoring to the edge inside a fixed 18% zone. Whether centring is
   *      safe depends on how wide the box is relative to the card, so a fixed
   *      zone cannot be right: check-chart-tooltip found a 264px box centred
   *      at 19% of a 320px card hanging 71px past the left edge.
   *
   * The way out is that a percentage inside `translateX` resolves against the
   * ELEMENT'S OWN border box. So `50%` is half the tooltip and `100%` is all
   * of it, computed by the browser at paint time, for a width nothing in
   * JavaScript ever has to know.
   *
   * What JavaScript does supply is the TRACK — the container's width — which
   * is stable, changes on resize rather than on every frame of a drag, and is
   * already being measured for other reasons.
   *
   *   left edge:   8px
   *   centred:     x - 50%          (half the box left of the point)
   *   right edge:  track - 100% - 8px
   *
   * clamp() picks the middle one unless it would cross a bound. And where the
   * box cannot fit at all, clamp() returns its minimum, which pins it left —
   * with `max-width: calc(100% - 16px)` making sure that case is only ever a
   * rounding away.
   */
  const tooltipShift = (): string => {
    const track = containerRef.current?.offsetWidth ?? 0
    const x = tooltipX()
    if (!track) return "translateX(-50%)"
    /**
     * `translateZ(0)` keeps the layer promotion the old `translate3d` gave
     * for free. The movement is still entirely in the transform — `left` is
     * a static 0 — so a dragging finger never lays this element out, which
     * is the rule tests/analytics-chart.test.ts holds.
     */
    return shiftFor(x, track)
  }

  const lastDotIndex = chartDisplayData.length - 1

  // Build tooltip lines for active point
  const getTooltipLines = () => {
    if (!activePoint) return []
    const metricLabels: Record<string, string> = { views: "Views", clicks: "Clicks", sales: "Orders", revenue: "Revenue", subscribers: "Subscribers", conversion: "Conversion", ctr: "CTR", refunds: "Refunds" }
    const lines: { label: string; value: string; isRefund?: boolean }[] = []
    const addLine = (key: string, val: number | undefined) => {
      if (val == null) return
      const displayLabel = metricLabels[key] || key
      let displayVal: string
      if (key === "revenue") displayVal = formatPrice(val)
      else if (key === "conversion" || key === "ctr") displayVal = `${val}%`
      else displayVal = val.toLocaleString()
      lines.push({ label: displayLabel, value: displayVal, isRefund: key === "refunds" })
    }
    if (analyticsMode === "store") {
      if (chartMetricFilter === "all" || chartMetricFilter === "views") addLine("views", activePoint.views)
      if (chartMetricFilter === "all" || chartMetricFilter === "orders") addLine("sales", activePoint.sales)
      if ((chartMetricFilter === "all" || chartMetricFilter === "orders" || chartMetricFilter === "revenue") && activePoint.refunds) addLine("refunds", activePoint.refunds)
      if (chartMetricFilter === "all" || chartMetricFilter === "revenue") addLine("revenue", activePoint.revenue)
      if (chartMetricFilter === "conversion") addLine("conversion", activePoint.conversion)
      const prevKey = previousKeyFor(chartMetricFilter)
      const prevVal = prevKey ? (activePoint[prevKey] as number | undefined) : undefined
      if (compareLabel && prevKey && prevVal != null) {
        const base = prevKey.replace("prev_", "")
        const v = base === "revenue" ? formatPrice(prevVal) : base === "conversion" ? `${prevVal}%` : prevVal.toLocaleString()
        lines.push({ label: "Compared", value: v })
      }
    } else {
      if (onePageChartFilter === "all" || onePageChartFilter === "views") addLine("views", activePoint.views)
      if (onePageChartFilter === "all" || onePageChartFilter === "clicks") addLine("clicks", activePoint.clicks)
      if (onePageChartFilter === "all" || onePageChartFilter === "subscribers") addLine("subscribers", activePoint.subscribers)
      if (onePageChartFilter === "ctr") addLine("ctr", activePoint.ctr)
    }
    return lines
  }

  /*
    A HIDDEN DOT IS NO DOT.

    This used to return `<circle r={0} fill="none" stroke="none" />` for every
    point that is not the active one or the last one — thirty per series, four
    series, 120 SVG elements that paint nothing and that React reconciles on
    every render. Measured in Chromium: 241 nodes in the plot, of which the
    invisible circles were the clear majority. Returning null renders none of
    them, and the same measurement now reads 125.
  */
  type AreaDot = ComponentProps<typeof Area>["dot"]
  const makeDot = useCallback(
    (color: string): AreaDot => ((props: { index?: number; cx?: number; cy?: number }) => {
      const isActive = tooltipActive && props.index === activeIndex
      const isLast = props.index === lastDotIndex && !tooltipActive
      if (isActive) {
        return (
          <circle
            key={`dot-${props.index}`}
            cx={props.cx}
            cy={props.cy}
            r={6}
            fill={color}
            stroke="#fff"
            strokeWidth={2.5}
            style={{ filter: `drop-shadow(0 1px 3px ${color}66)` }}
          />
        )
      }
      if (isLast) {
        return <circle key={`dot-${props.index}`} cx={props.cx} cy={props.cy} r={4} fill={color} stroke="#fff" strokeWidth={2} />
      }
      /*
        NULL, and the cast is the reason it needs a comment.

        recharts types a function `dot` as returning a ReactElement, but React
        renders null as nothing and recharts passes it straight through —
        which is exactly what is wanted. The only null-ish thing its types do
        allow is an empty <g />, which is the 120 nodes again under another
        tag name.
      */
      return null
    }) as unknown as AreaDot,
    [tooltipActive, activeIndex, lastDotIndex],
  )

  /*
    An ELEMENT rather than a props object, so the dot can be moved with a
    transform and glide between points instead of being redrawn at the next
    one. On touch the custom tooltip owns the highlight, so there is none.
  */
  const makeActiveDot = useCallback(
    (color: string) => (!isTouchDevice ? <GlidingActiveDot fill={color} /> : false),
    [isTouchDevice],
  )

  return (
    <div
      ref={containerRef}
      data-chart-loading={isLoading ? "true" : "false"}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{
        /**
         * =====================================================================
         *  THE VERTICAL AXIS BELONGS TO THE BROWSER
         * =====================================================================
         * This was "none", and everything under it followed from that: the
         * touchstart was cancelled, the vertical branch of touchMoveHandler
         * moved the page by writing scrollTop, and a flick was carried on by
         * a requestAnimationFrame loop in a lib/chart-scroll that no longer
         * needs to exist.
         *
         * It worked and it never felt like the rest of the page. A scroll
         * written in JavaScript runs on the main thread, begins only after
         * twelve pixels of slop, has no momentum the system recognises and
         * no rubber band at the ends. So a thumb travelling down the page met
         * a 200px band where the scrolling suddenly stiffened, reported as
         * "at some touch scroll it becomes very rigid and hard".
         *
         * "pan-y" gives that axis back. The browser scrolls this card the
         * same way it scrolls the cards above and below it, on the
         * compositor, and the chart keeps the horizontal axis, which is the
         * one a scrub actually uses.
         *
         * AND THE HOLD STILL WORKS, although touch-action is latched at
         * touchstart and cannot be changed mid gesture. A pan does not begin
         * when a finger lands; it begins once the browser has seen enough
         * movement in a direction it owns. Cancelling a touchmove before
         * that point takes the whole gesture, for good:
         *
         *   hold        the finger is still, no pan has begun, and the first
         *               move after the tooltip opens cancels it, so it is
         *               ours including whatever it does next
         *   sideways    dx clears 8px while dy is still nothing, cancelled,
         *               so it is ours
         *   downwards   dy clears the browser's own slop first and nothing
         *               cancels it, so it is the browser's and it scrolls
         *
         * The touchstart is not cancelled any more, because cancelling it is
         * the one thing that would refuse all three at once. It was there to
         * refuse the platform's long press; the two lines below are what
         * actually refuse that, and they do it without taking the scroll.
         */
        touchAction: "pan-y",
        /* A placeholder has nothing to scrub, and letting a finger press it
           would raise a tooltip reading zero for a number nobody has. */
        pointerEvents: isLoading ? "none" : undefined,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        position: "relative",
      } as React.CSSProperties}
    >
      <ResponsiveContainer width="100%" height={200}>
        {/*
          ROOM FOR THE DOTS. The y axis used to reserve 40px on the left;
          without it, `left: 0` drew the first point's active dot — six pixels
          of radius plus a two pixel ring — half outside the card, which reads
          as a stray spike rather than as a clipped dot.
        */}
        <AreaChart data={chartDisplayData} margin={{ top: PLOT_TOP, right: PLOT_RIGHT, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradViews" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.views} stopOpacity={0.15} />
              <stop offset="95%" stopColor={CHART_COLORS.views} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.orders} stopOpacity={0.15} />
              <stop offset="95%" stopColor={CHART_COLORS.orders} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.revenue} stopOpacity={0.15} />
              <stop offset="95%" stopColor={CHART_COLORS.revenue} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradRefunds" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.refunds} stopOpacity={0.15} />
              <stop offset="95%" stopColor={CHART_COLORS.refunds} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradConversion" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.clicks} stopOpacity={0.15} />
              <stop offset="95%" stopColor={CHART_COLORS.clicks} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradSubscribers" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradCtr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          {/*
            THE NUMBERS ARE BACK, at the width the touch maths reads.
            PLOT_LEFT is the single place that number lives.
          */}
          <YAxis
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            domain={[0, "auto"]}
            width={plotLeft}
            tickFormatter={axisTick}
          />
          {/* Desktop-only Recharts tooltip */}
          {!isTouchDevice && (
            <Tooltip
              cursor={<GlidingCursor />}
              /*
                ANIMATED, which is what makes the box follow the pointer.

                This was `false`, and false is why the tooltip teleported: the
                wrapper's transform changed with no transition on it. Recharts
                puts `transition: transform <duration>ms <easing>` on the
                wrapper when this is on, so 120ms of ease-out turns each jump
                into a glide — and it animates a transform, so it is composited.
              */
              isAnimationActive
              animationDuration={120}
              animationEasing="ease-out"
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const lines: { label: string; value: string; color?: string }[] = []
                payload.forEach((p: any) => {
                  const name = p.dataKey as string
                  const val = p.value as number
                  const labels: Record<string, string> = { views: "Views", clicks: "Clicks", sales: "Orders", revenue: "Revenue", subscribers: "Subscribers", conversion: "Conversion", ctr: "CTR", refunds: "Refunds" }
                  const isPrev = name.startsWith("prev_")
                  const base = isPrev ? name.slice(5) : name
                  const displayLabel = isPrev ? "Compared" : labels[name] || name
                  let displayVal: string
                  if (base === "revenue") displayVal = formatPrice(val)
                  else if (base === "conversion" || base === "ctr") displayVal = `${val}%`
                  else displayVal = val.toLocaleString()
                  lines.push({ label: displayLabel, value: displayVal })
                })
                return (
                  <div style={{ background: "#1a1a2e", border: "none", borderRadius: "8px", fontSize: "12px", color: "#fff", padding: "8px 12px", pointerEvents: "none" }}>
                    <p style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "2px" }}>{label}</p>
                    {lines.map((l, i) => (
                      <p key={i} style={{ fontWeight: 500, color: l.label === "Refunds" ? CHART_COLORS.refunds : undefined }}>{l.label}: {l.value}</p>
                    ))}
                  </div>
                )
              }}
            />
          )}
          {/* Vertical crosshair line at active touch point */}
          {tooltipActive && activePoint && (
            <ReferenceLine
              x={activePoint.date}
              stroke="#c4b5fd"
              strokeWidth={1}
              strokeDasharray="4 3"
              ifOverflow="extendDomain"
            />
          )}
          {/* The comparison, dashed and quieter, under the line it is compared with. */}
          {analyticsMode === "store" && compareLabel && !isLoading && previousKeyFor(chartMetricFilter) && (
            <Line
              type="monotone"
              dataKey={previousKeyFor(chartMetricFilter) as string}
              stroke={chartMetricFilter === "revenue" ? CHART_COLORS.revenue : chartMetricFilter === "conversion" ? "#10b981" : CHART_COLORS.views}
              strokeOpacity={0.45}
              strokeWidth={1.75}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              isAnimationActive={lineAnimates}
              animationDuration={600}
              name="compared"
            />
          )}
          {/* Store areas */}
          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "views") && (
            <Area type="monotone" dataKey="views" stroke={lineStroke(CHART_COLORS.views)} strokeWidth={2} fill={lineFill("url(#gradViews)")} dot={lineDot(CHART_COLORS.views)} activeDot={lineActiveDot(CHART_COLORS.views)} name="views" isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "orders") && (
            <Area type="monotone" dataKey="sales" stroke={lineStroke(CHART_COLORS.orders)} strokeWidth={2} fill={lineFill("url(#gradOrders)")} dot={lineDot(CHART_COLORS.orders)} activeDot={lineActiveDot(CHART_COLORS.orders)} name="sales" isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "orders" || chartMetricFilter === "revenue") && (
            <Area type="monotone" dataKey="refunds" stroke={lineStroke(CHART_COLORS.refunds)} strokeWidth={2} fill={lineFill("url(#gradRefunds)")} dot={lineDot(CHART_COLORS.refunds)} activeDot={lineActiveDot(CHART_COLORS.refunds)} name="refunds" isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={45} />
          )}
          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "revenue") && (
            <Area type="monotone" dataKey="revenue" stroke={lineStroke(CHART_COLORS.revenue)} strokeWidth={2} fill={lineFill("url(#gradRevenue)")} dot={lineDot(CHART_COLORS.revenue)} activeDot={lineActiveDot(CHART_COLORS.revenue)} name="revenue" isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={45} />
          )}
          {analyticsMode === "store" && chartMetricFilter === "conversion" && (
            <Area type="monotone" dataKey="conversion" stroke={lineStroke("#10b981")} strokeWidth={2} fill={lineFill("url(#gradConversion)")} dot={lineDot("#10b981")} activeDot={lineActiveDot("#10b981")} name="conversion" isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
          {/* OnePage areas */}
          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "views") && (
            <Area type="monotone" dataKey="views" stroke={lineStroke(CHART_COLORS.views)} strokeWidth={2} fill={lineFill("url(#gradViews)")} dot={lineDot(CHART_COLORS.views)} activeDot={lineActiveDot(CHART_COLORS.views)} name="views" connectNulls isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "clicks") && (
            <Area type="monotone" dataKey="clicks" stroke={lineStroke(CHART_COLORS.clicks)} strokeWidth={2} fill={lineFill("url(#gradClicks)")} dot={lineDot(CHART_COLORS.clicks)} activeDot={lineActiveDot(CHART_COLORS.clicks)} name="clicks" connectNulls isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "subscribers") && (
            <Area type="monotone" dataKey="subscribers" stroke={lineStroke("#8b5cf6")} strokeWidth={2} fill={lineFill("url(#gradSubscribers)")} dot={lineDot("#8b5cf6")} activeDot={lineActiveDot("#8b5cf6")} name="subscribers" connectNulls isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={45} />
          )}
          {analyticsMode === "onepage" && onePageChartFilter === "ctr" && (
            <Area type="monotone" dataKey="ctr" stroke={lineStroke("#f59e0b")} strokeWidth={2} fill={lineFill("url(#gradCtr)")} dot={lineDot("#f59e0b")} activeDot={lineActiveDot("#f59e0b")} name="ctr" connectNulls isAnimationActive={lineAnimates} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {/*
        ONE STABLE THING FOR A FINGER TO LAND ON.

        A touch belongs to the node it started on for the whole gesture, and
        it keeps going to that node even after the node leaves the document —
        where the events reach nothing, because there is no longer a path up
        to the listener. Without this, a finger lands on whatever recharts
        happened to draw at that pixel: check-chart-scrub landed one press on
        `path.recharts-curve`, which is a node recharts redraws.

        So the touches land here instead, on one div that is rendered
        unconditionally and never re-keyed. It is invisible and it is only in
        the way on a touch screen — a mouse passes straight through, because
        the hover tooltip below belongs to recharts and needs the real marks.
      */}
      <div
        aria-hidden
        data-chart-touch-shield
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 5,
          pointerEvents: isTouchDevice ? "auto" : "none",
        }}
      />

      {/* Custom tooltip for touch — inside the chart area, at fixed top position */}
      {tooltipActive && activePoint && (() => {
        const lines = getTooltipLines()
        return (
          <div
            ref={tooltipRef}
            style={{
              position: "absolute",
              top: 8,
              left: 0,
              transform: tooltipShift(),
              /* Glides between points; see the dashboard chart for why. */
              /* Moved imperatively every frame; a transition here is lag. */
              transition: "none",
              maxWidth: "calc(100% - 16px)",
              background: "#1a1a2e",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#fff",
              padding: "6px 12px",
              pointerEvents: "none",
              zIndex: 10,
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              willChange: "transform",
            }}
          >
            <p style={{ fontSize: "11px", color: "#9ca3af", margin: 0, marginBottom: "2px" }}>{activePoint.date}</p>
            {lines.map((l, i) => (
              <p key={i} style={{ fontWeight: 600, margin: 0, color: l.isRefund ? CHART_COLORS.refunds : undefined }}>{l.label}: {l.value}</p>
            ))}
          </div>
        )
      })()}
    </div>
  )
}

/**
 * MEMOISED, which is the point of the move.
 *
 * The props are six values: an array the page already memoises, three
 * strings, a boolean and a formatter. None of them changes while somebody is
 * hovering the chart, so with this wrapper in place hovering re-renders
 * recharts and nothing else on the page can.
 */
export const AnalyticsChartWithTooltip = memo(AnalyticsChartWithTooltipInner)
