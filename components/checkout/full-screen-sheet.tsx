"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * ===========================================================================
 *  A SUBPAGE THAT ARRIVES, RATHER THAN APPEARING
 * ===========================================================================
 *
 * Every full-screen step of the checkout — the address, the card, the locker
 * map — opens through this. It slides in from the right and back out to the
 * right, which is the gesture grammar every phone uses for "deeper into the
 * same task", and it is the difference between a subpage and a screen that
 * blinks into existence with no indication of where it came from or how to get
 * back.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS BUILT THIS WAY AND NOT WITH A CSS CLASS
 * ---------------------------------------------------------------------------
 * Three things have to be true for a transition to actually feel smooth, and
 * missing any one of them produces the version that was here before — an
 * instant, jarring swap:
 *
 *   1. THE ELEMENT MUST EXIST, OFF-SCREEN, BEFORE IT MOVES. A transition needs
 *      two frames: one showing the start state and one showing the end. Mount
 *      and set the final transform in the same frame and the browser collapses
 *      them into one — nothing animates. So the panel mounts at
 *      translate3d(100%,0,0), and the move to 0 is written in the NEXT frame,
 *      after a forced reflow so it cannot be batched away.
 *
 *   2. IT MUST STAY MOUNTED WHILE IT LEAVES. Unmounting on close removes the
 *      element mid-animation — the panel vanishes instead of leaving, which is
 *      exactly as abrupt as having no animation at all.
 *
 *   3. IT MUST BE ONE COMPOSITOR PROPERTY. `transform` and nothing else. Any
 *      animation of width, height, top or opacity-on-a-large-subtree drops the
 *      whole thing onto the main thread, where it competes with React and with
 *      Stripe's iframes and lands at fifteen frames a second.
 *
 * The curve and the durations are the ones the app's bottom sheet already uses,
 * because two different easings for two kinds of panel in the same flow is
 * precisely the sort of thing that reads as unfinished. Out is faster than in:
 * arriving wants the full glide, leaving is getting out of the way of a
 * decision already made.
 */

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const IN_MS = 380
const OUT_MS = 300

/**
 * The slide itself, on its own, for panels that bring their own chrome.
 *
 * Returns `mounted` — true from the moment it opens until the exit animation
 * has finished — and a ref to put on the panel. The panel must start at
 * translate3d(100%, 0, 0); this drives it in and back out.
 */
export function useSlideInPanel(open: boolean, onClosed?: () => void) {
  const [mounted, setMounted] = useState(open)
  const ref = useRef<HTMLDivElement>(null)

  const slide = useCallback((to: "in" | "out") => {
    const el = ref.current
    if (!el) return
    el.style.transition = `transform ${to === "in" ? IN_MS : OUT_MS}ms ${EASE}`
    el.style.transform = to === "in" ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)"
  }, [])

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    slide("out")
    const t = window.setTimeout(() => {
      setMounted(false)
      onClosed?.()
    }, OUT_MS + 10)
    return () => window.clearTimeout(t)
  }, [open, mounted, slide, onClosed])

  useEffect(() => {
    if (!open || !mounted) return
    const el = ref.current
    if (!el) return
    el.style.transition = "none"
    el.style.transform = "translate3d(100%, 0, 0)"
    // Reading a layout property forces the start state to be committed, so the
    // browser cannot merge it with the transform written on the next line.
    void el.offsetHeight
    const raf = requestAnimationFrame(() => slide("in"))
    return () => cancelAnimationFrame(raf)
  }, [open, mounted, slide])

  return { mounted, ref }
}

/** The style a slide-in panel's root must carry. */
export const SLIDE_PANEL_STYLE: React.CSSProperties = {
  height: "100dvh",
  transform: "translate3d(100%, 0, 0)",
  // Promoted up front rather than at the moment it moves: promoting on the
  // first frame of the animation costs a layer creation inside the animation,
  // which is a visible hitch at exactly the wrong time.
  willChange: "transform",
}

export function FullScreenSheet({
  open,
  onClose,
  title,
  closeLabel = "închidere",
  footer,
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  title: string
  closeLabel?: string
  /** Pinned under the scrolling body — the save button, usually. */
  footer?: React.ReactNode
  children: React.ReactNode
  /** For screen readers, when it differs from the visible title. */
  label?: string
}) {
  const { mounted, ref: panelRef } = useSlideInPanel(open)

  // The page underneath must not scroll while a subpage is over it — otherwise
  // closing returns you to a checkout scrolled somewhere you never put it.
  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [mounted, onClose])

  if (!mounted || typeof document === "undefined") return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      className="fixed inset-0 z-[96] flex flex-col bg-white"
      style={SLIDE_PANEL_STYLE}
    >
      <header
        className="relative shrink-0 border-b border-neutral-200 px-4 pb-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="text-[15px] font-medium text-neutral-700 active:opacity-60"
        >
          {closeLabel}
        </button>
        <h1 className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[16px] font-bold text-neutral-900">
          {title}
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

      {footer && (
        <div
          className="shrink-0 border-t border-neutral-200 px-4 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {footer}
        </div>
      )}
    </div>,
    document.body,
  )
}

/** The save button every subpage ends with, so they cannot drift apart. */
export const SHEET_SAVE_BUTTON =
  "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-6 " +
  "text-[16px] font-semibold text-white transition-transform active:scale-[0.985] " +
  "disabled:opacity-40 disabled:active:scale-100"
