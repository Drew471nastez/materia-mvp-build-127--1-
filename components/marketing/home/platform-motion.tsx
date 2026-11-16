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

  WAVE 17 (the owner's iPhone recording: sections arriving as empty boxes
  whose insides appeared a few frames later, on every change of direction):
  - a loop is woken a screen before its section arrives (LIVE_AHEAD), not as
    it reaches the screen's edge (it was 120px). Paused there, a section came
    in still paused, and on iOS the animated parts (each its own layer) were
    drawn only after the page's thread had caught up: the app's phone, the
    rows of apps, the terminal's lines, the contacts.
  - on a phone or any touch screen (touchScreen) an entrance never hides
    what is about to scroll in: `data-platform-in` is set a screen ahead
    too, so the stage is already there when it arrives. A computer keeps
    the entrance at the screen's edge as its track wrote it.
*/

import { startTransition, useEffect, useRef, useState, type RefObject } from "react"

/** Wave 17: how far ahead of the screen (either way) a section's loops run: a screen. */
export const LIVE_AHEAD = "100% 0px"

/** Wave 17: a phone or a touch screen, the same test as the page's phone rules (landing-story.tsx REVEAL_CSS). */
export const TOUCH_SCREEN_QUERY = "(max-width: 767px), (hover: none) and (pointer: coarse)"
export const touchScreen = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(TOUCH_SCREEN_QUERY).matches

export const platformReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Watches a section root. Returns whether it is "live" (on screen and the tab
 * is visible) and writes the two data attributes the CSS reads.
 *
 * Wave 17: `live` (the script loops: the globe, the tickers) still follows
 * `rootMargin`; `data-platform-live` (the CSS loops) is "true" a screen ahead
 * (LIVE_AHEAD), and on a touch screen `data-platform-in` is set there too.
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
    let near = false
    let seen = false
    const sync = () => {
      const reduced = !!motion?.matches
      const live = onScreen && !document.hidden && !reduced
      const value = String((near || onScreen) && !document.hidden && !reduced)
      if (el.dataset.platformLive !== value) el.dataset.platformLive = value
      /* As a transition: the section re-renders in slices between frames, not as one task of up to 100 ms at 4x CPU in the middle of a scroll. The attributes above, which the CSS reads, are already written. */
      startTransition(() => setState((p) => (p.seen === seen && p.live === live && p.reduced === reduced ? p : { seen, live, reduced })))
    }
    if (typeof IntersectionObserver !== "function") {
      el.setAttribute("data-platform-in", "")
      seen = true
      onScreen = true
      sync()
      return
    }
    const early = touchScreen()
    const markSeen = () => {
      if (seen) return
      seen = true
      el.setAttribute("data-platform-in", "")
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        if (onScreen) markSeen()
        sync()
      },
      { rootMargin, threshold: 0 },
    )
    const ahead = new IntersectionObserver(
      ([entry]) => {
        near = entry.isIntersecting
        if (near && early) markSeen()
        sync()
      },
      { rootMargin: LIVE_AHEAD, threshold: 0 },
    )
    io.observe(el)
    ahead.observe(el)
    document.addEventListener("visibilitychange", sync)
    motion?.addEventListener?.("change", sync)
    sync()
    return () => {
      io.disconnect()
      ahead.disconnect()
      document.removeEventListener("visibilitychange", sync)
      motion?.removeEventListener?.("change", sync)
    }
  }, [ref, rootMargin])
  return state
}

/**
 * LANDING ROUND 12 (perf). A tall section is live while any of it is within a
 * screen (LIVE_AHEAD), so on a phone its lower cards ran their loops two or
 * three screens away (the round 12 audit: the analytics and Everything
 * sections, 8 and 22 loops). Each part matching `selector` inside the root
 * gets `data-part-live`, "true" while ALL of that part is within a screen
 * (so no loop in it runs further away than that) and "false" otherwise, from
 * one IntersectionObserver for all of them (no scroll listener, nothing
 * measured by hand). The CSS pauses a part's loops on "false"; a part not yet
 * reported has no attribute and follows its section. A part is never taller
 * than the three screens the observer looks over.
 */
export const PART_LIVE_ATTR = "data-part-live"
/** Whole within the observer's margin: the share of it inside is all of it (an empty box counts as inside once it intersects). */
export const wholeInside = (e: IntersectionObserverEntry) =>
  e.isIntersecting && (e.intersectionRatio > 0.99 || e.boundingClientRect.width * e.boundingClientRect.height === 0)
export function usePartsLive(ref: RefObject<HTMLElement | null>, selector: string) {
  useEffect(() => {
    const root = ref.current
    if (!root || typeof IntersectionObserver !== "function") return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const value = String(wholeInside(e))
          const el = e.target as HTMLElement
          if (el.getAttribute(PART_LIVE_ATTR) !== value) el.setAttribute(PART_LIVE_ATTR, value)
        }
      },
      { rootMargin: LIVE_AHEAD, threshold: [0, 0.995] },
    )
    root.querySelectorAll(selector).forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [ref, selector])
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
