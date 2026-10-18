/**
 * ===========================================================================
 *  DESKTOP, PHONE AND FULL SCREEN: ONE LAYOUT, THEN ONLY TRANSFORMS
 * ===========================================================================
 * The owner: switching the canvas to phone, back to desktop, or in and out of
 * full screen "is very glitchy, not smooth at all".
 *
 * Measured (scripts/check-view-switch.mjs), it was three things at once. The
 * card's box snapped to its new size and was then slid or faded from a place
 * it had never been: going into full screen the page was laid out at its new
 * width, pushed 294px right, and slid back, so everything on it moved right
 * and then left; coming out, its right edge jumped 300px and slid back. A
 * device switch dimmed the whole page to 55% and scaled it. And the card's
 * radius and shadow were transitioned, which repaints a card the size of the
 * page on every frame of it.
 *
 * Now the layout changes once, and the page is drawn where it ends up, at
 * full strength, in the first frame. What moves after that is never the page:
 *
 *   phone and desktop  the card's edges. Strips of the card's own white (going
 *                      narrower) or of the shelf's grey (going wider) are laid
 *                      over the gap between the old box and the new one and
 *                      shrink to nothing toward where the edge now is, by
 *                      scale, so the edge travels from the old box to the new
 *                      one and the page inside never moves.
 *   full screen        the sidebar. It is laid over the canvas while it goes,
 *                      and slides a little and fades; coming back it does the
 *                      same the other way. The canvas is at its new width
 *                      under it from the first frame.
 *
 * Transform and opacity only, on layers of their own: the compositor runs
 * them at the screen's rate and the main thread lays nothing out after the
 * one change. The old box is read once, on the press, before the change, and
 * the new one once, after it (CLAUDE.md: measure once and share).
 *
 * With reduced motion nothing moves: the change is one frame.
 */

/** How long the edges and the sidebar take. */
export const CANVAS_SWITCH_MS = 300
/** On the curve the editor's sheets and panels use. */
export const CANVAS_SWITCH_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** The card's surface, and the shelf it stands on (the editor's `bg-[#eef1f5]`). */
export const CARD_WHITE = "#ffffff"
export const SHELF_GREY = "#eef1f5"
/** How far the sidebar travels as it fades: a nudge, not a sweep across the page. */
export const SIDEBAR_NUDGE_PX = 24

export type Box = { left: number; top: number; right: number; bottom: number }

export type Strip = {
  /** Where it sits, in the canvas's own coordinates. */
  left: number
  top: number
  width: number
  height: number
  color: string
  /** The edge it shrinks toward, as a transform origin. */
  origin: "left" | "right" | "top" | "bottom"
  axis: "x" | "y"
  /** Which side of the card it is on, for the check. */
  side: "left" | "right" | "top" | "bottom"
}

const round = (n: number) => Math.round(n * 10) / 10

/**
 * The strips that carry the card's edges from `from` to `to`, both in the
 * canvas's coordinates. Pure, so the test can check the geometry.
 *
 * Going narrower, the gap between the boxes is the card's white, shrinking
 * inward to the new edge. Going wider, the gap is the shelf's grey, laid over
 * the new card and shrinking outward to the new edge. Each side is its own
 * strip; the left and right ones run the full height of the larger box, the
 * top and bottom ones only the width of the smaller, so no two overlap.
 */
