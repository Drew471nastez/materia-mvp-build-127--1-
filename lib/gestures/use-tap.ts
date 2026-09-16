"use client"

/**
 * ===========================================================================
 *  A TAP THAT ARRIVES THE FIRST TIME
 * ===========================================================================
 * `onClick` is not the touch. It is a click the browser SYNTHESISES after a
 * touch, and it withholds it in two situations that happen constantly on a
 * phone:
 *
 *   THE PAGE IS STILL MOVING. A touch that lands while a fling is running is
 *   spent stopping it. pointerdown and pointerup are both delivered; no click
 *   follows. Driven against production, this is exactly what the product
 *   page's back arrow does: scroll down, scroll back up so the bar returns,
 *   tap the arrow — `pointerdown -> button[Back]`, `pointerup -> button[Back]`,
 *   `click -> null`, and the page does not move. Tap it again and it works.
 *   That is the whole of "I have to press it twice".
 *
 *   THE CONTROL MOVED. A click goes to the nearest common ancestor of the
 *   pointerdown target and the pointerup target. A bar sliding back into
 *   place, a button scaling under a finger, a row reflowing — any of them and
 *   the two targets differ, so there is no click at all.
 *
 * So the tap is read from the pointer events, which are delivered in both
 * cases, and `setPointerCapture` keeps the rest of the gesture on the control
 * no matter what moves underneath it.
 *
 * WHAT STILL HAS TO BE TRUE for it to count as a tap:
 *
 *   The finger did not travel more than TAP_SLOP_PX, so a scroll that started
 *   on the control is a scroll.
 *
 *   It came up ON the control, measured against where the control is at that
 *   moment rather than where it was when the finger landed. A bar that slides
 *   in under a waiting finger is a hit; a finger that slides off is not.
 *
 * AND THE KEYBOARD STILL WORKS. Enter and Space on a focused button produce a
 * click with no pointer events at all, and `detail === 0` is what tells that
 * apart from the click the browser synthesises after a touch (`detail === 1`).
 * So the click handler acts only on the keyboard's, and the touch's is
 * ignored as the duplicate it is.
 */

import * as React from "react"

/** How far a finger may travel and still have been a tap rather than a drag. */
export const TAP_SLOP_PX = 10

export interface TapHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void
  onClick: (e: React.MouseEvent<HTMLElement>) => void
}

export function useTap(onTap: () => void): TapHandlers {
  /**
   * Held in a ref and written during render rather than listed as a
   * dependency, so the handlers are stable for the life of the control and a
   * caller does not have to memoise what it passes in.
   */
  const latest = React.useRef(onTap)
  latest.current = onTap

  const gesture = React.useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    /* A right click or a middle click is not a tap. */
    if (e.pointerType === "mouse" && e.button !== 0) return
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* Capture is a convenience, not the mechanism. Without it the rest
         still works for anything that does not move. */
    }
  }, [])

  const onPointerMove = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId || g.moved) return
    if (Math.abs(e.clientX - g.x) > TAP_SLOP_PX || Math.abs(e.clientY - g.y) > TAP_SLOP_PX) {
      g.moved = true
    }
  }, [])

  /**
   * The browser took the gesture over — a scroll started, or the system put
   * something else in front. Not a tap, and nothing to undo.
   */
  const onPointerCancel = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (gesture.current?.id === e.pointerId) gesture.current = null
  }, [])

  const onPointerUp = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.id !== e.pointerId || g.moved) return

    /* Where the control is NOW, not where it was when the finger landed. */
    const r = e.currentTarget.getBoundingClientRect()
    const inside =
      e.clientX >= r.left - TAP_SLOP_PX &&
      e.clientX <= r.right + TAP_SLOP_PX &&
      e.clientY >= r.top - TAP_SLOP_PX &&
      e.clientY <= r.bottom + TAP_SLOP_PX
    if (!inside) return

    latest.current()
  }, [])

  const onClick = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    /* detail 1 or more is the click the browser made from the touch or the
       mouse press this hook has already answered. */
    if (e.detail > 0) return
    latest.current()
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick }
}
