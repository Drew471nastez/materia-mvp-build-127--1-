/**
 * ===========================================================================
 *  A DESCRIPTION BOX AS TALL AS WHAT IS IN IT (round AR)
 * ===========================================================================
 * The owner: "when there is a lot of text, the description textarea input
 * on the blocks of the OnePage is too small". A block's long text fields
 * were two or three lines with a resize handle, so a paragraph scrolled
 * inside a box the height of a thumb.
 *
 * Every textarea in an open block's settings ([data-block-settings]) now
 * grows with its text from its own starting height up to GROW_MAX_PX, then
 * scrolls. Where the browser can size a field to its text by itself
 * (`field-sizing: content`, components/onepage/block-fields.css) nothing is
 * measured here; where it cannot (Safari before it learned it, which is the
 * iPhone app's WebView) this measures: the height is reset, scrollHeight is
 * read, and the box is set to it, capped. On every input, and once for
 * each textarea that arrives (a block opening, Settings and Layout
 * switching), so a long saved description opens at its full height.
 */

/** The tallest a growing box gets before it scrolls: about twelve lines. */
export const GROW_MAX_PX = 320

/** The height a box with `scrollHeight` of text and `floor` as its own minimum is given. Pure, for the tests. */
export function grownHeight(scrollHeight: number, floor: number, max = GROW_MAX_PX): { height: number; scrolls: boolean } {
  const want = Math.max(Math.ceil(scrollHeight), Math.ceil(floor))
  return { height: Math.min(want, max), scrolls: want > max }
}

function nativeSizing(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content")
}

function fit(el: HTMLTextAreaElement) {
  /* A box not drawn (a tab not shown) has no height to start from: it is fitted when it is. */
  if (!el.getClientRects().length) return
  const floor = parseFloat(el.dataset.growFloor || "") || el.getBoundingClientRect().height || 0
  if (!el.dataset.growFloor) el.dataset.growFloor = String(Math.round(floor))
  el.style.height = "auto"
  const { height, scrolls } = grownHeight(el.scrollHeight + (el.offsetHeight - el.clientHeight), floor)
  el.style.height = `${height}px`
  el.style.overflowY = scrolls ? "auto" : "hidden"
}

/**
 * A ref callback for the settings' container. Stable (module level), so
 * React calls it once per mount; it returns its own cleanup (React 19).
 */
export function growTextareas(root: HTMLElement | null): (() => void) | void {
  if (!root || nativeSizing()) return
  const fitAll = () => root.querySelectorAll("textarea").forEach((t) => fit(t as HTMLTextAreaElement))
  const onInput = (e: Event) => {
    const t = e.target as HTMLElement | null
    if (t && t.tagName === "TEXTAREA") fit(t as HTMLTextAreaElement)
  }
  let frame = 0
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(fitAll)
  })
  observer.observe(root, { childList: true, subtree: true })
  root.addEventListener("input", onInput)
  frame = requestAnimationFrame(fitAll)
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    root.removeEventListener("input", onInput)
  }
}