export function edgeStrips(from: Box, to: Box): Strip[] {
  const out: Strip[] = []
  const outer = { left: Math.min(from.left, to.left), top: Math.min(from.top, to.top), right: Math.max(from.right, to.right), bottom: Math.max(from.bottom, to.bottom) }
  const inner = { left: Math.max(from.left, to.left), top: Math.max(from.top, to.top), right: Math.min(from.right, to.right), bottom: Math.min(from.bottom, to.bottom) }
  const push = (s: Strip) => {
    if (s.width >= 1 && s.height >= 1) out.push({ ...s, left: round(s.left), top: round(s.top), width: round(s.width), height: round(s.height) })
  }
  /* Narrower on a side: the old card's white is there and goes in. Wider: the shelf is over the new card and goes out. */
  const x = (side: "left" | "right") => {
    const shrinking = side === "left" ? to.left > from.left : to.right < from.right
    const color = shrinking ? CARD_WHITE : SHELF_GREY
    const left = side === "left" ? outer.left : inner.right
    const width = side === "left" ? inner.left - outer.left : outer.right - inner.right
    const origin = side === "left" ? (shrinking ? "right" : "left") : shrinking ? "left" : "right"
    push({ left, top: outer.top, width, height: outer.bottom - outer.top, color, origin, axis: "x", side })
  }
  const y = (side: "top" | "bottom") => {
    const shrinking = side === "top" ? to.top > from.top : to.bottom < from.bottom
    const color = shrinking ? CARD_WHITE : SHELF_GREY
    const top = side === "top" ? outer.top : inner.bottom
    const height = side === "top" ? inner.top - outer.top : outer.bottom - inner.bottom
    const origin = side === "top" ? (shrinking ? "bottom" : "top") : shrinking ? "top" : "bottom"
    push({ left: inner.left, top, width: inner.right - inner.left, height, color, origin, axis: "y", side })
  }
  x("left")
  x("right")
  y("top")
  y("bottom")
  return out
}

function reduced(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Lay the strips over `host` (the canvas, `position: relative`) and shrink
 * them away. `from` and `to` are viewport boxes; the host's is read here.
 */
export function playCardEdges(host: HTMLElement, from: Box, to: Box): void {
  if (reduced() || typeof host.animate !== "function") return
  const h = host.getBoundingClientRect()
  const local = (b: Box): Box => ({ left: b.left - h.left, top: b.top - h.top, right: b.right - h.left, bottom: b.bottom - h.top })
  const strips = edgeStrips(local(from), local(to))
  if (!strips.length) return
  for (const old of host.querySelectorAll("[data-wb-switch-edge]")) old.remove()
  for (const s of strips) {
    const el = document.createElement("div")
    el.setAttribute("data-wb-switch-edge", s.side)
    el.setAttribute("data-wb-switch-color", s.color === CARD_WHITE ? "card" : "shelf")
    el.setAttribute("aria-hidden", "true")
    el.style.cssText = `position:absolute;left:${s.left}px;top:${s.top}px;width:${s.width}px;height:${s.height}px;background:${s.color};z-index:5;pointer-events:none;will-change:transform;transform-origin:${s.origin === "left" ? "0 50%" : s.origin === "right" ? "100% 50%" : s.origin === "top" ? "50% 0" : "50% 100%"}`
    host.appendChild(el)
    const gone = s.axis === "x" ? "scaleX(0)" : "scaleY(0)"
    const a = el.animate([{ transform: "none" }, { transform: gone }], { duration: CANVAS_SWITCH_MS, easing: CANVAS_SWITCH_EASE, fill: "forwards" })
    const remove = () => el.remove()
    a.finished.then(remove, remove)
  }
}

/**
 * The sidebar folding away (`folding`) or coming back. `fold` is the box that
 * snaps to no width; `panel` is the sidebar inside it, which is laid over the
 * canvas while it goes.
 */
export function playSidebarFold(fold: HTMLElement, panel: HTMLElement, folding: boolean): void {
  if (reduced() || typeof panel.animate !== "function") return
  const to = `translateX(-${SIDEBAR_NUDGE_PX}px)`
  if (folding) {
    /* Over the canvas, which is already full width under it, for as long as it takes to go. */
    fold.style.zIndex = "6"
    const a = panel.animate([{ transform: "none", opacity: 1 }, { transform: to, opacity: 0 }], { duration: CANVAS_SWITCH_MS, easing: CANVAS_SWITCH_EASE })
    const done = () => {
      fold.style.zIndex = ""
    }
    a.finished.then(done, done)
  } else {
    panel.animate([{ transform: to, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: CANVAS_SWITCH_MS, easing: CANVAS_SWITCH_EASE })
  }
}
