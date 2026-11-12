"use client"

/*
  PLATFORM TRACK MOTION PRIMITIVES (home sections 3, 10, 11, 13, 15).

  Everything here costs nothing while a section is off screen:
  - one IntersectionObserver per section root (no scroll listeners at all),
  - `data-platform-in` is set once, the first time a section is seen, and
    drives every reveal through CSS transitions on transform and opacity,
  - `data-platform-live` follows whether the section is on screen AND the tab
    is visible; CSS pauses every loop under `[data-platform-live="false"]`
    and the JS loops (globe, typing, tickers) stop their timers.
  - prefers-reduced-motion: reveals are instant and loops never start.
*/

import { useEffect, useRef, useState, type RefObject } from "react"

export const platformReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Watches a section root. Returns whether it is "live" (on screen and the tab
 * is visible) and writes the two data attributes the CSS reads.
 */
export function usePlatformSection(
  ref: RefObject<HTMLElement | null>,
  rootMargin = "120px 0px",
): { seen: boolean; live: boolean; reduced: boolean } {
  /* One state object, changed only when something in it changes: one render per real change. */
  const [state, setState] = useState({ seen: false, live: false, reduced: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const motion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null
    let onScreen = false
    let seen = false
    const sync = () => {
      const reduced = !!motion?.matches
      const live = onScreen && !document.hidden && !reduced
      const value = String(live)
      if (el.dataset.platformLive !== value) el.dataset.platformLive = value
      setState((p) => (p.seen === seen && p.live === live && p.reduced === reduced ? p : { seen, live, reduced }))
    }
    if (typeof IntersectionObserver !== "function") {
      el.setAttribute("data-platform-in", "")
      seen = true
      onScreen = true
      sync()
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        if (onScreen && !seen) {
          seen = true
          el.setAttribute("data-platform-in", "")
        }
        sync()
      },
      { rootMargin, threshold: 0 },
    )
    io.observe(el)
    document.addEventListener("visibilitychange", sync)
    motion?.addEventListener?.("change", sync)
    sync()
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", sync)
      motion?.removeEventListener?.("change", sync)
    }
  }, [ref, rootMargin])
  return state
}

/**
 * A number that counts up to `value` once `start` turns true. The server
 * renders the final figure, so it is readable without JS; the animation
 * changes the text node's data in place, one write per frame, without
 * re-rendering and without replacing the node: the site's stylesheet has
 * `:has()` rules on <html> and <body>, and a text node put into the page
 * makes the browser restyle the whole document (1,800 elements) for it.
 */
export function PlatformCount({
  value,
  start,
  format = (n) => Math.round(n).toLocaleString("en-US"),
  duration = 1400,
  from = 0,
  className,
}: {
  value: number
  start: boolean
  format?: (n: number) => string
  duration?: number
  from?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef<number | null>(null)
  const formatRef = useRef(format)
  formatRef.current = format
  useEffect(() => {
    const el = ref.current
    if (!el || !start) return
    let text = el.firstChild
    if (!text || text.nodeType !== 3) {
      el.textContent = formatRef.current(value)
      text = el.firstChild
    }
    const node = text as Text
    if (platformReducedMotion()) {
      node.data = formatRef.current(value)
      shown.current = value
      return
    }
    const begin = shown.current ?? from
    const t0 = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const n = begin + (value - begin) * eased
      shown.current = n
      const next = formatRef.current(n)
      if (node.data !== next) node.data = next
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, start, duration, from])
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(value)}
    </span>
  )
}

/** A step counter that advances every `ms` while `live`, for looping demos. */
export function usePlatformTicker(live: boolean, ms: number, steps: number) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setStep((s) => (s + 1) % steps), ms)
    return () => window.clearInterval(id)
  }, [live, ms, steps])
  return step
}
