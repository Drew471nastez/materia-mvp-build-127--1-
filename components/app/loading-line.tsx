"use client"

/**
 * ===========================================================================
 *  THE APP'S SLIM PROGRESS LINE, FOR A PART OF A PAGE
 * ===========================================================================
 * The navigation bar's motion (components/app/navigation-loading-bar.tsx)
 * for numbers a page is waiting on: 2px along the top edge of what is
 * loading, nothing for the first AFTER_MS (most answers are back by then,
 * and a line that flashes says "loading" about nothing), then it runs
 * towards 90% on a curve that slows as it goes, and when the wait ends it
 * runs to the end and fades.
 *
 * On the compositor: two Web Animations, of transform and then of opacity,
 * started from effects. Nothing renders while it moves, a busy main thread
 * (the answer being drawn, say) cannot stall it, and it holds no React
 * state, so starting and stopping it renders nothing either.
 *
 * Under reduced motion it does not run: it is drawn part way while the wait
 * lasts, and goes when it ends.
 */

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/** Nothing is drawn for a wait shorter than this: the navigation bar's NAV_BAR_AFTER_MS. */
export const LOADING_LINE_AFTER_MS = 300
/** How long it takes to reach 90%, on a curve that has done most of that in the first second. */
const RUN_MS = 6000
const RUN_EASE = "cubic-bezier(0.1, 0.6, 0.3, 1)"
/** The end: to the full width, then away. */
const END_MS = 420

function scaleOf(el: HTMLElement): number {
  const t = getComputedStyle(el).transform
  if (!t || t === "none") return 0
  try {
    return new DOMMatrixReadOnly(t).a
  } catch {
    return 0
  }
}

export function LoadingLine({ active, className }: { active: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const run = useRef<{ timer: number | null; anim: Animation | null; shown: boolean }>({ timer: null, anim: null, shown: false })

  useEffect(() => {
    const el = ref.current
    const r = run.current
    if (!el || typeof el.animate !== "function") return
    const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (active) {
      if (r.shown || r.timer != null) return
      r.timer = window.setTimeout(() => {
        r.timer = null
        r.shown = true
        r.anim?.cancel()
        if (still) {
          r.anim = el.animate([{ transform: "scaleX(0.6)", opacity: 1 }, { transform: "scaleX(0.6)", opacity: 1 }], { duration: 1, fill: "forwards" })
          return
        }
        r.anim = el.animate([{ transform: "scaleX(0)", opacity: 1 }, { transform: "scaleX(0.9)", opacity: 1 }], { duration: RUN_MS, easing: RUN_EASE, fill: "forwards" })
      }, LOADING_LINE_AFTER_MS)
      return
    }
    if (r.timer != null) {
      window.clearTimeout(r.timer)
      r.timer = null
    }
    if (!r.shown) return
    r.shown = false
    const from = scaleOf(el)
    r.anim?.cancel()
    const end = still
      ? el.animate([{ transform: `scaleX(${from})`, opacity: 1 }, { transform: `scaleX(${from})`, opacity: 0 }], { duration: 120, fill: "forwards" })
      : el.animate(
          [
            { transform: `scaleX(${from})`, opacity: 1 },
            { transform: "scaleX(1)", opacity: 1, offset: 0.45 },
            { transform: "scaleX(1)", opacity: 0 },
          ],
          { duration: END_MS, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" },
        )
    r.anim = end
    end.onfinish = () => {
      if (r.anim !== end) return
      r.anim = null
      end.cancel()
    }
  }, [active])

  useEffect(() => {
    const r = run.current
    return () => {
      if (r.timer != null) window.clearTimeout(r.timer)
      r.anim?.cancel()
    }
  }, [])

  return (
    <span
      ref={ref}
      aria-hidden
      data-loading-line=""
      className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 block h-[2px] origin-left bg-[#8b5cf6]", className)}
      style={{ opacity: 0, transform: "scaleX(0)" }}
    />
  )
}
