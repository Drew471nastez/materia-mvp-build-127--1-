/**
 * ===========================================================================
 *  THE KEYBOARD GOING AWAY IS A LAYER GOING AWAY
 * ===========================================================================
 * "Focus a field and the preview will not scroll any more." The builder is a
 * fixed, full-screen surface with the document locked, and iOS does not care:
 * when a field takes focus WebKit scrolls the WINDOW to bring it above the
 * keyboard, `overflow: hidden` or not, and when the keyboard goes it leaves
 * the window where it scrolled it. The fixed surface is then sitting offset
 * from the viewport, its scroller is partly off screen, and the next touch
 * finds nothing that moves. That is the same failure the canvas already
 * heals when the code pane or project settings close — and a keyboard closing
 * had no such handler, so a field was the one layer that could still freeze
 * the page.
 *
 * Two signals, because neither is reliable alone:
 *
 *   `visualViewport` shrinks while the keyboard is up and grows back when it
 *   goes. This is the honest signal, but in a Capacitor shell whose keyboard
 *   mode resizes the webview it can be a plain window resize instead.
 *
 *   `focusout` fires when the field loses focus, which is a little before the
 *   keyboard has finished leaving. It is waited on, and only counts once
 *   nothing that takes a keyboard has focus — moving between two fields is
 *   not the keyboard closing.
 *
 * Pure: takes the window and document it watches, so a test can hand it fakes
 * and drive both signals.
 */

export interface ViewportLike {
  height: number
  addEventListener(type: string, cb: () => void): void
  removeEventListener(type: string, cb: () => void): void
}

export interface WindowLike {
  innerHeight: number
  visualViewport?: ViewportLike | null
  addEventListener(type: string, cb: () => void): void
  removeEventListener(type: string, cb: () => void): void
  setTimeout(cb: () => void, ms: number): number
  clearTimeout(id: number): void
}

export interface DocumentLike {
  activeElement: { tagName?: string; isContentEditable?: boolean } | null
  addEventListener(type: string, cb: () => void): void
  removeEventListener(type: string, cb: () => void): void
}

/** A viewport this much shorter than the window has a keyboard in it. */
export const KEYBOARD_MIN_PX = 120
/** How long after a blur before "nothing has focus" is believed. */
export const FOCUS_SETTLE_MS = 150

/** Whether what has focus is something a keyboard comes up for. */
export function takesKeyboard(el: DocumentLike["activeElement"]): boolean {
  if (!el) return false
  const tag = (el.tagName ?? "").toUpperCase()
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true
}

/**
 * Calls `onClosed` once each time the keyboard goes away. Returns the
 * function that stops watching.
 */
export function watchKeyboard(win: WindowLike, doc: DocumentLike, onClosed: () => void): () => void {
  const vv = win.visualViewport ?? null
  let up = false
  let settle = 0

  const closed = () => {
    up = false
    onClosed()
  }

  const onViewport = () => {
    const height = vv?.height ?? win.innerHeight
    const shrunk = win.innerHeight - height >= KEYBOARD_MIN_PX
    if (shrunk) {
      up = true
      return
    }
    if (up) closed()
  }

  const onFocusOut = () => {
    win.clearTimeout(settle)
    settle = win.setTimeout(() => {
      if (takesKeyboard(doc.activeElement)) return
      // The viewport may already have reported this; a second revive is
      // harmless, and a missed one is the bug.
      closed()
    }, FOCUS_SETTLE_MS)
  }

  vv?.addEventListener("resize", onViewport)
  win.addEventListener("resize", onViewport)
  doc.addEventListener("focusout", onFocusOut)
  return () => {
    win.clearTimeout(settle)
    vv?.removeEventListener("resize", onViewport)
    win.removeEventListener("resize", onViewport)
    doc.removeEventListener("focusout", onFocusOut)
  }
}
