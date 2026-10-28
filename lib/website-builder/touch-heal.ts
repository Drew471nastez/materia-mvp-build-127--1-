/**
 * ===========================================================================
 *  WHAT A GESTURE HOLDS, IT LETS GO OF WHEN THE FINGER LIFTS (round 1026)
 * ===========================================================================
 * Several parts of the editor hold something still for the length of one
 * gesture and give it back at the gesture's end:
 *
 *   a sheet's list, frozen     components/ui/bottom-sheet.tsx sets
 *                              `overflow-y: hidden` on the list a scroll was
 *                              handed off from, so the sheet can take the
 *                              rest of the finger, and thaws it on touchend
 *   the canvas, held           drawer-frame.ts puts `overflow: hidden` and
 *                              `touch-action: none` on #wb-preview-root while
 *                              the site's menu is open
 *   the page, held             a dialog's or a menu's lock on <html> and
 *                              <body> (stuck-layer.ts)
 *
 * Each gives it back from the end of the gesture that took it, and that end
 * can be missed: a touchend delivered to an element React has replaced
 * reaches no listener at all, a sheet unmounted mid-gesture never thaws, the
 * app put away with a finger down never sees the finger lift. What is left
 * is a list, a canvas or a page that no swipe can move, until a reload.
 *
 * So once every finger is off the glass, and whenever the page comes back
 * into view, whatever is still held with nothing entitled to hold it is let
 * go. Each check asks the narrow question: a frozen list is released only
 * with no finger down, the canvas only when no drawer counts itself as its
 * holder, the page only when no dialog or menu is open.
 *
 * Pure over small interfaces, so tests/editor-touch-scroll.test.ts drives it
 * without a browser; the editor installs it with `watchTouchLeftovers`.
 */

/** Set by components/ui/bottom-sheet.tsx on a list it froze for a handed off drag, and taken off when it thaws it. */
export const FROZEN_ATTRIBUTE = "data-touch-frozen"

export interface FrozenLike {
  style: { overflowY: string }
  removeAttribute(name: string): void
}

/** The lists a gesture froze and nothing thawed. Only with no finger down: during a gesture the freeze is meant. */
export function thawFrozenLists(frozen: Iterable<FrozenLike>, touchesDown: number): number {
  if (touchesDown > 0) return 0
  let n = 0
  for (const el of frozen) {
    if (el.style.overflowY === "hidden") el.style.overflowY = ""
    el.removeAttribute(FROZEN_ATTRIBUTE)
    n++
  }
  return n
}

export interface HealDeps {
  /** Every element still carrying FROZEN_ATTRIBUTE. */
  frozen(): Iterable<FrozenLike>
  /** Fingers on the glass now (0 after the last lifts). */
  touchesDown(): number
  /** The canvas's own check (canvas-scroll.ts releaseStrayDrawerHold): true when it let go of a hold no drawer counts. */
  releaseCanvas(): boolean
  /** The page's own check (stuck-layer.ts clearStaleDocumentLocks): what it cleared. */
  releaseDocument(): string[]
}

/** One pass: what was let go, for a log and a test. */
export function healTouchLeftovers(deps: HealDeps): string[] {
  const out: string[] = []
  const thawed = thawFrozenLists(deps.frozen(), deps.touchesDown())
  if (thawed) out.push(`thawed ${thawed} list${thawed === 1 ? "" : "s"}`)
  if (deps.touchesDown() === 0 && deps.releaseCanvas()) out.push("canvas hold")
  if (deps.touchesDown() === 0) out.push(...deps.releaseDocument())
  return out
}

export interface WatchTarget {
  addEventListener(type: string, cb: (e: { touches?: { length: number } }) => void, opts?: { capture?: boolean; passive?: boolean }): void
  removeEventListener(type: string, cb: (e: { touches?: { length: number } }) => void, opts?: { capture?: boolean }): void
}

/**
 * Runs `heal` after the last finger of a gesture lifts (touchend, touchcancel)
 * and when the page comes back into view. A frame later, so every listener
 * that ends a gesture properly has run first and this only ever finds what
 * they missed.
 */
export function watchTouchLeftovers(
  win: WatchTarget,
  doc: WatchTarget & { visibilityState?: string },
  heal: () => void,
  later: (cb: () => void) => void,
): () => void {
  let pending = false
  const soon = () => {
    if (pending) return
    pending = true
    later(() => {
      pending = false
      heal()
    })
  }
  const onEnd = (e: { touches?: { length: number } }) => {
    if ((e.touches?.length ?? 0) > 0) return
    soon()
  }
  const onVisible = () => {
    if (doc.visibilityState === "visible") soon()
  }
  win.addEventListener("touchend", onEnd, { capture: true, passive: true })
  win.addEventListener("touchcancel", onEnd, { capture: true, passive: true })
  doc.addEventListener("visibilitychange", onVisible)
  return () => {
    win.removeEventListener("touchend", onEnd, { capture: true })
    win.removeEventListener("touchcancel", onEnd, { capture: true })
    doc.removeEventListener("visibilitychange", onVisible)
  }
}
