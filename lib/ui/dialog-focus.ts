/**
 * ===========================================================================
 *  A MODAL'S FIRST FOCUS, ON THE NEXT FRAME, WITHOUT A TOUCH SCREEN
 * ===========================================================================
 * Round 49. Opening a Radix modal makes it block presses outside by writing
 * `pointer-events: none` on <body>, an inherited property, so the next style
 * pass is the whole document's. Its focus trap then focused the first field
 * in the same task as the press, which forced that pass there and then: the
 * press was one long task of 70 to 170ms on a computer
 * (scripts/check-dialogs-r49.mjs: "focus < focusFirst" under the largest
 * style recalculation in the trace).
 *
 * Where no pointer is a finger (`any-pointer: coarse` is false, and not the
 * native app) the focus moves at the start of the next frame instead, where
 * the browser does that pass for the paint anyway, so the press's own task
 * is the dialog's render alone. What is focused is what Radix focuses: the
 * caller's onOpenAutoFocus first (it sees a cancelable event on the panel,
 * as before), then the first control that is not a link (an input's text
 * selected), else the panel.
 *
 * WITH A TOUCH SCREEN, ONLY WHERE NO KEYBOARD COMES UP. A phone or a tablet
 * opens its keyboard for a field focused inside the tap's own task and not
 * for one focused a frame later. So with any finger pointer (a phone, a
 * tablet, a laptop with a touch screen, the app) a dialog keeps Radix's own
 * timing when what it would focus first is a place to type, or when the
 * caller decides the focus itself (it may focus a field); a dialog that
 * opens on a button, a list or its own panel focuses on the next frame
 * there too, which nothing on screen shows.
 */
import { useCallback, type RefObject } from "react"

/** No pointer is a finger, and this is not the native app. */
export function noTouch(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return !window.matchMedia("(any-pointer: coarse)").matches && !document.documentElement.classList.contains("capacitor")
}

const NOT_TYPED = /^(button|checkbox|radio|range|color|file|image|reset|submit)$/

/** Does focusing this bring up a phone's keyboard? */
export function opensKeyboard(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) return !NOT_TYPED.test(el.type)
  return (el as HTMLElement).isContentEditable === true || el.getAttribute("contenteditable") === "true"
}

/** The first control Radix would look at, by the tree alone (no style read, so nothing is forced). */
function firstByTree(panel: HTMLElement): HTMLElement | null {
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_ELEMENT, { acceptNode: accept })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as HTMLElement).tagName !== "A") return n as HTMLElement
  return null
}

function accept(node: Node): number {
  const el = node as HTMLElement & { disabled?: boolean; type?: string }
  if (el.disabled || el.hidden || (el.tagName === "INPUT" && el.type === "hidden")) return NodeFilter.FILTER_SKIP
  return el.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
}

/** May this dialog's first focus wait for the next frame? */
export function focusOnNextFrame(panel: HTMLElement | null, callerDecides: boolean): boolean {
  if (!panel) return false
  if (noTouch()) return true
  return !callerDecides && !opensKeyboard(firstByTree(panel))
}

function isHiddenIn(node: HTMLElement, upTo: HTMLElement): boolean {
  if (getComputedStyle(node).visibility === "hidden") return true
  for (let el: HTMLElement | null = node; el && el !== upTo; el = el.parentElement) {
    if (getComputedStyle(el).display === "none") return true
  }
  return false
}

/** Radix FocusScope's first focus, by its own rules: tabbable, enabled, shown, not a link, an input's text selected. */
export function focusFirstIn(panel: HTMLElement): void {
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_ELEMENT, { acceptNode: accept })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n as HTMLElement
    if (el.tagName === "A" || isHiddenIn(el, panel)) continue
    el.focus({ preventScroll: true })
    if (document.activeElement !== el) continue
    if (el instanceof HTMLInputElement) el.select()
    return
  }
  if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
}

/**
 * The onOpenAutoFocus to give a Radix Dialog's Content: `panel` is the
 * content element, `own` the caller's handler.
 */
export function useNextFrameAutoFocus(panel: RefObject<HTMLElement | null>, own?: (event: Event) => void): (event: Event) => void {
  return useCallback(
    (event: Event) => {
      const node = panel.current
      if (!focusOnNextFrame(node, !!own)) {
        own?.(event)
        return
      }
      event.preventDefault()
      requestAnimationFrame(() => {
        if (!node?.isConnected) return
        const again = new CustomEvent("focusScope.autoFocusOnMount", { cancelable: true })
        Object.defineProperty(again, "currentTarget", { value: node })
        Object.defineProperty(again, "target", { value: node })
        own?.(again)
        if (again.defaultPrevented || node.contains(document.activeElement)) return
        focusFirstIn(node)
      })
    },
    [panel, own],
  )
}
