"use client"

import { useCallback, useEffect, useRef } from "react"

import { hapticTap } from "@/lib/native-bridge"

export type PullPhase = "idle" | "pulling" | "ready" | "refreshing"

/**
 * ===========================================================================
 *  ONE SET OF NUMBERS FOR THE WHOLE GESTURE
 * ===========================================================================
 * The hook, the indicator, the dashboard and scripts/check-pull-refresh.mjs
 * all read these. The gap the page holds open and the gap the ring centres
 * itself in used to be two literals that happened to agree; a number measured
 * once and shared cannot drift.
 */
export const PULL_TO_REFRESH = {
  /**
   * The offset, in px, at which the ring is full and a release refreshes.
   *
   * WHY 48 AND NOT 60. The old curve was `dy * 0.45`, so 60px of offset took
   * 133px of finger. The rubber band below starts near 1:1 and gets heavier,
   * so the same 133px would have been far past the useful part of the curve.
   * 48 against this curve lands the trigger at 105px of finger travel, which
   * is where UIScrollView + UIRefreshControl put it (c = 0.55 against a
   * 844pt scroll view reaches its own 60pt trigger at 117px).
   */
  threshold: 48,
  /**
   * The limit the rubber band approaches and never reaches. Close to the old
   * maxPull of 90, so the page opens the same sort of gap at full stretch.
   */
  maxPull: 98,
  /**
   * How closely the offset follows the finger at the very start: the slope of
   * the curve at zero. 0.9 reads as "the page is under my finger" for the
   * first centimetre and then visibly loads up.
   *
   * UIScrollView uses 0.55 against the height of the scroll view. The shape is
   * the same either way; the pair that matters is (tension, maxPull), because
   * together they decide where the trigger falls. 0.55 against a 98px limit
   * would need 290px of finger to reach any sensible threshold, so the limit
   * is small and the tension is high instead of the other way round.
   */
  tension: 0.9,
  /** The gap held open while the refresh runs. */
  refreshHold: 34,
  /** The ring's diameter. */
  ringSize: 19,
  /**
   * The spinner is shown for at least this long. A cached refresh returns in
   * 20ms and a spinner that appears and vanishes inside one frame reads as a
   * glitch rather than as work.
   */
  minSpin: 450,
} as const

/**
 * UIScrollView's rubber band.
 *
 *   offset = (1 - 1 / (travel * c / d + 1)) * d
 *
 * Slope `c` at zero, asymptotic to `d`, monotonic in between. The finger can
 * always move it, and it can never move further than `d`, so there is no hard
 * stop to hit: the old `Math.min(dy * 0.45, maxPull)` simply stopped dead at
 * 90 and the page went rigid under a finger that was still moving.
 */
export function rubberBand(travel: number, limit: number, tension: number): number {
  if (travel <= 0) return 0
  return (1 - 1 / ((travel * tension) / limit + 1)) * limit
}

/**
 * The finger travel that produces a given offset: the inverse of the above.
 * Used by the probe to report where the threshold falls, and by nothing at
 * runtime.
 */
export function rubberBandInverse(offset: number, limit: number, tension: number): number {
  if (offset <= 0) return 0
  if (offset >= limit) return Infinity
  return (offset * limit) / (tension * (limit - offset))
}

/* ── The settle spring ─────────────────────────────────────────────────────
   Stepped in rAF, transform only. ζ = 24 / (2·√260) = 0.74, so it overshoots
   by about 3% of the travel (a pixel and a half off a 48px snap) and is still
   inside a tenth of a pixel after ~330ms. A single cubic ease cannot do that:
   it either arrives flat or it arrives early, and the eye reads both as the
   page being dragged back rather than letting go. */
const SPRING_STIFFNESS = 260
const SPRING_DAMPING = 24
/**
 * Below this the motion is over, and the last fraction of a pixel is snapped.
 * A spring approaches its rest asymptotically: left to converge on its own it
 * spends another 300ms moving a quarter of a pixel, which nobody can see and
 * every frame of which is a frame the page drew for nothing. Measured before
 * this was tightened: the pin was still 0.06px short after 470ms.
 */
const SPRING_REST_OFFSET = 0.15
const SPRING_REST_VELOCITY = 3
/** A frame longer than this (a stalled tab) is stepped as if it were this. */
const MAX_STEP = 1 / 30

/* ── The ring ──────────────────────────────────────────────────────────────
   Geometry lives here because the hook paints it; the indicator renders the
   same numbers for its first frame. */
