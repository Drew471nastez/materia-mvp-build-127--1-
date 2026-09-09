"use client"

/**
 * ===========================================================================
 *  THE MOBILE SHEET, WITH DETENTS
 * ===========================================================================
 * It had two positions: a peek at the bottom and half the screen. That is
 * enough for a list of sections and not enough for anything you have to READ
 * or TYPE into — a settings panel with twenty fields, or a conversation with
 * a text box at the bottom of it. There was no way to get more room, so the
 * answer for the AI panel had been to not offer it on a phone at all.
 *
 * Now it snaps between a set of DETENTS, the way an iOS sheet does: peek,
 * half, full. Dragging moves between neighbours; a flick carries you one
 * further in the direction you flicked.
 *
 * ---------------------------------------------------------------------------
 *  THE KEYBOARD IS THE HARD PART
 * ---------------------------------------------------------------------------
 * `window.innerHeight` does not change when the on-screen keyboard opens on
 * iOS — the page is simply scrolled under it — so a sheet positioned against
 * it puts its text box behind the keyboard and there is nothing the person can
 * do about it. `visualViewport` is the only API that reports what is actually
 * visible, and its `height` plus `offsetTop` are what a sheet has to be
 * measured against.
 *
 * Falls back to `window.innerHeight` where it is missing, which costs nothing
 * on a browser that has no on-screen keyboard anyway.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import {
  DRAG_THRESHOLD_PX,
  dragIntent,
  offsetsFor,
  releaseVelocity,
  snapDuration,
  snapTarget,
  type DragIntent,
  type Sample,
} from "./sheet-gestures"

const PEEK_HEIGHT = 72
const SNAP_DURATION_MS = 360
const SNAP_EASING = "cubic-bezier(0.32, 0.72, 0, 1)"

/**
 * How far up the screen each stop sits, as a fraction of what is visible.
 * The largest is the sheet's actual height; the others are it, pushed down.
 */
export type Detent = number

const DEFAULT_DETENTS: Detent[] = [0.5, 0.92]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
  peekHeight?: number
  /** Stops above the peek, smallest first. The last one is the full height. */
  detents?: Detent[]
  /**
   * Open straight to the tallest stop. For a panel whose whole point is room —
   * a conversation — starting at half and making somebody drag is a step that
   * only ever has one answer.
   */
  openFull?: boolean
  /**
   * Which sheets stack above which.
   *
   * The Sections / Pages / Settings sheet is always there, so it is "base".
   * Anything that opens OVER the builder for a moment, the menu, Publish, the
   * AI, is "raised" and sits above it whatever order it landed in the DOM.
   * Without this, all sheets shared one z-index and the last one in the tree
   * won, which put the menu and Publish UNDER the peek they were opened from.
   */
  layer?: "base" | "raised"
}

