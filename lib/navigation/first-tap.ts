"use client"

/**
 * ===========================================================================
 *  THE FIRST TAP IS THE TAP
 * ===========================================================================
 * A control that navigates on `click` depends on the browser turning a touch
 * into a click, and on a phone it sometimes does not:
 *
 *   A ROW THAT IS STILL SCROLLING. The library's pills sit in a sideways
 *   scroller that glides the chosen pill into view after every press. A
 *   finger landing while it glides is spent stopping the glide: iOS sends
 *   the pointer events and no click.
 *   SOMETHING CHANGING UNDER THE FINGER. WebKit cancels the click of a tap
 *   when content appears during it (its hover heuristic), and a cross fade
 *   laying a copy over the screen, or a skeleton giving way, is exactly that.
 *   A CONTROL THAT MOVES UNDER THE FINGER. A press that shrinks it can leave
 *   the lift outside the down, so the click goes to their common parent.
 *
 * Each one reads as "I had to tap it twice". So for a finger or a pen the
 * press is decided on the lift: the same pointer that went down on the
 * control comes up within TAP_SLOP_PX of where it landed, inside
 * TAP_MAX_MS, and that is the tap. The click the browser may or may not
 * send afterwards is swallowed, so it can never be a second activation. A
 * mouse and the keyboard keep the plain click, which never had the problem.
 */

import { useRef } from "react"
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react"
import { backInFlight } from "./go-back"

/** How far a finger may drift and still be a tap rather than a scroll. */
export const TAP_SLOP_PX = 10
/** Longer than this is a long press, which belongs to the platform. */
export const TAP_MAX_MS = 700
/** How long after a lift the browser's own click is taken as the same tap. */
export const CLICK_ECHO_MS = 800

type Start = { id: number; x: number; y: number; t: number }

/** Whether a pointer that went down at `start` and came up at (x, y) after `t` ms is a tap. */
export function isTap(start: { x: number; y: number; t: number } | null, x: number, y: number, t: number): boolean {
  if (!start) return false
  const dx = x - start.x
  const dy = y - start.y
  return dx * dx + dy * dy <= TAP_SLOP_PX * TAP_SLOP_PX && t - start.t <= TAP_MAX_MS
}

function plainClick(e: ReactMouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

/**
 * Handlers for a control that should answer the first tap. `activate` runs
 * once per tap or plain click; return false from it to let a plain click go
 * on to the element's own default (a Link that navigates itself on a mouse
 * click). `onClick` is still yours for a mouse and the keyboard.
 */
export function useFirstTap<E extends HTMLElement = HTMLElement>(activate: (via: "tap" | "click") => boolean | void) {
  const start = useRef<Start | null>(null)
  const tappedAt = useRef(-Infinity)
  return {
    onPointerDown(e: ReactPointerEvent<E>) {
      if (e.pointerType === "mouse" || !e.isPrimary) return
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
    },
    onPointerUp(e: ReactPointerEvent<E>) {
      const s = start.current
      start.current = null
      if (!s || e.pointerType === "mouse" || s.id !== e.pointerId) return
      if (!isTap(s, e.clientX, e.clientY, e.timeStamp)) return
      tappedAt.current = performance.now()
      /* The second tap of a double tap on a back arrow, landing on the page that came back: not a press here (lib/navigation/go-back). */
      if (backInFlight()) return
      activate("tap")
    },
    onPointerCancel() {
      /* The touch became a scroll: not a tap. */
      start.current = null
    },
    onClick(e: ReactMouseEvent<E>) {
      if (performance.now() - tappedAt.current < CLICK_ECHO_MS) {
        /* The browser's click for the tap already taken on the lift. */
        tappedAt.current = -Infinity
        e.preventDefault()
        return
      }
      if (!plainClick(e)) return
      if (activate("click") !== false) e.preventDefault()
    },
  }
}
