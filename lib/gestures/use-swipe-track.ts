"use client"

/**
 * ===========================================================================
 *  A STRIP OF SLIDES THAT FOLLOWS A FINGER
 * ===========================================================================
 * Threshold swiping — watch the touch, and when it has travelled 50px change
 * the slide — is the thing that makes a gallery feel like a web page rather
 * than an app. Nothing moves while the finger moves, so there is no feedback
 * until the moment it jumps, and a slow drag of 40px does nothing at all with
 * no way to tell that it did nothing.
 *
 * This is the other kind: the strip is translated by the drag every frame, so
 * the picture is attached to the finger, and the release decides. It came out
 * of components/product/product-media-viewer, which had it and worked, and
 * lives here so the gallery underneath uses the SAME one rather than a second
 * implementation that drifts.
 *
 * WHAT IT HANDLES, each of which is a way the naive version feels wrong:
 *
 *   AXIS LOCK. One decision per gesture, on the first movement past 8px.
 *   Without it a mostly-vertical scroll drags the strip a few pixels sideways
 *   and springs back, and the page twitches while you are trying to read it.
 *
 *   RUBBER BAND. At the first and last slide the drag is divided by three, so
 *   the end of the strip feels like an end rather than like a broken drag.
 *
 *   A FLICK IS A FLICK. Past 22% of the width commits, and so does anything
 *   fast enough, however short. Requiring distance alone means a quick flick
 *   springs back, which reads as the gesture being ignored.
 *
 * It deliberately does NOT own the index. The gallery has thumbnails, arrows
 * and an autoplay timer that all move it too, so the caller keeps it and this
 * asks for the change.
 */
import * as React from "react"

/** Past this much of the width, a release changes slide rather than springing back. */
export const COMMIT_RATIO = 0.22
/** And a flick is a flick however short, if it is fast enough (px per ms). */
export const FLICK_VELOCITY = 0.4
/** Movement before the gesture decides whether it is a swipe or a scroll. */
const AXIS_LOCK_PX = 8

export interface SwipeTrack {
  /** Live drag offset in px. Zero when not dragging. */
  dragX: number
  /** True between the first touch and the release. */
  dragging: boolean
  /** Put this on the element whose width is one slide. */
  frameRef: React.RefObject<HTMLDivElement | null>
  /** Spread onto that same element. */
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: () => void
    onTouchCancel: () => void
  }
  /** How far the finger travelled on the last gesture, for callers that need
   *  to tell a tap from a swipe. */
  lastTravel: React.RefObject<number>
}

export function useSwipeTrack({
  index,
  count,
  onIndexChange,
  enabled = true,
}: {
  index: number
  count: number
  onIndexChange: (next: number) => void
  /** Off on a desktop, where the pointer is a mouse and the arrows are there. */
  enabled?: boolean
}): SwipeTrack {
  const [dragX, setDragX] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const start = React.useRef<{ x: number; y: number; t: number } | null>(null)
  const axis = React.useRef<"undecided" | "x" | "y">("undecided")
  const width = React.useRef(1)
  const frameRef = React.useRef<HTMLDivElement | null>(null)
  const lastTravel = React.useRef(0)
  /** The live value, because the release reads it in the same tick it ends. */
  const dragRef = React.useRef(0)

  const setDrag = React.useCallback((x: number) => {
    dragRef.current = x
    setDragX(x)
  }, [])

  const onTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || count < 2 || e.touches.length !== 1) return
      width.current = frameRef.current?.clientWidth || window.innerWidth || 1
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }
      axis.current = "undecided"
      lastTravel.current = 0
      setDragging(true)
    },
    [count, enabled],
  )

  const onTouchMove = React.useCallback(
    (e: React.TouchEvent) => {
      const from = start.current
      if (!from || e.touches.length !== 1) return
      const dx = e.touches[0].clientX - from.x
      const dy = e.touches[0].clientY - from.y
      lastTravel.current = Math.max(lastTravel.current, Math.abs(dx), Math.abs(dy))

      if (axis.current === "undecided") {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
      }
      if (axis.current !== "x") return

      const atEnd = (dx > 0 && index === 0) || (dx < 0 && index === count - 1)
      setDrag(atEnd ? dx / 3 : dx)
    },
    [count, index, setDrag],
  )

  const onTouchEnd = React.useCallback(() => {
    const from = start.current
    start.current = null
    setDragging(false)
    const travelled = dragRef.current
    if (!from || axis.current !== "x") {
      setDrag(0)
      return
    }
    const elapsed = Math.max(1, performance.now() - from.t)
    const velocity = Math.abs(travelled) / elapsed
    const past = Math.abs(travelled) > width.current * COMMIT_RATIO
    if (past || velocity > FLICK_VELOCITY) {
      const next = index + (travelled < 0 ? 1 : -1)
      onIndexChange(Math.max(0, Math.min(count - 1, next)))
    }
    setDrag(0)
  }, [count, index, onIndexChange, setDrag])

  return {
    dragX,
    dragging,
    frameRef,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    lastTravel,
  }
}
