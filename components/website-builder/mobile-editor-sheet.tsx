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

/**
 * How tall a scroller's content is, independent of how tall the scroller is.
 *
 * `scrollHeight` is `max(content, client)`, so it answers this correctly only
 * while the scroller is actually overflowing: give the scroller more room
 * than its content needs and it reports the room, not the content, and a
 * sheet sized from it can never shrink again. A `[data-sheet-content]` box
 * inside the scroller is not sized by the scroller, so its rectangle is the
 * content's own height at any sheet height. `scrollHeight` stays as the
 * fallback for a scroller that has not marked its content, where it is right
 * in the overflowing case and no worse than before in the other.
 */
function naturalScrollHeight(scroller: HTMLElement): number {
  const inner = scroller.querySelector<HTMLElement>("[data-sheet-content]")
  if (!inner) return scroller.scrollHeight
  const cs = getComputedStyle(scroller)
  const padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
  return inner.getBoundingClientRect().height + padding
}

/** The home-indicator inset, as a number, for sizing a content-fit sheet. */
function safeAreaBottom(): number {
  if (typeof document === "undefined") return 0
  const probe = document.createElement("div")
  probe.style.cssText = "position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none"
  document.body.appendChild(probe)
  const h = probe.getBoundingClientRect().height
  probe.remove()
  return h
}
/**
 * How much of a bottom-anchored fixed element the browser's own bar covers.
 *
 * MEASURED, NOT ASSUMED. A zero-height probe pinned to `bottom: 0` reports
 * where the fixed containing block actually ends; `visualViewport.height`
 * reports where the visible area ends. On a browser whose toolbar overlays
 * the page the first is below the second, and the difference is the strip of
 * sheet nobody can see — which is where the Publish button kept ending up.
 * Where the two agree this is zero and nothing changes, which is why it is
 * safe to apply everywhere.
 */
