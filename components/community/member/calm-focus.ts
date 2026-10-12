"use client"

/**
 * ===========================================================================
 *  A TAP INTO AN EMPTY FIELD, FOCUSED WITHOUT iOS SCROLLING THE PAGE (round 25)
 * ===========================================================================
 * The owner: "the composer (new post) sheet: when the keyboard closes and I
 * tap 'Write something' again, the sheet bumps up weirdly." The sheet's first
 * keyboard never did that, and the difference is how the field got the caret:
 * the first time the sheet puts it there itself (composer.tsx focusFirst,
 * `focus({ preventScroll: true })`); the second time a finger does, and iOS
 * answers a finger's focus by scrolling the page to the field, a sheet that
 * is fixed to the screen included, before anything of ours can run. The sheet
 * holds the page behind it still (holdPage "scroll"), so it put the page back
 * on the next frame: the sheet went up and came back down, the bump.
 *
 * So on iOS a tap into an EMPTY field in these sheets (the post's title and
 * words, the comment box) is taken as the sheet's own focus: the tap's end is
 * kept from the browser and the field is focused from it with preventScroll,
 * which iOS honours, in the same touch (a focus inside a touch end brings the
 * keyboard). An empty field loses nothing by it: its caret has one place. A
 * field with words in it is left to the browser, so a tap still puts the caret
 * where the finger is; by then the sheet has already made the keyboard's room
 * (visible-box.ts sheetKeyboardRoom), so there is nothing for iOS to scroll to.
 */
import { useEffect } from "react"
import { currentKeyboardEnv, takesKeyboard } from "./visible-box"

/** Further than this between the touch's start and end, it was a scroll or a drag, not a tap. */
const TAP_SLOP_PX = 10
/** Longer than this, a press (the system's own menu), not a tap. */
const TAP_MS = 450

/** The empty text field a tap landed in, or null. */
export function emptyFieldAt(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  const el = target instanceof Element ? target.closest("textarea, input") : null
  if (!el || !takesKeyboard(el)) return null
  const f = el as HTMLInputElement | HTMLTextAreaElement
  if (f.disabled || f.readOnly || f.value !== "") return null
  return f
}

/** While `on`, taps into empty fields inside `scope()` are focused calmly (iOS only: elsewhere nothing changes). */
export function useCalmFocus(on: boolean, scope: () => HTMLElement | null): void {
  useEffect(() => {
    if (!on) return
    const env = currentKeyboardEnv()
    if (env !== "ios-safari" && env !== "ios-app" && env !== "ios-app-plugin") return
    let start: { x: number; y: number; t: number; field: HTMLInputElement | HTMLTextAreaElement } | null = null
    const onStart = (e: TouchEvent) => {
      const root = scope()
      const t = e.touches[0]
      const field = e.touches.length === 1 && root?.contains(e.target as Node) ? emptyFieldAt(e.target) : null
      start = field && t && document.activeElement !== field ? { x: t.clientX, y: t.clientY, t: e.timeStamp, field } : null
    }
    const onEnd = (e: TouchEvent) => {
      const s = start
      start = null
      const t = e.changedTouches[0]
      if (!s || !t || !e.cancelable) return
      if (Math.hypot(t.clientX - s.x, t.clientY - s.y) > TAP_SLOP_PX || e.timeStamp - s.t > TAP_MS) return
      if (!s.field.isConnected || s.field.value !== "" || document.activeElement === s.field) return
      e.preventDefault()
      s.field.focus({ preventScroll: true })
    }
    const onCancel = () => {
      start = null
    }
    document.addEventListener("touchstart", onStart, { capture: true, passive: true })
    document.addEventListener("touchend", onEnd, { capture: true, passive: false })
    document.addEventListener("touchcancel", onCancel, { capture: true, passive: true })
    return () => {
      document.removeEventListener("touchstart", onStart, true)
      document.removeEventListener("touchend", onEnd, true)
      document.removeEventListener("touchcancel", onCancel, true)
    }
  }, [on, scope])
}
