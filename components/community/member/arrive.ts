"use client"

/**
 * ===========================================================================
 *  HOW A NEW POST OR COMMENT COMES ONTO THE SCREEN (round 10)
 * ===========================================================================
 * A post put at the top of the list (somebody else's, arriving live, or the
 * member's own just posted) must not shove the list down in one frame. Once
 * React has drawn it, and before that frame is painted, the posts after it
 * are moved back up by its height and slide down to their places on the
 * compositor (translate only), uncovering it as they go (they are drawn over
 * it), while it fades in. The member's own post then gets a gentle warm
 * highlight that fades, and the page scrolls smoothly to it if it is not in
 * sight.
 *
 * A comment that lands (sent, or arriving live) rises a few pixels into its
 * place as it fades in: at the end of the list, so nothing above it moves.
 *
 * Layout is read once per arrival, never per frame; with reduced motion
 * nothing moves (the highlight still says where the post is).
 */
import { useCallback, useLayoutEffect, useRef } from "react"
import { SHEET_EASE } from "@/components/ui/bottom-sheet"

export const SLIDE_MS = 420
export const FADE_IN_MS = 260
export const HIGHLIGHT_MS = 1800
/** The warm tint a new post is marked with, under its words (no violet in the member area). */
const HIGHLIGHT = "#fbf5e4"

function reduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

function postEl(id: string): HTMLElement | null {
  const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"')
  return document.querySelector<HTMLElement>(`[data-feed-list] > [data-post="${esc}"]`)
}

/**
 * NO SCROLL ANCHORING WHILE POSTS ARRIVE. The browser keeps a post on screen
 * still when something above it changes height by scrolling the page the
 * same amount, which here fights the arrival (the posts are already being
 * slid into place) and, while the editor folds above them, moves the page in
 * one frame. Off for `ms`, for the page, then as it was.
 */
let anchorHolds = 0
let anchorTimer = 0
export function holdAnchor(ms: number) {
  if (typeof document === "undefined") return
  const html = document.documentElement
  if (!anchorHolds++) html.style.overflowAnchor = "none"
  window.clearTimeout(anchorTimer)
  anchorTimer = window.setTimeout(() => {
    anchorHolds = 0
    html.style.overflowAnchor = ""
  }, ms)
}

/** The highlight: a tint under the post's words that fades, then is taken away. */
export function highlight(el: HTMLElement) {
  const tint = document.createElement("span")
  tint.setAttribute("aria-hidden", "true")
  tint.setAttribute("data-post-highlight", "")
  tint.style.cssText = `position:absolute;inset:0;border-radius:inherit;background:${HIGHLIGHT};pointer-events:none;z-index:-1;opacity:0`
  const prev = { position: el.style.position, isolation: el.style.isolation }
  if (getComputedStyle(el).position === "static") el.style.position = "relative"
  el.style.isolation = "isolate"
  el.prepend(tint)
  const done = () => {
    tint.remove()
    el.style.position = prev.position
    el.style.isolation = prev.isolation
  }
  if (typeof tint.animate !== "function") return void window.setTimeout(done, HIGHLIGHT_MS)
  const a = tint.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration: HIGHLIGHT_MS, easing: "ease-out" })
  a.onfinish = done
  a.oncancel = done
}

/** Scrolls the page smoothly so `el` sits just under the community's bar, when it is not already in sight. */
export function bringIntoSight(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--community-top")) || 65
  const top = bar + 12
  if (r.top >= top - 4 && r.top < window.innerHeight * 0.55) return
  window.scrollTo({ top: Math.max(0, window.scrollY + r.top - top), behavior: reduced() ? "auto" : "smooth" })
}

export interface ArriveOptions {
  /** The member's own post: highlighted and brought into sight. */
  mine?: boolean
  /** Called when the posts never show in the list (another order on screen, say). */
  missing?: () => void
}

/**
 * New posts at the top of the list, already in the page and not yet painted:
 * the rest slide down to make room and the new ones fade in. `mine` adds the
 * highlight and brings it into sight.
 */
