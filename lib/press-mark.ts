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

function mark(e: ReactPointerEvent<HTMLElement>, on: boolean) {
  const row = e.currentTarget.parentElement
  if (!row) return
  if (on) row.setAttribute("data-pressed", "")
  else row.removeAttribute("data-pressed")
}

/** Spread on the link that covers the row; the row is its parent. */
export const pressMark = {
  /* In the capture phase, so a link's own onPointerDown stays its own. */
  onPointerDownCapture: (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    mark(e, true)
  },
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => mark(e, false),
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => mark(e, false),
  onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => mark(e, false),
}
