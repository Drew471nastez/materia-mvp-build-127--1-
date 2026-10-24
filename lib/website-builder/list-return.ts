/**
 * ===========================================================================
 *  BACK TO THE LIST, ON THE ROW YOU CAME FROM (round BC)
 * ===========================================================================
 * The owner: "When I go back, the sidebar jumps to the top or bottom. It
 * should return to the exact scroll position where I clicked, and keep that
 * row briefly highlighted (like Shopify) so I can see which one I was on."
 *
 * The list already comes back at the scroll it was left at (the editor's
 * keepListScroll, round 36). What it did not do is look for the row: a
 * section opened from the canvas, or a second one opened from there while
 * its settings were showing, came back to a list scrolled to wherever it had
 * been, with the row far above or below. Now, as the list is drawn again:
 *
 *   the scroll it was left at stays, when the row is on screen there
 *   otherwise the row is brought to the middle of what shows, before the
 *     list is painted, so nothing is seen moving
 *   the section's row, and the block's under it when a block was open, wear
 *     a soft highlight that fades (globals.css [data-row-flash])
 *
 * "What shows" is the scroller clipped to the window: on a phone the list is
 * in a sheet whose lower part can sit below the screen.
 */

/** How long a row keeps the highlight: it holds, then fades (globals.css wb-row-flash). */
export const ROW_FLASH_MS = 1700

const timers = new WeakMap<HTMLElement, number>()

/** The soft highlight on a row, taken off when it has faded. A row flashed again starts again. */
export function flashRow(el: HTMLElement | null): void {
  if (!el) return
  const was = timers.get(el)
  if (was) window.clearTimeout(was)
  el.removeAttribute("data-row-flash")
  /* Read layout so a second flash restarts the animation rather than continuing the first. */
  void el.offsetWidth
  el.setAttribute("data-row-flash", "")
  timers.set(el, window.setTimeout(() => {
    el.removeAttribute("data-row-flash")
    timers.delete(el)
  }, ROW_FLASH_MS))
}

/** The part of the scroller on screen, in client coordinates. */
function shownBox(scroller: HTMLElement): { top: number; bottom: number } {
  const r = scroller.getBoundingClientRect()
  const vh = typeof window !== "undefined" ? window.innerHeight : r.bottom
  return { top: Math.max(r.top, 0), bottom: Math.min(r.bottom, vh) }
}

/**
 * How far to scroll so a row is on screen: nothing when it already is,
 * otherwise to put it in the middle of what shows (its top, for a row
 * taller than that). Pure, for the tests.
 */
export function scrollToShow(row: { top: number; bottom: number }, box: { top: number; bottom: number }): number {
  if (row.top >= box.top && row.bottom <= box.bottom) return 0
  const room = box.bottom - box.top
  const h = row.bottom - row.top
  if (h >= room) return row.top - box.top
  return Math.round(row.top - box.top - (room - h) / 2)
}

const esc = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&"))

/**
 * The list is drawn again after a section's (or a block's) settings: the row
 * is brought on screen if it is not, and highlighted. Runs before paint (a
 * ref callback), so the list is first seen where it ends.
 */
export function returnToRow(scroller: HTMLElement, back: { section: string; block?: string | null }): void {
  const row = scroller.querySelector<HTMLElement>(`[data-section-row="${esc(back.section)}"]`)
  if (!row) return
  const blockRow = back.block
    ? scroller.querySelector<HTMLElement>(`[data-section-blocks="${esc(back.section)}"] [data-tree-block="${esc(back.block)}"] > [role="button"]`)
    : null
  const target = blockRow ?? row
  const delta = scrollToShow(target.getBoundingClientRect(), shownBox(scroller))
  if (delta) scroller.scrollTop += delta
  flashRow(row)
  if (blockRow) flashRow(blockRow)
}
