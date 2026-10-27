/**
 * The canvas scroll, without reading layout on the frames it moves.
 *
 * A scroll handler that calls getBoundingClientRect forces the browser to
 * lay the page out on that frame. On a long theme that is the stutter: the
 * finger moves, then the page catches up. Shopify's theme editor and
 * Webflow keep selection chrome on the scroll offset during the gesture and
 * measure once it has stopped. The numbers here are that: scrollTop is
 * already known, the boxes are not read until the gesture rests.
 *
 * A push that arrives mid-gesture waits for the same rest, so it does not
 * lay the page out under the finger. It still lands on its own. Nobody
 * reloads the editor to see it.
 */

/** How long after the last scroll event the canvas counts as still. */
export const SCROLL_REST_MS = 120

let scrolling = false
let timer = 0
const waiters: Array<() => void> = []

function settle(): void {
  timer = 0
  scrolling = false
  const pending = waiters.splice(0)
  for (const done of pending) done()
}

/** The canvas moved. Called from its scroll listener and nothing else. */
export function noteCanvasScroll(): void {
  scrolling = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(settle, SCROLL_REST_MS) as unknown as number
}

/** Whether a gesture is still moving the canvas. */
export function canvasScrolling(): boolean {
  return scrolling
}

/** Resolves now when the canvas is still, otherwise when the gesture rests. */
export function whenCanvasRests(): Promise<void> {
  if (!scrolling) return Promise.resolve()
  return new Promise((resolve) => waiters.push(resolve))
}

/** Forget a gesture, for tests. */
export function resetCanvasScroll(): void {
  if (timer) clearTimeout(timer)
  timer = 0
  scrolling = false
  waiters.splice(0)
}

/**
 * Where a bar that was `top` px down the canvas area sits after the scroller
 * moves from `before` to `after`. No box is read. A sticky section is put
 * right when the gesture rests and the real boxes are read once.
 */
export function shiftWithScroll(top: number, before: number, after: number): number {
  return top - (after - before)
}

/**
 * The scrollbar thumb, from numbers already known. `scrollHeight` and
 * `clientHeight` are read when the page changes size, not on the scroll.
 */
export function thumbFor(scrollTop: number, scrollHeight: number, clientHeight: number, inset = 8, min = 28): { top: number; height: number } | null {
  const track = clientHeight - inset * 2
  if (scrollHeight <= clientHeight + 1 || track <= min) return null
  const height = Math.max(min, Math.round((clientHeight / scrollHeight) * track))
  const range = scrollHeight - clientHeight
  const top = inset + Math.round((scrollTop / range) * (track - height))
  return { top, height }
}
