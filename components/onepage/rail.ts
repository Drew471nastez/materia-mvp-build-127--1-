"use client"

/**
 * ===========================================================================
 *  EVERY ROW THAT SLIDES SIDEWAYS, ONE HOOK (round 19)
 * ===========================================================================
 * The rules are lib/onepage/rail.ts. Two hooks:
 *
 *   useRails()        once per page (components/onepage/public-onepage, so the
 *                     live page, the editor's phone preview and Preview alike).
 *                     For every `.op-rail` on the page, now or later:
 *                       - its soft edges: data-more-start / data-more-end as it
 *                         scrolls, resizes or gets its pictures (app/globals.css
 *                         draws the fade as a mask);
 *                       - a trackpad or a sideways wheel: the snap off while the
 *                         wheel turns, then one glide to the slide it was heading
 *                         for, the snap back once it has landed.
 *                     A finger is the browser's own scroll, momentum and snap,
 *                     untouched; a mouse drag is components/onepage/drag-scroll.
 *   useRailPager()    a row with arrows and dots (a group's carousel): the dots
 *                     and the arrows painted from the scroll, written straight to
 *                     the elements, never through React state, so a swipe renders
 *                     nothing (it re-rendered every block in the row each time the
 *                     slide changed).
 *
 * Native listeners, passive, one of each on the document.
 */
import * as React from "react"
import { dotLook, isSidewaysWheel, nearestStop, railEdges, railProgress, railStops, wheelRestingPoint, WHEEL_IDLE_MS } from "@/lib/onepage/rail"
import { glideBehavior, snapPoints, whenLanded } from "@/components/onepage/drag-scroll"

const RAIL = ".op-rail"

/** Marks a row's sides that have more of it. Writes only when something changed. */
export function paintRailEdges(row: HTMLElement): { start: boolean; end: boolean } {
  const e = railEdges(row.scrollLeft, row.scrollWidth, row.clientWidth)
  if (e.start !== ("moreStart" in row.dataset)) {
    if (e.start) row.dataset.moreStart = ""
    else delete row.dataset.moreStart
  }
  if (e.end !== ("moreEnd" in row.dataset)) {
    if (e.end) row.dataset.moreEnd = ""
    else delete row.dataset.moreEnd
  }
  return e
}

/** The row a sideways wheel over `target` would move: the nearest rail that has somewhere to go. */
function railUnder(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target.closest<HTMLElement>(RAIL) : null
  while (el) {
    if (el.scrollWidth > el.clientWidth + 1) return el
    el = el.parentElement?.closest<HTMLElement>(RAIL) ?? null
  }
  return null
}

type WheelGesture = { startLeft: number; snap: string; idle: number; cancelLanding: (() => void) | null }

export function useRails(enabled = true) {
  React.useEffect(() => {
    if (!enabled || typeof document === "undefined") return
    /* ── soft edges ── */
    const dirty = new Set<HTMLElement>()
    let frame = 0
    const flush = () => {
      frame = 0
      dirty.forEach((row) => { if (row.isConnected) paintRailEdges(row) })
      dirty.clear()
    }
    const mark = (row: HTMLElement) => {
      dirty.add(row)
      if (!frame) frame = requestAnimationFrame(flush)
    }
    const seen = new WeakSet<HTMLElement>()
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => entries.forEach((e) => { const row = (e.target as HTMLElement).closest<HTMLElement>(RAIL); if (row) mark(row) })) : null
    const scan = () => {
      document.querySelectorAll<HTMLElement>(RAIL).forEach((row) => {
        if (!seen.has(row)) {
          seen.add(row)
          ro?.observe(row)
          /* Its content too: a picture that arrives makes a row wider than it was. */
          if (row.firstElementChild) ro?.observe(row.firstElementChild)
          if (row.lastElementChild && row.lastElementChild !== row.firstElementChild) ro?.observe(row.lastElementChild)
        }
        mark(row)
      })
    }
    scan()
    let scanFrame = 0
    const mo = typeof MutationObserver === "function" ? new MutationObserver(() => { if (!scanFrame) scanFrame = requestAnimationFrame(() => { scanFrame = 0; scan() }) }) : null
    mo?.observe(document.body, { childList: true, subtree: true })
    /* scroll does not bubble; caught on its way down, it is one listener for every row. */
    const onScroll = (e: Event) => {
      const row = e.target instanceof HTMLElement && e.target.classList.contains("op-rail") ? e.target : null
      if (row) mark(row)
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })

    /* ── a trackpad, or shift and a wheel ── */
    const gestures = new Map<HTMLElement, WheelGesture>()
    const settle = (row: HTMLElement) => {
      const g = gestures.get(row)
      if (!g) return
      const max = row.scrollWidth - row.clientWidth
      const target = wheelRestingPoint(snapPoints(row), g.startLeft, row.scrollLeft, max)
      const done = () => {
        row.style.scrollSnapType = g.snap
        row.style.scrollBehavior = ""
        delete row.dataset.wheeling
        gestures.delete(row)
      }
      row.style.scrollBehavior = ""
      if (Math.abs(row.scrollLeft - target) > 1) row.scrollTo({ left: target, behavior: glideBehavior() })
      g.cancelLanding = whenLanded(row, target, done)
    }
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || !isSidewaysWheel(e.deltaX, e.deltaY)) return
      const row = railUnder(e.target)
      if (!row || "dragging" in row.dataset) return
      let g = gestures.get(row)
      if (!g) {
        g = { startLeft: row.scrollLeft, snap: row.style.scrollSnapType, idle: 0, cancelLanding: null }
        gestures.set(row, g)
        row.dataset.wheeling = ""
        row.style.scrollSnapType = "none"
        row.style.scrollBehavior = "auto"
      } else if (g.cancelLanding) {
        /* More of the pad's momentum after the glide began: the hand still has the row. */
        g.cancelLanding()
        g.cancelLanding = null
        row.style.scrollBehavior = "auto"
      }
      window.clearTimeout(g.idle)
      g.idle = window.setTimeout(() => settle(row), WHEEL_IDLE_MS)
    }
    document.addEventListener("wheel", onWheel, { capture: true, passive: true })

    return () => {
      if (frame) cancelAnimationFrame(frame)
      if (scanFrame) cancelAnimationFrame(scanFrame)
      mo?.disconnect()
      ro?.disconnect()
      document.removeEventListener("scroll", onScroll, { capture: true })
      document.removeEventListener("wheel", onWheel, { capture: true })
      gestures.forEach((g, row) => {
        window.clearTimeout(g.idle)
        g.cancelLanding?.()
        row.style.scrollSnapType = g.snap
        row.style.scrollBehavior = ""
        delete row.dataset.wheeling
      })
      gestures.clear()
    }
  }, [enabled])
}

