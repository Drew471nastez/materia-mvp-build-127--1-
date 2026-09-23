"use client"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ONE WAY TO READ A CHART, ON EVERY CHART
 * ═══════════════════════════════════════════════════════════════════════════
 * The Analytics chart at the top of the page had the interaction worked out
 * the hard way (components/app/analytics-chart.tsx has the history): the
 * report cards under it had a plainer one, so the two halves of one page
 * answered a finger differently. This is that interaction, for any chart.
 *
 * WITH A MOUSE the readout follows the pointer and glides between points.
 *
 * WITH A FINGER nothing is taken from the page until the gesture says so:
 *   - a sideways drag scrubs the chart, and the page stays put;
 *   - a hold of 100ms scrubs it too, for a thumb that means to read a point;
 *   - a drag that goes down the screen first is a scroll, and the chart lets
 *     go of it, even after a hold, so a slow thumb is never trapped;
 *   - each new point under the finger is a light tick, the first one a
 *     firmer one, the same haptics as the chart above.
 * Nothing cancels a touchstart, so the browser can always still scroll.
 */

import * as React from "react"
import { hapticTap } from "@/lib/native-bridge"

const SLOP_X = 8
const SLOP_Y = 12
const HOLD_MS = 100

export interface ChartScrub<E extends HTMLElement> {
  ref: React.RefObject<E | null>
  /** The point under the pointer or finger, or null. */
  index: number | null
  /** How it got there: a glide for the mouse, a cut under a finger. */
  input: "mouse" | "touch" | null
  onPointerMove: (e: React.PointerEvent) => void
  onPointerLeave: (e: React.PointerEvent) => void
}

/**
 * `indexAt` turns a clientX into the point it is nearest, or null when it is
 * outside the plot. It is read on every move, so it can change with the
 * chart's size.
 */
export function useChartScrub<E extends HTMLElement>(indexAt: (clientX: number) => number | null): ChartScrub<E> {
  const ref = React.useRef<E | null>(null)
  const [index, setIndex] = React.useState<number | null>(null)
  const [input, setInput] = React.useState<"mouse" | "touch" | null>(null)
  const indexAtRef = React.useRef(indexAt)
  indexAtRef.current = indexAt

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { x: number; y: number } | null = null
    let lastX = 0
    let lock: "horizontal" | "vertical" | null = null
    let scrubbing = false
    let moved = false
    let lastIndex: number | null = null
    let hold: ReturnType<typeof setTimeout> | null = null
    let frame = 0

    const show = (clientX: number, strong: boolean) => {
      const i = indexAtRef.current(clientX)
      if (i !== lastIndex) {
        lastIndex = i
        if (i !== null) hapticTap(strong ? "medium" : "light")
      }
      setIndex(i)
      setInput("touch")
    }
    const release = () => {
      if (hold) clearTimeout(hold)
      hold = null
      cancelAnimationFrame(frame)
      start = null
      lock = null
      scrubbing = false
      lastIndex = null
      setIndex(null)
      setInput(null)
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return release()
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY }
      lastX = t.clientX
      lock = null
      moved = false
      hold = setTimeout(() => {
        if (lock === "vertical") return
        lock = "horizontal"
        scrubbing = true
        show(lastX, true)
      }, HOLD_MS)
    }

    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      lastX = t.clientX
      const dx = Math.abs(t.clientX - start.x)
      const dy = Math.abs(t.clientY - start.y)
      if (dx > SLOP_X) moved = true

      if (scrubbing) {
        /* A hold that turns into a scroll is a scroll. */
        if (!moved && dy > SLOP_Y) {
          lock = "vertical"
          scrubbing = false
          lastIndex = null
          setIndex(null)
          setInput(null)
          return
        }
        if (e.cancelable) e.preventDefault()
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => show(lastX, false))
        return
      }

      if (lock === null && (dx > SLOP_X || dy > SLOP_Y)) {
        if (dx > dy) {
          lock = "horizontal"
          if (hold) clearTimeout(hold)
          scrubbing = true
          if (e.cancelable) e.preventDefault()
          show(t.clientX, true)
        } else if (dy > dx * 1.4) {
          lock = "vertical"
          if (hold) clearTimeout(hold)
        }
      }
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", release, { passive: true })
    el.addEventListener("touchcancel", release, { passive: true })
    return () => {
      release()
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", release)
      el.removeEventListener("touchcancel", release)
    }
  }, [])

  const onPointerMove = React.useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return
    setIndex(indexAtRef.current(e.clientX))
    setInput("mouse")
  }, [])
  const onPointerLeave = React.useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return
    setIndex(null)
    setInput(null)
  }, [])

  return { ref, index, input, onPointerMove, onPointerLeave }
}
