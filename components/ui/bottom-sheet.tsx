"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * A sheet that follows your finger.
 *
 * Extracted from the conversation's details panel the moment a second thing
 * needed one. Two copies of a drag this fiddly is two places for it to be
 * subtly different, and "subtly different" in a gesture is what people read as
 * an app being unfinished.
 *
 * The gesture, and why it is written this way:
 *
 *   The transform tracks the pointer in real time and the scrim's opacity
 *   follows how far down it has been pulled. Letting go either throws it away
 *   or springs it back, decided by distance OR by velocity — so a short fast
 *   flick closes it exactly like a long slow drag, which is the difference
 *   between a gesture that feels physical and one that feels like a threshold.
 *
 *   Nothing goes through React. A drag is sixty state updates a second; sixty
 *   re-renders of the sheet's contents is precisely how one ends up feeling
 *   like a web page. The transform and the opacity are written straight to the
 *   two nodes, one compositor property each.
 *
 *   The direction is decided ONCE, on the first four pixels of real movement.
 *   The handle owns its gesture outright; anywhere else the sheet only takes it
 *   if the content is scrolled to its top AND the finger is going down.
 *   Anything else belongs to the scroller and is never taken back — without
 *   that, an upward swipe at the top scrolled the content and dragged the sheet
 *   at the same time.
 */

/**
 * The curve iOS uses for a sheet: quick off the mark, long glide to rest.
 *
 * Two durations, not one. Opening is the sheet ARRIVING and wants the full
 * glide — you are about to read it, and the last hundred milliseconds of that
 * curve are what make it feel like it settled rather than stopped. Closing is
 * the sheet getting out of the way of a decision you have already made, and the
 * same 380ms there is a third of a second of watching something leave. 300 out
 * against 380 in is the asymmetry every native sheet has and the single
 * cheapest thing that makes one feel responsive.
 */
const SPRING_IN = "transform 380ms cubic-bezier(0.32, 0.72, 0, 1)"
const SPRING_OUT = "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)"
const SCRIM_IN = "opacity 380ms cubic-bezier(0.32, 0.72, 0, 1)"
/* The scrim clears FASTER than the sheet slides. It is the thing making the
   page behind it unreadable, so the screen you are going back to is bright
   again while the sheet is still on its way down — which reads as the sheet
   leaving rather than as the app waiting for it. */
const SCRIM_OUT = "opacity 220ms cubic-bezier(0.32, 0.72, 0, 1)"
const OUT_MS = 310
/** Past this share of its own height, letting go throws it away. */
const DISMISS_RATIO = 0.28
/** …or past this speed, in px/ms, however far it got. A flick is an intention. */
const DISMISS_VELOCITY = 0.55