const RING_SIZE = PULL_TO_REFRESH.ringSize
const RING_STROKE = 2
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
/** The arc left standing while it spins. A full ring has no visible rotation. */
export const SPIN_ARC = 0.75
/**
 * How far the ring turns across a full pull. Enough that the pull and the spin
 * that follows read as one movement, not so much that it looks like a spinner
 * before it is one.
 */
const PULL_TURN_DEG = 120
/** The look of the ring at rest, before anything has been pulled. */
const IDLE_SCALE = 0.82
const PULL_SCALE_BASE = 0.9
const PULL_SCALE_RANGE = 0.16
/** How long the arc takes to open from a full ring into a spinner's arc. */
const PIN_TWEEN_MS = 220
/** How long the ring takes to fade out once the refresh is done. */
const EXIT_FADE_MS = 260

interface Options {
  /** Offset in px that arms a refresh (default: PULL_TO_REFRESH.threshold) */
  threshold?: number
  /** The limit the rubber band approaches (default: PULL_TO_REFRESH.maxPull) */
  maxPull?: number
  /** Slope of the rubber band at zero (default: PULL_TO_REFRESH.tension) */
  tension?: number
  /** The gap held open while refreshing (default: PULL_TO_REFRESH.refreshHold) */
  refreshHold?: number
  /** Minimum time the spinner stays up (default: PULL_TO_REFRESH.minSpin) */
  minSpin?: number
  /** Called on every phase change, outside React's render. */
  onPhaseChange?: (phase: PullPhase) => void
}

const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/**
 * ===========================================================================
 *  PULL TO REFRESH, WITHOUT REACT IN THE GESTURE
 * ===========================================================================
 *
 * WHY THERE IS NO STATE HERE AT ALL. This used to call setPullDistance and
 * setPhase on every touchmove, which re-rendered the dashboard — 1400 lines
 * of charts, cards and lists — on every frame of the drag. Nothing on screen
 * needed React to move: a translate on the content and a transform, an
 * opacity and one arc on the ring. All four are written straight to the DOM
 * from a rAF that coalesces every move in a frame into one write.
 *
 * So a whole pull now costs zero renders, not "few". `onPhaseChange` is there
 * for a caller that genuinely needs to know, and `phaseRef` for one that wants
 * to read it without subscribing; neither is used by the dashboard.
 *
 * WHY THE TOUCHMOVE LISTENER IS STILL NON-PASSIVE. WebKit only honours
 * overscroll-behavior on the document scroll root. A child overflow-scroll
 * element on iOS still rubber-bands natively, and preventDefault() on a
 * non-passive touchmove is the only thing that stops it.
 *
 * @param containerRef  the scrollable element
 * @param onRefresh     async; the spinner holds until it settles (min minSpin)
 */
