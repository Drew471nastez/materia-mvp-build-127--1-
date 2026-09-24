"use client"

/**
 * ===========================================================================
 *  ONE SHEET, ONE MOTION
 * ===========================================================================
 * Every phone sheet in /app is this component, so they all open, close and
 * follow the thumb the same way. What it has to get right, and what each
 * earlier version got wrong:
 *
 *   THE FIRST FRAME IS ALREADY OFF SCREEN. The account sheet "double
 *   glitched": it appeared fully open for a frame, vanished, then slid up.
 *   `present` was set from an effect, so the portal was committed by a
 *   default priority render whose passive effects run AFTER the browser has
 *   painted, and the effect that moved the sheet below the screen came one
 *   paint too late. Measured over twenty opens: thirteen painted the sheet at
 *   rest before it slid. Now the portal is committed in the same render that
 *   flips `isOpen`, and the entrance starts in a layout effect, which runs
 *   before that commit is painted.
 *
 *   THE MOTION IS THE COMPOSITOR'S. Open and close are Web Animations on
 *   `transform` and `opacity` with one curve, so a busy main thread cannot
 *   stall them, and an interruption (closed while opening, reopened while
 *   closing) starts from wherever the sheet actually is, read off the running
 *   animation. It can never jump backwards.
 *
 *   THE DRAG DOES NOT GO THROUGH REACT. The finger writes the transform once
 *   per frame and React is told only when the gesture ends. The listeners are
 *   native and non-passive, because React registers touchmove passively and
 *   `preventDefault` in an `onTouchMove` prop does nothing.
 *
 *   A FLICK CLOSES, a stale flick does not, and a close takes as long as the
 *   distance left says it should.
 *
 *   WHAT IS INSIDE STAYS PUT WHILE IT LEAVES. A caller that renders
 *   `{open && <Panel/>}` used to empty the sheet on the first frame of its
 *   close, so it shrank to a handle as it went. The last children are kept
 *   until the sheet is gone.
 *
 *   A SHEET THAT IS TAKEN AWAY STILL LEAVES. When the parent itself goes (a
 *   row deleted from its own action sheet, a page navigated away from with a
 *   sheet open) React removes the sheet in the same commit, and it used to
 *   vanish on that frame. Now a copy of what was on screen is left on the
 *   body, inert, and slides out from exactly where the sheet was
 *   (`leaveBehind` below). Nothing reads it and nothing can touch it; it
 *   removes itself when the slide ends.
 *
 *   A LEAVING SHEET TAKES NO TAPS. From the moment it starts to close the
 *   layer is `pointer-events: none`, so the page and the nav pill under it
 *   answer the next tap instead of a scrim that is already fading.
 *
 *   THE PILL STAYS. The nav pill is not hidden, faded or moved while a sheet
 *   is up. The sheet's layer is above it, so the scrim dims it like the rest
 *   of the page and takes the tap that lands on it (app/globals.css).
 *
 * `will-change` is set only while something is moving, so a sheet at rest
 * does not hold a layer it does not need.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { bottomAboveKeyboard } from "@/lib/ui/keyboard-safe-sheet"

/**
 * THE TIMING. "Not smooth when it closes and when it opens: too direct, not
 * so fast, not direct." The open is 440ms on iOS's own presentation curve
 * (it leaves fast and settles slowly into place, never past it). A close by
 * a tap outside, Escape or the page is 340ms on an ease in and out: it
 * starts gently and ends gently. The presentation curve on a close is what
 * read as a jump: it covers a quarter of the way in its first two frames, so
 * the sheet seemed to vanish from under the finger rather than go down.
 *
 * A flick is different: the sheet is already moving at the finger's speed,
 * so it keeps that speed and slows to a stop, on the presentation curve,
 * over a time worked out from the velocity.
 *
 * The scrim fades on the same timing and the same curve as the sheet moves,
 * so the two arrive and leave together.
 */
