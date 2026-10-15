"use client"

/**
 * ===========================================================================
 *  OPENING A COMMUNITY FROM EXPLORE: ONE PAGE GOES OUT AS THE OTHER COMES IN
 * ===========================================================================
 * Round 31, the owner: opening a community from Explore is "too direct",
 * it should be "smooth and clean, a calm quick crossfade with the right
 * ground, the destination's header steady". Round 30 took Explore away in
 * one frame and faded the whole community frame up from nothing, its bar
 * included: a cut to an empty ground, then everything arriving at once.
 *
 * Now Explore goes out over the community. In the commit that takes
 * Explore's page down (a layout effect's cleanup in it, LeaveCopy), what the
 * window shows of it is copied (lib/navigation/in-view-copy.ts, a screenful)
 * and kept; the community frame, laying itself out in the same commit, puts
 * the copy where Explore stood, BELOW its own bar, and fades it off in
 * FADE_MS. The bar is there, whole and still, from the first frame; under it
 * the community's page shows through Explore as Explore goes. Opacity alone,
 * on the compositor.
 *
 * Only for a press that was going to a community (noted on the way, from a
 * page that is not that community), only while it is fresh, and not when
 * the slow page's surface was already over Explore (its own fade is the
 * hand over then). Nothing under reduced motion.
 */
import { copyInView } from "./in-view-copy"

export const ARRIVAL_FADE_MS = 200
export const ARRIVAL_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
export const ARRIVAL_NOTE_FRESH_MS = 15_000
export const ARRIVAL_STILL_ATTR = "data-arrival-still"
const COMMUNITY = /^\/community\/([^/?#]+)/

let noted: { slug: string; at: number } | null = null
let kept: { node: HTMLElement; left: number; top: number; width: number; height: number; at: number; ground: string } | null = null

/** A press is on its way to a community (a capture listener on the page being left). */
export function noteHeadingIntoCommunity(href: string | null | undefined): void {
  if (!href || typeof window === "undefined") return
  try {
    const url = new URL(href, window.location.href)
    const to = COMMUNITY.exec(url.pathname)?.[1]
    const here = COMMUNITY.exec(window.location.pathname)?.[1]
    if (url.origin === window.location.origin && to && to !== here) noted = { slug: to, at: performance.now() }
  } catch {
    /* not an address */
  }
}

/** In the commit that takes the page down (a layout effect's cleanup): its view, copied, when a community is next. */
export function keepLeavingSurface(el: HTMLElement | null | undefined): void {
  const n = noted
  noted = null
  if (!n || performance.now() - n.at > ARRIVAL_NOTE_FRESH_MS || typeof window === "undefined") return
  if (!(el instanceof HTMLElement) || !el.isConnected) return
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
  /* The slow page's surface is over it: that surface's own fade is the hand over (components/navigation/route-loading-bar.tsx). */
  if (document.querySelector("[data-route-slow-page]")) return
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.bottom <= 0 || r.top >= window.innerHeight) return
  try {
    const node = copyInView(el, window.innerHeight, ["data-nav-land"])
    kept = { node, left: r.left, top: r.top, width: r.width, height: r.height, at: performance.now(), ground: getComputedStyle(el).backgroundColor }
  } catch {
    kept = null
  }
}

/**
 * In the arriving frame's first layout effect: the page left, laid where it stood below `clipTop` (the bottom of the
 * frame's own bar) and faded off. Returns whether there was one to lay (the frame then plays no fade of its own).
 */
export function playArrivalStill(clipTop: number): boolean {
  const k = kept
  kept = null
  if (!k || typeof window === "undefined" || performance.now() - k.at > 1000) return false
  const clip = Math.max(0, Math.round(clipTop))
  const box = document.createElement("div")
  box.setAttribute(ARRIVAL_STILL_ATTR, "")
  box.setAttribute("aria-hidden", "true")
  box.inert = true
  /* Under the bars (the community's bar is 40, the tab bar above it), over the page. */
  box.style.cssText = `position:fixed;left:0;right:0;top:${clip}px;bottom:0;overflow:hidden;pointer-events:none;z-index:39;contain:layout paint style`
  k.node.style.cssText += `;position:absolute;left:${Math.round(k.left)}px;top:${Math.round(k.top - clip)}px;width:${Math.round(k.width)}px;height:${Math.round(k.height)}px;margin:0`
  box.append(k.node)
  document.body.append(box)
  let over = false
  const done = () => {
    if (over) return
    over = true
    window.clearTimeout(cap)
    box.remove()
  }
  const cap = window.setTimeout(done, ARRIVAL_FADE_MS + 500)
  try {
    box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ARRIVAL_FADE_MS, easing: ARRIVAL_EASE, fill: "forwards" }).finished.then(done, done)
  } catch {
    done()
  }
  return true
}
