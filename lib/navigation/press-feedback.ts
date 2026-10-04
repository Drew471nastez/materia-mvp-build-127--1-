"use client"

/**
 * ===========================================================================
 *  THE CONTROL ANSWERS ON THE FRAME THE FINGER LANDS
 * ===========================================================================
 * `:active` is not that on a phone. iOS only applies it to an element with a
 * touch listener of its own, and then late, after it has decided the touch
 * is not a scroll, so a quick tap on a back arrow often shows nothing at all
 * and the screen just changes: "nothing direct", the owner's word for it.
 *
 * So the press is written straight onto the element as `data-pressed` from
 * pointerdown, and its styles hang off that attribute (data-[pressed]:...).
 * Written to the DOM rather than through React state, so a press costs no
 * render: the style change is on screen in the same frame as the touch.
 * Cleared on the lift, a cancel (the touch became a scroll), the pointer
 * leaving, and after a moment whatever happens, so a press can never stick.
 */

import { useRef } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"

/** Longest a press may show before it clears itself. */
export const PRESS_MAX_MS = 900

export function usePressFeedback<E extends HTMLElement = HTMLElement>() {
  const el = useRef<E | null>(null)
  const timer = useRef(0)
  const clear = () => {
    window.clearTimeout(timer.current)
    el.current?.removeAttribute("data-pressed")
    el.current = null
  }
  return {
    onPointerDown(e: ReactPointerEvent<E>) {
      if (e.button !== 0 && e.pointerType === "mouse") return
      clear()
      el.current = e.currentTarget
      e.currentTarget.setAttribute("data-pressed", "")
      timer.current = window.setTimeout(clear, PRESS_MAX_MS)
    },
    onPointerUp: clear,
  }
}
