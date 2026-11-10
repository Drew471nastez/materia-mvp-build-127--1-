"use client"

/**
 * ===========================================================================
 *  THE SCROLL, AS STATE A HEADER OF THE SITE'S OWN CAN STYLE (round Q)
 * ===========================================================================
 * Andrew: the header is not sticky and nothing about it changes as the page
 * scrolls. A section's script runs in a sandbox that cannot see the page's
 * scroll, so a header written as a section could only fake it with a CSS
 * scroll timeline. The page writes the scroll's state onto it instead,
 * trusted and the same everywhere, and its own CSS does the rest
 * (transparent to solid, shrink, hide on the way down):
 *
 *   data-scrolled   "false" at the top, "true" once the page has moved
 *   data-scroll-dir "down" while the page goes down past the header, "up"
 *                   otherwise (at the top it is always "up")
 *   data-over-hero  "true" while the header still lies over the first
 *                   section under it, "false" once that section is behind it
 *
 * Written on the section's box (what sticks: lib/website-builder/theme-css.ts
 * chromePlatformCss), on the section's first element, and on every element
 * marked data-storelib-sticky or data-storelib-scroll, so a rule can match
 * the header root or any ancestor. For every section of the Header group,
 * and any other that asks with one of those two attributes.
 *
 * The scroller is the window on the live site and the canvas card in the
 * builder. One passive listener, read in an animation frame, attributes
 * written only when they change, so a scroll costs nothing to lay out.
 */
import { useEffect } from "react"
import { publishAnchorOffset, themeRootOf } from "@/lib/website-builder/section-motion"

export interface ScrollState {
  scrolled: boolean
  dir: "up" | "down"
}

/**
 * The next state from the scroll position. A move under `jitter` pixels
 * changes nothing (a trackpad's tremor must not flash the header); within
 * the header's own height the page is always going "up", so it never hides
 * while it is still the top of the page.
 */
export function nextScrollState(prev: ScrollState, lastY: number, y: number, headerHeight: number, jitter = 6): ScrollState {
  const scrolled = y > 2
  if (y <= Math.max(headerHeight, 0)) return { scrolled, dir: "up" }
  const d = y - lastY
  if (Math.abs(d) < jitter) return { scrolled, dir: prev.dir }
  return { scrolled, dir: d > 0 ? "down" : "up" }
}

/** Whether a section's markup asks for the scroll's state. */
export function asksForScroll(html: string): boolean {
  return /\sdata-storelib-(?:sticky|scroll)(?=[\s=>/])/.test(html)
}

function set(el: Element, name: string, value: string) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

export function useHeaderScroll(root: HTMLElement | null, opts: { inCanvas: boolean; header: boolean; html: string }) {
  const { inCanvas, header, html } = opts
  const wanted = header || asksForScroll(html)
  useEffect(() => {
    if (!root || !wanted) return
    const scroller: HTMLElement | Window = (inCanvas ? document.getElementById("wb-preview-root") : null) ?? window
    const top = () => (scroller === window ? window.scrollY : (scroller as HTMLElement).scrollTop)
    const box = root.closest<HTMLElement>("[data-section-box]")
    const targets = () => {
      const own = Array.from(root.querySelectorAll<HTMLElement>("[data-storelib-sticky],[data-storelib-scroll]"))
      const first = root.firstElementChild
      return [...(box ? [box] : []), ...(first && !own.includes(first as HTMLElement) ? [first] : []), ...own]
    }
    /* The element that is the header: the one that asked to stick, else the section's first. */
    const headerEl = () => root.querySelector<HTMLElement>("[data-storelib-sticky]") ?? (root.firstElementChild as HTMLElement | null)
    /* The first section of the page under the header: the next box that is not chrome. */
    const hero = () => {
      let el = box?.nextElementSibling ?? null
      while (el && !(el.hasAttribute("data-section-box") && !el.hasAttribute("data-chrome"))) el = el.nextElementSibling
      return el as HTMLElement | null
    }
    let state: ScrollState = { scrolled: false, dir: "up" }
    let lastY = top()
    let frame = 0
    const write = () => {
      frame = 0
      const y = top()
      const h = headerEl()?.offsetHeight ?? 0
      state = nextScrollState(state, lastY, y, h)
      lastY = y
      const hr = headerEl()?.getBoundingClientRect()
      const below = hero()?.getBoundingClientRect()
      const over = !!(hr && below && below.top <= hr.bottom + 1 && below.bottom > hr.bottom)
      for (const el of targets()) {
        set(el, "data-scrolled", String(state.scrolled))
        set(el, "data-scroll-dir", state.dir)
        set(el, "data-over-hero", String(over))
      }
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(write) }
    write()
    /* The header's height, where a link to a section lands under it (section-motion.ts). */
    const page = themeRootOf(root)
    if (page) publishAnchorOffset(page)
    scroller.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      scroller.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [root, wanted, inCanvas, html])
}
