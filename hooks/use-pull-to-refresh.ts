"use client"

import { useCallback, useEffect, useLayoutEffect, useRef } from "react"

import { hapticTap } from "@/lib/native-bridge"

export type PullPhase = "idle" | "pulling" | "ready" | "refreshing"

/** How many pull gestures are active in this tab (finger down, refreshing, or settling). */
let pullVisualActiveCount = 0

/** True while any page is mid pull or refresh — the /app shell must not land over it. */
export function pullRefreshVisualActive(): boolean {
  return pullVisualActiveCount > 0
}

const pullCancels = new Set<() => void>()

/** Drop every active pull immediately (navigation, tab change, route loading). */
export function cancelAllPullToRefresh() {
  for (const fn of pullCancels) fn()
}

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
  /** A touch lower than 48 so a refresh arms with a shorter, more native pull. */
  threshold: 44,
  /**
   * The limit the rubber band approaches and never reaches. Close to the old
   * maxPull of 90, so the page opens the same sort of gap at full stretch.
   */
  maxPull: 103,
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
  tension: 0.94,
  /** The gap held open while the refresh runs. */
  refreshHold: 32,
  /** The ring's diameter. */
  ringSize: 20,
  /**
   * The spinner is shown for at least this long. A cached refresh returns in
   * 20ms and a spinner that appears and vanishes inside one frame reads as a
   * glitch rather than as work.
   */
  minSpin: 300,
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

/**
 * Where a touch belongs to something that moves sideways: the metric strips
 * (components/app/use-tab-strip SCROLL_X_ATTR) and the charts' scrub layer
 * (components/app/chart-scrub).
 */
const LATERAL = "[data-scroll-x], [data-chart-touch-shield]"
/** How far such a touch moves before it is called a pull or a sideways swipe. */
const LATERAL_DECIDE_PX = 3

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
const EXIT_FADE_MS = 200

/* ── The spokes ────────────────────────────────────────────────────────────
   Round 11 (components/ui/pull-to-refresh.tsx): the shared component's
   indicator is iOS's activity spinner, eight spokes, instead of the ring.
   Its numbers live here because the hook paints it too.

   IT NEVER OVERLAPS ANYTHING. The spinner lives in the gap the pull opens
   above the content and nowhere else: its centre is the gap's middle and
   its drawn size is the gap less SPOKES_MARGIN at each end, up to its full
   size. While the gap is small it is small; while the page springs home it
   shrinks with the gap. So on every frame its box sits inside [0, gap],
   which is exactly where the content is not (measured on every frame by
   scripts/check-community-frame11.mjs PULL).

   THE SPOKES COME ONE BY ONE WITH THE PULL, clockwise from twelve, all the
   same quiet grey, the eighth landing as the pull reaches the line where
   letting go refreshes. Refreshing, they take the spinner's fading tail and
   turn (a CSS animation on their own box, the compositor's), until the
   refresh settles. */
/** The spinner's full size, and the room kept clear above and below it. */
/** Five percent larger than 24px so the spinner reads clearly on every page. */
export const SPOKES_SIZE = 25
export const SPOKES_MARGIN = 6
/** The gap held open while refreshing: the spinner and its room. */
export const SPOKES_HOLD = SPOKES_SIZE + 2 * SPOKES_MARGIN + 8
/** Where the first spoke shows: a gap any smaller draws nothing. */
const SPOKES_FIRST_PX = 10
/** One turn while refreshing. */
export const SPOKES_SPIN = "ptr-spokes-spin 0.9s linear infinite"
const SPOKES_PULL_OPACITY = 0.72

/**
 * The spinner for a gap of `gap` px, as numbers: how far its box is moved
 * down (its centre on the gap's middle), how much of its full size it is
 * drawn at (never more than the gap less the margins allows), and how many
 * spokes the pull has brought in (eight from `threshold`). Pure, so the
 * suite can prove the box stays inside the gap at every gap.
 */
