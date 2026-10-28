/**
 * ===========================================================================
 *  A ROW THAT GREYS WHILE ITS LINK IS PRESSED, WITHOUT :has(:active)
 * ===========================================================================
 * A list row on a phone is one big link laid over the row (`absolute
 * inset-0`), and the row greys while a finger is on it. That was written as
 * a `has-[…]` variant on the row naming the link `:active`, and a `:has()`
 * with `:active` (or `:hover`, or `:focus`) inside it anywhere in the app's
 * stylesheet costs
 * every page, not only the page with the row: Chromium then checks the
 * `:has()` anchors above every element whose press, hover or focus changes,
 * and `<html>` is one (the shell's `html:has(...)` rules), so each press,
 * release, hover change and focus change restyled the whole document.
 * Measured in the website builder: 1,346 elements and 35 to 120ms per press
 * at full CPU speed, on a page that has no such row at all
 * (docs/audits/website-builder-engine-2026-10.md, finding E1).
 *
 * So the press is marked by the link itself: `data-pressed` on the row while
 * the pointer is down on it, taken off when it lifts, is cancelled (a touch
 * that turns into a scroll is cancelled, as the engine drops `:active` then)
 * or leaves. The row's class reads `data-[pressed]:bg-…`.
 *
 * tests/editor-engine-w4b.test.ts holds that no `:has()` in the app's
 * stylesheet or its class names puts a pointer or focus state inside.
 */
import type { PointerEvent as ReactPointerEvent } from "react"

/*
  A FINGER IS NOT A PRESS UNTIL IT STAYS. A touch marked the row the instant
  it landed, and a finger lands on a row every time a list is scrolled, so
  the row under the thumb went grey and stayed grey until the browser decided
  the touch was a pan and sent pointercancel: the row "hovered" under every
  scroll on an iPhone. A touch now marks the row only once it has stayed
  TOUCH_MARK_MS without moving more than TOUCH_SLOP_PX; a scroll has moved or
  been cancelled by then and nothing is ever drawn. A mouse marks at once.
*/
export const TOUCH_MARK_MS = 120
export const TOUCH_SLOP_PX = 6

const pending = new WeakMap<HTMLElement, { timer: number; x: number; y: number }>()

function rowOf(e: ReactPointerEvent<HTMLElement>) {
  return e.currentTarget.parentElement
}

function clear(row: HTMLElement | null) {
  if (!row) return
  const p = pending.get(row)
  if (p) window.clearTimeout(p.timer)
  pending.delete(row)
  row.removeAttribute("data-pressed")
}

/** Spread on the link that covers the row; the row is its parent. */
export const pressMark = {
  /* In the capture phase, so a link's own onPointerDown stays its own. */
  onPointerDownCapture: (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    const row = rowOf(e)
    if (!row) return
    clear(row)
    if (e.pointerType === "mouse") {
      row.setAttribute("data-pressed", "")
      return
    }
    const timer = window.setTimeout(() => row.setAttribute("data-pressed", ""), TOUCH_MARK_MS)
    pending.set(row, { timer, x: e.clientX, y: e.clientY })
  },
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
    const row = rowOf(e)
    if (!row) return
    const p = pending.get(row)
    /* Moved past the slop, before the mark or after it (a slow scroll that outlasted the wait). */
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TOUCH_SLOP_PX) clear(row)
  },
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => clear(rowOf(e)),
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => clear(rowOf(e)),
  onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => clear(rowOf(e)),
}
