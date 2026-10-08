/**
 * ===========================================================================
 *  CLICKING INTO A FIELD DOES NOT MOVE THE SIDEBAR
 * ===========================================================================
 * "If I click inside an input in the sidebar, it auto scrolls the sidebar."
 * Pressing into a field that is already on screen moved the list under the
 * pointer: the browser bringing a focused element "into view", scroll
 * anchoring re-centring after a row grew, an effect elsewhere scrolling to a
 * selection. Each has a reason; together they are a sidebar that jumps on
 * every click, which reads as broken.
 *
 * So the sidebar's scroll containers hold still around a press: when a
 * field that is FULLY on screen is pressed with a mouse or trackpad, any
 * scroll of its container in the next moment that the person did not make
 * (no wheel, no drag, no key) is put back. A field that is partly hidden is
 * left to be brought into view, which is the one scroll a press should
 * cause.
 *
 * Desktop pointers only. On a phone the sheet moves a field above the
 * keyboard on purpose (components/website-builder/mobile-editor-sheet.tsx),
 * and undoing that would hide what is being typed.
 */

/** The containers this holds still: the desktop sidebar and the sheets' own scrollers. */
export const STEADY_SCROLLERS = "[data-wb-sidebar-scroll], [data-sheet-scroll]"

/** How long after a press a scroll the person did not make is put back. */
export const STEADY_MS = 400

const FIELD = 'input:not([type="hidden"]), textarea, select, [contenteditable="true"], [contenteditable=""], label, [role="textbox"], [role="combobox"]'

/** Whether `inner` lies wholly inside `outer`, with a pixel of grace. */
export function fullyInside(inner: { top: number; bottom: number }, outer: { top: number; bottom: number }): boolean {
  return inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1
}

/**
 * Starts holding the sidebar still. Returns the function that stops it.
 * Listens on the document, in the capture phase, so a control that stops
 * propagation cannot hide a press from it.
 */
export function installSteadyFocus(doc: Document = document): () => void {
  const win = doc.defaultView
  /* A touch screen is a phone sheet, which moves a field above the keyboard on purpose. */
  if (!win || win.matchMedia?.("(pointer: coarse)").matches) return () => {}

  let hold: { el: HTMLElement; top: number; until: number } | null = null
  const release = () => {
    hold = null
  }

  const onPointerDown = (e: PointerEvent) => {
    hold = null
    if (e.button !== 0) return
    const target = e.target instanceof Element ? e.target : null
    const field = target?.closest(FIELD) as HTMLElement | null
    const scroller = field?.closest(STEADY_SCROLLERS) as HTMLElement | null
    if (!field || !scroller) return
    if (!fullyInside(field.getBoundingClientRect(), scroller.getBoundingClientRect())) return
    hold = { el: scroller, top: scroller.scrollTop, until: performance.now() + STEADY_MS }
  }

  const onScroll = (e: Event) => {
    if (!hold || e.target !== hold.el) return
    if (performance.now() > hold.until) {
      hold = null
      return
    }
    if (hold.el.scrollTop !== hold.top) hold.el.scrollTop = hold.top
  }

  doc.addEventListener("pointerdown", onPointerDown, true)
  /* Scroll does not bubble; captured, it is seen from every container. */
  doc.addEventListener("scroll", onScroll, true)
  /* The person scrolling is never undone. */
  doc.addEventListener("wheel", release, { capture: true, passive: true })
  doc.addEventListener("touchmove", release, { capture: true, passive: true })
  doc.addEventListener("keydown", release, true)
  return () => {
    doc.removeEventListener("pointerdown", onPointerDown, true)
    doc.removeEventListener("scroll", onScroll, true)
    doc.removeEventListener("wheel", release, true)
    doc.removeEventListener("touchmove", release, true)
    doc.removeEventListener("keydown", release, true)
  }
}