/** A pagination dot's sizes (lib/onepage/rail dotLook): the one in view long, the others round. */
export const RAIL_DOT_MIN = 6
export const RAIL_DOT_MAX = 18

/**
 * A row's arrows and dots, painted from its scroll. `count` is how many dots to keep: one for each place the row
 * can stop, measured on resize (a 1.5-up row of four stops three times, not four). Arrows carry data-hidden at the
 * row's ends; the dot in view carries aria-current.
 */
export function useRailPager(rowRef: React.RefObject<HTMLElement | null>, slides: number) {
  const dotsRef = React.useRef<HTMLDivElement>(null)
  const prevRef = React.useRef<HTMLButtonElement>(null)
  const nextRef = React.useRef<HTMLButtonElement>(null)
  const stopsRef = React.useRef<number[]>([])
  const [count, setCount] = React.useState(slides)

  const paint = React.useCallback(() => {
    const row = rowRef.current
    if (!row) return
    const stops = stopsRef.current
    const left = row.scrollLeft
    const edges = paintRailEdges(row)
    if (prevRef.current) prevRef.current.toggleAttribute("data-hidden", !edges.start)
    if (nextRef.current) nextRef.current.toggleAttribute("data-hidden", !edges.end)
    const dots = dotsRef.current
    if (!dots) return
    const progress = railProgress(stops, left)
    const nearest = nearestStop(stops, left)
    for (let i = 0; i < dots.children.length; i++) {
      const dot = dots.children[i] as HTMLElement
      const look = dotLook(i, progress, RAIL_DOT_MIN, RAIL_DOT_MAX)
      dot.style.width = `${look.width}px`
      dot.style.opacity = String(look.opacity)
      if (i === nearest) dot.setAttribute("aria-current", "true")
      else dot.removeAttribute("aria-current")
    }
  }, [rowRef])

  React.useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    const measure = () => {
      stopsRef.current = railStops(snapPoints(row), row.scrollWidth - row.clientWidth)
      setCount(Math.max(1, stopsRef.current.length))
      paint()
    }
    measure()
    const onScroll = () => paint()
    row.addEventListener("scroll", onScroll, { passive: true })
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null
    ro?.observe(row)
    if (row.firstElementChild) ro?.observe(row.firstElementChild)
    return () => {
      row.removeEventListener("scroll", onScroll)
      ro?.disconnect()
    }
  }, [rowRef, paint, slides])

  /* New dots drawn: painted before they are seen. */
  React.useLayoutEffect(() => paint(), [count, paint])

  const goTo = React.useCallback((index: number) => {
    const row = rowRef.current
    const stops = stopsRef.current
    if (!row || stops.length === 0) return
    row.scrollTo({ left: stops[Math.max(0, Math.min(index, stops.length - 1))], behavior: glideBehavior() })
  }, [rowRef])
  const step = React.useCallback((by: number) => {
    const row = rowRef.current
    if (!row) return
    goTo(nearestStop(stopsRef.current, row.scrollLeft) + by)
  }, [rowRef, goTo])

  return { dotsRef, prevRef, nextRef, count: Math.min(count, slides), goTo, step }
}
