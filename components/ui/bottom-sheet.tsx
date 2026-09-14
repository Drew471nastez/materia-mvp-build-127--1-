"use client"

/**
 * ===========================================================================
 *  A BOTTOM SHEET THAT FOLLOWS THE THUMB
 * ===========================================================================
 * There were already three of these — in the platform header, in billing and
 * in settings — and they share the two faults that make a sheet feel cheap.
 *
 *   1. THE DRAG WENT THROUGH REACT. `setDragY(diff * 0.8)` on every touchmove
 *      is a render per frame of a gesture, with the transform applied on the
 *      way out. The same mistake the chart tooltip had, and the same fix: the
 *      finger writes the transform straight to the node, and React is only
 *      told when the gesture ends.
 *
 *   2. `e.preventDefault()` INSIDE A REACT `onTouchMove` DOES NOTHING. React
 *      registers touchstart, touchmove and wheel passively on its root, so
 *      the call is a no-op and the page behind the sheet scrolls while the
 *      sheet is being dragged. The listeners here are native and non-passive,
 *      which is the only way to refuse that scroll.
 *
 * And two things they did not do at all:
 *
 *   A FLICK CLOSES. Distance alone means a fast short flick springs back,
 *   which reads as the sheet fighting you. Past 500px/s downward it closes
 *   whatever the distance.
 *
 *   THE CLOSE TAKES AS LONG AS IT SHOULD. A fixed 400ms timer for every
 *   dismissal makes a flick feel slow and a gentle release feel abrupt. The
 *   duration is scaled to how far the sheet still has to travel.
 *
 * Rubber band above the top, so pulling up meets resistance rather than a
 * wall, and the backdrop fades with the drag rather than only at the ends.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/** Long enough to read as a movement, short enough not to be a wait. */
