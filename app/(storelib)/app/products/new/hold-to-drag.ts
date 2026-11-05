"use client"

/**
 * ===========================================================================
 *  HOLD TO DRAG: ONE SET OF RULES FOR EVERY LIST IN THE EDITOR
 * ===========================================================================
 * The questions (./faq-list.tsx) and the photos and videos (./media-grid.tsx)
 * reorder the same way, so they take the same sensors from here.
 *
 * WHY NOT PointerSensor. A finger raises pointer events as well as touch
 * events, so a PointerSensor with a distance takes every touch and starts a
 * drag after that many pixels, long before a TouchSensor's hold has run out:
 * there was no hold at all. With the handle `touch-action: none` on top of
 * that, a swipe that began on it could not scroll the page either. Both lists
 * had that pair; the media grid's handle was the whole tile, so a swipe over
 * the pictures dragged one instead of scrolling.
 *
 *   A mouse (MouseSensor) drags after MOUSE_DISTANCE_PX, on a computer.
 *   A finger (TouchSensor) drags after HOLD_MS held within HOLD_TOLERANCE_PX.
 *     Moving further before then is a scroll: the handle is
 *     `touch-action: manipulation`, so the browser scrolls as anywhere else
 *     and the sensor lets go. Once the hold has fired, the sensor cancels
 *     every touchmove, so the page stays put and the item follows the finger.
 *     A touchcancel ends it as a cancel: the order is what it was.
 *   A keyboard (KeyboardSensor) lifts with Space or Enter on the handle,
 *     moves with the arrow keys and drops with Space or Enter; Escape puts
 *     it back.
 *
 * Near the top or bottom of the editor's scrolling pane the pane scrolls by
 * itself (AUTO_SCROLL, for dnd-kit's autoScroll).
 */

import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { hapticTap } from "@/lib/native-bridge"

/** How long a finger holds before the item lifts. */
export const HOLD_MS = 300
/** How far it may wander in that time and still be a hold rather than a scroll. */
export const HOLD_TOLERANCE_PX = 8
/** From a computer, a press that moves this far is a drag, and less is a click. */
export const MOUSE_DISTANCE_PX = 4
/** The bottom and top 15% of the pane scroll it, at up to about 1000px a second. */
export const AUTO_SCROLL = { threshold: { x: 0, y: 0.15 }, acceleration: 6 }

export function useHoldToDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: HOLD_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/**
 * A short tick when a finger lifts an item: the app's own haptic
 * (lib/native-bridge), the Taptic Engine inside the iOS app and `vibrate`
 * where a browser has it. A mouse or a key gets none.
 */
export function liftTick(event: Event) {
  if (typeof TouchEvent === "undefined" || !(event instanceof TouchEvent)) return
  try {
    hapticTap("soft")
  } catch {
    /* A browser that refuses it (no user activation yet) says nothing. */
  }
}

/** The classes every handle carries: a swipe scrolls, a hold never selects text or opens a callout. */
export const HANDLE_TOUCH = "cursor-grab select-none touch-manipulation [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] active:cursor-grabbing"

/*
 * A GRIP THAT FOLLOWS THE FINGER AT ONCE, for the options and their values
 * (components/physical/variant-options.tsx). "Arranging them, smooth drag":
 * a hold before anything moves read as the list not answering. Those rows
 * have a grip of their own, a small handle at the start of the row, so a
 * finger on the grip means to move the row, not to scroll: the grip is
 * `touch-action: none` (GRIP_TOUCH) and the row lifts after GRIP_DISTANCE_PX
 * of movement, then tracks the finger. A swipe anywhere else on the row, or
 * on the page, scrolls as before. The mouse and the keyboard are as above.
 */
export const GRIP_DISTANCE_PX = 3

export function useGripDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
    useSensor(TouchSensor, { activationConstraint: { distance: GRIP_DISTANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/** A grip's classes: the finger drags rather than scrolls, and a press never selects text or opens a callout. */
export const GRIP_TOUCH = "cursor-grab select-none touch-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] active:cursor-grabbing"
