"use client"

import { useEffect, useState, type RefObject } from "react"

/**
 * One answer for every W12 motion primitive: should this element be moving
 * right now? False while it is offscreen, while the tab is hidden and when the
 * visitor prefers reduced motion. Re-renders only when the answer changes, so
 * timers and rAF loops can start and stop on it without polling.
 */
export function useMotionGate(
  ref: RefObject<HTMLElement | null>,
  rootMargin = "120px 0px",
): boolean {
  const [running, setRunning] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const reduce = matchMedia("(prefers-reduced-motion: reduce)")
    let visible = typeof IntersectionObserver !== "function"
    const sync = () => setRunning(visible && !document.hidden && !reduce.matches)
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting
              sync()
            },
            { rootMargin },
          )
        : null
    io?.observe(node)
    sync()
    document.addEventListener("visibilitychange", sync)
    reduce.addEventListener("change", sync)
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", sync)
      reduce.removeEventListener("change", sync)
    }
  }, [ref, rootMargin])
  return running
}

/** Shared keyframes for the CSS-only primitives, hoisted and deduplicated by
 * React (same href, one <style> in the document however many instances). */
export const MOTION_STYLE_PRECEDENCE = "w12-motion"