const OPEN_MS = 380
const CLOSE_MS = 260
/** iOS's own sheet curve: leaves fast, arrives slow, never overshoots. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** Past this, a release closes on distance alone. */
const DISMISS_PX = 96
/** Past this, a release closes however short the drag was. */
const DISMISS_VELOCITY = 0.5
/** How far a pull upward can move the sheet before it stops giving. */
const PULL_CAP = 28

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  label,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  /** For a sheet with no visible title. */
  label?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [present, setPresent] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  /* Gesture state is refs: none of it should cause a render. */
  const startYRef = useRef(0)
  const lastYRef = useRef(0)
  const lastAtRef = useRef(0)
  const velocityRef = useRef(0)
  const draggingRef = useRef(false)
  const offsetRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closingRef = useRef(false)

  useEffect(() => setMounted(true), [])

  const paint = useCallback(() => {
    rafRef.current = null
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.transform = `translate3d(0, ${offsetRef.current.toFixed(1)}px, 0)`
    const scrim = scrimRef.current
    if (scrim) {
      /* The backdrop lightens as the sheet leaves, so the two move together. */
      const height = sheet.offsetHeight || 1
      scrim.style.opacity = String(Math.max(0, 1 - offsetRef.current / height))
    }
  }, [])

  const schedule = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(paint)
  }, [paint])

  /** Slides the sheet to a resting place with a transition, then lets go. */
  const settle = useCallback((to: number, ms: number, then?: () => void) => {
    const sheet = sheetRef.current
    if (!sheet) { then?.(); return }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    sheet.style.transition = `transform ${ms}ms ${EASE}`
    const scrim = scrimRef.current
    if (scrim) scrim.style.transition = `opacity ${ms}ms ${EASE}`
    offsetRef.current = to
    /* Read once so the browser has the start position before the new one. */
    void sheet.offsetHeight
    sheet.style.transform = `translate3d(0, ${to}px, 0)`
    if (scrim) scrim.style.opacity = to > 0 ? "0" : "1"
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      sheet.style.transition = ""
      if (scrim) scrim.style.transition = ""
      then?.()
    }, ms)
  }, [])

  /**
   * Out of the way, then gone.
   *
   * ONE DISMISSAL, and `closingRef` is what makes it one. A drag that
   * dismisses ends by calling `onClose`, which flips `isOpen`, which reached
   * the effect below and started a SECOND slide from a sheet that had
   * already left — re-arming the transition and holding the unmount open for
   * another three hundred milliseconds after the sheet was gone.
   */
  const dismiss = useCallback((velocity = 0) => {
    if (closingRef.current) return
    closingRef.current = true
    const sheet = sheetRef.current
    const travel = Math.max(1, (sheet?.offsetHeight ?? 400) - offsetRef.current)
    /* A hard flick has less left to do and should take less time doing it. */
    const ms = Math.max(140, Math.min(CLOSE_MS, velocity > 0 ? travel / (velocity * 2.2) : CLOSE_MS))
    settle(sheet?.offsetHeight ?? 600, ms, () => {
      setPresent(false)
      onClose()
    })
  }, [onClose, settle])

  /* ── Open and close ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (isOpen) {
      closingRef.current = false
      setPresent(true)
      return
    }
    if (present) dismiss()
  }, [isOpen, present, dismiss])

  /* The entrance, once the node exists to move. */
  useEffect(() => {
    if (!present) return
    const sheet = sheetRef.current
    if (!sheet) return
    offsetRef.current = sheet.offsetHeight || 600
    sheet.style.transform = `translate3d(0, ${offsetRef.current}px, 0)`
    if (scrimRef.current) scrimRef.current.style.opacity = "0"
    /* Two frames: the first commits the closed position, the second animates
       from it. One frame and the browser collapses them into no movement. */
    const id = requestAnimationFrame(() => requestAnimationFrame(() => settle(0, OPEN_MS)))
    return () => cancelAnimationFrame(id)
  }, [present, settle])

  /* Nothing behind a sheet scrolls. */
  useEffect(() => {
    if (!present) return
    const body = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = body }
  }, [present])

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  }, [])

  /* ── The drag ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!present) return
    const sheet = sheetRef.current
    if (!sheet) return

    const atTop = () => (scrollRef.current?.scrollTop ?? 0) <= 1

    const onStart = (e: TouchEvent) => {
      const handle = (e.target as HTMLElement | null)?.closest?.("[data-sheet-handle]")
      /* From the handle always; from the body only when there is nothing to
         scroll up to, or a downward flick would fight the list. */
      if (!handle && !atTop()) return
      if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null }
      sheet.style.transition = ""
      if (scrimRef.current) scrimRef.current.style.transition = ""
      draggingRef.current = true
      startYRef.current = e.touches[0].clientY - offsetRef.current
      lastYRef.current = e.touches[0].clientY
      lastAtRef.current = performance.now()
      velocityRef.current = 0
    }

    const onMove = (e: TouchEvent) => {
      if (!draggingRef.current) return
      const y = e.touches[0].clientY
      let next = y - startYRef.current
      if (next < 0) {
        /**
         * =================================================================
         *  PULLING UP MOVES THE SHEET, AND THE SHEET HAS A BOTTOM
         * =================================================================
         * This was `next / 3` with nothing stopping it, so a long upward
         * drag translated the sheet a long way up — and the sheet is
         * anchored to the bottom of the screen, so everything it uncovered
         * down there was the scrim. That is the black band.
         *
         * Two things keep it shut. The give is capped, so a pull has
         * somewhere to go and then firmly stops; and the sheet paints on
         * past its own bottom edge (see the skirt below), so even the capped
         * amount uncovers nothing.
         */
        next = -PULL_CAP * (1 - Math.exp(next / (PULL_CAP * 2)))
      } else if (!atTop() && next > 0) {
        draggingRef.current = false
        settle(0, 180)
        return
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
      if (!draggingRef.current) return
      draggingRef.current = false
      /**
       * A FLICK IS A FLICK ONLY IF THE FINGER WAS STILL MOVING WHEN IT LEFT.
       *
       * Velocity comes from the last move, so a fast drag followed by a pause
       * and then a lift carried the speed of the drag into the release and
       * closed a sheet the person had just stopped to keep. Anything older
       * than a few frames is not a flick, it is a rest.
       */
      const v = performance.now() - lastAtRef.current > 80 ? 0 : velocityRef.current
      if (offsetRef.current > DISMISS_PX || v > DISMISS_VELOCITY) dismiss(Math.max(v, 0))
      else settle(0, 220)
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
  }, [present, dismiss, settle, schedule])

  useEffect(() => {
    if (!present) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [present, onClose])

  if (!mounted || !present) return null

  return createPortal(
    <div className="fixed inset-0 z-[200] sm:hidden" role="dialog" aria-modal="true" aria-label={label ?? title}>
      <div
        ref={scrimRef}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        style={{ opacity: 0, willChange: "opacity" }}
      />
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 rounded-t-[20px] bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.18)]"
        style={{
          /* The sheet owns every touch on it: the browser must not decide
             half way through that this was a scroll. */
          touchAction: "none",
          willChange: "transform",
          paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
          maxHeight: "min(86dvh, 720px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div data-sheet-handle className="shrink-0 pt-2.5 pb-1">
          <div className="mx-auto h-1 w-9 rounded-full bg-neutral-300" />
          {title && (
            <p className="px-5 pt-3 text-[15px] font-semibold text-neutral-900">{title}</p>
          )}
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }}>
          {children}
        </div>
        {/*
          THE SKIRT. The sheet's own colour, carried on below where the sheet
          ends. Nothing here is ever meant to be seen: it is what is there
          instead of the scrim when the sheet is lifted by a pull, by a
          keyboard, or by a phone deciding its safe area is bigger than it
          said. Out of the layout, so it changes nothing above it.
        */}
        <div
          aria-hidden
          style={{ position: "absolute", left: 0, right: 0, top: "100%", height: 160, background: "inherit" }}
        />
      </div>
    </div>,
    document.body,
  )
}

export default BottomSheet
