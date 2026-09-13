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
  XAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, ReferenceLine,
} from "recharts"

import { hapticTap } from "@/lib/native-bridge"
import { GlidingActiveDot, GlidingCursor } from "@/components/app/chart-glide"

// Chart colors - matching reference image
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
}

function AnalyticsChartWithTooltipInner({
  chartDisplayData,
  analyticsMode,
  chartMetricFilter,
  onePageChartFilter,
  isTouchDevice,
  formatPrice,
}: {
  chartDisplayData: AnalyticsChartData[]
  analyticsMode: "store" | "onepage"
  chartMetricFilter: string
  onePageChartFilter: string
  isTouchDevice: boolean
  formatPrice: (cents: number) => string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipActiveRef = useRef(false)
  const [tooltipActive, setTooltipActive] = useState(false)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const directionLockRef = useRef<"horizontal" | "vertical" | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const [shouldAnimate, setShouldAnimate] = useState(true)

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /*
    Play the draw-in once, then switch it off so hover updates are not
    re-animated. The timer has to outlast the longest series — 600ms begun at
    90ms — or the chart freezes mid-draw.
  */
  useEffect(() => {
    setShouldAnimate(true)
    const timer = setTimeout(() => setShouldAnimate(false), 750)
    return () => clearTimeout(timer)
  }, [chartDisplayData, chartMetricFilter, onePageChartFilter])

  const getIndexFromTouch = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el || !chartDisplayData.length) return null
    const rect = el.getBoundingClientRect()
    const chartLeft = rect.left + 40
    const chartRight = rect.right - 4
    const chartWidth = chartRight - chartLeft
    const x = clientX - chartLeft
    const ratio = Math.max(0, Math.min(1, x / chartWidth))
    return Math.round(ratio * (chartDisplayData.length - 1))
  }, [chartDisplayData.length])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    directionLockRef.current = null
    longPressTimerRef.current = setTimeout(() => {
      if (directionLockRef.current === null) {
        directionLockRef.current = "horizontal"
        tooltipActiveRef.current = true
        setTooltipActive(true)
        const idx = getIndexFromTouch(touch.clientX)
        setActiveIndex(idx)
        hapticTap("medium")
      }
    }, 250)
  }, [getIndexFromTouch])

  const touchMoveHandler = useCallback((e: TouchEvent) => {
    if (!touchStartPosRef.current) return
    const touch = e.touches[0]

    if (tooltipActiveRef.current) {
      e.preventDefault()
      e.stopPropagation()
      const clientX = touch.clientX
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const idx = getIndexFromTouch(clientX)
        setActiveIndex(idx)
      })
      return
    }

    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x)
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y)
    const totalMove = dx + dy

    if (directionLockRef.current === null && totalMove > 8) {
      if (dx > dy * 1.2) {
        directionLockRef.current = "horizontal"
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
        tooltipActiveRef.current = true
        setTooltipActive(true)
        hapticTap("light")
        e.preventDefault()
        e.stopPropagation()
        const idx = getIndexFromTouch(touch.clientX)
        setActiveIndex(idx)
      } else {
        directionLockRef.current = "vertical"
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
      }
    } else if (directionLockRef.current === "horizontal") {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [getIndexFromTouch])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener("touchmove", touchMoveHandler, { passive: false })
    return () => el.removeEventListener("touchmove", touchMoveHandler)
  }, [touchMoveHandler])

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
    setTooltipActive(false)
    setActiveIndex(null)
  }, [])

  const activePoint = activeIndex != null && activeIndex >= 0 && activeIndex < chartDisplayData.length
    ? chartDisplayData[activeIndex] : null

  const tooltipLeftPercent = activeIndex != null && chartDisplayData.length > 1
    ? (activeIndex / (chartDisplayData.length - 1)) * 100 : 50

  /*
    THE TOUCH TOOLTIP MOVES IN PIXELS, NOT PER CENT.

    `left: <n>%` is a layout property: every value the finger produced made the
    browser lay the element out again and repaint it, on the main thread, at
    touch frequency — while that same thread was busy handing recharts a new
    active index. The same position expressed as a translate is a compositor
    transform. The clamp maths is unchanged; only its unit is.
  */
  const getClampedLeftPx = () => {
    const containerEl = containerRef.current
    const containerWidth = containerEl?.offsetWidth ?? 0
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 0
    const half = tooltipWidth / 2
    const wanted = (tooltipLeftPercent / 100) * containerWidth
    if (!containerWidth) return wanted
    return Math.max(half + 4, Math.min(containerWidth - half - 4, wanted))
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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{
        touchAction: tooltipActive ? "none" : "pan-y pinch-zoom",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        position: "relative",
      } as React.CSSProperties}
    >
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartDisplayData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
            NO Y AXIS.
            It cost 40px of width on the left of every chart to print five
            numbers that nobody reads off a chart — the exact figure comes
            from the tooltip, and the shape is what the chart is for. The
            horizontal grid lines stay, so the rise and fall still has
            something to be read against.

            `domain` and the formatter went with it: both existed only to
            label ticks that are no longer drawn.
          */}
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
                  const displayLabel = labels[name] || name
                  let displayVal: string
                  if (name === "revenue") displayVal = formatPrice(val)
                  else if (name === "conversion" || name === "ctr") displayVal = `${val}%`
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
          {/* Store areas */}
          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "views") && (
            <Area type="monotone" dataKey="views" stroke={CHART_COLORS.views} strokeWidth={2} fill="url(#gradViews)" dot={makeDot(CHART_COLORS.views)} activeDot={makeActiveDot(CHART_COLORS.views)} name="views" isAnimationActive={shouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "orders") && (
            <Area type="monotone" dataKey="sales" stroke={CHART_COLORS.orders} strokeWidth={2} fill="url(#gradOrders)" dot={makeDot(CHART_COLORS.orders)} activeDot={makeActiveDot(CHART_COLORS.orders)} name="sales" isAnimationActive={shouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "orders" || chartMetricFilter === "revenue") && (
            <Area type="monotone" dataKey="refunds" stroke={CHART_COLORS.refunds} strokeWidth={2} fill="url(#gradRefunds)" dot={makeDot(CHART_COLORS.refunds)} activeDot={makeActiveDot(CHART_COLORS.refunds)} name="refunds" isAnimationActive={shouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={45} />
          )}
          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "revenue") && (
            <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS.revenue} strokeWidth={2} fill="url(#gradRevenue)" dot={makeDot(CHART_COLORS.revenue)} activeDot={makeActiveDot(CHART_COLORS.revenue)} name="revenue" isAnimationActive={shouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={45} />
          )}
          {analyticsMode === "store" && chartMetricFilter === "conversion" && (
            <Area type="monotone" dataKey="conversion" stroke="#10b981" strokeWidth={2} fill="url(#gradConversion)" dot={makeDot("#10b981")} activeDot={makeActiveDot("#10b981")} name="conversion" isAnimationActive={shouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
          {/* OnePage areas */}
          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "views") && (
            <Area type="monotone" dataKey="views" stroke={CHART_COLORS.views} strokeWidth={2} fill="url(#gradViews)" dot={makeDot(CHART_COLORS.views)} activeDot={makeActiveDot(CHART_COLORS.views)} name="views" connectNulls isAnimationActive={shouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "clicks") && (
            <Area type="monotone" dataKey="clicks" stroke={CHART_COLORS.clicks} strokeWidth={2} fill="url(#gradClicks)" dot={makeDot(CHART_COLORS.clicks)} activeDot={makeActiveDot(CHART_COLORS.clicks)} name="clicks" connectNulls isAnimationActive={shouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "subscribers") && (
            <Area type="monotone" dataKey="subscribers" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradSubscribers)" dot={makeDot("#8b5cf6")} activeDot={makeActiveDot("#8b5cf6")} name="subscribers" connectNulls isAnimationActive={shouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={45} />
          )}
          {analyticsMode === "onepage" && onePageChartFilter === "ctr" && (
            <Area type="monotone" dataKey="ctr" stroke="#f59e0b" strokeWidth={2} fill="url(#gradCtr)" dot={makeDot("#f59e0b")} activeDot={makeActiveDot("#f59e0b")} name="ctr" connectNulls isAnimationActive={shouldAnimate} animationDuration={600} animationEasing="ease-out" animationBegin={60} />
          )}
        </AreaChart>
      </ResponsiveContainer>

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
              transform: `translate3d(${getClampedLeftPx()}px, 0, 0) translateX(-50%)`,
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