export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>,
  options: Options = {}
) {
  const {
    threshold = PULL_TO_REFRESH.threshold,
    maxPull = PULL_TO_REFRESH.maxPull,
    tension = PULL_TO_REFRESH.tension,
    refreshHold = PULL_TO_REFRESH.refreshHold,
    minSpin = PULL_TO_REFRESH.minSpin,
    onPhaseChange,
  } = options

  /** The element that slides down. The caller attaches this. */
  const contentRef = useRef<HTMLDivElement | null>(null)
  /** The indicator's root. The caller attaches this. */
  const indicatorRef = useRef<HTMLDivElement | null>(null)

  const phaseRef = useRef<PullPhase>("idle")
  const offsetRef = useRef(0)

  /* Fresh on every render, read by handlers that are bound once. */
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh
  const phaseCbRef = useRef(onPhaseChange)
  phaseCbRef.current = onPhaseChange

  /* The ring's parts, looked up once per mount of the indicator rather than
     once per frame. querySelector in a touch handler is a habit worth not
     forming. */
  const partsRef = useRef<{
    root: HTMLElement
    turn: HTMLElement | SVGElement
    spin: SVGElement
    arc: SVGCircleElement
  } | null>(null)

  const parts = useCallback(() => {
    const root = indicatorRef.current
    if (!root) return null
    if (partsRef.current?.root === root) return partsRef.current
    const turn = root.querySelector<SVGElement>("[data-ptr-turn]")
    const spin = root.querySelector<SVGElement>("[data-ptr-spin]")
    const arc = root.querySelector<SVGCircleElement>("[data-ptr-arc]")
    if (!turn || !spin || !arc) return null
    partsRef.current = { root, turn, spin, arc }
    return partsRef.current
  }, [])

  /* ── Painting ──────────────────────────────────────────────────────────
     Every visual change in this file goes through here. Transform and
     opacity on the compositor; the one arc length is an attribute written to
     the SVG node, never through React. */
  const restingY = Math.max((refreshHold - RING_SIZE) / 2, 0)
  /** Rotation is frozen the moment the pull arms, so nothing turns backwards
   *  while the page settles. */
  const heldTurnRef = useRef<number | null>(null)

  const paintContent = useCallback((y: number) => {
    const el = contentRef.current
    if (el) el.style.transform = `translate3d(0, ${y}px, 0)`
  }, [])

  const paintRing = useCallback(
    (o: { y: number; opacity: number; scale: number; turn: number; dash: number }) => {
      const p = parts()
      if (!p) return
      p.root.style.transform = `translate3d(0, ${o.y}px, 0) scale(${o.scale})`
      p.root.style.opacity = String(o.opacity)
      p.turn.style.transform = `rotate(${o.turn}deg)`
      p.arc.setAttribute("stroke-dasharray", `${o.dash} ${RING_CIRCUMFERENCE}`)
    },
    [parts]
  )

  /** Everything the ring looks like at a given pull offset. */
  const ringAt = useCallback(
    (offset: number) => {
      const progress = Math.min(offset / threshold, 1)
      return {
        y: Math.max((offset - RING_SIZE) / 2, 0),
        opacity: Math.min(progress * 1.4, 1),
        scale: PULL_SCALE_BASE + progress * PULL_SCALE_RANGE,
        turn: heldTurnRef.current ?? progress * PULL_TURN_DEG,
        dash: RING_CIRCUMFERENCE * progress,
      }
    },
    [threshold]
  )

  const paintAt = useCallback(
    (offset: number) => {
      offsetRef.current = offset
      paintContent(offset)
      paintRing(ringAt(offset))
    },
    [paintContent, paintRing, ringAt]
  )

  /* ── will-change, only while something is moving ───────────────────────
     It used to sit in the JSX, so the wrapper held a compositor layer for the
     whole life of the page for the sake of a gesture almost nobody makes. */
  const setLifted = useCallback(
    (on: boolean) => {
      const c = contentRef.current
      if (c) c.style.willChange = on ? "transform" : ""
      const p = parts()
      if (p) {
        p.root.style.willChange = on ? "transform, opacity" : ""
        p.turn.style.willChange = on ? "transform" : ""
      }
    },
    [parts]
  )

  const setPhase = useCallback((next: PullPhase) => {
    if (phaseRef.current === next) return
    phaseRef.current = next
    phaseCbRef.current?.(next)
  }, [])

  /* ── The settle ────────────────────────────────────────────────────────
     One rAF driver for all three endings. The spring carries the page's
     offset; the opacity, the scale and the arc length cannot spring, so they
     run off the elapsed time of the same frames. */
  const frameRef = useRef(0)
  const cancelFrame = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
  }, [])

  const settle = useCallback(
    (
      to: number,
      mode: "release" | "pin" | "exit",
      done?: () => void
    ) => {
      cancelFrame()
      const from = offsetRef.current
      const startDash = mode === "pin" ? RING_CIRCUMFERENCE * Math.min(from / threshold, 1) : 0
      const endDash = RING_CIRCUMFERENCE * SPIN_ARC

      /* prefers-reduced-motion: there. No spring, no fade, no frames. */
      if (reducedMotion()) {
        offsetRef.current = to
        paintContent(to)
        if (mode === "pin") paintRing({ y: restingY, opacity: 1, scale: 1, turn: heldTurnRef.current ?? PULL_TURN_DEG, dash: endDash })
        else if (mode === "exit") paintRing({ y: restingY, opacity: 0, scale: IDLE_SCALE, turn: heldTurnRef.current ?? 0, dash: endDash })
        else paintRing(ringAt(to))
        done?.()
        return
      }

      let x = from
      let v = 0
      let last = 0
      const started = performance.now()

      const step = (now: number) => {
        frameRef.current = 0
        const dt = last ? Math.min((now - last) / 1000, MAX_STEP) : 1 / 60
        last = now

        /* Semi-implicit Euler, sub-stepped so a long frame cannot explode it. */
        const sub = Math.max(1, Math.ceil(dt / (1 / 120)))
        const h = dt / sub
        for (let i = 0; i < sub; i++) {
          v += (-SPRING_STIFFNESS * (x - to) - SPRING_DAMPING * v) * h
          x += v * h
        }
        const done0 = Math.abs(x - to) < SPRING_REST_OFFSET && Math.abs(v) < SPRING_REST_VELOCITY
        if (done0) x = to

        offsetRef.current = x
        paintContent(x)

        const elapsed = now - started
        if (mode === "release") {
          paintRing(ringAt(x))
        } else if (mode === "pin") {
          const u = Math.min(elapsed / PIN_TWEEN_MS, 1)
          paintRing({
            y: Math.max((x - RING_SIZE) / 2, 0),
            opacity: 1,
            scale: 1.06 + (1 - 1.06) * u,
            turn: heldTurnRef.current ?? PULL_TURN_DEG,
            dash: startDash + (endDash - startDash) * u,
          })
        } else {
          /* THE EXIT MOVES NOTHING. The ring stays exactly where the refresh
             left it, keeps its arc and keeps spinning; it dims and shrinks in
             place. Every one of those three used to change at the instant the
             phase flipped, while the ring was still on screen for another
             260ms, which is what read as it jerking backwards. */
          const u = Math.min(elapsed / EXIT_FADE_MS, 1)
          paintRing({
            y: restingY,
            opacity: 1 - u,
            scale: 1 + (IDLE_SCALE - 1) * u,
            turn: heldTurnRef.current ?? PULL_TURN_DEG,
            dash: endDash,
          })
        }

        const fadeDone = mode === "exit" ? elapsed >= EXIT_FADE_MS : true
        if (done0 && fadeDone) {
          done?.()
          return
        }
        frameRef.current = requestAnimationFrame(step)
      }
      frameRef.current = requestAnimationFrame(step)
    },
    [cancelFrame, paintContent, paintRing, ringAt, restingY, threshold]
  )

  /* ── Refresh ───────────────────────────────────────────────────────────── */
  const spinTimerRef = useRef<number | null>(null)
  const aliveRef = useRef(true)

  const runRefresh = useCallback(() => {
    setPhase("refreshing")
    const p = parts()
    /* The spin is a CSS animation on a node INSIDE the one holding the pull
       rotation, so it starts from the angle the pull left behind instead of
       snapping to zero, and the two compose into one continuous turn. */
    if (p) p.spin.style.animation = "ptr-spin 0.75s linear infinite"
    settle(refreshHold, "pin")

    const started = performance.now()
    const finish = () => {
      if (!aliveRef.current) return
      settle(0, "exit", () => {
        const q = parts()
        if (q) q.spin.style.animation = ""
        heldTurnRef.current = null
        setLifted(false)
        setPhase("idle")
      })
    }
    Promise.resolve()
      .then(() => refreshRef.current())
      .catch(() => { /* a failed refresh still has to put the spinner away */ })
      .then(() => {
        const rest = minSpin - (performance.now() - started)
        if (rest > 0) {
          spinTimerRef.current = window.setTimeout(finish, rest)
        } else {
          finish()
        }
      })
  }, [minSpin, parts, refreshHold, setLifted, setPhase, settle])

  /* ── Touch ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    aliveRef.current = true
    const el = containerRef.current
    if (!el) return

    let startY = 0
    let tracking = false
    let pendingDy = 0
    let queued = 0
    /** Whether the last painted frame was past the threshold. Haptics fire on
     *  the change, so one tick per crossing and not one per frame. */
    let armed = false

    const draw = () => {
      queued = 0
      if (!tracking) return
      const offset = rubberBand(pendingDy, maxPull, tension)
      const past = offset >= threshold

      if (past !== armed) {
        armed = past
        /* A light tick going in, a softer one coming back out. Same call the
           chart scrub and the phone nav use, so one function owns the
           platform difference. */
        hapticTap(past ? "light" : "soft")
        if (past) heldTurnRef.current = PULL_TURN_DEG
        else heldTurnRef.current = null
        setPhase(past ? "ready" : "pulling")
      }
      paintAt(offset)
    }

    const onTouchStart = (e: TouchEvent) => {
      /* Sheet overlays are children of the scroll container (iOS needs them to
         be, for position:fixed), so their touches bubble here. Not ours. */
      if ((e.target as Element | null)?.closest("[data-dashboard-sheet]")) return
      if (el.scrollTop !== 0 || phaseRef.current === "refreshing") return

      /* CATCHING IT MID-SETTLE. A finger put back down while the page is
         springing home takes over from where the page IS, not from zero: the
         travel that would have produced the current offset is subtracted from
         the start, so the first move continues the curve instead of jumping to
         the top of it. */
      cancelFrame()
      const held = offsetRef.current
      pendingDy = held > 0 ? rubberBandInverse(held, maxPull, tension) : 0
      startY = e.touches[0].clientY - pendingDy
      tracking = true
      armed = held >= threshold
      if (!armed) heldTurnRef.current = null
    }

    /** Stop following the finger, and paint the offset the finger ended on:
     *  a move may still be sitting in a frame that will never run. */
    const stopTracking = () => {
      tracking = false
      if (queued) {
        cancelAnimationFrame(queued)
        queued = 0
        paintAt(rubberBand(pendingDy, maxPull, tension))
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return
      const dy = e.touches[0].clientY - startY

      if (dy <= 0) {
        /* Going up: this is a scroll, not a pull. */
        stopTracking()
        if (offsetRef.current !== 0) {
          paintAt(0)
          setLifted(false)
        }
        setPhase("idle")
        return
      }

      /* The one thing that stops iOS rubber-banding the scroller itself. */
      e.preventDefault()

      if (phaseRef.current === "idle") {
        setLifted(true)
        setPhase("pulling")
      }
      pendingDy = dy
      /* Many moves can arrive inside one frame. One write per frame. */
      if (!queued) queued = requestAnimationFrame(draw)
    }

    const onTouchEnd = () => {
      if (!tracking) return
      stopTracking()
      if (offsetRef.current >= threshold) {
        runRefresh()
      } else if (offsetRef.current > 0) {
        settle(0, "release", () => {
          heldTurnRef.current = null
          setLifted(false)
          setPhase("idle")
        })
      } else {
        setLifted(false)
        setPhase("idle")
      }
    }

    /*
      THE BLOCKING LISTENER ONLY WHILE THE PAGE IS AT THE TOP.

      touchmove MUST be non-passive to call preventDefault(), and a
      non-passive touchmove on the scroller tells the browser that any
      swipe on the page might be cancelled: every swipe then waits for the
      page's thread before it scrolls. A pull can only start at the top
      (onTouchStart), so anywhere below it the listener could never act and
      only made swipes wait. Measured on Home, the swipes below the chart
      were the ones that lagged (scripts/check-home-scroll.mjs).

      So it is added when the page reaches the top and taken off when it
      leaves, never mid pull. Everything a pull does is unchanged.

      WHAT TELLS IT WHERE THE TOP IS: an IntersectionObserver on a marker
      of no height at the top of the scroller. Not a scroll listener
      reading `scrollTop`: that read forces the browser to finish style and
      layout on the spot whenever anything has changed, in the middle of a
      scroll, and measured at 24ms of forced layout across three flicks.
      An observer costs nothing per scroll.
    */
    let blocking = false
    const setBlocking = (atTop: boolean) => {
      if (atTop && !blocking) {
        el.addEventListener("touchmove", onTouchMove, { passive: false })
        blocking = true
      } else if (!atTop && blocking && !tracking) {
        el.removeEventListener("touchmove", onTouchMove)
        blocking = false
      }
    }
    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchend", onTouchEnd, { passive: true })
    el.addEventListener("touchcancel", onTouchEnd, { passive: true })
    /* No observer (a very old engine): the listener stays on, as it always was. */
    const top = typeof IntersectionObserver === "function" ? document.createElement("div") : null
    let io: IntersectionObserver | null = null
    if (top) {
      top.setAttribute("aria-hidden", "true")
      top.style.cssText = "height:0;margin:0;padding:0;border:0;pointer-events:none;overflow:hidden"
      el.prepend(top)
      io = new IntersectionObserver(([entry]) => setBlocking(entry.isIntersecting), { root: el })
      io.observe(top)
    } else {
      setBlocking(true)
    }

    return () => {
      aliveRef.current = false
      io?.disconnect()
      top?.remove()
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
      el.removeEventListener("touchcancel", onTouchEnd)
      if (queued) cancelAnimationFrame(queued)
      cancelFrame()
      if (spinTimerRef.current) window.clearTimeout(spinTimerRef.current)
    }
  }, [
    containerRef,
    threshold,
    maxPull,
    tension,
    paintAt,
    runRefresh,
    settle,
    setLifted,
    setPhase,
    cancelFrame,
  ])

  return { contentRef, indicatorRef, phaseRef }
}
