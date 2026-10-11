/**
 * ===========================================================================
 *  AFTER THE BROWSER'S OWN LAYOUT, BEFORE ITS PAINT (round 21)
 * ===========================================================================
 * A read of a box (getBoundingClientRect, offsetLeft, scrollY, getClientRects)
 * in a layout effect makes the browser lay the page out right there, in the
 * middle of React's commit. When a screen arrives (Home in the tab bar), every
 * such read after a write to the page lays the whole new page out again: at
 * 4x CPU on a phone each of those was a restyle of the whole document, 60 to
 * 140ms, several in a row (scripts/nav18-real-router, the community after the
 * account).
 *
 * A ResizeObserver's first report comes in the same frame, after the
 * browser's own style and layout and before the paint. Work done there reads
 * a page already laid out, so it costs no layout of its own, and what it
 * changes (a scroll position) is still painted in that frame. afterLayout runs
 * `fn` once, there; without a ResizeObserver, on the next animation frame.
 * The returned function cancels it.
 */
export function afterLayout(fn: () => void, target?: Element | null): () => void {
  if (typeof window === "undefined") return () => {}
  let done = false
  let cancel = () => {}
  const run = () => {
    if (done) return
    done = true
    cancel()
    fn()
  }
  const el = target ?? document.documentElement
  if (typeof ResizeObserver === "undefined" || !el) {
    const id = requestAnimationFrame(run)
    cancel = () => cancelAnimationFrame(id)
  } else {
    const ro = new ResizeObserver(run)
    cancel = () => ro.disconnect()
    ro.observe(el)
  }
  return () => {
    done = true
    cancel()
  }
}
