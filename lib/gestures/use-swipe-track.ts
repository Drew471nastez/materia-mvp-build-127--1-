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
 * the picture is attached to the finger, and the release decides.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  WHY IT IS NOT REACT STATE, WHICH IS THE WHOLE OF "IT IS LAGGY"
 * ───────────────────────────────────────────────────────────────────────────
 * The first version of this kept the drag offset in `useState` and let the
 * caller put it in a `style` prop. That is one setState per touchmove, which
 * on a phone is one React render per frame of the gesture, of a component
 * holding every slide, every picture and every thumbnail. A finger produces
 * touchmove faster than the screen refreshes, so it was often more than one.
 * The strip moved by way of a render, a reconciliation and a commit, and it
 * arrived late and unevenly: the picture lagged behind the finger and the
 * motion stuttered.
 *
 * Nothing about a drag needs React. The offset is not state anybody renders
 * from, it is a number that belongs to one DOM node for the length of one
 * gesture. So it is written straight to that node's `transform` in the
 * touchmove handler, and React is not involved between the touch going down
 * and coming up. The only render in a whole swipe is the one that changes the
 * index, if the release commits to one.
 *
 * WRITTEN IN THE HANDLER AND NOT IN A requestAnimationFrame. Deferring the
 * write to the next frame is the usual advice and it is wrong here twice
 * over. Setting `transform` on one node invalidates style for that node and
 * nothing else — there is no read, so nothing is forced, and the browser
 * already coalesces the paint at the frame boundary. And rAF is not always
 * running: it is throttled in a background tab and it does not run at all in
 * some headless and reduced-motion conditions, and a drag that depends on it
 * freezes wherever that is true. The version of this that used rAF measured
 * the strip 12px along while the finger was 60px in.
 *
 * The hook owns the node's `transform` and `transition` outright, which is
 * what makes that possible: a `style` prop from the caller would be written
 * back over the top on the next render.
 *
 * WHAT ELSE IT HANDLES, each of which is a way the naive version feels wrong:
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
 *   VELOCITY IS MEASURED OVER THE END OF THE GESTURE, not over all of it. A
 *   slow drag that finishes with a flick is a flick; averaging from the first
 *   touch says it is slow and springs it back.
 *
 * It deliberately does NOT own the index. The gallery has thumbnails, arrows
 * and an autoplay timer that all move it too, so the caller keeps it and this
 * asks for the change.
 *
 * THE CALLER STILL HAS TO SET `touch-action: pan-y` on the frame. That is
 * what tells the browser the horizontal gesture belongs to this code and the
 * vertical one is still the page's scroll. Without it the browser spends the
 * start of every gesture deciding, and the first frames of the drag are lost.
 */
import * as React from "react"

/** Past this much of the width, a release changes slide rather than springing back. */
export const COMMIT_RATIO = 0.22
/** And a flick is a flick however short, if it is fast enough (px per ms). */
export const FLICK_VELOCITY = 0.4
/** Movement before the gesture decides whether it is a swipe or a scroll. */
const AXIS_LOCK_PX = 8
/** How long the strip takes to settle once the finger is off it. */
export const SNAP_MS = 300
/** Out fast, settle soft: the curve a released slide should carry. */
export const SNAP_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** Velocity is read over the last movements only, not the whole gesture. */
const VELOCITY_WINDOW_MS = 120

export interface SwipeTrack {
  /** True between the first touch and the release. */
  dragging: boolean
  /** Put this on the element whose width is one slide. */
  frameRef: React.RefObject<HTMLDivElement | null>
  /** Put this on the strip that moves. The hook writes its transform. */
  trackRef: React.RefObject<HTMLDivElement | null>
  /** Spread onto the frame. */
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
  animate = true,
}: {
  index: number
  count: number
  onIndexChange: (next: number) => void
  /** Off on a desktop, where the pointer is a mouse and the arrows are there. */
  enabled?: boolean
  /**
   * Whether a change of index should slide or cut. Adjacent is a slide;
   * a thumbnail several along would drag every picture in between across the
   * box, so the caller turns this off for those.
   */
  animate?: boolean
}): SwipeTrack {
  const [dragging, setDragging] = React.useState(false)
  const start = React.useRef<{ x: number; y: number; t: number } | null>(null)
  const axis = React.useRef<"undecided" | "x" | "y">("undecided")
  const width = React.useRef(1)
  const frameRef = React.useRef<HTMLDivElement | null>(null)
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const lastTravel = React.useRef(0)
  /** The live offset. Read by the release in the same tick it ends. */
  const dragRef = React.useRef(0)
  /** The last few samples, so a flick at the end is not averaged away. */
  const samples = React.useRef<Array<{ x: number; t: number }>>([])
  const pendingIndex = React.useRef(index)
  pendingIndex.current = index

  /** The one place that touches the node. */
  const paint = React.useCallback((offset: number, withTransition: boolean) => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = withTransition ? `transform ${SNAP_MS}ms ${SNAP_EASE}` : "none"
    el.style.transform = `translate3d(calc(${-pendingIndex.current * 100}% + ${offset}px), 0, 0)`
  }, [])

  /**
   * The resting position, written on every index change and on mount. A
   * layout effect rather than an effect: it runs before the browser paints,
   * so a slide changed by a thumbnail never shows one frame at the old place.
   */
  React.useLayoutEffect(() => {
    if (dragRef.current !== 0) return
    paint(0, animate)
  }, [index, animate, paint])

  const onTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || count < 2 || e.touches.length !== 1) return
      width.current = frameRef.current?.clientWidth || window.innerWidth || 1
      const t = performance.now()
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t }
      samples.current = [{ x: 0, t }]
      axis.current = "undecided"
      lastTravel.current = 0
      dragRef.current = 0
      /* Promoted for the length of the gesture only. Left on permanently it
         is a layer the compositor keeps for a picture nobody is touching. */
      if (trackRef.current) trackRef.current.style.willChange = "transform"
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
      dragRef.current = atEnd ? dx / 3 : dx
      const now = performance.now()
      samples.current.push({ x: dragRef.current, t: now })
      while (samples.current.length > 2 && now - samples.current[0].t > VELOCITY_WINDOW_MS) {
        samples.current.shift()
      }
      paint(dragRef.current, false)
    },
    [count, index, paint],
  )

  const onTouchEnd = React.useCallback(() => {
    const from = start.current
    start.current = null
    setDragging(false)
    const travelled = dragRef.current
    dragRef.current = 0
    if (trackRef.current) trackRef.current.style.willChange = ""

    if (!from || axis.current !== "x") {
      paint(0, false)
      return
    }

    /* Over the end of the gesture, not over all of it. */
    const first = samples.current[0]
    const last = samples.current[samples.current.length - 1]
    const elapsed = Math.max(1, (last?.t ?? performance.now()) - (first?.t ?? from.t))
    const velocity = Math.abs((last?.x ?? travelled) - (first?.x ?? 0)) / elapsed

    const past = Math.abs(travelled) > width.current * COMMIT_RATIO
    if (past || velocity > FLICK_VELOCITY) {
      const next = Math.max(0, Math.min(count - 1, index + (travelled < 0 ? 1 : -1)))
      if (next !== index) {
        /* Painted from here rather than waiting for the caller's render, so
           the slide starts moving in this frame whatever React does next. */
        pendingIndex.current = next
        paint(0, true)
        onIndexChange(next)
        return
      }
    }
    paint(0, true)
  }, [count, index, onIndexChange, paint])

  return {
    dragging,
    frameRef,
    trackRef,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    lastTravel,
  }
}
