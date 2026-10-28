/**
 * ===========================================================================
 *  WHAT A FINGER LANDED ON, AS AN ELEMENT OF THE PAGE (round 1026)
 * ===========================================================================
 * A touch's target is whatever was drawn under the finger, and in the editor
 * that is very often a drawing: the chevron of a select, the icon of a row,
 * the eye on a section. Those are `<path>`s inside an `<svg>`, which are
 * Elements but not HTMLElements.
 *
 * The phone sheet looked for the scrollers under the finger starting from
 * `target instanceof HTMLElement ? target : null`, so a swipe that began on
 * an icon found no scroller at all, was decided as "nothing here scrolls,
 * the drag is the sheet's" (sheet-gestures.ts dragIntent), and cancelled
 * every move: the settings did not scroll, the sheet slid instead. Measured
 * by scripts/check-editor-touch.mjs ("from an icon": 10 of 10 moves
 * cancelled, 0px scrolled).
 *
 * Pure (anything with a nodeType), so tests/editor-touch-scroll.test.ts
 * drives it without a browser.
 */
export interface NodeLike {
  nodeType?: number
  parentElement?: NodeLike | null
}

/** The element itself, or the element holding a text node; null for anything that is not in a page (the window, null). */
export function elementOfTarget<T extends NodeLike>(target: unknown): T | null {
  if (!target || typeof target !== "object") return null
  const node = target as NodeLike
  if (typeof node.nodeType !== "number") return null
  if (node.nodeType === 1) return node as T
  return (node.parentElement ?? null) as T | null
}

/**
 * The scrollers between an element and `stop` (excluded), nearest first.
 * `scrolls` answers for one element; every ancestor is asked, whatever kind
 * of element the walk started on.
 */
export function scrollersBetween<T extends NodeLike>(target: unknown, stop: unknown, scrolls: (el: T) => boolean): T[] {
  const out: T[] = []
  let node = elementOfTarget<T>(target)
  while (node && node !== stop) {
    if (scrolls(node)) out.push(node)
    node = (node.parentElement ?? null) as T | null
  }
  return out
}

/**
 * ===========================================================================
 *  A DRAG WHOSE FINGER IS GONE IS OVER
 * ===========================================================================
 * A row held by its grip ends on the grip's `pointerup` or `pointercancel`.
 * Neither arrives when the grip leaves the document mid-drag (the list drawn
 * again under the finger takes the captured pointer with it), when the
 * system takes the touch for itself, or when the app is put away with a
 * finger down. The drag then stays live: the next press on any grip is
 * refused (`if (live.current) return`), the held row keeps its lift, and a
 * list that cancels touchmove while a row is held (use-link-tree-drag.ts)
 * cancels every swipe after it, for good.
 *
 * So a live drag also listens for the end of the touch itself, on the
 * window, and for the page being hidden or losing focus. Pointer events come
 * before the touch events of the same finger, so a drag that ended properly
 * is already over when these arrive and `done` finds nothing to do.
 */
export interface GoneTarget {
  addEventListener(type: string, cb: () => void, opts?: { capture?: boolean; passive?: boolean }): void
  removeEventListener(type: string, cb: () => void, opts?: { capture?: boolean }): void
}

export function whenFingerGone(win: GoneTarget, doc: GoneTarget & { visibilityState?: string }, done: () => void): () => void {
  let on = true
  const end = () => {
    if (!on) return
    off()
    done()
  }
  const hidden = () => {
    if (doc.visibilityState === "hidden") end()
  }
  const off = () => {
    on = false
    win.removeEventListener("touchend", end, { capture: true })
    win.removeEventListener("touchcancel", end, { capture: true })
    win.removeEventListener("blur", end)
    doc.removeEventListener("visibilitychange", hidden)
  }
  win.addEventListener("touchend", end, { capture: true, passive: true })
  win.addEventListener("touchcancel", end, { capture: true, passive: true })
  win.addEventListener("blur", end)
  doc.addEventListener("visibilitychange", hidden)
  return off
}
