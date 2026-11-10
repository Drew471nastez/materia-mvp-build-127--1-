/**
 * ===========================================================================
 *  ROUND W9: A DELETED BLOCK'S ROW FOLDS AWAY, THE ROWS UNDER IT GLIDE UP
 * ===========================================================================
 * The owner: "The delete icon should be as well as an icon in the block there,
 * not only from the menu. Fully implement." Each block row has its own bin now
 * (components/onepage/block-remove BlockRowDelete), asking the same question as
 * the more menu's Remove. When the answer is Delete or Archive the row used to
 * vanish in one frame and every row under it jumped up by its height. Now the
 * row folds to nothing (its height, and the list's gap after it, to zero, and
 * it fades) in ROW_COLLAPSE_MS, then the block is taken off the page, so the
 * list is already where it ends up and nothing jumps.
 *
 * Under reduced motion, or without the Web Animations API, the block goes at
 * once, as it did. `done` is always called exactly once.
 */

/** How long the row takes to fold: under the owner's 200ms. */
export const ROW_COLLAPSE_MS = 180
export const ROW_COLLAPSE_EASE = "cubic-bezier(0.2, 0, 0, 1)"

/**
 * The two frames: the row as it is, then nothing, the space beside it eaten by a negative margin (after it,
 * or before it for the last row, whose space before it goes with it).
 */
export function rowCollapseFrames(height: number, gap: number, side: "after" | "before" = "after"): Keyframe[] {
  const h = Math.max(0, Math.round(height * 100) / 100)
  const g = Math.max(0, Math.round(gap * 100) / 100)
  const margin = side === "after" ? "marginBottom" : "marginTop"
  return [
    { height: `${h}px`, opacity: 1, [margin]: "0px" },
    { height: "0px", opacity: 0, [margin]: `${-g}px` },
  ]
}

/** The nearest drawn row beside `el` (an add-between line of no height in between is skipped). */
function drawnSibling(el: HTMLElement, dir: "next" | "prev"): HTMLElement | null {
  let at = (dir === "next" ? el.nextElementSibling : el.previousElementSibling) as HTMLElement | null
  while (at && at.getBoundingClientRect().height === 0) at = (dir === "next" ? at.nextElementSibling : at.previousElementSibling) as HTMLElement | null
  return at
}

/**
 * The space that goes with the row: from its foot to the next row's top (the list's gap, and the add line
 * of no height with its own gap, which goes too), or for the last row from the row before it to its top.
 */
function spaceOf(el: HTMLElement): { gap: number; side: "after" | "before" } {
  const r = el.getBoundingClientRect()
  const next = drawnSibling(el, "next")
  if (next) return { gap: Math.max(0, next.getBoundingClientRect().top - r.bottom), side: "after" }
  const prev = drawnSibling(el, "prev")
  if (prev) return { gap: Math.max(0, r.top - prev.getBoundingClientRect().bottom), side: "before" }
  return { gap: 0, side: "after" }
}

/** Whether this browser asks for no motion. */
function reduced(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/**
 * Fold `el` away, then call `done` (which takes the block off the page). The
 * row stops taking presses while it folds, so a second press cannot remove it twice.
 */
export function collapseRow(el: Element | null | undefined, done: () => void): void {
  let called = false
  const finish = () => {
    if (called) return
    called = true
    done()
  }
  const row = el as HTMLElement | null | undefined
  if (!row || typeof row.animate !== "function" || reduced() || row.dataset.rowLeaving !== undefined) {
    if (row?.dataset.rowLeaving === undefined) finish()
    return
  }
  row.dataset.rowLeaving = ""
  const height = row.getBoundingClientRect().height
  row.style.overflow = "hidden"
  row.style.pointerEvents = "none"
  const space = spaceOf(row)
  const anim = row.animate(rowCollapseFrames(height, space.gap, space.side), { duration: ROW_COLLAPSE_MS, easing: ROW_COLLAPSE_EASE, fill: "forwards" })
  anim.onfinish = finish
  anim.oncancel = finish
  /* A tab in the background holds its animations: the block still goes. */
  window.setTimeout(finish, ROW_COLLAPSE_MS + 150)
}