export function MobileEditorSheet({
  open,
  onOpenChange,
  children,
  className,
  peekHeight = PEEK_HEIGHT,
  detents = DEFAULT_DETENTS,
  openFull = false,
  layer = "base",
}: Props) {
  const sheetRef = React.useRef<HTMLDivElement>(null)
  /** The grab bar. A touch that starts here is a drag and needs no arbitration. */
  const handleRef = React.useRef<HTMLDivElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)
  /** What is actually visible, which is not the window once a keyboard is up. */
  const [viewport, setViewport] = React.useState(0)
  /**
   * Where the visible area STARTS inside the page's own coordinates.
   *
   * A `fixed` element is placed against the layout viewport, and on a phone
   * the layout viewport runs behind the browser's own toolbars. So a sheet
   * pinned to `bottom: 0` has its last inch underneath Safari's bar — which is
   * exactly where the Publish button was. Anchoring by `top` instead, from the
   * visible area's own offset and height, puts the sheet's bottom edge on the
   * bottom edge somebody can actually see, whatever the browser is doing with
   * its chrome. It is the same number the keyboard moves, so it handles that
   * for free.
   */
  const [viewportTop, setViewportTop] = React.useState(0)

  const stops = React.useMemo(() => [...detents].sort((a, b) => a - b), [detents])
  const tallest = stops[stops.length - 1] ?? 0.92

  React.useEffect(() => {
    setMounted(true)
    const vv = window.visualViewport
    const update = () => {
      setViewport(Math.round(vv?.height ?? window.innerHeight))
      setViewportTop(Math.round(vv?.offsetTop ?? 0))
    }
    update()
    window.addEventListener("resize", update)
    vv?.addEventListener("resize", update)
    /**
     * `scroll` as well as `resize`: iOS reports the keyboard by scrolling the
     * visual viewport, not only by resizing it, and a sheet that ignored that
     * would sit correctly the first time and wrongly after any scroll.
     */
    vv?.addEventListener("scroll", update)
    return () => {
      window.removeEventListener("resize", update)
      vv?.removeEventListener("resize", update)
      vv?.removeEventListener("scroll", update)
    }
  }, [])

  const height = offsetsFor({ viewport, detents: stops, peekHeight }).height
  void tallest

  /**
   * translateY for each stop, tallest first — and SORTED, which is the whole
   * correctness of the thing.
   *
   * A larger fraction is a smaller offset, so mapping the fractions in
   * ascending order produces offsets in DESCENDING order: [336, 0], and with
   * the peek appended, [336, 0, 664]. That array is not monotonic, and the
   * flick logic below moves by index on the assumption that it is — so "one
   * stop further down" from full would have gone to half's index and then
   * jumped to the peek. Sorting is what makes index order and screen order the
   * same thing.
   */
  const offsets = React.useMemo(
    () => offsetsFor({ viewport, detents: stops, peekHeight }).offsets,
    [stops, viewport, peekHeight],
  )

  const closedY = offsets[offsets.length - 1]
  const openY = openFull ? offsets[0] : (offsets[Math.max(0, offsets.length - 2)] ?? 0)

  const openRef = React.useRef(open)
  openRef.current = open
  const offsetsRef = React.useRef(offsets)
  offsetsRef.current = offsets
  const onOpenChangeRef = React.useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  const drag = React.useRef({
    startY: 0,
    startX: 0,
    startTime: 0,
    lastY: 0,
    lastTime: 0,
    active: false,
    baseY: 0,
    currentY: 0,
    /**
     * Decided ONCE, on the first movement past the threshold, and kept for the
     * rest of the gesture. Re-deciding mid-drag is how a sheet snatches itself
     * away from a finger halfway down a list.
     */
    intent: "undecided" as DragIntent,
    /** The scrollable thing under the finger, if there is one. */
    scroller: null as HTMLElement | null,
    /** Recent positions, for the release speed. */
    samples: [] as Sample[],
  })

  /**
   * The nearest scrollable ancestor between the touch and the sheet.
   *
   * "Scrollable" means it can actually scroll — `overflow-y-auto` on a box
   * whose content fits is not something a person can scroll, and treating it
   * as one would leave that part of the sheet undraggable for no reason.
   */
  const scrollerUnder = (target: EventTarget | null): HTMLElement | null => {
    let node = target instanceof HTMLElement ? target : null
    while (node && node !== sheetRef.current) {
      const style = window.getComputedStyle(node)
      const scrolls = /(auto|scroll|overlay)/.test(style.overflowY)
      if (scrolls && node.scrollHeight > node.clientHeight + 1) return node
      node = node.parentElement
    }
    return null
  }

  /**
   * ONE WRITE PER FRAME.
   *
   * `touchmove` can fire more than once between paints — on a 120Hz panel it
   * usually does — and every write to `style.transform` in the same frame is
   * work the compositor throws away. Worse, reading nothing and writing twice
   * still costs a style recalculation each time.
   *
   * Coalescing into a rAF means the browser gets exactly one transform per
   * frame, which is the shape a compositor-driven drag is supposed to have.
   */
  const pendingY = React.useRef<number | null>(null)
  const rafId = React.useRef(0)

  const writeTransform = (y: number) => {
    const sheet = sheetRef.current
    const overlay = overlayRef.current
    const cY = offsetsRef.current[offsetsRef.current.length - 1]
    if (sheet) sheet.style.transform = `translateY(${y}px)`
    if (overlay) {
      const opacity = cY > 0 ? Math.max(0, Math.min(1, 1 - y / cY)) : 0
      overlay.style.opacity = String(opacity)
    }
  }

  const applyTransform = (y: number) => {
    pendingY.current = y
    if (rafId.current) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0
      if (pendingY.current !== null) writeTransform(pendingY.current)
      pendingY.current = null
    })
  }

  /**
   * The snap has to land exactly, so it writes straight through: a queued rAF
   * carrying the last DRAG position would fire after the transition had been
   * turned on and animate the sheet back to where the finger was.
   */
  const applyTransformNow = (y: number) => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current)
      rafId.current = 0
    }
    pendingY.current = null
    writeTransform(y)
  }

  React.useEffect(() => () => {
    if (rafId.current) cancelAnimationFrame(rafId.current)
  }, [])

  const setTransition = (on: boolean, ms: number = SNAP_DURATION_MS) => {
    const sheet = sheetRef.current
    const overlay = overlayRef.current
    const value = on ? `transform ${ms}ms ${SNAP_EASING}` : "none"
    const overlayValue = on ? `opacity ${ms}ms ${SNAP_EASING}` : "none"
    if (sheet) sheet.style.transition = value
    if (overlay) overlay.style.transition = overlayValue
  }

  /**
   * A sheet with no peek is entirely off screen when closed, and a thing that
   * is off screen should not be painted, nor cast its shadow up onto the
   * bottom edge. Hidden once the close has landed, shown the instant it is
   * asked to open again, so the open animation is never skipped.
   */
  const hideTimer = React.useRef(0)
  const settleVisibility = (isOpen: boolean, afterMs: number = SNAP_DURATION_MS) => {
    if (peekHeight > 0) return
    const sheet = sheetRef.current
    if (!sheet) return
    window.clearTimeout(hideTimer.current)
    if (isOpen) {
      sheet.style.visibility = "visible"
      return
    }
    hideTimer.current = window.setTimeout(() => {
      if (!openRef.current && !drag.current.active && sheetRef.current) {
        sheetRef.current.style.visibility = "hidden"
      }
    }, afterMs + 20)
  }
  React.useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  // Sync whenever `open` changes from outside — a tab, a menu, the overlay.
  React.useEffect(() => {
    if (drag.current.active) return
    setTransition(true)
    const target = open ? openY : closedY
    drag.current.currentY = target
    settleVisibility(open)
    applyTransformNow(target)
    const overlay = overlayRef.current
    if (overlay) overlay.style.pointerEvents = open ? "auto" : "none"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, openY, closedY])

  const startDrag = (clientY: number, clientX = 0, target: EventTarget | null = null, immediate = false) => {
    const now = performance.now()
    drag.current.startY = clientY
    drag.current.startX = clientX
    drag.current.lastY = clientY
    drag.current.startTime = now
    drag.current.lastTime = now
    drag.current.samples = [{ y: clientY, t: now }]
    /**
     * The handle and the mouse are unambiguous — nothing else could be meant —
     * so they skip the arbitration. A touch anywhere else has to declare
     * itself first.
     */
    drag.current.intent = immediate ? "sheet" : "undecided"
    drag.current.scroller = immediate ? null : scrollerUnder(target)
    drag.current.active = true
    /**
     * Measured from where the sheet ACTUALLY IS, not from whether it is
     * "open". With more than two stops those are different questions: a sheet
     * dragged to full is open, and so is one sitting at half.
     */
    drag.current.baseY = drag.current.currentY
    setTransition(false)
    settleVisibility(true)
    const overlay = overlayRef.current
    if (overlay) overlay.style.pointerEvents = "none"
  }

  const moveDrag = (clientY: number, clientX = drag.current.startX) => {
    if (!drag.current.active) return

    const now = performance.now()
    drag.current.samples.push({ y: clientY, t: now })
    // Enough for a 100ms window at any sane touch rate, and bounded so a long
    // drag does not grow an array for ever.
    if (drag.current.samples.length > 12) drag.current.samples.shift()

    /**
     * ONE DECISION PER GESTURE. Until it is made, nothing moves — which is
     * what stops a tap on a button inside the sheet nudging it a pixel.
     */
    if (drag.current.intent === "undecided") {
      drag.current.intent = dragIntent({
        deltaX: clientX - drag.current.startX,
        deltaY: clientY - drag.current.startY,
        scrollTop: drag.current.scroller?.scrollTop ?? 0,
        hasScroller: !!drag.current.scroller,
      })
      /**
       * The drag starts from where the finger is NOW, not from where it
       * touched down: the threshold has already been travelled, and counting
       * it would make the sheet jump six pixels the instant it takes over.
       */
      if (drag.current.intent === "sheet") {
        drag.current.startY = clientY
        drag.current.startX = clientX
      }
    }
    if (drag.current.intent !== "sheet") return

    const list = offsetsRef.current
    const cY = list[list.length - 1]
    let nextY = drag.current.baseY + (clientY - drag.current.startY)
    // Rubber-banding past either end, so the sheet feels attached to a finger
    // rather than to a clamp.
    if (nextY < 0) nextY = nextY / 3
    if (nextY > cY) nextY = cY + (nextY - cY) / 3
    drag.current.lastY = clientY
    drag.current.lastTime = performance.now()
    drag.current.currentY = nextY
    applyTransform(Math.max(0, Math.min(nextY, cY)))
  }

  const endDrag = () => {
    if (!drag.current.active) return
    drag.current.active = false

    const wasDragging = drag.current.intent === "sheet"
    drag.current.intent = "undecided"
    drag.current.scroller = null
    /**
     * A gesture the sheet never took over is the scroller's business, and
     * snapping on it would move the sheet somebody was only reading in.
     *
     * But `startDrag` has already made the sheet ready to be dragged — the
     * transition off, the overlay deaf — because at touchdown nobody yet knows
     * what the gesture is. Both have to be put back, or one scroll leaves an
     * overlay that no longer closes the sheet when tapped.
     */
    if (!wasDragging) {
      setTransition(true)
      const overlay = overlayRef.current
      if (overlay) overlay.style.pointerEvents = openRef.current ? "auto" : "none"
      return
    }

    const list = offsetsRef.current
    const cY = list[list.length - 1]
    const totalDelta = drag.current.lastY - drag.current.startY
    const velocity = releaseVelocity(drag.current.samples)
    const current = Math.max(0, Math.min(drag.current.currentY, cY))

    /**
     * Nearest stop, then one further if it was a flick.
     *
     * Nearest alone makes a fast short flick feel ignored — the finger has
     * barely moved, so the nearest stop is the one it started at. Carrying it
     * one further in the direction of the flick is what makes a sheet feel
     * like it has weight.
     */
    const index = snapTarget({ offsets: list, current, velocity, totalDelta })
    const targetY = list[index]
    /**
     * Timed by how far it has to go and how fast it was already going. A fixed
     * duration made closing from the peek — seventy pixels — take exactly as
     * long as opening from shut, and turned a fast flick into a slow crawl the
     * moment the finger lifted.
     */
    const ms = snapDuration(targetY - current, velocity)
    setTransition(true, ms)
    drag.current.currentY = targetY
    applyTransformNow(targetY)

    const nowOpen = index < list.length - 1
    settleVisibility(nowOpen, ms)
    const overlay = overlayRef.current
    if (overlay) overlay.style.pointerEvents = nowOpen ? "auto" : "none"
    if (nowOpen !== openRef.current) onOpenChangeRef.current(nowOpen)
  }

  /**
   * =========================================================================
   *  TOUCH, ON THE WHOLE SHEET
   * =========================================================================
   * These used to sit on the 28px grab bar alone. Everywhere else — the tabs,
   * the section list, the settings, the ninety-odd percent of the sheet a
   * thumb actually lands on — a drag did nothing at all. That is what "the
   * dragging is not accurate" is: not an imprecise drag, an absent one.
   *
   * Registered by hand rather than with onTouchMove because React attaches
   * touchmove PASSIVELY at the root, and a passive listener's
   * `preventDefault` is ignored with a console warning. Without it the browser
   * keeps its own overscroll — the rubber-band glow, pull-to-refresh — while
   * the sheet is being dragged, and the two fight over the same finger.
   */
  React.useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    const onStart = (e: TouchEvent) => {
      // A pinch is not a drag. Anything already in flight is abandoned rather
      // than left half-owned by a finger that has stopped reporting.
      if (e.touches.length !== 1) {
        if (drag.current.active) endDrag()
        return
      }
      const touch = e.touches[0]
      const onHandle = !!handleRef.current?.contains(e.target as Node)
      startDrag(touch.clientY, touch.clientX, e.target, onHandle)
    }

    const onMove = (e: TouchEvent) => {
      if (!drag.current.active || e.touches.length !== 1) return
      const touch = e.touches[0]
      moveDrag(touch.clientY, touch.clientX)
      /**
       * Only once the sheet owns the gesture. Calling this on an undecided or
       * scrolling touch would kill scrolling inside the sheet entirely, which
       * is the other half of what was asked for.
       */
      if (drag.current.intent === "sheet" && e.cancelable) e.preventDefault()
    }

    const onEnd = () => {
      if (drag.current.active) endDrag()
    }

    sheet.addEventListener("touchstart", onStart, { passive: true })
    sheet.addEventListener("touchmove", onMove, { passive: false })
    sheet.addEventListener("touchend", onEnd)
    sheet.addEventListener("touchcancel", onEnd)
    return () => {
      sheet.removeEventListener("touchstart", onStart)
      sheet.removeEventListener("touchmove", onMove)
      sheet.removeEventListener("touchend", onEnd)
      sheet.removeEventListener("touchcancel", onEnd)
    }
    // `mounted` is the dependency that matters: the sheet is not in the DOM
    // until it is true, so an effect that ran once on the server-safe first
    // render would attach to nothing and never try again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Global mouse listeners, so a mouseup outside the handle still ends a drag.
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag.current.active) moveDrag(e.clientY)
    }
    const onUp = () => {
      if (drag.current.active) endDrag()
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  if (!mounted) return null

  /**
   * =========================================================================
   *  PORTALLED, OR THE LAYER IS A LIE
   * =========================================================================
   * `z-index` is only comparable inside one stacking context. The publish
   * sheet is rendered next to the button that opens it, which is inside a
   * `relative z-50` header — so its z-[80] was being compared against the
   * header's other children, and the whole header, at z-50, still lost to the
   * persistent peek sheet at the same z-50 later in the tree.
   *
   * No amount of raising the number fixes that from inside. The sheet has to
   * leave, so it is rendered into `document.body`, where the layers it
   * declares are the layers it gets.
   */
  return createPortal(
    <>
      <div
        ref={overlayRef}
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 bg-black/30"
        style={{
          zIndex: layer === "raised" ? 70 : 40,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: `opacity ${SNAP_DURATION_MS}ms ${SNAP_EASING}`,
          // Its own layer, so fading it is a compositor job and not a repaint
          // of everything under it on every frame.
          willChange: "opacity",
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={open}
        className={cn(
          "fixed left-0 right-0 flex flex-col overflow-hidden rounded-t-[20px] bg-background shadow-[0_-12px_40px_-12px_rgba(17,24,39,0.22)]",
          className,
        )}
        style={{
          /**
           * Not `bottom: 0`. See `viewportTop`: the layout viewport runs
           * behind the browser's toolbars, so `bottom: 0` is below the last
           * row of pixels anybody can see. This lands the sheet's bottom edge
           * on the visible bottom edge instead.
           */
          top: `${viewportTop + viewport - height}px`,
          /**
           * Inline, not a class. A utility class can be merged away by
           * `cn`, or tie with another class of the same specificity and lose
           * on source order — neither of which is visible from here. A number
           * on the element is the one thing that cannot be quietly overridden.
           */
          zIndex: layer === "raised" ? 80 : 50,
          height: `${height}px`,
          visibility: peekHeight === 0 && !open ? "hidden" : "visible",
          transform: `translateY(${open ? openY : closedY}px)`,
          transition: `transform ${SNAP_DURATION_MS}ms ${SNAP_EASING}`,
          willChange: "transform",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          /**
           * `pan-y`, not `none`. `none` would hand every touch to us and kill
           * native scrolling inside the sheet — smooth, momentum-carrying,
           * compositor-driven scrolling that no JS reimplementation matches.
           * The arbitration only takes the gestures that are the sheet's.
           */
          touchAction: "pan-y",
        }}
      >
        <div
          ref={handleRef}
          className="flex shrink-0 cursor-grab select-none justify-center bg-inherit pb-1.5 pt-2.5 active:cursor-grabbing"
          onMouseDown={(e) => {
            e.preventDefault()
            // A mouse is unambiguous — there is no scroll gesture to confuse
            // it with — so it drags immediately, as it always did.
            startDrag(e.clientY, e.clientX, e.target, true)
          }}
        >
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {children}
      </div>
    </>,
    document.body,
  )
}
