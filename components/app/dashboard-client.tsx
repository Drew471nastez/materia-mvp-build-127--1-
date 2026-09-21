"use client"

import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from "react"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { PullToRefreshIndicator } from "./pull-to-refresh-indicator"
import { useHideNativeSplash } from "@/hooks/use-hide-native-splash"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  Eye,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Check,
  ChevronRight,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Image as ImageIcon,
  Package,
  Link2,
  Trophy,
  User,
  Palette,
  CreditCard,
  ExternalLink,
  X,
  Camera,
  FileText,
  Type,
  Wallet,
  Share2,
  Blocks,
  BarChart3,
  Globe,
  MonitorSmartphone,
} from "lucide-react"
import dynamic from "next/dynamic"

// Lazy-load recharts — it's ~200KB gzipped and only used in the trend chart.
// Dynamic import keeps it out of the initial JS bundle for faster dashboard load.
const LazyAreaChart = dynamic(
  () => import("recharts").then(m => {
    const { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } = m
    // Return a wrapper component that passes all recharts components via render prop
    return {
      default: ({ data, children }: { data: any[]; children: (components: {
        AreaChart: typeof AreaChart; Area: typeof Area; XAxis: typeof XAxis;
        YAxis: typeof YAxis; CartesianGrid: typeof CartesianGrid;
        Tooltip: typeof Tooltip; ResponsiveContainer: typeof ResponsiveContainer;
        ReferenceLine: typeof ReferenceLine;
      }) => ReactNode }) =>
        <>{children({ AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine })}</>,
    }
  }),
  { ssr: false, loading: () => <div className="w-full h-[200px] bg-neutral-50 animate-pulse rounded-xl" /> },
)
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n"
import { getLinksShareUrl, getLinksUrl, getStoreShareUrl, getStoreUrl, getWebsiteUrl } from "@/lib/url-helpers"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal, hapticTap } from "@/lib/native-bridge"
import { CHART_ANIM_MS } from "@/lib/chart-motion"
import { findScroller, fling, noFling, scrollByPx } from "@/lib/chart-scroll"
import { useToast } from "@/hooks/use-toast"
import { GlidingActiveDot, GlidingCursor } from "@/components/app/chart-glide"
import { STORELIB_LOGO } from "@/lib/brand/logo"

interface SetupStep {
  id: string
  title: string
  description: string
  tooltip: string
  completed: boolean
  href: string
}

interface ChartDataPoint {
  label: string
  value: number
  secondaryValue?: number
  refunds?: number
}

type KPIType = "views" | "orders" | "revenue" | "conversion" | null

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
 * THE AXIS IS ONLY AS WIDE AS ITS WIDEST NUMBER.
 *
 * A flat 40px is right for "$12.4k" and absurd for "0", "1", "2" — which is
 * what a new store's chart is made of, and why the left of it looked like a
 * margin somebody forgot to remove. On a 320px phone that was an eighth of
 * the chart spent on three characters.
 *
 * Measured from the longest label the formatter will actually produce for
 * this data, at roughly seven pixels a character, with room for the gap to
 * the plot. Bounded so it can neither collapse onto the grid nor run away
 * for a large currency value.
 */
function plotLeftFor(labels: string[]): number {
  const longest = labels.reduce((a, b) => (b.length > a.length ? b : a), "")
  return Math.max(22, Math.min(46, longest.length * 7 + 10))
}
/** The right margin. */
const PLOT_RIGHT = 10



/**
 * WHERE A BOX OF UNKNOWN WIDTH GOES, given where it wants to be.
 *
 * The percentages resolve against the BOX'S own border box — `50%` is half
 * of it, `100%` all of it — so the browser does the arithmetic that would
 * otherwise need a measurement taken at a moment when the element does not
 * exist yet. `track` is the card, which is measured and stable.
 */
function shiftFor(x: number, track: number): string {
  return `translateX(clamp(8px, calc(${x.toFixed(1)}px - 50%), calc(${track}px - 100% - 8px))) translateZ(0)`
}
/** Room above for the active dot: six pixels of radius plus its white ring. */
const PLOT_TOP = 10

/**
 * Chart wrapper with smooth long-press tooltip for mobile.
 * - 250ms long-press to activate
 * - Custom tooltip positioned inside chart area at fixed top
 * - requestAnimationFrame-driven updates for 120fps smoothness
 * - Smooth animation when switching between KPI modals
 * - Desktop hover works normally via Recharts default
 */