export const SHEET_OPEN_MS = 440
export const SHEET_CLOSE_MS = 340
/** iOS's own sheet curve: leaves fast, arrives slow, never overshoots. For an open, and for a flick. */
export const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** A close nobody is dragging: in gently, out gently. */
export const SHEET_CLOSE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)"
const OPEN_MS = SHEET_OPEN_MS
const CLOSE_MS = SHEET_CLOSE_MS
const EASE = SHEET_EASE
const CLOSE_EASE = SHEET_CLOSE_EASE
/** Past this, a release closes on distance alone. */
const DISMISS_PX = 96
/** Past this, a release closes however short the drag was. */
const DISMISS_VELOCITY = 0.5
/** How far a pull upward can move the sheet before it stops giving. */
const PULL_CAP = 28
/** A finger has to travel this far before the sheet decides what it is. */
const SLOP_PX = 6

const translate = (y: number) => `translate3d(0, ${y.toFixed(1)}px, 0)`

/** Where the sheet really is right now, running animation included. */
function readY(el: HTMLElement): number {
  const t = getComputedStyle(el).transform
  if (!t || t === "none") return 0
  return new DOMMatrixReadOnly(t).m42
}

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/**
 * The exit for a sheet whose parent has gone. `root` is the sheet's own layer,
 * still in the document when this runs (React calls it before it removes the
 * nodes). A copy goes on the body and finishes the close the sheet would have
 * made: from where it is, down by the distance left, with the scrim fading
 * out beside it.
 */
function leaveBehind(root: HTMLElement, fromY: number, height: number, scrimOpacity: number) {
  if (typeof document === "undefined" || !root.isConnected) return
  const h = Math.max(1, height)
  if (fromY >= h - 1) return
  const ghost = root.cloneNode(true) as HTMLElement
  ghost.setAttribute("data-app-sheet", "closing")
  ghost.setAttribute("data-sheet-ghost", "")
  ghost.setAttribute("aria-hidden", "true")
  ghost.removeAttribute("role")
  ghost.removeAttribute("aria-modal")
  ghost.setAttribute("inert", "")
  ghost.style.pointerEvents = "none"
  const panel = ghost.querySelector<HTMLElement>("[data-sheet-panel]")
  const scrim = ghost.firstElementChild as HTMLElement | null
  if (!panel) return
  /* What was scrolled stays scrolled, so the content does not jump to its top as it goes. */
  const from = root.querySelectorAll<HTMLElement>("[data-sheet-panel] *")
  const to = panel.querySelectorAll<HTMLElement>("*")
  const scrolled: [number, number][] = []
  from.forEach((el, i) => { if (el.scrollTop > 0) scrolled.push([i, el.scrollTop]) })
  panel.style.transform = translate(h)
  panel.style.willChange = "transform"
  if (scrim) scrim.style.opacity = "0"
  document.body.appendChild(ghost)
  for (const [i, top] of scrolled) if (to[i]) to[i].scrollTop = top
  let gone = false
  const done = () => { if (!gone) { gone = true; ghost.remove() } }
  const ms = reducedMotion() ? 1 : Math.max(200, CLOSE_MS * Math.min(1, (h - fromY) / h))
  if (typeof panel.animate !== "function") { done(); return }
  const timing: KeyframeAnimationOptions = { duration: ms, easing: CLOSE_EASE }
  const a = panel.animate([{ transform: translate(fromY) }, { transform: translate(h) }], timing)
  scrim?.animate([{ opacity: scrimOpacity }, { opacity: 0 }], timing)
  a.onfinish = done
  a.oncancel = done
  /* However the animation ends, or if it never runs (a hidden tab), the copy goes. */
  window.setTimeout(done, ms + 400)
}

