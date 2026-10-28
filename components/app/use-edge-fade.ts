"use client"

import { useLayoutEffect, useRef } from "react"

/**
 * A ROW THAT SCROLLS SIDEWAYS SAYS WHERE IT IS CUT. The row carries
 * `edge-fade` (app/globals.css), and this marks it `data-fade-start` while
 * something is scrolled off its left and `data-fade-end` while something is
 * past its right, so the cut edge fades out instead of slicing a label in
 * half. A row that fits carries neither, and has no mask at all.
 *
 * Written straight onto the element from a passive scroll listener and a
 * ResizeObserver: no React state, so a scroll never renders anything.
 */
export function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const mark = () => {
      frame = 0
      const max = el.scrollWidth - el.clientWidth
      const start = max > 1 && el.scrollLeft > 1
      const end = max > 1 && el.scrollLeft < max - 1
      if (start !== el.hasAttribute("data-fade-start")) el.toggleAttribute("data-fade-start", start)
      if (end !== el.hasAttribute("data-fade-end")) el.toggleAttribute("data-fade-end", end)
    }
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(mark)
    }
    mark()
    el.addEventListener("scroll", queue, { passive: true })
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(queue) : null
    ro?.observe(el)
    /* The row's own children change size too (a longer period's name). */
    for (const child of Array.from(el.children)) ro?.observe(child)
    return () => {
      el.removeEventListener("scroll", queue)
      ro?.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])
  return ref
}