function browserChromeGap(): number {
  if (typeof document === "undefined") return 0
  const probe = document.createElement("div")
  probe.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none"
  document.body.appendChild(probe)
  const containingBlockBottom = probe.getBoundingClientRect().top
  probe.remove()
  const visible = window.visualViewport?.height ?? window.innerHeight
  return Math.max(0, Math.round(containingBlockBottom - visible))
}

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
  /**
   * Size the sheet to what is in it, up to the tallest detent, instead of to
   * a fraction of the screen. A menu of six rows does not need half a
   * screen; the publish card does not need 62% of one. The sheet measures
   * its content and is exactly that tall, so nothing is clipped at the
   * bottom and nothing is empty under it.
   */
  fit?: boolean
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
  fit = false,
}: Props) {
  const sheetRef = React.useRef<HTMLDivElement>(null)
  /** The grab bar. A touch that starts here is a drag and needs no arbitration. */
  const handleRef = React.useRef<HTMLDivElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)
  /** What is actually visible, which is not the window once a keyboard is up. */
  const [viewport, setViewport] = React.useState(0)
  /** Pixels of a bottom-pinned element the browser's own bar sits over. */
  const [chromeGap, setChromeGap] = React.useState(0)
  /**
   * The home indicator, added to the peek rather than subtracted from it.
   *
   * The peek is how much of the sheet stays on screen when it is closed, and
   * the sheet pads its own content clear of the home bar — so a bare 72px
   * peek on a phone with a 34pt indicator left 38px of tab row showing, half
   * a control. Grown by the inset, what stays visible is 72px of sheet in
   * both places. The editor's canvas subtracts `--wb-sheet-peek`, which is
   * this same sum in CSS, so the two agree on where the canvas ends.
   */
  const [peekInset, setPeekInset] = React.useState(0)
  /**
   * ANCHORED BY `bottom: 0`, AND THIS IS DELIBERATE.
   *
   * An earlier attempt placed the sheet by `top`, computed as
   * `visualViewport.offsetTop + visualViewport.height - height`, on the
   * theory that a fixed element is laid out against a taller layout viewport
   * running behind Safari's toolbar. On a real iPhone that lands the sheet
   * LOWER, not higher: Safari already keeps a bottom-anchored fixed element
   * above its toolbar, so the correction was a second one on top of the
   * browser's, and the publish card went under the bar rather than above it.
   *
   * `bottom: 0` is what the browser already gets right. What was actually
   * cutting the sheet off was the stop it opened to, below.
   */

  const stops = React.useMemo(() => [...detents].sort((a, b) => a - b), [detents])
  const tallest = stops[stops.length - 1] ?? 0.92
  /** What the content wants, when `fit` is on. Handle included, measured live. */
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = React.useState(0)
  React.useEffect(() => {
    if (!fit || !mounted) return
    const el = contentRef.current
    const handle = handleRef.current
    if (!el) return
    const measure = () => {
      // The gap is part of the sheet's height as well as its padding: a sheet
      // grown only by padding would push its own content back out of sight.
      const safe = safeAreaBottom() + browserChromeGap()
      /**
       * ===============================================================
       *  A MEASUREMENT THAT CANNOT DEPEND ON THE ANSWER
       * ===============================================================
       * Two attempts at this have now got stuck, and both got stuck the
       * same way: the number was read from boxes whose size the number
       * itself decides. The wrapper holds a scroller that is free to
       * shrink, so the sheet took the height it measured, that squeezed
       * the scroller, the next measurement came back smaller, and the pair
       * settled wherever the collapse ran out — a Publish card a third of
       * the screen tall with its own URL row below the fold.
       *
       * Adding back "whatever the scroller is currently clipping" was
       * supposed to make it converge upward instead. It converges only
       * while the scroller is the thing being clipped; the moment the
       * squeeze lands anywhere else — the wrapper cut by the sheet's own
       * `overflow: hidden`, a scroller handed zero height by a flex line
       * that had none to give — the correction is zero and every height is
       * self-consistent. Any starting height is then a fixed point,
       * including a bad one, which is exactly what shipped.
       *
       * So nothing here is measured from a constrained box. A scroller
       * contributes the height of its CONTENT, which is inside it and
       * therefore never squeezed by it, and the correction is applied as a
       * difference against what that scroller was actually given. The
       * result is the same number whatever height the sheet happens to be
       * at when it is taken, so there is no loop to settle and no fixed
       * point to get caught in.
       */
      let wanted = 0
      for (const child of Array.from(el.children) as HTMLElement[]) {
        let h = child.getBoundingClientRect().height
        const scroller = child.matches("[data-sheet-scroll]")
          ? child
          : child.querySelector<HTMLElement>("[data-sheet-scroll]")
        if (scroller) h += naturalScrollHeight(scroller) - scroller.clientHeight
        wanted += h
      }
      setContentHeight(
        Math.ceil(wanted + (handle?.getBoundingClientRect().height ?? 0) + safe),
      )
    }
    measure()
    // The wrapper's own box stops changing as soon as the sheet settles, so
    // observing only that misses a card whose CONTENT grew: a URL arriving,
    // a status line changing from one word to three. Every marked content
    // box is observed as well.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const node of el.querySelectorAll<HTMLElement>("[data-sheet-content]")) ro.observe(node)
    return () => ro.disconnect()
    // `open` is in here deliberately. A ResizeObserver reports a box that
    // CHANGED, and a card whose content was laid out once and never touched
    // again presents no change to report — so the one measurement that has
    // to be right, the one taken at the moment the sheet is shown, would be
    // whatever the last one happened to be.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, mounted, chromeGap, open])

  React.useEffect(() => {
    setMounted(true)
    const vv = window.visualViewport
    /**
     * ONE MEASUREMENT PER FRAME, HOWEVER MANY EVENTS.
     *
     * `visualViewport.scroll` fires on every frame of a keyboard animation
     * and `resize` alongside it, and each `update` appends a probe and reads
     * its box, which is a synchronous layout of the whole editor — the
     * canvas, the site in it, the sheet. Several of those in one frame is the
     * "lags the layout" that was reported. Coalesced into a rAF, the sheet
     * measures once per painted frame and never more.
     */
    let frame = 0
    const update = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measureViewport()
      })
    }
    const measureViewport = () => {
      setViewport(Math.round(vv?.height ?? window.innerHeight))
      /**
       * The toolbar gap is measured here and the home indicator is NOT, and
       * the difference matters: `visualViewport.scroll` fires on every frame
       * of a scroll on iOS, and each probe appends an element and reads its
       * box, which forces a layout. A collapsing toolbar genuinely changes
       * mid-scroll so it has to be re-read; a home indicator only changes on
       * rotation, so paying for it per frame buys nothing. It gets its own
       * listeners below.
       */
      setChromeGap(browserChromeGap())
    }
    measureViewport()
    window.addEventListener("resize", update)
    vv?.addEventListener("resize", update)
    /**
     * `scroll` as well as `resize`: iOS reports the keyboard by scrolling the
     * visual viewport, not only by resizing it, and a sheet that ignored that
     * would sit correctly the first time and wrongly after any scroll.
     */
    vv?.addEventListener("scroll", update)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener("resize", update)
      vv?.removeEventListener("resize", update)
      vv?.removeEventListener("scroll", update)
    }
  }, [])

  // The home indicator, on the only two events that can change it.
  React.useEffect(() => {
    const measure = () => setPeekInset(safeAreaBottom())
    measure()
    window.addEventListener("resize", measure)
    window.addEventListener("orientationchange", measure)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("orientationchange", measure)
    }
  }, [])

  // A sheet with no peek has nothing to grow: `peekHeight={0}` still means
  // gone, not "gone except for the home indicator".
  const peek = peekHeight > 0 ? peekHeight + peekInset : 0
  const natural = offsetsFor({ viewport, detents: stops, peekHeight: peek }).height
  const height = fit && contentHeight > 0 ? Math.min(contentHeight, Math.round(viewport * tallest)) : natural

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
    () =>
      fit && contentHeight > 0
        ? // One stop — the content's own height — and the closed position.
          [0, Math.max(height - peek, 0)]
        : offsetsFor({ viewport, detents: stops, peekHeight: peek }).offsets,
    [stops, viewport, peek, fit, contentHeight, height],
  )

  /**
   * ===================================================================
   *  THE CANVAS RESERVES THE NUMBER THE SHEET ACTUALLY LEAVES SHOWING
   * ===================================================================
   * The editor's canvas has to keep the peek clear, and it used to do that
   * by computing the same sum in CSS: 72px plus env(safe-area-inset-bottom).
   * Two computations of one number, in two languages, from two different
   * readings of the inset — and on a real phone they did not agree. Every
   * pixel they differed by was a strip of canvas the sheet did not cover,
   * showing the dark behind it: the black band above Sections / Pages /
   * Settings.
   *
   * There is only one number now, and it is this one — the peek this sheet
   * is actually translated to, in pixels, measured on the device it is
   * running on. The canvas reads it and cannot disagree with it.
   *
   * Only a sheet WITH a peek publishes. The menu, Publish and the AI are
   * `peekHeight={0}`: they cover the canvas when open and reserve nothing.
   */
  React.useEffect(() => {
    if (peek <= 0) return
    const root = document.documentElement
    root.style.setProperty("--wb-sheet-peek", `${peek}px`)
    return () => {
      root.style.removeProperty("--wb-sheet-peek")
    }
  }, [peek])

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
    if (sheet) {
      sheet.style.transform = `translateY(${y}px)`
      /**
       * ═════════════════════════════════════════════════════════════════════
       *  WHAT THE SHEET HIDES, THE SCROLLER GETS BACK
       * ═════════════════════════════════════════════════════════════════════
       * The sheet is always its full height and is slid DOWN by `y`, so at a
       * half-open stop the bottom `y` pixels of it are below the screen. The
       * scroller inside is sized for the whole sheet, and its last `y` pixels
       * of content sit in that hidden part: you scroll to the end and the end
       * is off the bottom of the phone. This is that number, handed to the
       * stylesheet, which adds exactly that much room after the content (see
       * `[data-sheet-scroll]::after` in globals.css).
       *
       * Zero for a content-fit sheet, whose height is measured from that same
       * content: room added there would be measured, grow the sheet, add more
       * room, and never settle.
       */
      sheet.style.setProperty("--wb-sheet-hidden", fit ? "0px" : `${Math.max(0, Math.round(y))}px`)
    }
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

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE BACKDROP'S TWO PROPERTIES ARE SET TOGETHER OR NOT AT ALL
   * ═════════════════════════════════════════════════════════════════════════
   * The drag writes this element's opacity by hand, for the same reason it
   * writes the sheet's transform by hand: React cannot keep up with a finger.
   * What it did NOT do was hand the opacity back at the end. `endDrag`
   * restored `pointer-events` and left the opacity wherever the gesture had
   * put it — and none of the drag path sets React state, so no re-render ever
   * came along to correct it.
   *
   * A backdrop left at opacity 0 with `pointer-events: auto` is a full-screen
   * invisible wall over the whole app. The canvas is plainly visible through
   * it and every touch is swallowed, until the page is reloaded. That is
   * "when I select a section it blocks": tapping a row starts a gesture on
   * the sheet, the row is replaced by that section's settings, and the
   * backdrop is left in that state.
   *
   * Measured on the real editor by scripts/check-editor-scroll.mjs:
   * `div.fixed.inset-0.bg-black/30 opacity=0 pointer-events=auto`, still
   * there three seconds later.
   *
   * So the two are written from one place, from one answer, and cannot
   * disagree again.
   */
  const settleOverlay = (nowOpen: boolean) => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.style.opacity = nowOpen ? "1" : "0"
    overlay.style.pointerEvents = nowOpen ? "auto" : "none"
  }

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

  /**
   * The starting visibility, set ONCE. It used to be an inline style on the
   * element — `visibility: hidden` whenever `open` was false — which meant
   * React wrote "hidden" in the same commit that asked the sheet to slide
   * down: every raised sheet (the menu, Publish, the AI) vanished on the spot
   * instead of closing. settleVisibility hides it after the snap has landed.
   */
  React.useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.visibility = peekHeight === 0 && !openRef.current ? "hidden" : "visible"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Sync whenever `open` changes from outside — a tab, a menu, the overlay.
  React.useEffect(() => {
    if (drag.current.active) return
    setTransition(true)
    const target = open ? openY : closedY
    drag.current.currentY = target
    settleVisibility(open)
    applyTransformNow(target)
    settleOverlay(open)
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
      settleOverlay(openRef.current)
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
    settleOverlay(nowOpen)
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
    /**
     * ═════════════════════════════════════════════════════════════════════
     *  THE END OF A GESTURE IS THE WINDOW'S BUSINESS, NOT THE SHEET'S
     * ═════════════════════════════════════════════════════════════════════
     * These two were on the sheet. A touch event is delivered to the element
     * the touch STARTED on, so if React has replaced that element in the
     * meantime the `touchend` has nowhere to go: it never reaches the sheet,
     * `endDrag` never runs, and `drag.current.active` stays true forever.
     *
     * Which is exactly what tapping a section row does. The row is replaced
     * by that section's settings, the finger comes up on an element that is
     * no longer in the document, and the sheet is left mid-drag. A sheet that
     * thinks it is being dragged renders its backdrop at the drag's opacity —
     * zero — while React keeps writing `pointer-events: auto` on it. The
     * result is a full-screen INVISIBLE layer over the whole app: the canvas
     * is plainly visible through it and every touch is swallowed, until the
     * page is reloaded.
     *
     * "When I select a section it blocks." Measured on the real editor by
     * scripts/check-editor-scroll.mjs: `div.fixed.inset-0.bg-black/30
     * opacity=0 pointer-events=auto`, still there three seconds later.
     *
     * The mouse path already knew this — see the window listeners below,
     * added so a mouseup outside the handle still ends a drag. Touch simply
     * never got the same treatment.
     */
    window.addEventListener("touchend", onEnd)
    window.addEventListener("touchcancel", onEnd)
    return () => {
      sheet.removeEventListener("touchstart", onStart)
      sheet.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onEnd)
      window.removeEventListener("touchcancel", onEnd)
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
  /**
   * ===========================================================================
   *  WHILE A FINGER IS ON IT, THE FINGER IS THE TRUTH
   * ===========================================================================
   * The drag writes `transform` straight to the element, once per frame, and
   * turns the transition off while it does. React was writing the same two
   * properties from state on every render — so ANY re-render landing in the
   * middle of a drag put the sheet back where state believed it was and
   * switched the 360ms transition back on, which is a sheet that jumps out
   * from under the finger and then eases after it.
   *
   * And re-renders land there constantly on a phone: iOS fires
   * `visualViewport.scroll` while a sheet is being dragged, the content-fit
   * measurement can resolve at any moment, the browser's chrome gap is
   * re-probed on resize. None of those have anything to do with the gesture.
   *
   * So the rendered values MIRROR the drag rather than competing with it.
   * Mid-gesture React writes exactly what the imperative path already wrote,
   * which is a no-op; at rest it writes the state's position with the
   * transition back on, which is how a sheet opens and closes.
   */
  const dragging = drag.current.active
  const closedOffset = offsets[offsets.length - 1] ?? 0
  const renderY = dragging ? drag.current.currentY : open ? openY : closedY
  const renderOpacity = dragging
    ? closedOffset > 0
      ? Math.max(0, Math.min(1, 1 - renderY / closedOffset))
      : 0
    : open
      ? 1
      : 0
  const motion = dragging ? "none" : `transform ${SNAP_DURATION_MS}ms ${SNAP_EASING}`
  const fade = dragging ? "none" : `opacity ${SNAP_DURATION_MS}ms ${SNAP_EASING}`

  return createPortal(
    <>
      <div
        ref={overlayRef}
        data-wb-sheet-overlay=""
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 bg-black/30"
        style={{
          zIndex: layer === "raised" ? 70 : 40,
          opacity: renderOpacity,
          /**
           * WHAT YOU CAN SEE IS WHAT CAN TAKE THE TOUCH.
           *
           * This said `open ? "auto" : "none"`, which sounds right and is
           * not: the sheet can be open while this is drawn at zero opacity —
           * during a drag, and forever if a drag is left unfinished. An
           * invisible full-screen layer with `pointer-events: auto` is the
           * worst thing on a screen, because nothing looks wrong at all.
           *
           * Tied to the opacity, that state cannot exist. A backdrop you can
           * see closes the sheet when tapped, as before; one you cannot see
           * is not there at all.
           */
          pointerEvents: open && renderOpacity > 0.01 ? "auto" : "none",
          transition: fade,
          // Its own layer, so fading it is a compositor job and not a repaint
          // of everything under it on every frame.
          willChange: "opacity",
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={open}
        /**
         * CapacitorBounceGuard cancels touchmove at a scroller's boundary to
         * stop WKWebView rubber-banding, and it opts out of anything carrying
         * this. Without it the guard and this sheet's own drag fight over the
         * same finger — the guard wins, because it listens on the document.
         */
        data-mobile-bottom-sheet=""
        className={cn(
          "fixed left-0 right-0 bottom-0 flex flex-col overflow-hidden rounded-t-[20px] bg-background shadow-[0_-12px_40px_-12px_rgba(17,24,39,0.22)]",
          className,
        )}
        style={{
          /**
           * Inline, not a class. A utility class can be merged away by
           * `cn`, or tie with another class of the same specificity and lose
           * on source order — neither of which is visible from here. A number
           * on the element is the one thing that cannot be quietly overridden.
           */
          zIndex: layer === "raised" ? 80 : 50,
          height: `${height}px`,
          transform: `translateY(${renderY}px)`,
          transition: motion,
          willChange: "transform",
          /**
           * Painted on its own, so moving it never repaints the canvas under
           * it, and nothing under it is repainted when its contents change.
           * `paint` only: `layout` containment would also pull any
           * `position: fixed` inside it out of the viewport, and menus that
           * open from the sheet are fixed.
           */
          contain: "paint",
          // The home indicator, plus whatever the browser's bar is covering.
          paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${chromeGap}px)`,
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
        {/* Not flex-1: a flex item that sizes to its content is what makes
            the measurement the content's own height and not the space the
            sheet happened to give it. min-h-0 lets it shrink under the cap,
            and the scrollable region inside takes the rest. */}
        {fit ? (
          <div ref={contentRef} className="flex min-h-0 flex-col">
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </>,
    document.body,
  )
}