/** The nearest thing between the finger and the sheet that scrolls vertically. */
function scrollerAt(target: EventTarget | null, stop: HTMLElement): HTMLElement | null {
  let el = target as HTMLElement | null
  while (el && el !== stop) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY
      if (oy === "auto" || oy === "scroll") return el
    }
    el = el.parentElement
  }
  return null
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  label,
  header,
  hideFrom = "sm",
  fill = false,
  height,
  maxHeight = "min(86dvh, 720px)",
  aboveKeyboard = false,
  className,
  scrollKey,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  /** For a sheet with no visible title. */
  label?: string
  /** Drawn under the handle, and draggable like it: a title row with a close button, say. */
  header?: React.ReactNode
  /** The width from which a phone sheet is not drawn at all. Match whatever decides to open it. */
  hideFrom?: "sm" | "md" | null
  /** The children lay themselves out and scroll themselves (a list under tabs, say). */
  fill?: boolean
  /** A fixed height, so content that arrives late does not move the top edge. */
  height?: string
  maxHeight?: string
  /**
   * The sheet has a field in it: it sits on the keyboard rather than under
   * it, and is never taller than the room the keyboard leaves
   * (lib/ui/keyboard-safe-sheet). Off by default, so no sheet without a
   * field changes.
   */
  aboveKeyboard?: boolean
  className?: string
  /** When this changes the content scrolls back to the top: a list that
      swaps for a sub-list, say, would otherwise open part way down. */
  scrollKey?: string | number | null
}) {
  const [mounted, setMounted] = useState(false)
  /**
   * In the DOM or not. Derived during render, not in an effect: an effect
   * that sets this is what put a whole extra paint between "open" and "the
   * sheet is below the screen, ready to rise".
   */
  const [present, setPresent] = useState(isOpen)
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) setPresent(true)
  }

  /* The children the sheet had while open, drawn unchanged while it leaves. */
  const shownRef = useRef<React.ReactNode>(children)
  if (isOpen) shownRef.current = children

  const rootRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [scrollKey])

  /* Gesture and motion state is refs: none of it should cause a render. */
  const startYRef = useRef(0)
  const startXRef = useRef(0)
  const lastYRef = useRef(0)
  const lastAtRef = useRef(0)
  const velocityRef = useRef(0)
  const draggingRef = useRef(false)
  const pendingRef = useRef(false)
  const fromHandleRef = useRef(false)
  const scrollerRef = useRef<HTMLElement | null>(null)
  const offsetRef = useRef(0)
  const heightRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const animsRef = useRef<Animation[]>([])
  const closingRef = useRef(false)
  const flickRef = useRef(0)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const isOpenRef = useRef(isOpen)
  useLayoutEffect(() => { isOpenRef.current = isOpen }, [isOpen])

  useEffect(() => setMounted(true), [])

  const stopMotion = useCallback(() => {
    for (const a of animsRef.current) a.cancel()
    animsRef.current = []
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [])

  const paint = useCallback(() => {
    rafRef.current = null
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.transform = translate(offsetRef.current)
    const scrim = scrimRef.current
    /* The backdrop lightens as the sheet leaves, so the two move together. */
    if (scrim) scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - offsetRef.current / (heightRef.current || 1))))
  }, [])

  const schedule = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(paint)
  }, [paint])

  /**
   * Move from wherever the sheet is to `to`, on the compositor.
   *
   * The final value goes on the node first and the animation plays over it,
   * so when the animation ends there is nothing to hand back: the node is
   * already where the animation left it.
   */
  const glide = useCallback((from: number, to: number, ms: number, then?: () => void, easing: string = EASE) => {
    const sheet = sheetRef.current
    const scrim = scrimRef.current
    if (!sheet) { then?.(); return }
    stopMotion()
    const h = heightRef.current || sheet.offsetHeight || 1
    const duration = reducedMotion() ? 1 : Math.max(1, Math.round(ms))
    const opacity = (y: number) => Math.max(0, Math.min(1, 1 - y / h))
    offsetRef.current = to
    sheet.style.willChange = "transform"
    sheet.style.transform = translate(to)
    if (scrim) scrim.style.opacity = String(opacity(to))
    if (typeof sheet.animate !== "function") {
      sheet.style.willChange = ""
      then?.()
      return
    }
    const timing: KeyframeAnimationOptions = { duration, easing }
    const a = sheet.animate([{ transform: translate(from) }, { transform: translate(to) }], timing)
    const anims = [a]
    if (scrim) anims.push(scrim.animate([{ opacity: opacity(from) }, { opacity: opacity(to) }], timing))
    animsRef.current = anims
    a.onfinish = () => {
      if (animsRef.current[0] !== a) return
      animsRef.current = []
      sheet.style.willChange = ""
      then?.()
    }
  }, [stopMotion])

  /** Where the sheet is this frame: mid-animation, mid-drag or at rest. */
  const currentY = useCallback(() => {
    const sheet = sheetRef.current
    if (!sheet) return 0
    if (animsRef.current.length) return readY(sheet)
    return offsetRef.current
  }, [])

  /* ── Open and close ─────────────────────────────────────────────────── */
  useLayoutEffect(() => {
    if (!mounted || !present) return
    const sheet = sheetRef.current
    if (!sheet) return
    heightRef.current = sheet.offsetHeight || 600
    if (isOpen) {
      closingRef.current = false
      /* Fresh: from below the screen. Reopened mid-close: from where it is. */
      const from = animsRef.current.length ? readY(sheet) : heightRef.current
      glide(from, 0, OPEN_MS)
      return
    }
    /**
     * ONE DISMISSAL, and `closingRef` is what makes it one. A drag that
     * dismisses has already started the slide out before it tells the
     * parent, and the parent's answer must not start a second one.
     */
    if (closingRef.current) return
    closingRef.current = true
    const from = currentY()
    const travel = Math.max(1, heightRef.current - from)
    const v = flickRef.current
    flickRef.current = 0
    /* A hard flick has less left to do and should take less time doing it,
       and keeps the finger's speed at the start; anything else eases out. */
    const ms = v > 0
      ? Math.max(140, Math.min(CLOSE_MS, travel / (v * 2.2)))
      : Math.max(200, CLOSE_MS * Math.min(1, travel / heightRef.current))
    glide(from, heightRef.current, ms, () => {
      closingRef.current = false
      setPresent(false)
    }, v > 0 ? EASE : CLOSE_EASE)
  }, [isOpen, present, mounted, glide, currentY])

  useEffect(() => () => stopMotion(), [stopMotion])

  /**
   * TAKEN AWAY WHILE ON SCREEN. This cleanup runs when the sheet itself is
   * unmounted, before React removes its nodes, so the layer is still there to
   * copy and the running animation still says where the panel is.
   */
  const leaveRef = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    leaveRef.current = () => {
      const root = rootRef.current
      const sheet = sheetRef.current
      if (!root || !sheet) return
      const scrim = scrimRef.current
      leaveBehind(root, currentY(), heightRef.current || sheet.offsetHeight, scrim ? Number(getComputedStyle(scrim).opacity) || 0 : 0)
    }
  })
  useLayoutEffect(() => {
    const leave = leaveRef
    return () => leave.current()
  }, [])

  /** Out of the way, then gone: the parent is told, and its answer closes it. */
  const dismiss = useCallback((velocity = 0) => {
    if (closingRef.current) return
    closingRef.current = true
    const sheet = sheetRef.current
    const h = heightRef.current || sheet?.offsetHeight || 600
    const from = currentY()
    const travel = Math.max(1, h - from)
    const ms = velocity > 0
      ? Math.max(140, Math.min(CLOSE_MS, travel / (velocity * 2.2)))
      : Math.max(200, CLOSE_MS * Math.min(1, travel / h))
    glide(from, h, ms, () => {
      closingRef.current = false
      /* The parent said no (a refund still in flight, say): come back up
         rather than leave a sheet it still thinks is open. */
      if (isOpenRef.current) { glide(h, 0, OPEN_MS); return }
      setPresent(false)
    }, velocity > 0 ? EASE : CLOSE_EASE)
    /* The parent hears about it after the slide has started, so whatever it
       renders in answer lands on a frame the compositor is already moving. */
    onCloseRef.current()
  }, [currentY, glide])

  const requestClose = useCallback(() => { dismiss(0) }, [dismiss])

  /* ── The drag ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!mounted || !present) return
    const sheet = sheetRef.current
    if (!sheet) return

    const onStart = (e: TouchEvent) => {
      if (closingRef.current || e.touches.length > 1) return
      const target = e.target as HTMLElement | null
      fromHandleRef.current = !!target?.closest?.("[data-sheet-handle]")
      scrollerRef.current = fromHandleRef.current ? null : scrollerAt(target, sheet)
      /* Mid-animation: take the sheet from exactly where it is. */
      if (animsRef.current.length) {
        const y = readY(sheet)
        stopMotion()
        offsetRef.current = y
        sheet.style.transform = translate(y)
        schedule()
      }
      heightRef.current = sheet.offsetHeight || heightRef.current
      pendingRef.current = true
      draggingRef.current = false
      startYRef.current = e.touches[0].clientY - offsetRef.current
      startXRef.current = e.touches[0].clientX
      lastYRef.current = e.touches[0].clientY
      lastAtRef.current = performance.now()
      velocityRef.current = 0
    }

    const onMove = (e: TouchEvent) => {
      if (!pendingRef.current && !draggingRef.current) return
      const y = e.touches[0].clientY
      if (pendingRef.current) {
        const dy = y - lastYRef.current
        const dx = e.touches[0].clientX - startXRef.current
        if (Math.abs(dy) < SLOP_PX && Math.abs(dx) < SLOP_PX) {
          if (e.cancelable && fromHandleRef.current) e.preventDefault()
          return
        }
        pendingRef.current = false
        /* Sideways is a row of tabs or chips scrolling, not the sheet. */
        if (Math.abs(dx) > Math.abs(dy)) return
        const scroller = scrollerRef.current
        if (!fromHandleRef.current && scroller) {
          /* A list that can scroll the way the finger went gets the finger. */
          if (dy < 0 || scroller.scrollTop > 1) return
        }
        draggingRef.current = true
        sheet.style.willChange = "transform"
      }
      if (!draggingRef.current) return
      let next = y - startYRef.current
      if (next < 0) {
        /**
         * PULLING UP MOVES THE SHEET, AND THE SHEET HAS A BOTTOM. The give is
         * capped, so a pull has somewhere to go and then firmly stops, and
         * the sheet paints on past its own bottom edge (the skirt below), so
         * even the capped amount uncovers nothing.
         */
        next = -PULL_CAP * (1 - Math.exp(next / (PULL_CAP * 2)))
      }
      /* Native and non-passive, so this actually refuses the page's scroll. */
      if (e.cancelable) e.preventDefault()
      const now = performance.now()
      const dt = now - lastAtRef.current
      if (dt > 0) velocityRef.current = (y - lastYRef.current) / dt
      lastYRef.current = y
      lastAtRef.current = now
      offsetRef.current = next
      schedule()
    }

    const onEnd = () => {
      pendingRef.current = false
      if (!draggingRef.current) {
        /* Touched mid-animation and let go without dragging: finish the move. */
        if (!closingRef.current && Math.abs(offsetRef.current) > 0.5 && !animsRef.current.length) {
          glide(offsetRef.current, 0, OPEN_MS * 0.6)
        }
        return
      }
      draggingRef.current = false
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; paint() }
      /**
       * A FLICK IS A FLICK ONLY IF THE FINGER WAS STILL MOVING WHEN IT LEFT.
       * Anything older than a few frames is not a flick, it is a rest.
       */
      const v = performance.now() - lastAtRef.current > 80 ? 0 : velocityRef.current
      if (offsetRef.current > DISMISS_PX || v > DISMISS_VELOCITY) {
        dismiss(Math.max(v, 0))
      } else {
        const h = heightRef.current || 1
        glide(offsetRef.current, 0, Math.max(200, Math.min(OPEN_MS, OPEN_MS * 2 * Math.abs(offsetRef.current) / h)))
      }
    }

    sheet.addEventListener("touchstart", onStart, { passive: false })
    sheet.addEventListener("touchmove", onMove, { passive: false })
    sheet.addEventListener("touchend", onEnd)
    sheet.addEventListener("touchcancel", onEnd)
    return () => {
      sheet.removeEventListener("touchstart", onStart)
      sheet.removeEventListener("touchmove", onMove)
      sheet.removeEventListener("touchend", onEnd)
      sheet.removeEventListener("touchcancel", onEnd)
    }
  }, [mounted, present, dismiss, glide, paint, schedule, stopMotion])

  /* The scrim takes no scroll: a drag on it must not move the page behind. */
  useEffect(() => {
    if (!mounted || !present) return
    const scrim = scrimRef.current
    if (!scrim) return
    const refuse = (e: TouchEvent) => { if (e.cancelable) e.preventDefault() }
    scrim.addEventListener("touchmove", refuse, { passive: false })
    return () => scrim.removeEventListener("touchmove", refuse)
  }, [mounted, present])

  /**
   * FOCUS GOES IN, AND COMES BACK. A modal dialog that leaves focus on the
   * page behind it is one a screen reader never enters, and one a keyboard
   * tabs straight past. The panel takes focus when it opens, without
   * scrolling anything, and the control that opened it gets it back after.
   */
  /* Both moves wait for the slide to finish: a focus change restyles the
     control that gains it and the one that loses it, and neither belongs in
     the first frames of a movement. */
  useEffect(() => {
    if (!isOpen || !mounted) return
    const opener = document.activeElement as HTMLElement | null
    const into = window.setTimeout(() => {
      const panel = sheetRef.current
      if (panel && isOpenRef.current && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    }, reducedMotion() ? 0 : OPEN_MS)
    return () => {
      window.clearTimeout(into)
      window.setTimeout(() => {
        /* Only if focus has not gone somewhere of its own since (a sheet
           opened again, a field tapped). */
        const now = document.activeElement
        if (now && now !== document.body && !rootRef.current?.contains(now)) return
        if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true })
      }, reducedMotion() ? 0 : CLOSE_MS)
    }
  }, [isOpen, mounted])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, requestClose])

  if (!mounted || !present) return null

  return createPortal(
    <div
      ref={rootRef}
      data-app-sheet={isOpen ? "open" : "closing"}
      className={cn("fixed inset-0 z-[200]", hideFrom === "sm" && "sm:hidden", hideFrom === "md" && "md:hidden")}
      style={isOpen ? undefined : { pointerEvents: "none" }}
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
    >
      <div
        ref={scrimRef}
        onClick={requestClose}
        className="absolute inset-0 bg-black/40"
        /* Below the screen and invisible on the very first paint, before any
           script has run: there is no frame in which the sheet is at rest. */
        style={{ opacity: 0, touchAction: "none" }}
      />
      <div
        ref={sheetRef}
        data-sheet-panel=""
        tabIndex={-1}
        className={cn("absolute inset-x-0 bottom-0 rounded-t-[20px] bg-white outline-none", className)}
        style={{
          transform: "translate3d(0, 100%, 0)",
          /* The sheet owns every touch on it: the browser must not decide
             half way through that this was a scroll. */
          touchAction: "none",
          paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
          ...(aboveKeyboard ? bottomAboveKeyboard() : {}),
          maxHeight: aboveKeyboard ? `min(${maxHeight}, calc(var(--vv-h, 100dvh) - 24px))` : maxHeight,
          height,
          display: "flex",
          flexDirection: "column",
          /* Layout and style stop at the panel. Paint cannot: the skirt
             below is painted outside it on purpose. The content inside gets
             paint containment as well (the body below). */
          contain: "layout style",
          /* A short soft edge along the top. It was a 40px blur at 18%:
             under a 40% scrim it could not be seen, and it was the largest
             thing to raster on the first frame of every open. */
          boxShadow: "0 -2px 16px rgba(0, 0, 0, 0.08)",
        }}
      >
        <div data-sheet-handle className="shrink-0 pt-2.5 pb-1">
          <div className="mx-auto h-1 w-9 rounded-full bg-neutral-300" />
          {title && !header && (
            <p className="px-5 pt-3 text-[15px] font-semibold text-neutral-900">{title}</p>
          )}
          {header}
        </div>
        {fill ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ touchAction: "pan-x pan-y", contain: "layout paint" }}>
            {shownRef.current}
          </div>
        ) : (
          <div ref={bodyRef} data-sheet-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y", contain: "layout paint" }}>
            {shownRef.current}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default BottomSheet