export function animateArrival(els: HTMLElement[], opts: ArriveOptions = {}) {
  if (!els.length) return
  els.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  const first = els[0]
  const last = els[els.length - 1]
  if (opts.mine) {
    highlight(first)
    bringIntoSight(first)
  }
  if (reduced() || typeof first.animate !== "function") return
  /*
    Drawn in full from this frame: a card is content-visibility:auto, and one
    just put in the page is laid out at its guessed height until the browser
    has seen it on screen, so its true height (what the posts under it were
    pushed by) is only there once it is drawn regardless.
  */
  for (const el of els) el.style.contentVisibility = "visible"
  window.setTimeout(() => {
    for (const el of els) el.style.contentVisibility = ""
  }, SLIDE_MS + 200)
  /* One read of the layout: how far the posts after the new ones were pushed, and which of them can be seen. */
  const top = first.getBoundingClientRect().top
  const next = last.nextElementSibling as HTMLElement | null
  const pushed = (next ? next.getBoundingClientRect().top : last.getBoundingClientRect().bottom) - top
  if (pushed <= 0) return
  const followers: HTMLElement[] = []
  for (let x = next; x; x = x.nextElementSibling as HTMLElement | null) {
    if (x.getBoundingClientRect().top - pushed > window.innerHeight) break
    followers.push(x)
  }
  for (const el of els) el.animate([{ opacity: 0, translate: "0 -6px" }, { opacity: 1, translate: "0 0" }], { duration: FADE_IN_MS, delay: 60, easing: "ease-out", fill: "backwards" })
  for (const x of followers) x.animate([{ translate: `0 ${-pushed}px` }, { translate: "0 0" }], { duration: SLIDE_MS, easing: SHEET_EASE })
}

/**
 * POSTS EXPECTED IN THE LIST. `expect(ids)` is called just before the list
 * is given them; the arrival starts in the layout effect of the commit that
 * draws them (this hook's owner is drawn with the list), so the first frame
 * painted with them is already the first frame of the move: no frame with
 * the posts under them pushed down. A commit that does not draw them leaves
 * them expected for the frames after, up to EXPECT_FRAMES, then `missing`.
 */
const EXPECT_FRAMES = 20
export function useArrivals(): (ids: string[], opts?: ArriveOptions) => void {
  const pending = useRef<{ ids: string[]; opts: ArriveOptions } | null>(null)
  useLayoutEffect(() => {
    const p = pending.current
    if (!p) return
    const els = p.ids.map(postEl)
    if (!els.every(Boolean)) return
    pending.current = null
    animateArrival(els as HTMLElement[], p.opts)
  })
  return useCallback((ids: string[], opts: ArriveOptions = {}) => {
    if (!ids.length || typeof document === "undefined") return
    holdAnchor(SLIDE_MS + 400)
    const mine = { ids, opts }
    pending.current = mine
    let n = 0
    const look = () => {
      if (pending.current !== mine) return
      const els = ids.map(postEl)
      if (els.every(Boolean)) {
        pending.current = null
        return animateArrival(els as HTMLElement[], opts)
      }
      if (++n < EXPECT_FRAMES) requestAnimationFrame(look)
      else {
        pending.current = null
        opts.missing?.()
      }
    }
    requestAnimationFrame(look)
  }, [])
}

/** How long a comment takes to land. */
export const LAND_MS = 420
/** iOS's own settle: a quick start, a long soft finish, no overshoot. */
const LAND_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"

/**
 * A comment landing at the end of its list (round 11): it rises into place
 * from just under it, settling to its full size, as it fades in over
 * the first part of the move, so it reads as placed rather than popped. The
 * row's own layer only for the move (will-change set and taken off), so the
 * rest of the list is not drawn again for it.
 */
export function landComment(el: HTMLElement | null) {
  if (!el || reduced() || typeof el.animate !== "function") return
  el.style.willChange = "translate, scale, opacity"
  /* Opacity ends on whatever the row is (lighter while "Sending"): its one keyframe is the start, the end is the row's own. */
  el.animate([{ opacity: 0, offset: 0 }], { duration: LAND_MS * 0.6, easing: "ease-out" })
  const move = el.animate([{ translate: "0 14px", scale: "0.985" }, { translate: "0 0", scale: "1" }], { duration: LAND_MS, easing: LAND_EASE })
  const done = () => {
    el.style.willChange = ""
  }
  move.onfinish = done
  move.oncancel = done
}
