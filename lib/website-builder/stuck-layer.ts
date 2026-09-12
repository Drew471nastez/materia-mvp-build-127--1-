/**
 * ===========================================================================
 *  A LAYER THAT CLOSED BADLY LEAVES THE WHOLE PAGE DEAD TO TOUCH
 * ===========================================================================
 * "Come back from the code editor or project settings and the preview will
 * not scroll at all; I have to reload the page." Fixed four times at the
 * scroller — a bfcache scrim, a keyboard offset, a bounce guard, a WebKit
 * layer — and reported a fifth time, because the scroller was never the
 * problem.
 *
 *     @radix-ui/react-dismissable-layer:
 *         document.body.style.pointerEvents = "none"
 *
 * Every Radix modal does that while it is open and puts it back when it
 * unmounts. Both the code editor and project settings are opened FROM a
 * dropdown menu, and mounting a full-screen pane over that menu tears it
 * down in the middle of closing — so the restore can be skipped, and
 * `pointer-events: none` stays on the body until the page is reloaded.
 *
 * Nothing on the page takes a touch or a click after that. It reads as "the
 * scroll is frozen" because scrolling is what you try first. It is why every
 * fix aimed at the scroller changed nothing, and why a watchdog listening ON
 * the scroller never fired: the events were never arriving.
 *
 * THE GUARD THAT MADE IT WORSE ON A PHONE. The cleanup that already existed
 * skipped itself whenever it found `[data-mobile-bottom-sheet]` in the
 * document — and the builder's sections sheet is mounted for the whole life
 * of the editor, because it has a peek. So on a phone the cleanup never ran
 * once. A layer that never sets a body lock is not a reason to leave one in
 * place, which is what `modalIsOpen` below is careful about.
 *
 * Pure DOM and no React, so a test can drive it with a fake document.
 */

/**
 * What could legitimately be holding a body lock right now. Radix's
 * dismissable layer is the only thing in this app that sets one, and it
 * always renders one of these while it is open.
 *
 * Deliberately NOT `[data-state="open"]` on its own: that is on accordions,
 * collapsibles and the builder's own panels, none of which touch the body.
 * Matching those is how the old guard talked itself out of ever running.
 */
const MODAL_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  '[aria-modal="true"]',
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
].join(",")

export interface DocLike {
  querySelector(selector: string): unknown
  documentElement: ElLike
  body: ElLike
}
export interface ElLike {
  style: { getPropertyValue(name: string): string; removeProperty(name: string): void }
  hasAttribute(name: string): boolean
  removeAttribute(name: string): void
}

/** Is something open that has a right to be holding the document still? */
export function modalIsOpen(doc: DocLike): boolean {
  return doc.querySelector(MODAL_SELECTOR) !== null
}

/**
 * The properties a modal library sets on html or body and is supposed to put
 * back. Nothing in this app sets any of them deliberately: the builder locks
 * the document with a CLASS (`wb-fullscreen`) and a stylesheet, precisely so
 * that an inline one is always somebody's leftover.
 */
const LOCKS = ["pointer-events", "overflow", "position", "touch-action", "overscroll-behavior"] as const

/**
 * Clear what a layer left behind, and only when no layer is entitled to it.
 * Returns what was cleared, so a caller can log it and a test can assert it.
 */
export function clearStaleDocumentLocks(doc: DocLike): string[] {
  if (modalIsOpen(doc)) return []
  const cleared: string[] = []
  for (const [name, el] of [["html", doc.documentElement], ["body", doc.body]] as const) {
    for (const prop of LOCKS) {
      if (el.style.getPropertyValue(prop)) {
        el.style.removeProperty(prop)
        cleared.push(`${name}.${prop}`)
      }
    }
    if (el.hasAttribute("data-scroll-locked")) {
      el.removeAttribute("data-scroll-locked")
      cleared.push(`${name}[data-scroll-locked]`)
    }
  }
  return cleared
}

/**
 * The one that ends "reload the page", whatever caused it.
 *
 * With `pointer-events: none` on the body, a press hit-tests through to the
 * root element — so it still reaches a listener on the DOCUMENT, even though
 * it reaches nothing inside the page. That is the one signal available from
 * inside a frozen page, and it is enough: the press that finds the page dead
 * is the press that revives it.
 *
 * Passive, and it reads two inline properties before doing anything, so an
 * ordinary press costs nothing.
 */
export function watchForStuckLayer(
  doc: DocLike & {
    addEventListener(type: string, cb: () => void, opts?: { passive?: boolean; capture?: boolean }): void
    removeEventListener(type: string, cb: () => void, opts?: { capture?: boolean }): void
  },
  onCleared: (what: string[]) => void,
): () => void {
  const check = () => {
    if (!doc.body.style.getPropertyValue("pointer-events") && !doc.documentElement.style.getPropertyValue("pointer-events")) return
    const cleared = clearStaleDocumentLocks(doc)
    if (cleared.length) onCleared(cleared)
  }
  // Capture, so it runs before anything can stop the event travelling.
  doc.addEventListener("pointerdown", check, { passive: true, capture: true })
  doc.addEventListener("touchstart", check, { passive: true, capture: true })
  return () => {
    doc.removeEventListener("pointerdown", check, { capture: true })
    doc.removeEventListener("touchstart", check, { capture: true })
  }
}
