"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { triggerHaptic } from "@/lib/native-bridge"
import { lockScroll } from "@/lib/scroll-lock"
import { useWideViewport } from "@/lib/use-wide-viewport"
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
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE SCRIM SETS THE STAGE — BUT IT MUST NOT GET THE SHEET'S CURVE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It leads the sheet, and that part is right and is kept: tied to the sheet's
 * own 380ms the page behind was still fully legible when the panel was already
 * halfway up, which is two things arriving at once. Landing the dim first means
 * the sheet arrives onto a stage that has been set.
 *
 * WHAT WAS WRONG IS THE EASING, and shortening the duration made it worse.
 * `cubic-bezier(0.32, 0.72, 0, 1)` is the sheet's spring, and handing it to an
 * opacity is a category error dressed as consistency. That curve is violently
 * front-loaded, which is exactly right for TRAVEL — a sheet that leaves fast and
 * settles slowly reads as an object with momentum. An opacity has no momentum to
 * read. It reaches about 62% of its value in the first quarter of its duration,
 * so at 240ms the screen was essentially fully dimmed within about sixty
 * milliseconds and then spent the rest of the time on rounding. That is not a
 * fade, it is a cut with a tail on it, and it is what reads as cheap.
 *
 * A fade wants to be EVEN. `cubic-bezier(0.33, 0, 0.67, 1)` is symmetric and
 * gentle at both ends: nothing jumps at the start, nothing stops abruptly at the
 * finish, and it is the same shape in reverse on the way out.
 *
 * 320 still lands the dim comfortably before the sheet's 380ms of travel — the
 * stage is still set first — while giving the change of state a length the eye
 * can follow. The sheet keeps its spring, because the sheet is the thing that is
 * actually moving.
 */
const SCRIM_EASE = "cubic-bezier(0.33, 0, 0.67, 1)"
const SCRIM_IN = `opacity 320ms ${SCRIM_EASE}`
/* And it clears BEFORE the sheet has finished sliding, for the mirror of that
   reason: the screen you are going back to is readable again while the sheet is
   still on its way down, which reads as the sheet leaving rather than as the app
   waiting for it. 200ms on a front-loaded curve was not "faster" though — it was
   instant, the dimming simply gone with the sheet still there. 260 on an even
   curve still finishes well inside the 300ms exit. */
const SCRIM_OUT = `opacity 260ms ${SCRIM_EASE}`
const OUT_MS = 310
/** Past this share of its own height, letting go throws it away. */
const DISMISS_RATIO = 0.28
/** …or past this speed, in px/ms, however far it got. A flick is an intention. */
const DISMISS_VELOCITY = 0.55

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ON A DESKTOP THIS IS NOT A SHEET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything above is designed around a thumb: a panel that rises from the
 * bottom edge because that is the part of a phone a hand can reach, with a grab
 * handle because a finger can throw it away, capped at 86% of the viewport
 * because the top of a phone is where the status bar lives.
 *
 * Put the same object on a 27-inch monitor and every one of those reasons is
 * gone, and what is left is the tell: a panel glued to the bottom edge of a
 * browser window, five hundred pixels wide in the middle of two thousand, with
 * a grab handle nobody can grab because a mouse does not flick. It is the single
 * loudest way a desktop screen announces it was designed for a phone and shipped
 * as-is.
 *
 * So the same component draws a CENTRED DIALOG above 768px. Not a second
 * component and not a second call site — the ten places that open one of these
 * would each have grown their own answer, and ten answers to "what does this
 * look like on a laptop" is how an app ends up with three modal styles.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MOTION IS DIFFERENT TOO, AND NOT JUST THE POSITION
 * ---------------------------------------------------------------------------
 * A sheet's spring is front-loaded because it models an object with momentum
 * being thrown up from an edge. A dialog does not travel — it is already where
 * it is going — so it arrives by settling: a few pixels of rise and a hair of
 * scale, under an opacity. Given the sheet's curve and its 380ms it would look
 * like it had been dropped rather than opened.
 *
 * Shorter, as well. A sheet's length is justified by the distance it covers; a
 * dialog that fades for a third of a second is a dialog you wait for.
 */
const DIALOG_IN =
  "transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 180ms cubic-bezier(0.33, 0, 0.67, 1)"
const DIALOG_OUT =
  "transform 170ms cubic-bezier(0.4, 0, 0.9, 1), opacity 150ms cubic-bezier(0.33, 0, 0.67, 1)"
