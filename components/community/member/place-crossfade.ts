"use client"

import { copyInView } from "@/lib/navigation/in-view-copy"

/**
 * ===========================================================================
 *  ONE PLACE INTO THE NEXT: A SHORT CROSSFADE IN THE MIDDLE COLUMN (round 31)
 * ===========================================================================
 * The owner: switching Community, Learn, Calendar, Members and About "feels
 * too snappy, too direct". The place host showed the next place on the frame
 * of the tap and lifted it from 35% (6px, 180ms on a curve that does most of
 * its work in the first two frames): the place being left was gone in one
 * frame, so the change read as a cut however the new one came in.
 *
 * Now the place being left goes out while the next one comes in. On the tap
 * (place-host.tsx beforeGo, while the place is still on screen) the part of
 * it that is in the window is copied: an element wholly outside the window
 * is copied as an empty box of its own size, so the copy costs what is on
 * screen and not what the place holds (a feed is thousands of nodes, a
 * screenful a few hundred). In the commit that shows the next place the copy
 * is laid where the old place was, inside the host (so the dark look's
 * selectors still reach it), and faded off it in OUT_MS while the new place
 * fades up from nothing and rises 4px in IN_MS. Opacity and translate only,
 * on the compositor; nothing in the bar, the columns or the tab bar moves.
 * Back and Forward put a place back as it was, with no motion, as before,
 * and reduced motion has neither.
 */

/** The place coming in: from nothing, 4px under, on an ease out that is not front loaded. */
export const IN_MS = 180
export const IN_RISE_PX = 4
export const IN_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
/** From 1024px, where the columns hold still around a wider middle: a touch shorter and lower. */
export const IN_WIDE_MS = 160
export const IN_WIDE_RISE_PX = 3
/** The place going out: quicker than the one coming in, so the two are never half and half for long. */
export const OUT_MS = 120
export const OUT_EASE = "cubic-bezier(0.2, 0, 0, 1)"
/** Past this a copy taken on a tap is stale (the next place waited for its data): it is dropped, and the new place only fades up. */
export const STILL_FRESH_MS = 1500
/** On the copy, so no query for a place, a seed or a spinner ever finds it. */
export const PLACE_STILL_ATTR = "data-place-still"

export interface PlaceStill {
  node: HTMLElement
  /** Where the place stood in the window when it was copied, and the page's scroll then. */
  left: number
  top: number
  width: number
  scrollY: number
  at: number
}

const MARKS = ["data-place-screen", "data-place-routed", "data-place-seed", "data-place-key", "data-place-spinner", "data-page-title", "data-pull-content", "data-pull-to-refresh"]

/** On the tap: the place as it stands, the part in the window copied. Null when there is nothing to copy or motion is reduced. */
export function takePlaceStill(el: HTMLElement | null | undefined): PlaceStill | null {
  if (typeof window === "undefined" || !(el instanceof HTMLElement) || !el.isConnected) return null
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= window.innerHeight) return null
  try {
    const node = copyInView(el, window.innerHeight, MARKS)
    node.setAttribute(PLACE_STILL_ATTR, "")
    node.setAttribute("aria-hidden", "true")
    node.inert = true
    return { node, left: r.left, top: r.top, width: r.width, scrollY: window.scrollY, at: performance.now() }
  } catch {
    return null
  }
}

/**
 * In the commit that shows the next place (a layout effect, before it is painted): the copy laid where the place was,
 * inside `host`, and faded off; `arriving` (the next place's own box) fades up under it. `scrollBefore` is where the page
 * stood just before the commit, which is where the copy has to look as though it still is.
 */
export function playPlaceCrossfade(still: PlaceStill | null, host: HTMLElement | null, arriving: HTMLElement | null, scrollBefore: number, wide: boolean): void {
  if (typeof window === "undefined") return
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
  const inMs = wide ? IN_WIDE_MS : IN_MS
  const rise = wide ? IN_WIDE_RISE_PX : IN_RISE_PX
  if (arriving && typeof arriving.animate === "function") {
    arriving.animate([{ opacity: 0, translate: `0 ${rise}px` }, { opacity: 1, translate: "0 0" }], { duration: inMs, easing: IN_EASE })
  }
  if (!still || !host || performance.now() - still.at > STILL_FRESH_MS) return
  /* Where it stood in the window just before this commit: moved by any scroll since the tap. */
  const top = still.top - (scrollBefore - still.scrollY)
  const box = document.createElement("div")
  box.setAttribute(PLACE_STILL_ATTR, "")
  box.setAttribute("aria-hidden", "true")
  box.inert = true
  const clip = Math.max(0, top)
  box.style.cssText = `position:fixed;left:${Math.round(still.left)}px;top:${Math.round(clip)}px;width:${Math.round(still.width)}px;height:${Math.max(0, Math.round(window.innerHeight - clip))}px;overflow:hidden;pointer-events:none;z-index:1;contain:layout paint style`
  still.node.style.cssText += `;position:absolute;left:0;top:${Math.round(top - clip)}px;width:${Math.round(still.width)}px;margin:0`
  box.append(still.node)
  host.append(box)
  /* An ancestor that holds fixed boxes to itself (the pull to refresh moves the page on the compositor) would move it: put it back where it was. */
  const got = box.getBoundingClientRect()
  if (Math.abs(got.left - still.left) > 0.5 || Math.abs(got.top - clip) > 0.5) {
    box.style.left = `${Math.round(still.left - (got.left - still.left))}px`
    box.style.top = `${Math.round(clip - (got.top - clip))}px`
  }
  let over = false
  const done = () => {
    if (over) return
    over = true
    window.clearTimeout(cap)
    box.remove()
  }
  const cap = window.setTimeout(done, OUT_MS + 400)
  try {
    box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing: OUT_EASE, fill: "forwards" }).finished.then(done, done)
  } catch {
    done()
  }
}
