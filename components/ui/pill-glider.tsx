"use client"

/**
 * ===========================================================================
 *  ONE FILL THAT GLIDES TO THE CHOSEN PILL
 * ===========================================================================
 * Pill rows drew the chosen state as each pill's own fill: the old one
 * emptied and the new one filled, two fades in two places, which read as a
 * flash and a bump. This is one element, under the labels, that moves to the
 * chosen pill on transform and width only. A second press mid-glide sets a
 * new target and it turns towards it; nothing queues.
 *
 * HOW A ROW USES IT. The row is `relative` and is this element's parent; the
 * chosen pill matches `selector`; each label sits above the fill (z-[2]).
 * Until the fill has measured, the chosen pill draws its own fill (the
 * server's paint, a page with no script). In the same frame the fill is
 * placed, the row gets `data-glide`, and pills drop their own fill under
 * `group-data-[glide]/<name>:`, so nothing blinks on hydration.
 *
 * Reduced motion: it moves without a transition.
 */
import { useLayoutEffect, useRef } from "react"
import { cn } from "@/lib/utils"

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
export const PILL_GLIDE_MS = 280

export function PillGlider({ active, selector = "[aria-current=page]", className }: { active: string; selector?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)

  useLayoutEffect(() => {
    const fill = ref.current
    const row = fill?.parentElement
    if (!fill || !row) return
    const still = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const place = (animate: boolean) => {
      const on = row.querySelector<HTMLElement>(selector)
      if (!on) {
        fill.style.opacity = "0"
        return
      }
      fill.style.transition = animate && !still() ? `transform ${PILL_GLIDE_MS}ms ${EASE}, width ${PILL_GLIDE_MS}ms ${EASE}, opacity 120ms linear` : "none"
      fill.style.width = `${on.offsetWidth}px`
      fill.style.height = `${on.offsetHeight}px`
      fill.style.transform = `translate3d(${on.offsetLeft}px, ${on.offsetTop}px, 0)`
      fill.style.opacity = "1"
      if (!placed.current) {
        placed.current = true
        row.setAttribute("data-glide", "")
      }
    }
    place(placed.current)
    /* A font arriving, a label changing: the pill's width changed, follow it at once. */
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => place(false))
    ro.observe(row)
    return () => ro.disconnect()
  }, [active, selector])

  return <span ref={ref} aria-hidden data-pill-glider="" className={cn("pointer-events-none absolute left-0 top-0 z-[1] rounded-full opacity-0 will-change-transform", className)} />
}