const DIALOG_OUT_MS = 180
/** Rest, and the eight pixels below it that it rises through. */
const DIALOG_SHOWN = "translate3d(0, 0, 0) scale(1)"
const DIALOG_HIDDEN = "translate3d(0, 8px, 0) scale(0.97)"
const SHEET_SHOWN = "translate3d(0, 0, 0)"
const SHEET_HIDDEN = "translate3d(0, 100%, 0)"

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
  /**
   * A dialog above 768px, a sheet below it — see the note by DIALOG_IN.
   *
   * Read here rather than in CSS because this component animates by writing
   * styles straight to the node: a media query could move the box but could not
   * tell the imperative code which transform means "hidden", and a dialog
   * springing in from `translateY(100%)` is a dialog that flies up from off
   * screen. One source of truth for both halves.
   *
   * The hook resolves in an effect, so it is false for the first client render.
   * That costs nothing here: these components render null until something opens
   * them, which is always long after mount.
   */
  const wide = useWideViewport()
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const outMs = wide ? DIALOG_OUT_MS : OUT_MS

  const settle = useCallback(
    (to: "open" | "closed") => {
      const sheet = sheetRef.current
      const scrim = scrimRef.current
      if (!sheet || !scrim) return
      const opening = to === "open"
      sheet.style.transition = wide
        ? opening
          ? DIALOG_IN
          : DIALOG_OUT
        : opening
          ? SPRING_IN
          : SPRING_OUT
      scrim.style.transition = opening ? SCRIM_IN : SCRIM_OUT
      sheet.style.transform = wide
        ? opening
          ? DIALOG_SHOWN
          : DIALOG_HIDDEN
        : opening
          ? SHEET_SHOWN
          : SHEET_HIDDEN
      // A sheet travels, so it needs no opacity — it is legible the whole way
      // and its own edge is the animation. A dialog barely moves, so opacity is
      // the animation; without it the box would simply appear.
      sheet.style.opacity = wide ? (opening ? "1" : "0") : "1"
      scrim.style.opacity = opening ? "1" : "0"
      // A sheet on its way out stops taking taps. It is still on screen for a
      // third of a second after the decision was made, and a row pressed in that
      // window fires an action against a panel the person has already dismissed —
      // which is where "I tapped once and it did it twice" comes from.
      const dead = opening ? "" : "none"
      sheet.style.pointerEvents = dead
      scrim.style.pointerEvents = dead
    },
    [wide],
  )

  const dismiss = useCallback(() => {
    settle("closed")
    // Long enough for the spring to finish. Unmounting mid-animation is the
    // sheet vanishing rather than leaving, which is the whole thing this avoids.
    window.setTimeout(onClose, outMs)
  }, [onClose, outMs, settle])

  /**
   * ESCAPE CLOSES IT.
   *
   * A phone has a system back gesture and a scrim under a thumb; a keyboard has
   * neither, and Escape is the one key every person who has ever closed a dialog
   * reaches for first. It was missing entirely — which on the sheets that have
   * no visible close control at all (the message actions list) meant the only
   * way out on a desktop was to find the dimmed area and click it.
   *
   * Bound while MOUNTED rather than while open, so a key pressed during the
   * closing animation cannot re-enter anything.
   */
  useEffect(() => {
    if (!mounted || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        dismiss()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mounted, open, dismiss])

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    settle("closed")
    const t = window.setTimeout(() => setMounted(false), outMs)
    return () => window.clearTimeout(t)
  }, [open, mounted, outMs, settle])

  /**
   * THE PAGE BEHIND HOLDS STILL.
   *
   * Without this the profile scrolls under the sheet — a thumb that lands
   * slightly off it, or on it but past the end of its list, moves the whole
   * page. Nothing breaks; it just reads as a panel sitting on a web page rather
   * than as part of the app, and it is the single loudest source of "this feels
   * laggy" on a screen where nothing is actually slow.
   *
   * Held for as long as the sheet is MOUNTED rather than open, so the page is
   * still still while the sheet is on its way down. Counted, because the delete
   * confirmation opens over this one and the two overlap — see lib/scroll-lock.
   */
  useEffect(() => {
    if (!mounted) return
    return lockScroll()
  }, [mounted])

  // Start below the frame, then spring up on the NEXT frame. Rendering it
  // already in place can only ever pop; two separate style commits are what give
  // the browser something to animate between.
  useEffect(() => {
    if (!mounted || !open) return
    const sheet = sheetRef.current
    const scrim = scrimRef.current
    if (!sheet || !scrim) return
    sheet.style.transition = "none"
    sheet.style.transform = wide ? DIALOG_HIDDEN : SHEET_HIDDEN
    sheet.style.opacity = wide ? "0" : "1"
    scrim.style.transition = "none"
    scrim.style.opacity = "0"
    void sheet.offsetHeight // commit the start state before the target replaces it
    const raf = requestAnimationFrame(() => settle("open"))
    return () => cancelAnimationFrame(raf)
  }, [mounted, open, wide, settle])

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
    <div
      className={cn("fixed inset-0 z-[95]", wide && "flex items-center justify-center p-6")}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {/* `will-change: opacity` on the scrim as well as the sheet. Both are
          animated on every open and close, and a full-screen black layer that
          is NOT promoted is a full-screen repaint per frame behind a sheet that
          is trying to slide at sixty — the one element on this component most
          likely to be the reason it is not.

          Lighter behind a dialog. A sheet covers the bottom half of a phone and
          the dim is what says the rest of the screen is not the subject; a
          dialog is a small box in the middle of a large window, and 45% black
          over a whole desktop for a three-row menu is a blackout for a
          decision that does not deserve one. */}
      <div
        ref={scrimRef}
        onClick={dismiss}
        className={cn("absolute inset-0 will-change-[opacity]", wide ? "bg-black/30" : "bg-black/45")}
        style={{ opacity: 0 }}
      />

      <div
        ref={sheetRef}
        // No drag on a desktop. The handlers are not merely inert there — a
        // mouse-down that begins a gesture the pointer can never complete is
        // how a dialog ends up half-dismissed under a cursor that was only
        // trying to select the text in it.
        onPointerDown={wide ? undefined : onPointerDown}
        onPointerMove={wide ? undefined : onPointerMove}
        onPointerUp={wide ? undefined : onPointerUp}
        onPointerCancel={wide ? undefined : onPointerUp}
        className={cn(
          "flex max-h-[86dvh] flex-col bg-white will-change-transform [backface-visibility:hidden]",
          wide
            ? // Centred, its own object, with a shadow that reads as height off
              // the page rather than as a panel lifted off the bottom edge.
              "relative w-full max-w-lg rounded-2xl shadow-[0_24px_70px_-12px_rgba(15,15,15,0.32),0_2px_8px_rgba(15,15,15,0.08)]"
            : "absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-3xl shadow-[0_-8px_44px_rgba(0,0,0,0.2)]",
          className,
        )}
        style={{ transform: wide ? DIALOG_HIDDEN : SHEET_HIDDEN, opacity: wide ? 0 : 1 }}
      >
        {wide ? (
          /* A grab handle on a desktop is a control that cannot be operated —
             a mouse does not flick — so it is replaced by the one a pointer
             expects. The spacer keeps the button in its own corner on the
             sheets that pass no header at all (the message actions list),
             rather than floating it over their first row. */
          <div className="relative shrink-0 pr-11">
            {/* `pr-11` on the wrapper rather than on each caller's header: the
                close button occupies that column, and a header laid out to the
                full width would truncate its own title underneath it. */}
            {header ?? <span aria-hidden className="block h-9" />}
            <button
              type="button"
              aria-label="Închide"
              onClick={dismiss}
              className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="h-[17px] w-[17px]" strokeWidth={2.3} />
            </button>
          </div>
        ) : (
          /* `touch-action: none` here and only here: the browser must not claim
              this gesture for a scroll before the handler sees it, and everything
              below still scrolls normally. */
          <div
            data-sheet-handle
            className="shrink-0 cursor-grab pt-2.5 active:cursor-grabbing"
            style={{ touchAction: "none" }}
          >
            <span aria-hidden className="mx-auto block h-1.5 w-10 rounded-full bg-neutral-200" />
            {header}
          </div>
        )}

        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2"
          // The home-indicator inset is a phone fact. On a desktop it resolves
          // to zero anyway, but the 14px floor under it would still be reserving
          // room for a gesture bar that is not there.
          style={{
            paddingBottom: wide ? 10 : "max(calc(env(safe-area-inset-bottom, 0px) + 4px), 14px)",
          }}
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
  //
  // The hover state is gated on there being a pointer, not on a breakpoint. A
  // plain `hover:` lights the row on tap and leaves it lit until the next one,
  // and `md:hover:` would do exactly that on every tablet — which is the same
  // class of mistake as shipping a bottom sheet to a desktop: a guess at the
  // input device made from the width of the screen.
  "flex w-full items-center gap-3 rounded-xl px-3 py-[15px] text-left text-[16px] transition-colors active:bg-neutral-100 [@media(hover:hover)]:hover:bg-neutral-50"