export function BottomSheet({
  open,
  onClose,
  label,
  header,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  label: string
  /** Rendered inside the grab area, above the scrolling body. */
  header?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  /** Kept mounted through the closing animation, so it can be watched leaving. */
  const [mounted, setMounted] = useState(open)
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const settle = useCallback((to: "open" | "closed") => {
    const sheet = sheetRef.current
    const scrim = scrimRef.current
    if (!sheet || !scrim) return
    sheet.style.transition = to === "open" ? SPRING_IN : SPRING_OUT
    scrim.style.transition = to === "open" ? SCRIM_IN : SCRIM_OUT
    sheet.style.transform = to === "open" ? "translate3d(0, 0, 0)" : "translate3d(0, 100%, 0)"
    scrim.style.opacity = to === "open" ? "1" : "0"
  }, [])

  const dismiss = useCallback(() => {
    settle("closed")
    // Long enough for the spring to finish. Unmounting mid-animation is the
    // sheet vanishing rather than leaving, which is the whole thing this avoids.
    window.setTimeout(onClose, OUT_MS)
  }, [onClose, settle])

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    settle("closed")
    const t = window.setTimeout(() => setMounted(false), OUT_MS)
    return () => window.clearTimeout(t)
  }, [open, mounted, settle])

  // Start below the frame, then spring up on the NEXT frame. Rendering it
  // already in place can only ever pop; two separate style commits are what give
  // the browser something to animate between.
  useEffect(() => {
    if (!mounted || !open) return
    const sheet = sheetRef.current
    const scrim = scrimRef.current
    if (!sheet || !scrim) return
    sheet.style.transition = "none"
    sheet.style.transform = "translate3d(0, 100%, 0)"
    scrim.style.transition = "none"
    scrim.style.opacity = "0"
    void sheet.offsetHeight // commit the start state before the target replaces it
    const raf = requestAnimationFrame(() => settle("open"))
    return () => cancelAnimationFrame(raf)
  }, [mounted, open, settle])

  const drag = useRef({
    armed: false,
    active: false,
    fromHandle: false,
    startY: 0,
    dy: 0,
    lastY: 0,
    lastT: 0,
    v: 0,
  })

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const fromHandle = !!(e.target as HTMLElement).closest?.("[data-sheet-handle]")
    drag.current = {
      armed: true,
      active: false,
      fromHandle,
      startY: e.clientY,
      dy: 0,
      lastY: e.clientY,
      lastT: performance.now(),
      v: 0,
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    const sheet = sheetRef.current
    const scrim = scrimRef.current
    if (!sheet || !scrim) return

    if (d.armed && !d.active) {
      const dy0 = e.clientY - d.startY
      if (Math.abs(dy0) < 4) return // still ambiguous; wait for a real direction
      const body = bodyRef.current
      const atTop = !body || body.scrollTop <= 0
      if (!d.fromHandle && !(atTop && dy0 > 0)) {
        d.armed = false
        return
      }
      d.armed = false
      d.active = true
      d.startY = e.clientY // re-anchor so the sheet does not jump by the threshold
      d.lastY = e.clientY
      d.lastT = performance.now()
      sheet.style.transition = "none"
      scrim.style.transition = "none"
      sheet.setPointerCapture?.(e.pointerId)
    }
    if (!d.active) return

    // Upward gets a quarter of the travel: there is nowhere above for the sheet
    // to go, and refusing outright makes the gesture feel dead rather than
    // bounded.
    let dy = e.clientY - d.startY
    if (dy < 0) dy *= 0.25

    const now = performance.now()
    const dt = now - d.lastT
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = now
    d.dy = dy

    sheet.style.transform = `translate3d(0, ${dy}px, 0)`
    const h = sheet.offsetHeight || 1
    scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / h))
  }, [])

  const onPointerUp = useCallback(() => {
    const d = drag.current
    d.armed = false
    if (!d.active) return
    d.active = false
    const sheet = sheetRef.current
    if (!sheet) return
    const h = sheet.offsetHeight || 1
    if (d.dy > h * DISMISS_RATIO || d.v > DISMISS_VELOCITY) {
      void triggerHaptic("light")
      dismiss()
    } else {
      settle("open")
    }
  }, [dismiss, settle])

  if (!mounted || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label={label}>
      {/* `will-change: opacity` on the scrim as well as the sheet. Both are
          animated on every open and close, and a full-screen black layer that
          is NOT promoted is a full-screen repaint per frame behind a sheet that
          is trying to slide at sixty — the one element on this component most
          likely to be the reason it is not. */}
      <div
        ref={scrimRef}
        onClick={dismiss}
        className="absolute inset-0 bg-black/45 will-change-[opacity]"
        style={{ opacity: 0 }}
      />

      <div
        ref={sheetRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "absolute inset-x-0 bottom-0 mx-auto flex max-h-[86dvh] max-w-lg flex-col rounded-t-3xl bg-white",
          "shadow-[0_-8px_44px_rgba(0,0,0,0.2)] will-change-transform [backface-visibility:hidden]",
          className,
        )}
        style={{ transform: "translate3d(0, 100%, 0)" }}
      >
        {/* `touch-action: none` here and only here: the browser must not claim
            this gesture for a scroll before the handler sees it, and everything
            below still scrolls normally. */}
        <div
          data-sheet-handle
          className="shrink-0 cursor-grab pt-2.5 active:cursor-grabbing"
          style={{ touchAction: "none" }}
        >
          <span aria-hidden className="mx-auto block h-1.5 w-10 rounded-full bg-neutral-200" />
          {header}
        </div>

        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2"
          style={{ paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 4px), 14px)" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** The row shape both sheets use, so they cannot drift apart. */
export const SHEET_ROW =
  // 16px and a little more air. A sheet is a list of decisions read at arm's
  // length with a thumb over half the screen, and 15.5 was set to match a
  // conversation that has itself moved to 16 — the two must not disagree.
  "flex w-full items-center gap-3 rounded-xl px-3 py-[15px] text-left text-[16px] transition-colors active:bg-neutral-100"