function ChartWithLongPressTooltip({
  displayChartData,
  openKPIModal,
  t,
}: {
  displayChartData: ChartDataPoint[]
  openKPIModal: KPIType
  t: (key: string) => string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  /**
   * The axis labels, and therefore how wide the axis has to be. One
   * formatter, used to draw the ticks and to measure them, so the gutter can
   * never be sized for text the chart does not show.
   */
  const axisTick = useCallback((v: number) => (
    openKPIModal === "revenue" ? `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`
      : openKPIModal === "conversion" ? `${v}%`
      : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
  ), [openKPIModal])

  const plotLeft = useMemo(() => {
    const top = displayChartData.reduce((m, d) => Math.max(m, d.value ?? 0), 0)
    /* The ends and the middle: enough to catch the widest tick recharts draws. */
    return plotLeftFor([axisTick(0), axisTick(top / 2), axisTick(top)])
  }, [displayChartData, axisTick])
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipActiveRef = useRef(false)
  const [tooltipActive, setTooltipActive] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const directionLockRef = useRef<"horizontal" | "vertical" | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const rafRef = useRef<number | null>(null)
  /** The last point a tick was fired for, so one is fired per point, not per frame. */
  const lastHapticIndexRef = useRef<number | null>(null)
  /** Where the finger is now, which for a drifting thumb is not where it landed. */
  const lastTouchXRef = useRef(0)
  /**
   * SCROLLING THE PAGE OURSELVES, because this element told the browser not
   * to. See the container's touch-action below for why it has to.
   */
  const lastTouchYRef = useRef(0)
  const scrollerRef = useRef<HTMLElement | null>(null)
  const scrollVelocityRef = useRef(0)
  const lastMoveAtRef = useRef(0)
  const stopFlingRef = useRef<() => void>(noFling)
  // Animation state — true means "play the animation now"
  const [shouldAnimate, setShouldAnimate] = useState(true)

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0)
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      /* A fling outlives the component otherwise, scrolling a page it no
         longer has any business scrolling. */
      stopFlingRef.current()
    }
  }, [])

  /**
   * ONE ANIMATION PER SWITCH, WHEN THE DATA FOR IT ARRIVES.
   *
   * `openKPIModal` used to be a dependency here alongside the data, and that
   * is the double refresh: tapping Revenue fired this once immediately — so
   * the chart redrew itself with the OLD numbers still in it — and then
   * again a moment later when the fetch came back with the new ones. Two
   * draws, the first of them of the wrong thing, which is exactly what a
   * double reload looks like.
   *
   * The data is the only honest trigger. The metric changing is a request
   * for data, not the arrival of any.
   */
  useEffect(() => {
    setShouldAnimate(true)
    const timer = setTimeout(() => setShouldAnimate(false), CHART_ANIM_MS)
    return () => clearTimeout(timer)
  }, [displayChartData])

  const getIndexFromTouch = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el || !displayChartData.length) return null
    const rect = el.getBoundingClientRect()
    const chartLeft = rect.left + plotLeft
    const chartRight = rect.right - PLOT_RIGHT
    const chartWidth = chartRight - chartLeft
    const x = clientX - chartLeft
    const ratio = Math.max(0, Math.min(1, x / chartWidth))
    return Math.round(ratio * (displayChartData.length - 1))
  }, [displayChartData.length])

  /**
   * =========================================================================
   *  THE CHART HAS TO BE ABLE TO REFUSE THE PLATFORM'S OWN LONG PRESS
   * =========================================================================
   * This was an `onTouchStart` prop, and React registers touchstart, touchmove
   * and wheel PASSIVELY on its root — so `preventDefault` inside one is a
   * no-op. Measured, not assumed: check-chart-scrub reported the touchstart
   * coming back with defaultPrevented false.
   *
   * On a phone that is the difference between a hold and no hold. The system
   * runs its own long-press recogniser for selection, the callout and drag,
   * and the only way to tell it this press is ours is to cancel the
   * touchstart. A passive listener cannot, so the system takes the press,
   * sends a touchcancel, and the gesture is over before the finger has moved
   * — which is a hold you have to lift out of and start again.
   *
   * Native and non-passive, registered beside the touchmove listener that is
   * already here for exactly the same reason.
   */
  const touchStartHandler = useCallback((e: TouchEvent) => {
    e.preventDefault()
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    lastTouchXRef.current = touch.clientX
    lastTouchYRef.current = touch.clientY
    /* A new touch stops the last flick, or the two fight over the scroller. */
    stopFlingRef.current()
    stopFlingRef.current = noFling
    scrollVelocityRef.current = 0
    lastMoveAtRef.current = performance.now()
    directionLockRef.current = null
    longPressTimerRef.current = setTimeout(() => {
      /**
       * A HOLD IS A HOLD EVEN THOUGH A THUMB IS NEVER STILL.
       *
       * This used to bail unless nothing had been decided yet, and what
       * decided it was `totalMove > 5` with `dx > dy` — so a resting finger's
       * own tremor, which is a few pixels and very often more vertical than
       * horizontal, locked the gesture to "vertical" within about fifty
       * milliseconds and cancelled this timer. The hold was then lost for
       * good: moving left or right afterwards did nothing, because the lock
       * was already set. That is the "I hold and it just loses it".
       *
       * Only a decisive vertical pull cancels a hold now — see SLOP below —
       * and the point is read from where the finger IS rather than from
       * where it landed, which for a drifting thumb is not the same place.
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


  // Use a native event listener for touchmove with { passive: false }
  // so preventDefault() actually works and swiping doesn't get stuck
  const touchMoveHandler = useCallback((e: TouchEvent) => {
    if (!touchStartPosRef.current) return
    const touch = e.touches[0]

    if (tooltipActiveRef.current) {
      // Already in scrub mode — prevent scroll and update position
      e.preventDefault()
      e.stopPropagation()
      const clientX = touch.clientX
      lastTouchXRef.current = clientX
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        /**
         * =================================================================
         *  THE BOX FOLLOWS THE FINGER. THE NUMBERS SNAP TO THE POINT.
         * =================================================================
         * It used to be positioned from the active INDEX, so it sat still
         * until the finger crossed into the next column and then jumped the
         * whole way — forty pixels at a time on a week of data. A glide
         * softened the jump and could not remove it, because the thing being
         * animated was still a series of steps.
         *
         * Written here, straight to the node, it moves with the thumb on
         * every frame it gets. React is not involved: `setActiveIndex` below
         * still runs, but it only ever changes when a point is crossed, so
         * there is no render per frame and nothing to be late.
         *
         * What stays snapped is what should: the values in the box and the
         * dot on the line mark a data point, and a data point is a fact.
         */
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
        /**
         * ONE TICK PER POINT CROSSED.
         *
         * Fired on the CHANGE rather than on the frame, which is what keeps
         * it to one per column instead of sixty a second — a finger crossing
         * a point is the event, and holding still is not. It is what makes a
         * scrub feel like it is passing over something rather than sliding
         * on glass.
         */
        if (idx !== null && idx !== lastHapticIndexRef.current) {
          lastHapticIndexRef.current = idx
          hapticTap("light")
        }
        setActiveIndex(idx)
      })
      return
    }

    /**
     * DIRECTION, DECIDED ONLY WHEN THE FINGER HAS ACTUALLY SAID SOMETHING.
     *
     * The old test was `dx + dy > 5`, then `dx > dy` for horizontal and
     * everything else for vertical. Summing the axes means five pixels of
     * tremor counts as movement, and "everything else" means a one pixel
     * vertical bias is a scroll. Between them, a hold was cancelled before it
     * could start.
     *
     * SLOP is per axis and large enough that a thumb resting on glass cannot
     * cross it. Horizontal wins on its own; vertical has to win clearly,
     * because getting that one wrong steals a hold and getting it wrong the
     * other way only delays a scroll by a few pixels.
     */
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
    const SLOP_X = 8
    const SLOP_Y = 12

    if (directionLockRef.current === null && (dx > SLOP_X || dy > SLOP_Y)) {
      if (dx > dy) {
        // Horizontal intent → activate scrub immediately (no long press needed)
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
         * Decisively vertical: a scroll. The browser will not perform it —
         * this element is touch-action:none on purpose — so we do, from here
         * to the lift and on into a short fling.
         */
        directionLockRef.current = "vertical"
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
        scrollerRef.current = findScroller(containerRef.current)
        lastTouchYRef.current = touch.clientY
        lastMoveAtRef.current = performance.now()
      }
      /* Ambiguous: decide nothing, and let the hold timer have its chance. */
    } else if (directionLockRef.current === "horizontal") {
      e.preventDefault()
      e.stopPropagation()
    } else if (directionLockRef.current === "vertical") {
      /* A finger moving up the screen sends the page down. */
      const step = lastTouchYRef.current - touch.clientY
      lastTouchYRef.current = touch.clientY
      const now = performance.now()
      const elapsed = now - lastMoveAtRef.current
      if (elapsed > 0) scrollVelocityRef.current = step / elapsed
      lastMoveAtRef.current = now
      scrollByPx(scrollerRef.current, step)
    }
  }, [getIndexFromTouch])

  // Attach non-passive touchmove listener
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

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    /* A flick carries on after the finger leaves. See lib/chart-scroll. */
    if (directionLockRef.current === "vertical") {
      stopFlingRef.current = fling(scrollerRef.current, scrollVelocityRef.current)
    }
    touchStartPosRef.current = null
    directionLockRef.current = null
    tooltipActiveRef.current = false
    lastHapticIndexRef.current = null
    setTooltipActive(false)
    setActiveIndex(null)
  }, [])

  const activePoint = activeIndex != null && activeIndex >= 0 && activeIndex < displayChartData.length
    ? displayChartData[activeIndex] : null

  const formatValue = (val: number) => {
    if (openKPIModal === "revenue") return `$${val.toFixed(2)}`
    if (openKPIModal === "conversion") return `${val}%`
    return val.toLocaleString()
  }

  const metricLabel = openKPIModal === "views" ? t("dashboard.views")
    : openKPIModal === "orders" ? t("dashboard.orders")
    : openKPIModal === "revenue" ? t("dashboard.revenue")
    : t("dashboard.conversionRate")

  /**
   * WHERE THE POINT ACTUALLY IS, in pixels from the card's left edge.
   *
   * This was a percentage of the whole card: index 0 became 0%, so the
   * tooltip sat at the very left while its data point sat `plotLeft` pixels
   * further in. Every point was off by the width of the axis, worst at the
   * ends. The plot area is what the points are spread across, so that is
   * what they are measured against.
   */
  const tooltipX = (): number => {
    const track = containerRef.current?.offsetWidth ?? 0
    if (!track || activeIndex == null || displayChartData.length < 2) return track / 2
    const plotWidth = track - plotLeft - PLOT_RIGHT
    return plotLeft + (activeIndex / (displayChartData.length - 1)) * plotWidth
  }

  /*
    CLAMPED IN PIXELS, because the tooltip is positioned with a transform.

    `left: <n>%` is a layout property: every value a dragging finger produced
    made the browser lay the element out again and repaint it, on the main
    thread, at touch frequency, while that same thread was handing recharts a
    new active index. The clamp maths is unchanged; only its unit is.
  */
  /**
   * =========================================================================
   *  THE TOOLTIP FLIPS AT THE EDGES INSTEAD OF BEING CENTRED AND CLIPPED
   * =========================================================================
   * The old version clamped by half the tooltip's own width, read with
   * `tooltipRef.current?.offsetWidth ?? 0`. That ref is null on the render
   * that first shows the tooltip — the element does not exist yet — so the
   * width came back 0, the clamp became a no-op, and `translateX(-50%)` then
   * pushed half the box off the left edge of the card. Which is exactly what
   * the first point on the chart looked like: "p 6" and "ews: 3".
   *
   * Measuring it properly would mean a layout read every time the active
   * point changes, and this thing is driven by a dragging finger.
   *
   * So it does not measure at all. Near an edge the box ANCHORS to that edge
   * rather than centring on the point, which is what a tooltip should do
   * anyway — the same flip a menu does near the side of a screen. Three
   * cases, no measurement, and no width can overflow because the box is
   * never centred on a point that has less than half a box beside it.
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

  // Show a dot on the last data point
  const lastDotIndex = displayChartData.length - 1

  return (
    <div
      ref={containerRef}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{
        /**
         * =====================================================================
         *  THE CHART OWNS THE TOUCH FROM THE MOMENT IT LANDS
         * =====================================================================
         * This was `tooltipActive ? "none" : "pan-y pinch-zoom"`, and that
         * ternary could never do what it looked like it did.
         *
         * The compositor reads touch-action ONCE, at touchstart, and keeps
         * that answer for the whole gesture. So the "none" branch never
         * applied to the gesture that set tooltipActive — only to the NEXT
         * touch. Every hold therefore began with the chart having promised
         * the browser it could take this gesture away as a vertical scroll,
         * and the browser took it: the tooltip opened, the finger slid, the
         * page scrolled instead, and the scrub was gone. Lift, tap again,
         * and now it worked, because the second touch landed on "none".
         *
         * That is the whole of "hold, untap, tap, slide". It is fixed by
         * owning the gesture from the start, which is what a scrubbable
         * chart has to do — and the price is that a thumb dragged down this
         * band no longer scrolls the page by itself, so the vertical branch
         * of touchMoveHandler scrolls it by hand instead.
         */
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        position: "relative",
      } as React.CSSProperties}
    >
      <LazyAreaChart data={displayChartData}>
        {({ AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine }) => (
          <ResponsiveContainer width="100%" height={200}>
            {/*
              ROOM FOR THE DOTS, now that there is no y axis reserving any.
              The axis used to take 40px on the left, and removing it left
              `left: 0` — so the first point's active dot, six pixels of
              radius plus a two pixel white ring, was drawn half outside the
              card. That clipped stub at the top left of the chart was the
              dot, not a spike in the data.
            */}
            <AreaChart data={displayChartData} margin={{ top: PLOT_TOP, right: PLOT_RIGHT, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="kpiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              {/*
                THE NUMBERS ARE BACK, and this is the width the touch maths
                reads. PLOT_LEFT is the one place it is written down — the
                thirty pixel drift between the axis and the finger came from
                there being two.
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
                  /*
                    The crosshair and the tooltip box GLIDE to the next point
                    rather than teleporting to it — components/app/chart-glide
                    has the why. `isAnimationActive={false}` is what made the
                    box jump: with it off, recharts leaves no transition on
                    the wrapper's transform.
                  */
                  cursor={<GlidingCursor />}
                  isAnimationActive
                  animationDuration={120}
                  animationEasing="ease-out"
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const point = payload[0]?.payload as ChartDataPoint
                    const val = point?.value ?? 0
                    return (
                      <div style={{ background: "#1a1a2e", border: "none", borderRadius: "8px", fontSize: "12px", color: "#fff", padding: "8px 12px", pointerEvents: "none" }}>
                        <p style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "2px" }}>{label}</p>
                        <p style={{ fontWeight: 500 }}>{metricLabel}: {formatValue(val)}</p>
                        {openKPIModal === "orders" && point?.refunds != null && point.refunds > 0 && (
                          <p style={{ fontSize: "10px", color: "#f59e0b", marginTop: "2px" }}>{point.refunds} refunded</p>
                        )}
                      </div>
                    )
                  }}
                />
              )}
              {/* Vertical crosshair line at active touch point */}
              {tooltipActive && activePoint && (
                <ReferenceLine
                  x={activePoint.label}
                  stroke="#c4b5fd"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  ifOverflow="extendDomain"
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill="url(#kpiGrad)"
                dot={((props: any) => {
                  const isActive = tooltipActive && props.index === activeIndex
                  const isLast = props.index === lastDotIndex && !tooltipActive
                  if (isActive) {
                    // Large active dot on the line while swiping
                    return (
                      <circle
                        key={`dot-${props.index}`}
                        cx={props.cx}
                        cy={props.cy}
                        r={6}
                        fill="#8b5cf6"
                        stroke="#fff"
                        strokeWidth={2.5}
                        style={{ filter: "drop-shadow(0 1px 3px rgba(139,92,246,0.4))" }}
                      />
                    )
                  }
                  if (isLast) {
                    return <circle key={`dot-${props.index}`} cx={props.cx} cy={props.cy} r={4} fill="#8b5cf6" stroke="#fff" strokeWidth={2} />
                  }
                  /*
                    NOTHING, rather than an invisible circle. This returned a
                    `<circle r={0}>` for every point that is not drawn — one
                    per day, all reconciled on every render. Measured on the
                    analytics chart, which carried the same line: 241 svg
                    nodes became 125.

                    The cast is because recharts types a function `dot` as
                    returning a ReactElement. React renders null as nothing
                    and recharts passes it straight through, which is the
                    point; the only null-ish thing its types allow is an empty
                    <g />, which is the same node count under another name.
                  */
                  return null
                }) as unknown as React.ComponentProps<typeof Area>["dot"]}
                activeDot={!isTouchDevice ? <GlidingActiveDot fill="#8b5cf6" /> : false}
                isAnimationActive={shouldAnimate}
                animationDuration={600}
                animationEasing="ease-out"
                animationBegin={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </LazyAreaChart>

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
      {tooltipActive && activePoint && (
        <div
          ref={tooltipRef}
          style={{
            position: "absolute",
            top: 8,
            /* Pinned left; the whole position is in the transform. See tooltipShift. */
            left: 0,
            transform: tooltipShift(),
            /**
             * IT SLIDES BETWEEN POINTS RATHER THAN TELEPORTING.
             *
             * A finger moves continuously and the data does not: the active
             * index steps from one column to the next, so without this the
             * box jumps in discrete hops while the thumb slides smoothly,
             * which is most of what "clunky" was. 90ms is under the
             * threshold where a following object reads as lag, and it is a
             * transform so it runs on the compositor.
             */
            /**
             * NO TRANSITION. The box is moved imperatively on every frame
             * now, so it is already continuous — a transition in front of
             * that is not smoothing, it is lag, and the two fight over the
             * same property. It was needed when the position came from the
             * active index and arrived in jumps.
             */
            transition: "none",
            /* And it can never be wider than the card it sits in. */
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
          <p style={{ fontSize: "11px", color: "#9ca3af", margin: 0, marginBottom: "2px" }}>{activePoint.label}</p>
          <p style={{ fontWeight: 600, margin: 0 }}>{metricLabel}: {formatValue(activePoint.value)}</p>
          {openKPIModal === "orders" && activePoint.refunds != null && activePoint.refunds > 0 && (
            <p style={{ fontSize: "10px", color: "#f59e0b", margin: 0, marginTop: "2px" }}>{activePoint.refunds} refunded</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sample data shown when the creator has zero real activity ──────────────
const SAMPLE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const SAMPLE_CHART: Record<string, ChartDataPoint[]> = {
  views:      SAMPLE_DAYS.map((d, i) => ({ label: d, value: [45, 78, 35, 92, 63, 88, 51][i], secondaryValue: [12, 22, 9, 31, 18, 28, 15][i] })),
  orders:     SAMPLE_DAYS.map((d, i) => ({ label: d, value: [2, 5, 1, 7, 3, 6, 4][i], refunds: [0, 0, 0, 1, 0, 0, 0][i] })),
  revenue:    SAMPLE_DAYS.map((d, i) => ({ label: d, value: [12.5, 34, 9, 45, 25, 38, 20][i] })),
  conversion: SAMPLE_DAYS.map((d, i) => ({ label: d, value: [4.2, 6.1, 2.8, 7.5, 4.8, 6.8, 7.8][i] })),
}
const SAMPLE_KPI = {
  periodViews: 452, totalViews: 1660, prevPeriodViews: 380,
  periodOrders: 28, totalOrders: 95, prevPeriodOrders: 22,
  periodRevenue: 34500, totalRevenue: 125000, prevPeriodRevenue: 28900,
  conversionRate: 6.2, prevConversionRate: 5.8,
}

// Icon mapping for setup steps
const stepIcons: Record<string, any> = {
  welcome: User,
  branding: Palette,
  product: Package,
  payouts: CreditCard,
  onepage: Link2,
  sale: Trophy,
}

// Substeps for each main step - using translation keys
const stepSubsteps: Record<string, { labelKey: string; check: (data: any) => boolean; href: string }[]> = {
  welcome: [
    { labelKey: "setup.accountCreated", check: () => true, href: "/app/settings" },
  ],
  branding: [
    { labelKey: "setup.addPhoto", check: (d) => !!d.hasAvatar, href: "/app/settings" },
    { labelKey: "setup.setName", check: (d) => !!d.hasName, href: "/app/settings" },
    { labelKey: "setup.writeBio", check: (d) => !!d.hasBio, href: "/app/settings" },
  ],
  product: [
    { labelKey: "setup.createAProduct", check: (d) => d.hasProducts, href: "/app/products/new" },
  ],
  payouts: [
    { labelKey: "setup.connectStripe", check: (d) => d.hasPayouts, href: "/app/payouts" },
  ],
  onepage: [
    { labelKey: "setup.createOnePage", check: (d) => d.hasOnePage, href: "/app/onepage" },
    { labelKey: "setup.addBlocks", check: (d) => d.hasOnePageBlock, href: "/app/onepage" },
  ],
  sale: [
    { labelKey: "setup.shareLink", check: () => false, href: "/app/onepage" },
    { labelKey: "setup.getFirstSale", check: (d) => d.hasFirstSale, href: "/app/orders" },
  ],
}

interface Order {
  id: string
  product_id: string
  amount_cents: number
  status: string
  created_at: string
}

interface DashboardClientProps {
  creatorId: string
  displayName: string
  initialSetupSteps: SetupStep[]
  productIds: string[]
  initialOrders?: Order[]
  initialTotalOrders?: number
  initialTotalRevenue?: number
  creatorHandle?: string
  connectedDomain?: string | null
  brandingDetail?: { hasAvatar: boolean; hasName: boolean; hasBio: boolean }
  /** True only when a site has actually been published, never when one merely exists. */
  websitePublished?: boolean
  subscriptionPlanId?: string
}

function ChainLinkIcon({ className = "w-4 h-4", stroke = "#ffffff" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M10.0002 13C10.4297 13.5741 10.9776 14.0491 11.6067 14.3929C12.2359 14.7367 12.9317 14.9411 13.6468 14.9923C14.362 15.0435 15.0798 14.9403 15.7515 14.6897C16.4233 14.4392 17.0333 14.047 17.5402 13.54L20.5402 10.54C21.451 9.59695 21.955 8.33394 21.9436 7.02296C21.9322 5.71198 21.4063 4.45791 20.4793 3.53087C19.5523 2.60383 18.2982 2.07799 16.9872 2.0666C15.6762 2.0552 14.4132 2.55918 13.4702 3.46997L11.7502 5.17997M14.0002 11C13.5707 10.4258 13.0228 9.95078 12.3936 9.60703C11.7645 9.26327 11.0687 9.05885 10.3535 9.00763C9.63841 8.95641 8.92061 9.0596 8.24885 9.31018C7.5771 9.56077 6.96709 9.9529 6.4602 10.46L3.4602 13.46C2.54941 14.403 2.04544 15.666 2.05683 16.977C2.06822 18.288 2.59407 19.542 3.52111 20.4691C4.44815 21.3961 5.70221 21.9219 7.01319 21.9333C8.32418 21.9447 9.58719 21.4408 10.5302 20.53L12.2402 18.82"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CopyLinkIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M10.0696 7C10.3869 3.9787 11.8424 3 15.5 3C19.7059 3 21 4.29412 21 8.5C21 12.1576 20.0213 13.6131 17 13.9304M3 15.5C3 11.2941 4.29412 10 8.5 10C12.7059 10 14 11.2941 14 15.5C14 19.7059 12.7059 21 8.5 21C4.29412 21 3 19.7059 3 15.5Z"
        stroke="#6b6b6b"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type TimeframeOption = {
  value: string
  label: string
  getDates: () => { start: Date; end: Date }
}

function QuickAccessRow({
  label,
  url,
  icon,
  actionLabel,
  isCopied,
  onAction,
  onOpen,
}: {
  label: string
  url: string
  icon: ReactNode
  actionLabel: "copy" | "setup"
  isCopied: boolean
  onAction: () => void
  onOpen: () => void
}) {
  const isSetupAction = actionLabel === "setup"

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen()
      }}
      className="w-full text-left rounded-2xl border border-[#ececf1] p-3.5 hover:bg-[#fafafa] active:bg-[#f4f4f5] transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[#111827]">{label}</p>
          <p className="text-[12px] text-[#6b7280] truncate">{url}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAction()
          }}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
            isSetupAction
              ? "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9] hover:bg-[#ede9fe]"
              : isCopied
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f8fafc]"
          }`}
        >
          {isSetupAction ? (
            <ArrowRight className="h-3.5 w-3.5" />
          ) : isCopied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <CopyLinkIcon className="h-3.5 w-3.5" />
          )}
          {isSetupAction ? "Set up" : isCopied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  )
}


const timeframeOptions: TimeframeOption[] = [
  {
    value: "today",
    label: "Today",
    getDates: () => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      return { start, end }
    },
  },
  {
    value: "yesterday",
    label: "Yesterday",
    getDates: () => {
      const start = new Date()
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setDate(end.getDate() - 1)
      end.setHours(23, 59, 59, 999)
      return { start, end }
    },
  },
  {
    value: "last_48_hours",
    label: "Last 48 hours",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setHours(start.getHours() - 48)
      return { start, end }
    },
  },
  {
    value: "last_7_days",
    label: "Last 7 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      return { start, end }
    },
  },
  {
    value: "last_30_days",
    label: "Last 30 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      return { start, end }
    },
  },
  {
    value: "this_month",
    label: "This month",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      return { start, end }
    },
  },
  {
    value: "last_90_days",
    label: "Last 90 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 90)
      return { start, end }
    },
  },
  {
    value: "last_365_days",
    label: "Last 365 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 365)
      return { start, end }
    },
  },
  {
    value: "last_year",
    label: "Last year",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setFullYear(start.getFullYear() - 1)
      return { start, end }
    },
  },
  {
    value: "all_time",
    label: "All time",
    getDates: () => {
      const end = new Date()
      const start = new Date(2020, 0, 1) // Start from 2020
      return { start, end }
    },
  },
]

// Helper function to calculate percentage change
const calculatePercentChange = (current: number, previous: number): { value: number; isPositive: boolean; isZero: boolean } => {
  if (previous === 0 && current === 0) return { value: 0, isPositive: true, isZero: true }
  if (previous === 0) return { value: 100, isPositive: true, isZero: false }
  const change = ((current - previous) / previous) * 100
  return { value: Math.abs(change), isPositive: change >= 0, isZero: change === 0 }
}

// Small percentage change indicator component
function PercentChangeIndicator({ current, previous }: { current: number; previous: number }) {
  const { value, isPositive, isZero } = calculatePercentChange(current, previous)

  if (isZero) return null

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
      isPositive ? "text-emerald-600" : "text-[#9ca3af]"
    }`}>
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {Math.round(value)}%
    </span>
  )
}

// Helper function to format period text naturally
const formatPeriodText = (timeframeValue: string): string => {
  switch (timeframeValue) {
    case "today":
      return "today"
    case "yesterday":
      return "yesterday"
    case "last_48_hours":
      return "in last 48h"
    case "last_7_days":
      return "in last 7 days"
    case "last_30_days":
      return "in last 30 days"
    case "this_month":
      return "this month"
    case "last_90_days":
      return "in last 90 days"
    case "last_365_days":
      return "in last 365 days"
    case "last_year":
      return "last year"
    case "all_time":
      return "all time"
    default:
      return ""
  }
}

// Progress circle component with purple accent
function ProgressCircle({ progress, size = 32 }: { progress: number; size?: number }) {
  const strokeWidth = 2.5
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  )
}

// Mobile Bottom Sheet for Timeframe Selector with smooth GPU-accelerated swipe-to-close
function TimeframeBottomSheet({
  isOpen,
  onClose,
  options,
  selectedValue,
  onSelect,
  t,
}: {
  isOpen: boolean
  onClose: () => void
  options: TimeframeOption[]
  selectedValue: string
  onSelect: (value: string) => void
  t: (key: any) => string
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const lastYRef = useRef(0)
  const lastTimeRef = useRef(0)
  const velocityRef = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setIsDragging(false)
    setDragY(0)
    velocityRef.current = 0
    setTimeout(() => {
      onClose()
    }, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return
    const sheetRect = sheetElement.getBoundingClientRect()
    // Allow drag from anywhere above the sheet content area (backdrop + handle + header)
    // Only block drag if touch is deep inside sheet content (scrollable area)
    const touchYInSheet = touch.clientY - sheetRect.top
    if (touchYInSheet <= 0 || touchYInSheet <= 100) {
      // Touch is on backdrop (above sheet) or in handle/header area
      startYRef.current = touch.clientY
      lastYRef.current = touch.clientY
      lastTimeRef.current = Date.now()
      velocityRef.current = 0
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startYRef.current
    if (diff > 0) {
      e.preventDefault()
      const now = Date.now()
      const dt = Math.max(1, now - lastTimeRef.current)
      velocityRef.current = (currentY - lastYRef.current) / dt
      lastYRef.current = currentY
      lastTimeRef.current = now
      const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
      setDragY(resisted)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 92 || velocityRef.current > 0.55) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  return (
    <div
      data-dashboard-sheet
      className="fixed inset-0 z-[100] md:hidden"
      style={{ pointerEvents: isVisible ? "auto" : "none", touchAction: "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Backdrop with smooth fade + blur */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        style={{
          opacity: isAnimating ? 1 : 0,
          transition: isDragging ? 'none' : 'opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={isAnimating ? handleClose : undefined}
      />
      {/* Bottom Sheet - GPU accelerated */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translate3d(0, ${dragY}px, 0)` : "translate3d(0, 100%, 0)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        {/* Handle bar */}
        <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none" data-sheet-handle>
          <div className="h-[5px] w-10 rounded-full bg-gray-300" />
        </div>
        <div className="px-4 pb-4">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">{t("time.selectPeriod")}</h3>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y' }}>
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onSelect(option.value)
                  handleClose()
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-[15px] font-medium transition-colors ${
                  selectedValue === option.value
                    ? "bg-[#f5f3ff] text-[#8b5cf6]"
                    : "text-[#374151] hover:bg-[#f9fafb] active:bg-[#f3f4f6]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {/* Safe area padding for iOS */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

function QuickAccessBottomSheet({
  isOpen,
  onClose,
  onePageUrl,
  storeUrl,
  navOnePageUrl,
  navStoreUrl,
  isOnePageCopied,
  isStoreCopied,
  onCopyOnePage,
  onCopyStore,
  isOnePageReady,
  onSetupOnePage,
}: {
  isOpen: boolean
  onClose: () => void
  onePageUrl: string
  storeUrl: string
  navOnePageUrl?: string
  navStoreUrl?: string
  isOnePageCopied: boolean
  isStoreCopied: boolean
  onCopyOnePage: () => void
  onCopyStore: () => void
  isOnePageReady: boolean
  onSetupOnePage: () => void
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const lastYRef = useRef(0)
  const lastTimeRef = useRef(0)
  const velocityRef = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setIsAnimating(true)))
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setIsDragging(false)
    setDragY(0)
    velocityRef.current = 0
    setTimeout(() => onClose(), 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    startYRef.current = touch.clientY
    lastYRef.current = touch.clientY
    lastTimeRef.current = Date.now()
    velocityRef.current = 0
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startYRef.current
    if (diff > 0) {
      e.preventDefault()
      const now = Date.now()
      const dt = Math.max(1, now - lastTimeRef.current)
      velocityRef.current = (currentY - lastYRef.current) / dt
      lastYRef.current = currentY
      lastTimeRef.current = now
      const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
      setDragY(resisted)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 92 || velocityRef.current > 0.55) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  return (
    <div
      data-dashboard-sheet
      className="fixed inset-0 z-[110] md:hidden"
      style={{ pointerEvents: isVisible ? "auto" : "none", touchAction: "none" }}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        style={{
          opacity: isAnimating ? 1 : 0,
          transition: isDragging ? 'none' : 'opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={isAnimating ? handleClose : undefined}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translate3d(0, ${dragY}px, 0)` : "translate3d(0, 100%, 0)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        {/* Invisible extended touch zone above sheet for easier grab */}
        <div
          className="absolute left-0 right-0 h-6 -top-6"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        {/* Handle bar — drag target only, touch events restricted here */}
        <div
          className="pt-3 pb-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-full flex justify-center py-2 cursor-grab active:cursor-grabbing touch-none">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </div>
        </div>
        <div className="px-4 pb-5">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">Quick access</h3>
          <div className="space-y-2">
            <QuickAccessRow
              label="OnePage"
              url={isOnePageReady ? onePageUrl : "Set up your OnePage to create a link"}
              actionLabel={isOnePageReady ? "copy" : "setup"}
              isCopied={isOnePageCopied}
              onAction={() => {
                if (isOnePageReady) {
                  onCopyOnePage()
                } else {
                  onSetupOnePage()
                  handleClose()
                }
              }}
              onOpen={() => {
                if (isOnePageReady) {
                  const url = onePageUrl || navOnePageUrl
                  openExternal(url)
                } else {
                  onSetupOnePage()
                }
                handleClose()
              }}
              icon={<div className="w-8 h-8 rounded-full bg-[#8b5cf6] flex items-center justify-center"><ChainLinkIcon className="w-4 h-4" stroke="#ffffff" /></div>}
            />

            <QuickAccessRow
              label="Store"
              url={storeUrl}
              actionLabel="copy"
              isCopied={isStoreCopied}
              onAction={onCopyStore}
              onOpen={() => {
                const url = storeUrl || navStoreUrl
                openExternal(url)
                handleClose()
              }}
              icon={<div className="w-8 h-8 rounded-full bg-black flex items-center justify-center overflow-hidden"><img src={STORELIB_LOGO} alt="" width={20} height={20} className="w-5 h-5" loading="eager" decoding="async" /></div>}
            />
          </div>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

export function DashboardClient({
  creatorId,
  displayName,
  initialSetupSteps,
  productIds,
  initialOrders = [],
  initialTotalOrders = 0,
  initialTotalRevenue = 0,
  creatorHandle = "",
  connectedDomain = null,
  brandingDetail,
  websitePublished = false,
  subscriptionPlanId = "free",
}: DashboardClientProps) {
  const [timeframe, setTimeframe] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dashboard_timeframe") || "last_7_days"
    }
    return "last_7_days"
  })
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isProfileAccessOpen, setIsProfileAccessOpen] = useState(false)
  const [isProfileAccessVisible, setIsProfileAccessVisible] = useState(false)
  const [isProfileAccessAnimating, setIsProfileAccessAnimating] = useState(false)
  const [isQuickAccessMobileOpen, setIsQuickAccessMobileOpen] = useState(false)
  const profileAccessRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()

  useHideNativeSplash()

  // Persist timeframe selection to localStorage
  useEffect(() => {
    localStorage.setItem("dashboard_timeframe", timeframe)
  }, [timeframe])

  // Canonical subdomain URLs for display text and clipboard copy
  const publicStoreUrl = connectedDomain ? `https://${connectedDomain}` : (creatorHandle ? getStoreShareUrl(creatorHandle) : "")
  /**
   * TWO ADDRESSES, TWO THINGS, and url-helpers is explicit about which is
   * which: <name>.storelib.com is the WEBSITE built in the website builder,
   * storelib.com/<name> is the creator PAGE. Quick access listed the page
   * twice under two names and never listed the website at all.
   */
  const publicWebsiteUrl = creatorHandle && websitePublished ? getWebsiteUrl(creatorHandle) : ""
  const publicOnePageUrl = connectedDomain ? `https://${connectedDomain}/links` : (creatorHandle ? getLinksShareUrl(creatorHandle) : "")
  // Internal-path URLs for in-app navigation (preserves auth in Capacitor)
  const navStoreUrl = connectedDomain ? `https://${connectedDomain}` : (creatorHandle ? getStoreUrl(creatorHandle) : "")
  const navOnePageUrl = connectedDomain ? `https://${connectedDomain}/links` : (creatorHandle ? getLinksUrl(creatorHandle) : "")
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false)
  // loading.tsx already renders the streaming skeleton. On first mount we
  // render the shell immediately with a subtle blur on data-bound fields so
  // there's no second full-page skeleton flash ("double load"). isLoading
  // stays behind as a safety net for rare edge cases where data is missing.
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(true)
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(false)
  useEffect(() => {
    if (!isLoading) {
      setShowLoadingSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowLoadingSkeleton(true), 200)
    return () => clearTimeout(timer)
  }, [isLoading])
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>("views")
  const [chartExpanded, setChartExpanded] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("storelib_chart_expanded")
      if (saved !== null) return saved === "true"
      // Desktop: closed by default; Mobile: open by default
      return window.innerWidth < 768
    }
    return false
  })
  // Persist chart expanded/collapsed preference
  useEffect(() => {
    localStorage.setItem("storelib_chart_expanded", String(chartExpanded))
  }, [chartExpanded])

  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [isChartLoading, setIsChartLoading] = useState(false)
  // Sample data toggle — session-only (resets on page refresh, no localStorage)
  const [showSampleData, setShowSampleData] = useState(false)
  const [analyticsData, setAnalyticsData] = useState({
    totalViews: 0,
    totalOrders: initialTotalOrders,
    totalRevenue: initialTotalRevenue,
    conversionRate: 0,
    periodViews: 0,
    periodOrders: initialTotalOrders,
    periodRevenue: initialTotalRevenue,
    // Previous period for comparison
    prevPeriodViews: 0,
    prevPeriodOrders: 0,
    prevPeriodRevenue: 0,
    prevConversionRate: 0,
  })
  // Live orders — starts from SSR-fetched initialOrders, updated via Realtime
  const [liveOrders, setLiveOrders] = useState<Order[]>(initialOrders)
  const liveOrdersRef = useRef<Order[]>(initialOrders)

  // Keep ref in sync so realtime handler always has latest array
  useEffect(() => {
    liveOrdersRef.current = liveOrders
  }, [liveOrders])

  // Subscribe to new/updated orders for this creator's products
  useEffect(() => {
    if (!productIds || productIds.length === 0) return
    const supabase = createClient()
    const channel = supabase
      .channel("dashboard-orders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const row = (payload.new || payload.old) as Order | undefined
          if (!row || !productIds.includes(row.product_id)) return

          setLiveOrders((prev) => {
            if (payload.eventType === "INSERT") {
              // Avoid duplicates
              if (prev.some((o) => o.id === row.id)) return prev
              return [row, ...prev]
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((o) => (o.id === row.id ? { ...o, ...row } : o))
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((o) => o.id !== row.id)
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [productIds.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sample data overlay ────────────────────────────────────────────────────
  // True once any real metric exists — toggle and badge disappear permanently
  const hasRealData = analyticsData.totalViews > 0 || analyticsData.totalOrders > 0 || analyticsData.totalRevenue > 0
  const displayAnalytics = showSampleData && !hasRealData ? { ...analyticsData, ...SAMPLE_KPI } : analyticsData
  const displayChartData = showSampleData && !hasRealData && openKPIModal
    ? (SAMPLE_CHART[openKPIModal] ?? chartData)
    : chartData

  const [liveVisitors, setLiveVisitors] = useState(0)
  const { t } = useLanguage()
  const { toast } = useToast()
  const [copiedTarget, setCopiedTarget] = useState<"onepage" | "store" | "website" | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

  const formatCurrency = (cents: number, compact = false) => {
    const value = cents / 100
    if (compact && value >= 1000) {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`
      }
      return `$${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
    }
    // Remove decimal places if they are .00
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value)
    return formatted
  }

  // Format numbers compactly (10.5K, 1.2M, etc.)
  const formatCompactNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`
    }
    return num.toLocaleString()
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  const isFirstLoadRef = useRef(true)
  const fetchAnalytics = async (selectedTimeframe: string) => {
    // First load: isRefreshing is already true (seeded in useState). Using
    // a full skeleton here would stack with loading.tsx and cause the
    // "double load" flash. Blur handles the brief refresh visually.
    setIsRefreshing(true)
    const supabase = createClient()

    try {
      const option = timeframeOptions.find((o) => o.value === selectedTimeframe)
      if (!option) return

      const { start, end } = option.getDates()

      // Calculate previous period dates (same duration, immediately before)
      const periodDuration = end.getTime() - start.getTime()
      const prevEnd = new Date(start.getTime() - 1) // 1ms before current period start
      const prevStart = new Date(prevEnd.getTime() - periodDuration)

      // Fetch views for the current period (analytics_events are OK to fetch client-side)
      const { data: viewEvents } = await supabase
        .from("analytics_events")
        .select("id, visitor_id, session_id, product_id, created_at")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())

      const uniqueViewKeys = new Set(
        (viewEvents || [])
          .map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          })
          .filter(Boolean)
      )

      const periodViews = uniqueViewKeys.size || 0

      // Fetch views for the previous period
      const { data: prevViewEvents } = await supabase
        .from("analytics_events")
        .select("id, visitor_id, session_id, product_id, created_at")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString())

      const prevUniqueViewKeys = new Set(
        (prevViewEvents || [])
          .map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          })
          .filter(Boolean)
      )

      const prevPeriodViews = prevUniqueViewKeys.size || 0

      // Filter orders — include both completed + refunded in order counts
      const completedOrders = liveOrders.filter(o => o.status === "completed")
      const allValidOrders = liveOrders.filter(o => o.status === "completed" || o.status === "refunded")

      // Current period orders
      const periodOrdersData = allValidOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= start && orderDate <= end
      })
      const periodOrders = periodOrdersData.length
      const periodRevenue = completedOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= start && orderDate <= end
      }).reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      // Previous period orders
      const prevPeriodOrdersData = allValidOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= prevStart && orderDate <= prevEnd
      })
      const prevPeriodOrders = prevPeriodOrdersData.length
      const prevPeriodRevenue = completedOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= prevStart && orderDate <= prevEnd
      }).reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      // Fetch all-time views
      const { data: allViewEvents } = await supabase
        .from("analytics_events")
        .select("id, visitor_id, session_id, product_id")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")

      const allUniqueViewKeys = new Set(
        (allViewEvents || [])
          .map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          })
          .filter(Boolean)
      )

      const totalViews = allUniqueViewKeys.size || 0

      // All-time orders — includes completed + refunded
      const totalOrders = allValidOrders.length
      const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      const conversionRate = periodViews > 0 ? (periodOrders / periodViews) * 100 : 0
      const prevConversionRate = prevPeriodViews > 0 ? (prevPeriodOrders / prevPeriodViews) * 100 : 0

      setAnalyticsData({
        totalViews,
        totalOrders,
        totalRevenue,
        conversionRate: Number(conversionRate.toFixed(2)),
        periodViews,
        periodOrders,
        periodRevenue,
        prevPeriodViews,
        prevPeriodOrders,
        prevPeriodRevenue,
        prevConversionRate: Number(prevConversionRate.toFixed(2)),
      })
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
      setIsLoading(false)
      // Delay removing the refresh blur so KPI numbers and charts
      // settle before the CSS transition fades them back in cleanly
      if (!isFirstLoadRef.current) {
        setTimeout(() => setIsRefreshing(false), 300)
      } else {
        setIsRefreshing(false)
      }
      isFirstLoadRef.current = false
    }
  }

  // Fetch live visitors (active in last 5 minutes)
  const fetchLiveVisitors = async () => {
    const supabase = createClient()
    try {
      const fiveMinutesAgo = new Date()
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5)

      const { data: recentViews } = await supabase
        .from("analytics_events")
        .select("visitor_id, session_id")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", fiveMinutesAgo.toISOString())

      // Count unique visitors
      const uniqueVisitors = new Set(
        (recentViews || [])
          .map((e: any) => e.visitor_id || e.session_id)
          .filter(Boolean)
      )

      setLiveVisitors(uniqueVisitors.size)
    } catch (error) {
      console.error("Error fetching live visitors:", error)
    }
  }

  // Poll for live visitors every 30 seconds — "live" means last 5 min so 30 s cadence is plenty
  useEffect(() => {
    fetchLiveVisitors()
    const interval = setInterval(fetchLiveVisitors, 30000)
    return () => clearInterval(interval)
  }, [creatorId])

  // Generate time buckets based on timeframe for chart
  const generateTimeBuckets = (tf: string, start: Date, end: Date) => {
    const buckets: { start: Date; end: Date; label: string }[] = []
    const isHourly = tf === "today" || tf === "yesterday"
    const is48h = tf === "last_48_hours"
    const isAllTime = tf === "all_time"
    const isYear = tf === "last_year" || tf === "last_365_days"
    const is90Days = tf === "last_90_days"
    const isMonth = tf === "last_30_days" || tf === "this_month"

    if (isHourly) {
      const maxHour = tf === "today" ? new Date().getHours() : 23
      for (let hour = 0; hour <= maxHour; hour++) {
        const hourStart = new Date(start)
        hourStart.setHours(hour, 0, 0, 0)
        const hourEnd = new Date(start)
        hourEnd.setHours(hour, 59, 59, 999)
        buckets.push({ start: hourStart, end: hourEnd, label: `${hour.toString().padStart(2, '0')}:00` })
      }
    } else if (is48h) {
      for (let i = 47; i >= 0; i -= 4) {
        const bStart = new Date(end)
        bStart.setHours(bStart.getHours() - i)
        bStart.setMinutes(0, 0, 0)
        const bEnd = new Date(bStart)
        bEnd.setHours(bEnd.getHours() + 3, 59, 59, 999)
        buckets.push({
          start: bStart,
          end: bEnd,
          label: `${bStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${bStart.getHours().toString().padStart(2, '0')}:00`,
        })
      }
    } else if (isAllTime) {
      const currentYear = new Date().getFullYear()
      for (let year = 2020; year <= currentYear; year++) {
        buckets.push({
          start: new Date(year, 0, 1),
          end: new Date(year, 11, 31, 23, 59, 59, 999),
          label: year.toString(),
        })
      }
    } else if (isYear) {
      for (let i = 11; i >= 0; i--) {
        const md = new Date(end)
        md.setMonth(md.getMonth() - i)
        const mStart = new Date(md.getFullYear(), md.getMonth(), 1)
        const mEnd = new Date(md.getFullYear(), md.getMonth() + 1, 0, 23, 59, 59, 999)
        buckets.push({
          start: mStart,
          end: mEnd,
          label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mStart.getMonth()],
        })
      }
    } else if (is90Days) {
      for (let week = 11; week >= 0; week--) {
        const wStart = new Date(end)
        wStart.setDate(wStart.getDate() - (week * 7 + 6))
        wStart.setHours(0, 0, 0, 0)
        const wEnd = new Date(wStart)
        wEnd.setDate(wEnd.getDate() + 6)
        wEnd.setHours(23, 59, 59, 999)
        buckets.push({
          start: wStart,
          end: wEnd,
          label: wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        })
      }
    } else {
      let dayStep = 1
      let dayCount: number
      if (isMonth) { dayCount = 10; dayStep = 3 }
      else {
        // Compute day count from actual date range to avoid off-by-one
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        dayCount = diffDays + 1
      }
      for (let i = dayCount - 1; i >= 0; i--) {
        const dStart = new Date(end)
        dStart.setDate(dStart.getDate() - (i * dayStep))
        dStart.setHours(0, 0, 0, 0)
        const dEnd = new Date(dStart)
        dEnd.setDate(dEnd.getDate() + dayStep - 1)
        dEnd.setHours(23, 59, 59, 999)
        buckets.push({
          start: dStart,
          end: dEnd,
          label: dStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        })
      }
    }
    return buckets
  }

  // Fetch detailed chart data for KPI modal — bulk fetch + local bucketing for speed
  const fetchChartData = async (kpiType: KPIType) => {
    if (!kpiType) return

    setIsChartLoading(true)
    const supabase = createClient()

    try {
      const option = timeframeOptions.find((o) => o.value === timeframe)
      if (!option) return

      const { start, end } = option.getDates()
      // Use same filters as KPI display: completed+refunded for order counts, completed-only for revenue
      const allValidOrders = liveOrders.filter(o => o.status === "completed" || o.status === "refunded")
      const completedOrders = liveOrders.filter(o => o.status === "completed")

      // For all_time, extend start to 2020
      const fetchStart = timeframe === "all_time" ? new Date(2020, 0, 1) : start

      // Bulk fetch all view events in ONE query
      let viewEvents: any[] = []
      let clickEvents: any[] = []

      if (kpiType === "views" || kpiType === "conversion") {
        const { data } = await supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id, created_at")
          .eq("creator_id", creatorId)
          .eq("event_type", "view")
          .gte("created_at", fetchStart.toISOString())
          .lte("created_at", end.toISOString())
        viewEvents = data || []

        if (kpiType === "views") {
          const { data: clicks } = await supabase
            .from("analytics_events")
            .select("id, created_at")
            .eq("creator_id", creatorId)
            .eq("event_type", "click")
            .gte("created_at", fetchStart.toISOString())
            .lte("created_at", end.toISOString())
          clickEvents = clicks || []
        }
      }

      // Generate time buckets and compute values locally
      const buckets = generateTimeBuckets(timeframe, start, end)
      const points: ChartDataPoint[] = []

      for (const bucket of buckets) {
        let value = 0
        let secondaryValue = 0

        if (kpiType === "views") {
          const bucketViews = viewEvents.filter(e => {
            const d = new Date(e.created_at)
            return d >= bucket.start && d <= bucket.end
          })
          const uniqueKeys = new Set(bucketViews.map((e: any) => {
            const identity = e.visitor_id || e.session_id
            return identity ? `${identity}__${e.product_id || "store"}` : null
          }).filter(Boolean))
          value = uniqueKeys.size
          secondaryValue = clickEvents.filter(e => {
            const d = new Date(e.created_at)
            return d >= bucket.start && d <= bucket.end
          }).length
        } else if (kpiType === "orders") {
          // Use allValidOrders (completed + refunded) to match KPI display
          const bucketOrders = allValidOrders.filter(o => {
            const d = new Date(o.created_at)
            return d >= bucket.start && d <= bucket.end
          })
          value = bucketOrders.length
          // Count refunds in this bucket for tooltip info
          secondaryValue = bucketOrders.filter(o => o.status === "refunded").length
        } else if (kpiType === "revenue") {
          // Use completedOrders only for revenue (refunded orders don't count as revenue)
          value = completedOrders.filter(o => {
            const d = new Date(o.created_at)
            return d >= bucket.start && d <= bucket.end
          }).reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
        } else if (kpiType === "conversion") {
          const bucketViews = viewEvents.filter(e => {
            const d = new Date(e.created_at)
            return d >= bucket.start && d <= bucket.end
          })
          const views = new Set(bucketViews.map((e: any) => {
            const id = e.visitor_id || e.session_id
            return id ? `${id}__${e.product_id || "store"}` : null
          }).filter(Boolean)).size
          // Use allValidOrders for conversion rate to match KPI display
          const orders = allValidOrders.filter(o => {
            const d = new Date(o.created_at)
            return d >= bucket.start && d <= bucket.end
          }).length
          value = views > 0 ? Number(((orders / views) * 100).toFixed(2)) : 0
        }

        points.push({
          label: bucket.label,
          value,
          secondaryValue: kpiType === "views" ? secondaryValue : undefined,
          refunds: kpiType === "orders" ? secondaryValue : undefined,
        })
      }

      setChartData(points)
      // Delay removing loading blur so chart lines redraw while still
      // blurred, then the CSS transition fades in the finished chart cleanly
      setTimeout(() => setIsChartLoading(false), 350)
    } catch (error) {
      console.error("Error fetching chart data:", error)
      setIsChartLoading(false)
    }
  }

  // Fetch chart data when modal opens or timeframe changes
  useEffect(() => {
    if (openKPIModal) {
      // Safety net: if Supabase queries hang, stop the skeleton after 5 s
      const safetyTimer = window.setTimeout(() => setIsChartLoading(false), 5000)
      fetchChartData(openKPIModal).finally(() => window.clearTimeout(safetyTimer))
      return () => window.clearTimeout(safetyTimer)
    }
  }, [openKPIModal, timeframe, creatorId])

  useEffect(() => {
    // Safety net: if analytics queries hang (slow network, Supabase latency),
    // stop showing the skeleton after 5s so the page is usable with cached data.
    const safetyTimer = window.setTimeout(() => {
      setIsLoading(false)
      isFirstLoadRef.current = false
    }, 5000)
    fetchAnalytics(timeframe).finally(() => window.clearTimeout(safetyTimer))
    return () => window.clearTimeout(safetyTimer)
  }, [timeframe, creatorId])

  // When liveOrders updates (realtime), recalculate order KPIs without re-fetching views
  useEffect(() => {
    // Skip on first render — fetchAnalytics will handle it
    if (isFirstLoadRef.current) return

    const option = timeframeOptions.find((o) => o.value === timeframe)
    if (!option) return
    const { start, end } = option.getDates()
    const periodDuration = end.getTime() - start.getTime()
    const prevEnd = new Date(start.getTime() - 1)
    const prevStart = new Date(prevEnd.getTime() - periodDuration)

    const completedOrders = liveOrders.filter(o => o.status === "completed")
    const allValidOrders = liveOrders.filter(o => o.status === "completed" || o.status === "refunded")

    const periodOrders = allValidOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= start && d <= end
    }).length
    const periodRevenue = completedOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= start && d <= end
    }).reduce((s, o) => s + (o.amount_cents || 0), 0)
    const prevPeriodOrders = allValidOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= prevStart && d <= prevEnd
    }).length
    const prevPeriodRevenue = completedOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= prevStart && d <= prevEnd
    }).reduce((s, o) => s + (o.amount_cents || 0), 0)
    const totalOrders = allValidOrders.length
    const totalRevenue = completedOrders.reduce((s, o) => s + (o.amount_cents || 0), 0)

    setAnalyticsData(prev => ({
      ...prev,
      totalOrders,
      totalRevenue,
      periodOrders,
      periodRevenue,
      prevPeriodOrders,
      prevPeriodRevenue,
    }))
  }, [liveOrders]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown when clicking outside (desktop only)
  const copyQuickAccessUrl = async (target: "onepage" | "store" | "website") => {
    const url = target === "onepage" ? publicOnePageUrl : target === "website" ? publicWebsiteUrl : publicStoreUrl
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiedTarget(target)
      setCopyNotice("Link copied")
      toast({ title: "Link copied" })
      setTimeout(() => setCopiedTarget((prev) => (prev === target ? null : prev)), 1800)
      setTimeout(() => setCopyNotice(null), 1800)
    } catch {
      toast({ title: "Copy failed", description: "Please copy the link manually.", variant: "destructive" })
    }
  }


  useEffect(() => {
    if (isProfileAccessOpen) {
      setIsProfileAccessVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setIsProfileAccessAnimating(true)))
    } else if (isProfileAccessVisible) {
      setIsProfileAccessAnimating(false)
      const timer = setTimeout(() => setIsProfileAccessVisible(false), 180)
      return () => clearTimeout(timer)
    }
  }, [isProfileAccessOpen, isProfileAccessVisible])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".timeframe-dropdown")) {
        setIsDropdownOpen(false)
      }
      if (profileAccessRef.current && !profileAccessRef.current.contains(target)) {
        setIsProfileAccessOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const selectedOption = timeframeOptions.find((o) => o.value === timeframe)
  const completedSteps = initialSetupSteps.filter((s) => s.completed).length
  const totalSteps = initialSetupSteps.length
  const allCompleted = completedSteps === totalSteps

  // Derive completion status from steps
  const hasProducts = initialSetupSteps.find((s) => s.id === "product")?.completed || false
  const hasPayouts = initialSetupSteps.find((s) => s.id === "payouts")?.completed || false
  const hasOnePageSetup = initialSetupSteps.find((s) => s.id === "onepage")?.completed || false
  const mobileHandleLabel = creatorHandle.length > 14 ? `${creatorHandle.slice(0, 14)}...` : creatorHandle


  // Announcement bar state
  const DURATION = 15000 // 15 seconds — matches the CSS transition below
  const [announcementType, setAnnouncementType] = useState<"upgrade" | "steps" | "payouts">("upgrade")
  const [announcementVisible, setAnnouncementVisible] = useState(true)
  // 0 = bar just reset (no transition), 100 = bar animating to full (CSS 15 s linear transition)
  const [progressTarget, setProgressTarget] = useState(100)

  // Rotate announcements every 15 s. Progress bar is driven purely by CSS transition —
  // no setInterval/setState at 50 ms, which was causing 20 re-renders per second.
  useEffect(() => {
    // Instantly reset bar to 0 (transition: none), then on next frame animate to 100 (15 s linear)
    setProgressTarget(0)
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setProgressTarget(100)))

    // Rotate announcements — 360 ms matches the CSS transition-duration (300 ms)
    // plus a safety margin so opacity is fully 0 before content swaps.
    const rotateTimer = setTimeout(() => {
      setAnnouncementVisible(false)
      setTimeout(() => {
        setAnnouncementType((prev) => {
          if (prev === "upgrade") {
            if (!allCompleted) return "steps"
            if (hasProducts && !hasPayouts) return "payouts"
            return "upgrade"
          } else if (prev === "steps") {
            if (hasProducts && !hasPayouts) return "payouts"
            return "upgrade"
          } else {
            // was "payouts"
            return "upgrade"
          }
        })
        setProgressTarget(0)
        setAnnouncementVisible(true)
      }, 360)
    }, DURATION)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(rotateTimer)
    }
  }, [announcementType, allCompleted, hasProducts, hasPayouts])

  // Build substep data based on step completion
  const getSubstepData = (step: SetupStep) => {
    return {
      hasAvatar: step.id === "branding" ? (brandingDetail?.hasAvatar ?? step.completed) : false,
      hasName: step.id === "branding" ? (brandingDetail?.hasName ?? step.completed) : false,
      hasBio: step.id === "branding" ? (brandingDetail?.hasBio ?? step.completed) : false,
      hasProducts: step.id === "product" ? step.completed : false,
      hasPayouts: step.id === "payouts" ? step.completed : false,
      hasOnePage: step.id === "onepage" ? step.completed : false,
      hasOnePageBlock: step.id === "onepage" ? step.completed : false,
      hasFirstSale: step.id === "sale" ? step.completed : false,
    }
  }

  const handleStepClick = (stepId: string, e: React.MouseEvent) => {
    e.preventDefault()
    setExpandedStep(expandedStep === stepId ? null : stepId)
  }

  // ── Pull-to-refresh ───────────────────────────────────────────────────────
  // Wraps the dashboard's own scroll container so we can intercept touch events
  // with { passive: false } — the only reliable way to block iOS rubber-band
  // bounce on a child overflow-scroll element.
  const handlePullRefresh = useCallback(async () => {
    await fetchAnalytics(timeframe)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe])

  const { pullDistance, phase: pullPhase } = usePullToRefresh(scrollRef, handlePullRefresh)

  // Content translateY: slides down while pulling, snaps back when done.
  // Small offset (34px) when refreshing — just enough to show the 20px spinner
  // with breathing room, matching the compact iOS-style indicator.
  /**
   * The gap held open while refreshing. Shared with the indicator so the ring is
   * centred in the SAME gap the content opens — it used to be a literal 10px
   * against this 34, which was never actually centred and would have drifted
   * silently the moment either number was touched.
   */
  const REFRESH_HOLD = 34

  const contentTranslateY =
    pullPhase === "pulling" || pullPhase === "ready"
      ? pullDistance
      : pullPhase === "refreshing"
        ? REFRESH_HOLD
        : 0

  // Ultra-smooth spring-like ease for the snap-back / pin animation.
  // 0.4s with cubic-bezier(0.25,1,0.5,1) gives that native iOS feel:
  // fast start, gentle deceleration, no bounce.
  const contentTransition =
    pullPhase === "idle" || pullPhase === "refreshing"
      ? "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)"
      : "none"

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto bg-[#f8f9fa] dashboard-scroll-container relative app-page-enter"
    >
      {/*
        ANNOUNCEMENT BAR — ANCHORED, AND OUTSIDE THE PULL WRAPPER.

        It used to sit INSIDE the sliding content, so pulling to refresh pushed
        the purple bar down the screen and opened a white gap between it and the
        header, with the spinner sitting in that gap — above the bar, detached
        from the page, over nothing. That is the thing that looked broken.

        The bar stays put now. Only what is below it moves, so the gap the
        spinner lives in opens UNDER the bar, where a refresh indicator belongs.
      */}
      <div className="bg-[#8b5cf6] text-white">
        <div className="py-2 px-4 md:py-2.5">
          <div
            className={`max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center transition-opacity duration-300 ${
              announcementVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {announcementType === "upgrade" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">{t("dashboard.tryProFree")}</span>
                  <span className="hidden md:inline"> — {t("dashboard.proSubtitle")}</span>
                </span>
                <Link
                  href="/app/settings/billing/upgrade"
                  className="relative inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-gray-900 to-black text-white text-[11px] md:text-[13px] font-medium rounded-full transition-all shrink-0 overflow-hidden group"
                >
                  <span className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/50 transition-colors" />
                  <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)', animation: 'laser-sweep 2s infinite linear' }} />
                  <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 relative z-10" />
                  <span className="relative z-10">{t("dashboard.upgrade")}</span>
                </Link>
              </>
            )}
            {announcementType === "steps" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">{t("dashboard.completeSetup")}</span>
                  <span className="md:hidden"> — {completedSteps}/{totalSteps}</span>
                  <span className="hidden md:inline"> — {totalSteps - completedSteps} {t("dashboard.stepsRemaining")}</span>
                </span>
                <button
                  onClick={() => {
                    const setupSection = document.getElementById("store-setup-section")
                    setupSection?.scrollIntoView({ behavior: "smooth" })
                  }}
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  {t("common.continue")}
                  <ChevronRight className="h-3 w-3 md:h-3.5 md:w-3.5" />
                </button>
              </>
            )}
            {announcementType === "payouts" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">{t("dashboard.getPaid")}</span>
                  <span className="hidden md:inline"> — {t("dashboard.connectPayoutsDesc")}</span>
                </span>
                <Link
                  href="/app/settings?tab=payments"
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  <Wallet className="h-3 w-3 md:h-3.5 md:w-3.5" />
                  {t("common.connect")}
                </Link>
              </>
            )}
          </div>
        </div>
        {/* Subtle progress bar — CSS-driven, no JS per-frame updates */}
        <div className="h-[2px] bg-white/10">
          <div
            className="h-full bg-white/30"
            style={{
              width: `${progressTarget}%`,
              transition: progressTarget === 0 ? 'none' : 'width 15s linear',
            }}
          />
        </div>
      </div>

      {/*
        Everything below the anchored bar. `relative` makes this the positioning
        context for the indicator, so topOffset=0 means "the top of the area
        under the purple bar" rather than "the top of the page".

        The indicator is absolute and pointer-events-none, so it neither takes up
        layout space nor intercepts a tap meant for anything underneath it.
      */}
      <div className="relative">
        <PullToRefreshIndicator
          pullDistance={pullDistance}
          phase={pullPhase}
          topOffset={0}
          refreshHold={REFRESH_HOLD}
        />

        <div
          style={{
            transform: `translateY(${contentTranslateY}px)`,
            transition: contentTransition,
            willChange: "transform",
          }}
        >

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
        {copyNotice && (
          <div className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-4 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-[#111827] px-4 py-2 text-xs font-medium text-white shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 whitespace-nowrap">
            {copyNotice}
          </div>
        )}

        {isLoading && showLoadingSkeleton ? (
          /* ── Full Page Skeleton ── */
          <div className="animate-pulse skeleton-fade">
            {/* Header skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div>
                <div className="h-7 w-56 bg-gray-100 rounded-lg mb-2" />
                <div className="h-4 w-40 bg-gray-50 rounded" />
              </div>
              <div className="hidden md:flex items-center gap-3">
                <div className="h-10 w-36 bg-gray-100 rounded-xl" />
                <div className="h-10 w-32 bg-gray-50 rounded-lg" />
              </div>
              <div className="md:hidden flex items-center gap-2">
                <div className="h-[38px] w-24 bg-gray-50 rounded-xl" />
                <div className="h-[38px] w-32 bg-gray-100 rounded-xl" />
              </div>
            </div>

            {/* KPI + Chart skeleton */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8 overflow-hidden">
              <div className="flex overflow-hidden md:grid md:grid-cols-4 divide-x divide-[#e5e7eb]/60">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="px-3 py-3 sm:px-4 sm:py-3.5 flex-shrink-0 min-w-[130px] md:min-w-0">
                    <div className="h-3 w-16 bg-gray-100 rounded mb-2" />
                    <div className="h-6 w-20 bg-gray-100 rounded mb-1.5" />
                    <div className="h-2.5 w-24 bg-gray-50 rounded" />
                  </div>
                ))}
              </div>
              <div className="border-t border-[#e5e7eb]/60 px-4 py-4">
                <div className="h-[200px] flex items-end gap-2 px-2">
                  {[40, 55, 30, 65, 45, 60, 35, 50, 70, 42].map((h, i) => (
                    <div key={i} className="flex-1 bg-gray-50 rounded-t" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Promotional banner skeleton */}
            <div className="mb-8">
              <div className="h-[140px] sm:h-[160px] bg-gray-100 rounded-2xl" />
            </div>

            {/* Grid skeleton: Setup checklist + Quick actions */}
            <div className="grid gap-6 lg:grid-cols-[370px_1fr]">
              {/* Setup checklist skeleton */}
              <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex items-center justify-between mb-5">
                  <div className="h-4 w-28 bg-gray-100 rounded" />
                  <div className="h-6 w-12 bg-gray-50 rounded-full" />
                </div>
                <div className="h-1.5 w-full bg-gray-50 rounded-full mb-5" />
                <div className="space-y-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                      <div className="flex-1">
                        <div className="h-3.5 w-28 bg-gray-100 rounded mb-1.5" />
                        <div className="h-2.5 w-40 bg-gray-50 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Quick actions skeleton */}
              <div className="space-y-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="h-16 w-16 rounded-xl bg-gray-100 shrink-0" />
                    <div className="flex-1">
                      <div className="h-4 w-36 bg-gray-100 rounded mb-2" />
                      <div className="h-3 w-52 bg-gray-50 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
        <>
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="mb-1 flex justify-end md:hidden">
              {creatorHandle && (
                <button
                  type="button"
                  onClick={() => setIsQuickAccessMobileOpen(true)}
                  className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#e5e7eb] bg-white/90 text-[12px] font-medium text-[#4b5563] transition-all cursor-pointer overflow-hidden"
                >
                  <span className="absolute -inset-px rounded-full opacity-40 pointer-events-none animate-[spin_12s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(139,92,246,0.30)_320deg,transparent_360deg)]" />
                  <span className="absolute inset-[1px] rounded-full bg-white/95" />
                  <span className="relative z-[1] inline-flex items-center gap-1.5">
                    @{mobileHandleLabel}
                    <ExternalLink className="h-3.5 w-3.5 text-[#9ca3af]" />
                  </span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">
                {t("dashboard.welcome")}, {displayName}
              </h1>
              {creatorHandle && (
                <div ref={profileAccessRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        setIsQuickAccessMobileOpen(true)
                        return
                      }
                      setIsProfileAccessOpen((v) => !v)
                    }}
                    className="hidden md:inline-flex relative items-center gap-1.5 px-3 py-1 rounded-full border border-[#e5e7eb] bg-white/90 text-[12px] font-medium text-[#4b5563] hover:text-[#111827] hover:border-[#d1d5db] hover:bg-white transition-all cursor-pointer overflow-hidden"
                  >
                    <span className="absolute -inset-px rounded-full opacity-45 pointer-events-none animate-[spin_12s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(139,92,246,0.30)_320deg,transparent_360deg)]" />
                    <span className="absolute inset-[1px] rounded-full bg-white/95" />
                    <span className="relative z-[1] inline-flex items-center gap-1.5">
                      @{creatorHandle}
                      <ExternalLink className="h-3.5 w-3.5 text-[#9ca3af]" />
                    </span>
                  </button>
                  {isProfileAccessVisible && (
                    <div className={`absolute left-0 top-full mt-2 w-[280px] sm:w-[320px] rounded-2xl border border-[#e5e7eb] bg-white shadow-xl p-2 z-50 origin-top-left transition-all duration-180 ease-out ${isProfileAccessAnimating ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-1 scale-[0.98]"}`}>
                      <p className="px-2 pt-1 pb-2 text-[11px] text-[#6b7280]">Quick access</p>
                      {/*
                        NO ACTION BUTTONS. There were two here, "View page" and
                        "Customize page", and they were removed on the owner's
                        instruction.

                        They also did not belong: this panel answers "what are
                        my addresses?", and every row in it is a thing to copy
                        and hand to somebody else. Opening the page is what the
                        row itself already does, and the editor is reached from
                        the nav — a pair of buttons on top of three addresses
                        made the one question it answers harder to read.
                      */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (hasOnePageSetup) {
                            openExternal(publicOnePageUrl || navOnePageUrl)
                          } else {
                            router.push("/app/onepage")
                          }
                          setIsProfileAccessOpen(false)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            if (hasOnePageSetup) {
                              openExternal(publicOnePageUrl || navOnePageUrl)
                            } else {
                              router.push("/app/onepage")
                            }
                            setIsProfileAccessOpen(false)
                          }
                        }}
                        className="w-full text-left rounded-xl p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]"><span className="w-5 h-5 rounded-full bg-[#8b5cf6] flex items-center justify-center"><ChainLinkIcon className="w-2.5 h-2.5" stroke="#ffffff" /></span>OnePage</div>
                        <div className="mt-1 flex items-center justify-between gap-2"><p className="text-[11px] text-[#6b7280] truncate">{hasOnePageSetup ? publicOnePageUrl : "Set up your OnePage to create a link"}</p><button type="button" onClick={(e) => { e.stopPropagation(); if (hasOnePageSetup) { copyQuickAccessUrl("onepage") } else { router.push("/app/onepage"); setIsProfileAccessOpen(false) } }} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all ${hasOnePageSetup ? (copiedTarget === "onepage" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e5e7eb] text-[#6b7280] bg-white") : "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]"}`}>{hasOnePageSetup ? (copiedTarget === "onepage" ? <Check className="h-3 w-3" /> : <CopyLinkIcon className="h-3 w-3" />) : <ArrowRight className="h-3 w-3" />}{hasOnePageSetup ? (copiedTarget === "onepage" ? "Copied" : "Copy") : "Set up"}</button></div>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          openExternal(publicStoreUrl || navStoreUrl)
                          setIsProfileAccessOpen(false)
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { openExternal(publicStoreUrl || navStoreUrl); setIsProfileAccessOpen(false) } }}
                        className="w-full text-left rounded-xl p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]"><span className="w-5 h-5 rounded-full bg-black flex items-center justify-center overflow-hidden"><img src={STORELIB_LOGO} alt="Storelib" width={14} height={14} className="w-3.5 h-3.5 object-contain" loading="eager" decoding="async" /></span>Creator page</div>
                        <div className="mt-1 flex items-center justify-between gap-2"><p className="text-[11px] text-[#6b7280] truncate">{publicStoreUrl}</p><button type="button" onClick={(e) => { e.stopPropagation(); copyQuickAccessUrl("store") }} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all ${copiedTarget === "store" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e5e7eb] text-[#6b7280] bg-white"}`}>{copiedTarget === "store" ? <Check className="h-3 w-3" /> : <CopyLinkIcon className="h-3 w-3" />}{copiedTarget === "store" ? "Copied" : "Copy"}</button></div>
                      </div>
                      {/*
                        THE THIRD SURFACE, WHICH WAS NEVER LISTED.

                        Quick access held the creator page and the OnePage and
                        stopped, so the one address a creator is most likely to
                        be asked for by somebody else was the one they could
                        not find. It appears only when a site has actually been
                        PUBLISHED: every account is seeded with theme installs
                        on first visit, so listing it on existence would hand
                        people a link to a page nobody has made.
                      */}
                      {publicWebsiteUrl && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            openExternal(publicWebsiteUrl)
                            setIsProfileAccessOpen(false)
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { openExternal(publicWebsiteUrl); setIsProfileAccessOpen(false) } }}
                          className="w-full text-left rounded-xl p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]"><span className="w-5 h-5 rounded-full bg-[#1a1a2e] flex items-center justify-center"><MonitorSmartphone className="w-2.5 h-2.5 text-white" /></span>Website</div>
                          <div className="mt-1 flex items-center justify-between gap-2"><p className="text-[11px] text-[#6b7280] truncate">{publicWebsiteUrl.replace(/^https?:\/\//, "")}</p><button type="button" onClick={(e) => { e.stopPropagation(); copyQuickAccessUrl("website") }} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all ${copiedTarget === "website" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e5e7eb] text-[#6b7280] bg-white"}`}>{copiedTarget === "website" ? <Check className="h-3 w-3" /> : <CopyLinkIcon className="h-3 w-3" />}{copiedTarget === "website" ? "Copied" : "Copy"}</button></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-[14px] text-[#6b7280] mt-1">{t("dashboard.subtitle")}</p>
          </div>

          {/* Desktop: Timeframe Dropdown + Live Indicator */}
          <div className="hidden md:flex items-center gap-3">
            <div className="relative timeframe-dropdown">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
              >
                {selectedOption?.label || "Last 7 days"}
                <ChevronDown
                  className={`h-4 w-4 text-[#9ca3af] transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                  {timeframeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setTimeframe(option.value)
                        setIsDropdownOpen(false)
                      }}
                      className={`w-full text-left px-4 py-2 text-[13px] font-medium transition-colors ${
                        timeframe === option.value
                          ? "bg-[#f5f3ff] text-[#8b5cf6]"
                          : "text-[#374151] hover:bg-[#f9fafb]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Live Indicator Pill - Desktop */}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[#f3f4f6] rounded-lg">
              <div
                className={`w-2 h-2 rounded-full ${
                  liveVisitors > 0
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                    : "bg-gray-400"
                }`}
                style={{
                  animation: liveVisitors > 0 ? "pulse-glow 2s ease-in-out infinite" : "none",
                }}
              />
              <span className={`text-[13px] font-medium ${liveVisitors > 0 ? "text-emerald-600" : "text-gray-500"}`}>
                {liveVisitors} {t("dashboard.liveVisitors")}
              </span>
            </div>
          </div>

          {/* Mobile: Live Indicator + Timeframe Button */}
          <div className="md:hidden flex items-center gap-2">
            {/* Live Indicator Pill - Mobile */}
            <div className="flex items-center gap-1.5 px-2.5 py-2 bg-[#f3f4f6] rounded-xl h-[38px]">
              <div
                className={`w-2 h-2 rounded-full ${
                  liveVisitors > 0
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                    : "bg-gray-400"
                }`}
                style={{
                  animation: liveVisitors > 0 ? "pulse-glow 2s ease-in-out infinite" : "none",
                }}
              />
              <span className={`text-[12px] font-medium ${liveVisitors > 0 ? "text-emerald-600" : "text-gray-500"}`}>
                {liveVisitors} {t("dashboard.liveVisitors")}
              </span>
            </div>
            <button
              onClick={() => setIsMobileSheetOpen(true)}
              className="w-fit inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] shadow-[0_1px_2px_rgba(0,0,0,0.03)] h-[38px]"
            >
              {selectedOption?.label || "Last 7 days"}
              <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
            </button>
          </div>
        </div>

        {/* Stats Cards + Chart Section */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8 overflow-hidden">
          {/* KPI Metric Tabs - horizontally scrollable on mobile */}
          <div className="relative flex overflow-x-auto scrollbar-hide md:grid md:grid-cols-4 divide-x divide-[#e5e7eb]/60" style={{
              /*
                BOTH AXES. This was `pan-x`, which does not mean "prefer
                horizontal" — it means vertical panning is not allowed here at
                all. So a thumb that landed on Views or Revenue and pulled down
                could not scroll the page, and the row looked frozen. With both
                named, the browser decides from the gesture: sideways scrolls
                the row, down scrolls the page.
              */
              touchAction: 'pan-x pan-y',
              WebkitOverflowScrolling: 'touch',
            }}>
            {/* Views */}
            <button
              className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                openKPIModal === "views" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
              }`}
              onClick={() => { setOpenKPIModal("views"); setChartExpanded(true) }}
            >
              {openKPIModal === "views" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
              <span className={`text-[11px] sm:text-[12px] font-medium ${openKPIModal === "views" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("dashboard.views")}</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-[filter,color,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{formatCompactNumber(displayAnalytics.periodViews)}</span>
                <PercentChangeIndicator current={displayAnalytics.periodViews} previous={displayAnalytics.prevPeriodViews} />
              </div>
              <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-[filter,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{formatCompactNumber(displayAnalytics.totalViews)} {t("dashboard.allTime")}</p>
            </button>

            {/* Revenue */}
            <button
              className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                openKPIModal === "revenue" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
              }`}
              onClick={() => { setOpenKPIModal("revenue"); setChartExpanded(true) }}
            >
              {openKPIModal === "revenue" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
              <span className={`text-[11px] sm:text-[12px] font-medium ${openKPIModal === "revenue" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("dashboard.revenue")}</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-[filter,color,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{formatCurrency(displayAnalytics.periodRevenue)}</span>
                <PercentChangeIndicator current={displayAnalytics.periodRevenue} previous={displayAnalytics.prevPeriodRevenue} />
              </div>
              <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-[filter,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{formatCurrency(displayAnalytics.totalRevenue)} {t("dashboard.allTime")}</p>
            </button>

            {/* Orders */}
            <button
              className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                openKPIModal === "orders" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
              }`}
              onClick={() => { setOpenKPIModal("orders"); setChartExpanded(true) }}
            >
              {openKPIModal === "orders" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
              <span className={`text-[11px] sm:text-[12px] font-medium ${openKPIModal === "orders" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("dashboard.orders")}</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-[filter,color,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{formatCompactNumber(displayAnalytics.periodOrders)}</span>
                <PercentChangeIndicator current={displayAnalytics.periodOrders} previous={displayAnalytics.prevPeriodOrders} />
              </div>
              <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-[filter,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{formatCompactNumber(displayAnalytics.totalOrders)} {t("dashboard.allTime")}</p>
            </button>

            {/* Conversion Rate - clickable */}
            <button
              className={`text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-200 cursor-pointer relative flex-shrink-0 min-w-[130px] md:min-w-0 ${
                openKPIModal === "conversion" ? "md:bg-[#f9fafb]" : "hover:bg-[#fafafa]"
              }`}
              onClick={() => { setOpenKPIModal("conversion"); setChartExpanded(true) }}
            >
              {openKPIModal === "conversion" && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#d1d5db]" />}
              <span className={`text-[11px] sm:text-[12px] font-medium ${openKPIModal === "conversion" ? "text-[#374151]" : "text-[#6b7280]"}`}>{t("dashboard.conversionRate")}</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className={`text-[18px] sm:text-[22px] font-semibold tracking-tight transition-[filter,color,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${showSampleData && !hasRealData ? "text-[#1a1a2e]/50" : "text-[#1a1a2e]"} ${isRefreshing ? "blur-[2px]" : "blur-0"}`}>{Math.round(displayAnalytics.conversionRate)}%</span>
                <PercentChangeIndicator current={displayAnalytics.conversionRate} previous={displayAnalytics.prevConversionRate} />
              </div>
              <p className={`text-[10px] sm:text-[11px] text-[#9ca3af] whitespace-nowrap transition-[filter,opacity] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${isRefreshing ? "blur-[1px]" : "blur-0"}`}>{t("dashboard.viewsToOrders")}</p>
            </button>

            {/* Toggle arrow - sticky right on mobile, positioned in conversion rate area on desktop */}
            <div className="sticky right-0 flex items-center md:absolute md:right-2 md:top-2 z-10 bg-white md:bg-transparent pl-1 pr-2 md:p-0">
              <button
                onClick={(e) => { e.stopPropagation(); setChartExpanded(!chartExpanded) }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f3f4f6] md:bg-transparent hover:bg-[#e5e7eb] md:hover:bg-[#f3f4f6] transition-colors shrink-0"
                title={chartExpanded ? "Hide chart" : "Show chart"}
              >
                {chartExpanded ? (
                  <ChevronUp className="h-4 w-4 text-[#6b7280]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[#6b7280]" />
                )}
              </button>
            </div>
          </div>

          {/* Shared Chart Area - smooth line chart, toggleable */}
          <div className={`overflow-hidden transition-all duration-500 ease-out ${chartExpanded && openKPIModal ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"}`}>
            <div className="border-t border-[#e5e7eb]/60 px-2 py-3 sm:px-4 sm:py-4">
              {isChartLoading && displayChartData.length === 0 ? (
                <div className="h-[200px] flex items-end gap-1.5 px-6 pb-6 pt-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-gray-100 to-gray-50 rounded-t animate-pulse"
                      style={{ height: `${25 + ((i * 37) % 60)}%`, animationDelay: `${i * 80}ms` }}
                    />
                  ))}
                </div>
              ) : (
                <div className="relative">
                  {/*
                    NO BLUR WHEN THE METRIC CHANGES.

                    This used to drop to 30% opacity with a 2px blur for as
                    long as `isChartLoading` was true, over 500ms each way.
                    Tapping Revenue therefore played three things at once: the
                    chart blurring out, the chart blurring back in, and the
                    line re-drawing itself. That is the pumping and the double
                    loading — one tap, three animations, none of which was
                    telling you anything you did not already know.

                    A first load with no data at all still gets the skeleton
                    above; it is the only moment there is genuinely nothing to
                    look at. From then on the old line simply becomes the new
                    one, which is what recharts does well and what the eye
                    reads as a change rather than a reload.

                    The sample-data dimming stays, because that is not a
                    loading state — it says these numbers are not yours.
                  */}
                  <div className={`transition-opacity duration-300 ease-out ${showSampleData && !hasRealData ? "opacity-50" : "opacity-100"}`}>
                  <ChartWithLongPressTooltip displayChartData={displayChartData} openKPIModal={openKPIModal} t={t} />
                  </div>
                  {!hasRealData && (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                      <span className="text-[11px] text-[#c8ccd4]">
                        {showSampleData ? "Sample data" : "No activity yet"}
                      </span>
                      <button
                        onClick={() => setShowSampleData(prev => !prev)}
                        className={`relative inline-flex h-4 w-7 rounded-full transition-colors cursor-pointer ${showSampleData ? "bg-indigo-300/80" : "bg-[#e9ecef]"}`}
                        aria-label={showSampleData ? "Hide sample data" : "Show sample data"}
                      >
                        <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm my-0.5 transition-transform ${showSampleData ? "translate-x-3.5" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Banner — content changes based on subscription plan */}
        <div className="mb-8">
          <div className="relative overflow-hidden rounded-2xl">
            {/*
              `sizes`, because without it next/image builds its srcset from
              the `width` prop and a phone downloads the 1200px candidate —
              2400 on a 3x screen — for a box about 358px wide. That is a
              megapixel and a half decoded on the main thread for a banner
              a third of that. The number is what the box really is: the
              content column, which is the viewport under `sm` and 640px of
              it above.
            */}
            <Image
              src="https://images.unsplash.com/photo-1541367777708-7905fe3296c0?w=1200&h=300&fit=crop"
              alt=""
              width={1200}
              height={300}
              sizes="(max-width: 640px) 100vw, 640px"
              priority
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
            <div className="relative z-10 px-5 py-5 sm:px-8 sm:py-6">
              {subscriptionPlanId === "growth" || subscriptionPlanId === "pro" ? (
                /* Growth / Pro plan banner */
                <>
                  <p className="text-[16px] sm:text-[20px] font-medium text-white mb-1">Track what&apos;s working in real time</p>
                  <p className="text-[13px] sm:text-[14px] text-white/80 mb-3 sm:mb-4">Use your dashboard to optimize for more sales.</p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Link
                      href="/app/analytics"
                      className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg text-[12px] sm:text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      View analytics
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] sm:text-[15px] font-semibold text-white">Unlock Growth features</span>
                  </div>
                  <p className="text-[14px] sm:text-[16px] text-white/90 mb-3 sm:mb-4">Scale faster with advanced tools, higher limits, and lower fees.</p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Link
                      href="/app/settings/billing/upgrade"
                      className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg text-[12px] sm:text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors"
                    >
                      Upgrade
                    </Link>
                    <button
                      onClick={() => {
                        if (isNativeApp()) {
                          openExternal("https://storelib.com/features")
                        } else {
                          window.open("/features", "_blank", "noopener,noreferrer")
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-[12px] sm:text-[13px] font-medium text-white hover:bg-white/20 transition-colors cursor-pointer"
                    >
                      Features
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Grid - Store Setup + Quick Actions */}
        <div className="grid gap-6 lg:grid-cols-[370px_1fr]">
          {/* Left Column - Store Setup Checklist */}
          <div id="store-setup-section" className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{t("dashboard.storeSetup")}</h2>
                <span className="text-[13px] font-medium text-[#6b7280] bg-[#f3f4f6] px-2.5 py-1 rounded-full">
                  {completedSteps}/{totalSteps}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#f3f4f6] rounded-full mb-5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa] rounded-full transition-all duration-500"
                  style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                />
              </div>

              {/* Steps List with Collapsible Substeps */}
              <div className="space-y-1">
                {initialSetupSteps.map((step) => {
                  const Icon = stepIcons[step.id] || Package
                  const isExpanded = expandedStep === step.id
                  const substeps = stepSubsteps[step.id] || []
                  const substepData = getSubstepData(step)

                  return (
                    <div key={step.id}>
                      <button
                        onClick={(e) => handleStepClick(step.id, e)}
                        className="group relative flex items-center gap-3 p-3 rounded-xl hover:bg-[#f9fafb] transition-all duration-150 w-full text-left"
                      >
                        {/* Checkmark or Progress circle */}
                        <div className="relative shrink-0">
                          {step.completed ? (
                            <div className="w-8 h-8 rounded-full bg-[#8b5cf6] flex items-center justify-center">
                              <Check className="h-4 w-4 text-white" strokeWidth={2.5} />
                            </div>
                          ) : (
                            <div className="relative">
                              <ProgressCircle progress={0} size={32} />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Icon className="h-3.5 w-3.5 text-[#9ca3af]" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-[13px] font-medium text-[#1a1a2e]`}
                          >
                            {step.title}
                          </p>
                          <p className="text-[11px] text-[#9ca3af] mt-0.5 truncate">{step.description}</p>
                        </div>

                        {/* Expand/Collapse Arrow */}
                        <ChevronDown
                          className={`h-4 w-4 text-[#d1d5db] shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        />

                        {/* Tooltip on hover - hidden on mobile, wider on desktop */}
                        <div className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                          <div className="bg-[#1a1a2e] text-white text-[12px] px-4 py-2.5 rounded-xl shadow-lg w-[220px] whitespace-normal leading-relaxed">
                            {step.tooltip}
                            <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-4 border-transparent border-r-[#1a1a2e]" />
                          </div>
                        </div>
                      </button>

                      {/* Collapsible Substeps */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-out ${
                          isExpanded ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
                        }`}
                      >
                        <div className="pl-11 pr-3 pb-2 space-y-1">
                          {substeps.map((substep, idx) => {
                            const isSubstepComplete = substep.check(substepData)
                            return (
                              <Link
                                key={idx}
                                href={substep.href}
                                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[#f5f3ff]/50 transition-colors"
                              >
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  isSubstepComplete
                                    ? "bg-[#8b5cf6] border-[#8b5cf6]"
                                    : "border-[#d1d5db]"
                                }`}>
                                  {isSubstepComplete && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                </div>
                                <span className={`text-[12px] ${
                                  isSubstepComplete ? "text-[#1a1a2e]" : "text-[#6b7280]"
                                }`}>
                                  {t(substep.labelKey as any)}
                                </span>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

          {/* Right Column - Quick Actions */}
          <div className="space-y-4">
            {/* Add a product card */}
            <Link
              href="/app/products/new"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl overflow-hidden shrink-0">
                <Image src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/iiii.png" alt="Create product" width={128} height={128} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    {t("dashboard.createProduct")}
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">{t("dashboard.createProductDesc")}</p>
              </div>
            </Link>

            {/* Market your products card */}
            <Link
              href="/app/onepage"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl overflow-hidden shrink-0">
                <Image src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/ooaw.png" alt="Edit OnePage" width={128} height={128} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    {t("dashboard.editOnePage")}
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">{t("dashboard.editOnePageDesc")}</p>
              </div>
            </Link>

            {/* View analytics card */}
            <Link
              href="/app/analytics"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl overflow-hidden shrink-0">
                <Image src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/naaly.png" alt="View analytics" width={128} height={128} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    {t("dashboard.viewAnalytics")}
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">{t("dashboard.viewAnalyticsDesc")}</p>
              </div>
            </Link>

            {/* Add Custom Domain card */}
            <Link
              href="/app/settings?tab=domains"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl overflow-hidden shrink-0">
                <Image src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/domani.png" alt="Add domain" width={128} height={128} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    Add Custom Domain
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">Connect your own domain to your store</p>
              </div>
            </Link>
          </div>
        </div>

        </>
        )}
      </div>

      {/* Dashboard Scrollbar Styles */}
      <style jsx>{`
        @keyframes laser-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes pulse-glow {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
          }
          50% {
            opacity: 0.7;
            box-shadow: 0 0 12px rgba(16, 185, 129, 0.8);
          }
        }
        @keyframes skeleton-shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        .skeleton-bar {
          background: linear-gradient(90deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.4) 50%, rgba(139, 92, 246, 0.2) 100%);
          background-size: 200% 100%;
          animation: skeleton-shimmer 2s ease-in-out infinite, skeleton-pulse 2.5s ease-in-out infinite;
        }
        .dashboard-scroll-container {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
        }
        .dashboard-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .dashboard-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .dashboard-scroll-container::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 3px;
        }
        .dashboard-scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: rgba(156, 163, 175, 0.7);
        }
        @media (max-width: 768px) {
          .dashboard-scroll-container::-webkit-scrollbar {
            display: none;
          }
          .dashboard-scroll-container {
            scrollbar-width: none;
          }
        }
      `}</style>
        </div>{/* end content translateY wrapper */}
      </div>{/* end below-the-bar area that hosts the pull indicator */}

      {/* Bottom sheets rendered OUTSIDE transform wrapper — iOS position:fixed requires no ancestor transform */}
      <TimeframeBottomSheet
        isOpen={isMobileSheetOpen}
        onClose={() => setIsMobileSheetOpen(false)}
        options={timeframeOptions}
        selectedValue={timeframe}
        onSelect={setTimeframe}
        t={t}
      />
      <QuickAccessBottomSheet
        isOpen={isQuickAccessMobileOpen}
        onClose={() => setIsQuickAccessMobileOpen(false)}
        onePageUrl={hasOnePageSetup ? publicOnePageUrl : "Set up your OnePage to create a link"}
        storeUrl={publicStoreUrl}
        navOnePageUrl={hasOnePageSetup ? navOnePageUrl : undefined}
        navStoreUrl={navStoreUrl}
        isOnePageCopied={copiedTarget === "onepage"}
        isStoreCopied={copiedTarget === "store"}
        onCopyOnePage={() => copyQuickAccessUrl("onepage")}
        onCopyStore={() => copyQuickAccessUrl("store")}
        isOnePageReady={hasOnePageSetup}
        onSetupOnePage={() => router.push("/app/onepage")}
      />
    </div>
  )
}