export function spokesAt(gap: number, threshold: number = PULL_TO_REFRESH.threshold): { y: number; scale: number; shown: number } {
  const g = Math.max(0, gap)
  return {
    y: (g - SPOKES_SIZE) / 2,
    scale: Math.max(0, Math.min(1, (g - 2 * SPOKES_MARGIN) / SPOKES_SIZE)),
    shown: Math.max(0, Math.min(1, (g - SPOKES_FIRST_PX) / (threshold - SPOKES_FIRST_PX))) * 8,
  }
}

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
  /**
   * Where the touches are listened for, when that is not the scroller
   * itself: a page that scrolls the whole document listens on its own
   * wrapper (components/ui/pull-to-refresh.tsx), so a pull on the header
   * above it is not a pull of the page.
   */
  listenOn?: React.RefObject<HTMLElement | null>
  /**
   * Judge every gesture by its first few pixels, not only those that land on
   * a marked sideways row: a page made of other people's components (a
   * community's space chips, a carousel) has sideways rows this hook does not
   * know the names of, and a swipe along one with a little downward drift
   * must stay theirs.
   */
  axisFirst?: boolean
  /** Extra px added to the spokes' vertical position (Explore: a little lower). */
  spinnerYOffset?: number
  /**
   * False: a finger landing does not start a pull. Read when the finger lands,
   * so a wrapper that stays mounted can turn its pull off for an address that
   * has none (components/community/member/community-pull-refresh.tsx) instead
   * of being taken out of the tree, which would take the page with it.
   */
  enabled?: boolean
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
    listenOn,
    axisFirst = false,
    spinnerYOffset = 0,
    enabled = true,
  } = options

  const spinnerYOffsetRef = useRef(spinnerYOffset)
  spinnerYOffsetRef.current = spinnerYOffset
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  /** The element that slides down. The caller attaches this. */
  const contentRef = useRef<HTMLDivElement | null>(null)
  const syncContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node
      if (!node) return
      node.setAttribute("data-ptr-phase", phaseRef.current)
      const y = offsetRef.current
      if (y > 0 || phaseRef.current === "refreshing") paintContentRef.current(y > 0 ? y : 0)
    },
    [],
  )
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
    spin: HTMLElement | SVGElement
    arc: SVGCircleElement | null
    /** The spokes' indicator (components/ui/pull-to-refresh.tsx), when that is the one drawn: its eight lines, and their resting opacities while spinning. */
    spokes: { lines: SVGElement[]; rest: number[] } | null
  } | null>(null)

  const parts = useCallback(() => {
    const root = indicatorRef.current
    if (!root) return null
    if (partsRef.current?.root === root) return partsRef.current
    const turn = root.querySelector<SVGElement>("[data-ptr-turn]")
    const spin = root.querySelector<SVGElement>("[data-ptr-spin]")
    const arc = root.querySelector<SVGCircleElement>("[data-ptr-arc]")
    const lines = [...root.querySelectorAll<SVGElement>("[data-ptr-spoke]")]
    if (!turn || !spin || (!arc && !lines.length)) return null
    partsRef.current = { root, turn, spin, arc, spokes: lines.length ? { lines, rest: lines.map((l) => Number(l.getAttribute("data-rest") || 1)) } : null }
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

  /* At rest the content is NOT translated: a moved ancestor pins every
     position:fixed element inside it to itself instead of the screen.

     THE OFFSET IS PADDING, NOT A TRANSFORM. Translating a child of an
     overflow scroller paints it twice on iOS: the header stays in the gap
     and is drawn again below it (/app home, Analytics). Padding moves the
     content in layout, one paint, still without a React render. */
  /*
     BUT A PAGE THAT IS THE DOCUMENT'S OWN SCROLL MOVES ON THE COMPOSITOR (round 14). Padding lays the whole page out again on
     every frame of the pull: a community feed, the account or Explore on a slow phone dropped frames under the finger. The
     double paint above only happens inside an overflow scroller, so the document's pages are translated while they move and
     have no transform at rest; padding stays for the pages inside a scroll box (/app).
  */
  const paintContent = useCallback((y: number) => {
    const el = contentRef.current
    if (!el) return
    const box = containerRef.current
    const onDocument = !box || box === document.scrollingElement || box === document.documentElement || box === document.body
    if (onDocument) {
      /* The shift mark is what lets this move win (app/globals.css). Without it the rule forces none, the page never moves, and the spinner draws on the first row. */
      el.style.paddingTop = ""
      if (y === 0) el.removeAttribute("data-ptr-shift")
      else el.setAttribute("data-ptr-shift", "transform")
      el.style.transform = y === 0 ? "" : `translate3d(0, ${y}px, 0)`
      el.style.willChange = y === 0 ? "" : "transform"
      return
    }
    el.removeAttribute("data-ptr-shift")
    el.style.transform = "none"
    el.style.willChange = ""
    el.style.paddingTop = y > 0 ? `${y}px` : ""
  }, [containerRef])
  const paintContentRef = useRef(paintContent)
  paintContentRef.current = paintContent

  /** The page scrolls the document: it moves by transform (paintContent), so its settle can run on the compositor. */
  const onDocumentNow = useCallback(() => {
    const box = containerRef.current
    return !box || box === document.scrollingElement || box === document.documentElement || box === document.body
  }, [containerRef])

  /*
    THE SETTLE ON THE COMPOSITOR (round 20, the owner: "the pull to refresh is still not smooth"). A document page's spring
    back used to be stepped in requestAnimationFrame on the main thread, and the refresh it had just started redraws the
    feed on that same thread: the page stalled on its way up, then jumped. On a document page the page and the spokes now
    settle as Web Animations of transform and opacity, which the compositor runs whatever the page is doing.
  */
  const compositorRef = useRef<Animation[]>([])
  /** Stops a compositor settle where it is, and returns the page's offset at that moment (or null when none was running). */
  const stopCompositor = useCallback((): number | null => {
    const running = compositorRef.current
    if (!running.length) return null
    const el = contentRef.current
    let y: number | null = null
    if (el) {
      try {
        y = Math.max(0, new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)
      } catch {
        y = null
      }
    }
    compositorRef.current = []
    for (const a of running) a.cancel()
    return y
  }, [])

  const paintRing = useCallback(
    (o: { y: number; opacity: number; scale: number; turn: number; dash: number }) => {
      const p = parts()
      if (!p || !p.arc) return
      p.root.style.transform = `translate3d(0, ${o.y}px, 0) scale(${o.scale})`
      p.root.style.opacity = String(o.opacity)
      p.turn.style.transform = `rotate(${o.turn}deg)`
      p.arc.setAttribute("stroke-dasharray", `${o.dash} ${RING_CIRCUMFERENCE}`)
    },
    [parts]
  )

  /**
   * The spokes for a gap of `gap` px: centred in it and never larger than
   * it allows (THE SPOKES above). `spinning` draws the spinner's tail (each
   * spoke at its resting opacity) rather than the pull's count of spokes;
   * `fade` (0 to 1) dims the whole thing on the way out.
   */
  const paintSpokes = useCallback(
    (gap: number, spinning: boolean, fade = 0) => {
      const p = parts()
      if (!p?.spokes) return
      const at = spokesAt(gap, threshold)
      const scale = at.scale
      p.root.style.transform = `translate3d(0, ${at.y + spinnerYOffsetRef.current}px, 0) scale(${scale})`
      p.root.style.opacity = String(scale > 0.02 ? 1 - fade : 0)
      const shown = spinning ? 8 : at.shown
      p.spokes.lines.forEach((l, i) => {
        l.style.opacity = String(spinning ? p.spokes!.rest[i] : Math.max(0, Math.min(1, shown - i)) * SPOKES_PULL_OPACITY)
      })
    },
    [parts, threshold]
  )
  const spokesDrawn = useCallback(() => !!parts()?.spokes, [parts])

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
      if (spokesDrawn()) paintSpokes(offset, false)
      else paintRing(ringAt(offset))
    },
    [paintContent, paintRing, paintSpokes, ringAt, spokesDrawn]
  )

  /* ── will-change, only while something is moving ───────────────────────
     It used to sit in the JSX, so the wrapper held a compositor layer for the
     whole life of the page for the sake of a gesture almost nobody makes. */
  const setLifted = useCallback(
    (on: boolean) => {
      /* The page itself is not a transform layer (that is what painted twice). */
      const c = contentRef.current
      if (c) c.style.willChange = ""
      const p = parts()
      if (p) {
        p.root.style.willChange = on ? "transform, opacity" : ""
        p.turn.style.willChange = on ? "transform" : ""
      }
    },
    [parts]
  )

  const overflowHold = useRef<{ el: HTMLElement; overflowY: string; overscroll: string } | null>(null)
  const holdScroller = useCallback((on: boolean) => {
    const el = containerRef.current
    if (!el) return
    /* The window scrolls on transform during a pull; locking overflow on <html> stuck the feed. */
    if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
      if (!on && overflowHold.current) {
        const held = overflowHold.current
        overflowHold.current = null
        held.el.style.overflowY = held.overflowY
        held.el.style.overscrollBehavior = held.overscroll
      }
      return
    }
    if (on) {
      if (overflowHold.current) return
      overflowHold.current = { el, overflowY: el.style.overflowY, overscroll: el.style.overscrollBehavior }
      /* Native rubber-band of this scroller is the other way the top of the page paints twice. */
      el.style.overflowY = "hidden"
      el.style.overscrollBehavior = "none"
    } else if (overflowHold.current && overflowHold.current.el === el) {
      const held = overflowHold.current
      overflowHold.current = null
      held.el.style.overflowY = held.overflowY
      held.el.style.overscrollBehavior = held.overscroll
    }
  }, [containerRef])

  const setPhase = useCallback((next: PullPhase) => {
    const prev = phaseRef.current
    if (prev === next) return
    if (prev === "idle" && next !== "idle") pullVisualActiveCount++
    if (prev !== "idle" && next === "idle") pullVisualActiveCount = Math.max(0, pullVisualActiveCount - 1)
    if (next === "idle") holdScroller(false)
    else if (prev === "idle") holdScroller(true)
    phaseRef.current = next
    const c = contentRef.current
    if (c) c.setAttribute("data-ptr-phase", next)
    phaseCbRef.current?.(next)
  }, [holdScroller])

  /* A React commit must not leave the wrapper at translate(0) while the finger or the spring still holds it open. */
  useLayoutEffect(() => {
    const y = offsetRef.current
    if (y > 0 || phaseRef.current === "refreshing") paintContent(y > 0 ? y : refreshHold)
  })

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
        if (spokesDrawn()) paintSpokes(to, mode !== "release", mode === "exit" ? 1 : 0)
        else if (mode === "pin") paintRing({ y: restingY, opacity: 1, scale: 1, turn: heldTurnRef.current ?? PULL_TURN_DEG, dash: endDash })
        else if (mode === "exit") paintRing({ y: restingY, opacity: 0, scale: IDLE_SCALE, turn: heldTurnRef.current ?? 0, dash: endDash })
        else paintRing(ringAt(to))
        done?.()
        return
      }

      const content = contentRef.current
      const ring = parts()
      if (onDocumentNow() && content && typeof content.animate === "function" && ring?.spokes) {
        stopCompositor()
        const ms = mode === "pin" ? 360 : mode === "exit" ? 420 : 340
        const easing = "cubic-bezier(0.32, 0.72, 0, 1)"
        /* The final place is written first and the move plays over it; the shift mark stays on for the whole move (app/globals.css). */
        content.setAttribute("data-ptr-shift", "transform")
        content.style.willChange = "transform"
        content.style.transform = `translate3d(0, ${to}px, 0)`
        offsetRef.current = to
        const moves: Animation[] = [content.animate([{ transform: `translate3d(0, ${from}px, 0)` }, { transform: `translate3d(0, ${to}px, 0)` }], { duration: ms, easing })]
        const at = spokesAt(to, threshold)
        const fromT = ring.root.style.transform || "translate3d(0, 0, 0) scale(0)"
        const fromO = ring.root.style.opacity || "0"
        const toT = `translate3d(0, ${at.y + spinnerYOffsetRef.current}px, 0) scale(${at.scale})`
        const toO = mode === "pin" ? (at.scale > 0.02 ? "1" : "0") : "0"
        if (mode === "pin") ring.spokes.lines.forEach((l, i) => { l.style.opacity = String(ring.spokes!.rest[i]) })
        ring.root.style.transform = toT
        ring.root.style.opacity = toO
        moves.push(ring.root.animate([{ transform: fromT, opacity: fromO }, { transform: toT, opacity: toO }], { duration: mode === "exit" ? Math.min(ms, EXIT_FADE_MS + 120) : ms, easing }))
        compositorRef.current = moves
        moves[0].onfinish = () => {
          if (compositorRef.current !== moves) return
          compositorRef.current = []
          paintContent(to)
          done?.()
        }
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
        if (spokesDrawn()) {
          /* The spokes follow the gap in every ending, so they are never outside it; on the way out they also dim. */
          paintSpokes(x, mode !== "release", mode === "exit" ? Math.min(elapsed / EXIT_FADE_MS, 1) : 0)
        } else if (mode === "release") {
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
    [cancelFrame, paintContent, paintRing, paintSpokes, ringAt, restingY, spokesDrawn, threshold, parts, onDocumentNow, stopCompositor]
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
    if (p) p.spin.style.animation = p.spokes ? SPOKES_SPIN : "ptr-spin 0.75s linear infinite"
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

  const forceIdle = useCallback(() => {
    cancelFrame()
    stopCompositor()
    if (spinTimerRef.current) {
      window.clearTimeout(spinTimerRef.current)
      spinTimerRef.current = null
    }
    offsetRef.current = 0
    heldTurnRef.current = null
    paintContent(0)
    const p = parts()
    if (p) {
      p.spin.style.animation = ""
      p.root.style.opacity = "0"
      p.root.style.transform = "translate3d(0, 0, 0) scale(0)"
      if (p.spokes) p.spokes.lines.forEach((l) => { l.style.opacity = "0" })
    }
    setLifted(false)
    if (phaseRef.current !== "idle") {
      pullVisualActiveCount = Math.max(0, pullVisualActiveCount - 1)
      holdScroller(false)
      phaseRef.current = "idle"
      const c = contentRef.current
      if (c) c.setAttribute("data-ptr-phase", "idle")
      phaseCbRef.current?.("idle")
    }
  }, [cancelFrame, holdScroller, paintContent, parts, setLifted, stopCompositor])

  /* ── Touch ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    aliveRef.current = true
    pullCancels.add(forceIdle)
    const el = containerRef.current
    if (!el) return
    /*
      THE DOCUMENT AS THE SCROLLER. A page that scrolls the window hands
      document.scrollingElement as the container: its scrollTop is the
      window's, but touches are taken on `listenOn` (the page's own part of
      the screen) and the top marker goes at the top of that part, watched
      against the viewport rather than inside <html>.
    */
    const isDocument = el === document.scrollingElement || el === document.documentElement
    const target: HTMLElement = listenOn?.current ?? el

    let startY = 0
    /* Where the finger landed, unadjusted, for telling a pull from a sideways swipe. */
    let downX = 0
    let downY = 0
    /**
     * The touch began on something a sideways swipe belongs to: a row that
     * scrolls sideways, or a chart that scrubs. Such a gesture is a pull only
     * once its first movement says it is going down rather than across.
     */
    let lateral = false
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
      if (!enabledRef.current) return
      /* Sheet overlays are children of the scroll container (iOS needs them to
         be, for position:fixed), so their touches bubble here. Not ours. */
      if ((e.target as Element | null)?.closest("[data-dashboard-sheet]")) return
      /* A post sheet or any phone sheet is open: this pull is not the page's, and starting one under it leaves the page translated when Back closes the sheet. */
      /* Only sheets that are actually open block a page pull; keepMounted panels stay in the DOM at rest. */
      if (document.querySelector("[data-app-sheet='open']")) return
      const postOverlay = document.querySelector<HTMLElement>("[data-post-overlay-root]")
      if (postOverlay && postOverlay.style.pointerEvents !== "none") return
      if (el.scrollTop !== 0 || phaseRef.current === "refreshing") return
      /* A sheet or a dialog holds the page (react-remove-scroll's mark): the touch is the sheet's. */
      if (isDocument && document.documentElement.hasAttribute("data-scroll-locked")) return

      /* CATCHING IT MID-SETTLE. A finger put back down while the page is
         springing home takes over from where the page IS, not from zero: the
         travel that would have produced the current offset is subtracted from
         the start, so the first move continues the curve instead of jumping to
         the top of it. */
      cancelFrame()
      /* Caught in a compositor settle: from where the page is on screen now. */
      const caught = stopCompositor()
      if (caught !== null) {
        offsetRef.current = caught
        paintContent(caught)
        if (spokesDrawn()) paintSpokes(caught, false)
      }
      const held = offsetRef.current
      downX = e.touches[0].clientX
      downY = e.touches[0].clientY
      /* A page already held down mid settle is a pull being caught, whatever it lands on. */
      lateral = held === 0 && !!(e.target as Element | null)?.closest?.(LATERAL)
      if (held === 0 && axisFirst) lateral = true
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

      /*
        A SIDEWAYS SWIPE IS NOT A PULL. At the top of Home this cancelled
        every move with any downward drift, including a swipe along the
        metric tabs, so the row froze and the page came down instead: "it
        thinks I want to scroll up or down". A gesture that starts on a
        sideways row or a chart is judged by its first few pixels: across is
        theirs, and it is left alone, uncancelled, for the rest of the
        gesture; down is a pull, as anywhere else.
      */
      if (lateral) {
        const ax = Math.abs(e.touches[0].clientX - downX)
        const ay = Math.abs(e.touches[0].clientY - downY)
        if (ax < LATERAL_DECIDE_PX && ay < LATERAL_DECIDE_PX) return
        lateral = false
        if (ax >= ay) {
          stopTracking()
          return
        }
      }

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
      /*
        A DOCUMENT PAGE IS PAINTED ON THE MOVE ITSELF (round 20): its offset is a transform, which costs nothing to write,
        and waiting for the next frame left the page a frame behind the finger. A page inside a scroll box moves by
        padding (a layout), so its moves are still gathered into one write per frame.
      */
      if (isDocument) draw()
      else if (!queued) queued = requestAnimationFrame(draw)
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
        target.addEventListener("touchmove", onTouchMove, { passive: false })
        blocking = true
      } else if (!atTop && blocking && !tracking) {
        target.removeEventListener("touchmove", onTouchMove)
        blocking = false
      }
    }
    target.addEventListener("touchstart", onTouchStart, { passive: true })
    target.addEventListener("touchend", onTouchEnd, { passive: true })
    target.addEventListener("touchcancel", onTouchEnd, { passive: true })
    /* No observer (a very old engine): the listener stays on, as it always was. */
    const top = typeof IntersectionObserver === "function" ? document.createElement("div") : null
    let io: IntersectionObserver | null = null
    if (top) {
      top.setAttribute("aria-hidden", "true")
      top.style.cssText = "height:0;margin:0;padding:0;border:0;pointer-events:none;overflow:hidden"
      ;(isDocument ? target : el).prepend(top)
      io = new IntersectionObserver(([entry]) => setBlocking(entry.isIntersecting), { root: isDocument ? null : el })
      io.observe(top)
    } else {
      setBlocking(true)
    }

    return () => {
      aliveRef.current = false
      pullCancels.delete(forceIdle)
      forceIdle()
      if (overflowHold.current) {
        const held = overflowHold.current
        overflowHold.current = null
        held.el.style.overflowY = held.overflowY
        held.el.style.overscrollBehavior = held.overscroll
      }
      io?.disconnect()
      top?.remove()
      target.removeEventListener("touchstart", onTouchStart)
      target.removeEventListener("touchmove", onTouchMove)
      target.removeEventListener("touchend", onTouchEnd)
      target.removeEventListener("touchcancel", onTouchEnd)
      if (queued) cancelAnimationFrame(queued)
    }
  }, [
    containerRef,
    listenOn,
    axisFirst,
    threshold,
    maxPull,
    tension,
    paintAt,
    runRefresh,
    settle,
    setLifted,
    setPhase,
    holdScroller,
    cancelFrame,
    forceIdle,
    stopCompositor,
    paintContent,
    paintSpokes,
    spokesDrawn,
  ])

  return { contentRef: syncContentRef, indicatorRef, phaseRef }
}
