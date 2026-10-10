/**
 * ===========================================================================
 *  THE SPACE PILLS: WHERE A TAP COUNTS, WHEN ONE IS A TAP, AND HOW IT FEELS
 * ===========================================================================
 * Round 15. The owner: "sometimes when I click around a pill shaped space, it
 * bumps instead of clicking it, sometimes the click takes hard, or double
 * taps", and the press colour "too direct ... too fast, or flashy".
 *
 * WHAT WAS WRONG, measured (scripts/check-communities-feed15.mjs DRIFT, TAPS,
 * PRESS, FILL), with the code as it was on main:
 *
 *   THE BUMP AND THE LOST TAP. The pills sit at the top of the feed, which is
 *   exactly where pull to refresh listens (hooks/use-pull-to-refresh.ts). A
 *   finger always rolls a little as it presses. Safari reports every pixel of
 *   that roll as a touchmove, and the pull took any roll of 3px or more that
 *   went down as the start of a pull: it cancelled the move (Safari then sends
 *   no click at all) and drew the page down by the rubber band (3.6px for a
 *   4px roll, 5.3px for 6px), which sprang back when the finger lifted. The
 *   page bumped and the pill did nothing; the second tap, made more carefully,
 *   worked. Chromium hides this (it keeps moves inside its own slop from the
 *   page), which is why it never showed in a desktop browser.
 *   THE DEAD GAP. A pill took taps only on its own 40px pill: the 8px between
 *   two pills and the band above and below belonged to the row.
 *   THE FLASH. A press turned the pill grey in 70ms, three frames: a flash,
 *   not an ease. The chosen pill's ink crossfaded in place over 150ms, so the
 *   ink blinked from one pill to the other rather than going there.
 *
 * WHAT IT IS NOW
 *   The pull waits for a finger to travel PULL_TAP_SLOP before it moves the
 *   page or cancels anything (the hook), so a tap's roll is left alone.
 *   A pill acts on the release when the finger is still within TAP_SLOP of
 *   where it landed, whatever the browser did with the click, and the click
 *   that may follow is not a second switch (CLICK_AFTER_MS).
 *   Every pill's hit area reaches HIT_X into each gap (so the two meet in the
 *   middle of it) and HIT_Y above and below, which on a phone makes the place
 *   that takes a tap TOUCH_H tall.
 *   The press is its own grey layer: on the first frame it is already
 *   PRESS_FROM of the way, then it eases to full over PRESS_IN_MS, and lets go
 *   over PRESS_OUT_MS. Opacity only, on the compositor.
 *   The ink is one piece that glides from the old pill to the new one over
 *   GLIDE_MS (chip-ink.tsx), translate and scale only, so it keeps moving while the new
 *   list is drawn.
 */

/** The pill as drawn on a phone. */
export const PILL_H = 40
/** The space between two pills. */
export const GAP = 8
/** How far a pill's hit area reaches past its edge, left and right: half the gap and half a pixel, so the two overlap by a hair and no column belongs to neither. */
export const HIT_X = GAP / 2 + 0.5
/** And above and below, into the row's own padding (the row has room for exactly this, so nothing is clipped). */
export const HIT_Y = 6
/** The height that takes a tap on a phone, never under Apple's 44: the hit area is measured from inside the pill's 1px hairline. */
export const TOUCH_H = PILL_H - 2 + 2 * HIT_Y

/** A press and a release this far apart are one tap, not a scroll. */
export const TAP_SLOP = 10
/** And this long apart. Past it the finger was resting, not tapping. */
export const TAP_MS = 700
/** A click this soon after a release that already acted is the same tap. */
export const CLICK_AFTER_MS = 700

/** How far a finger travels before a pull at the top of the page moves anything (hooks/use-pull-to-refresh.ts). */
export const PULL_TAP_SLOP = 8

/** The press layer: part of the way on the first frame, then an ease to full, and a slower let go. */
export const PRESS_FROM = 0.35
export const PRESS_IN_MS = 140
export const PRESS_OUT_MS = 240
/** The ink's glide from one pill to the next, and its curve (iOS's own deceleration). */
export const GLIDE_MS = 320
export const GLIDE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** When the new list is drawn after a tap (feed.tsx): past the glide's fast part, so the work of drawing it lands on its slow end. */
export const LIST_AFTER_MS = 110

/** How far along its way the ink is `ms` into the glide (the curve's progress, for the tests): the cubic bezier solved for x. */
export function glideAt(ms: number): number {
  const x = Math.min(1, Math.max(0, ms / GLIDE_MS))
  const [x1, y1, x2, y2] = [0.32, 0.72, 0, 1]
  const bez = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (bez(mid, x1, x2) < x) lo = mid
    else hi = mid
  }
  return bez((lo + hi) / 2, y1, y2)
}

export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** Where a pill laid out at `box` actually takes a tap. */
export function hitBox(box: Box): Box {
  return { left: box.left - HIT_X, right: box.right + HIT_X, top: box.top - HIT_Y, bottom: box.bottom + HIT_Y }
}

export function inside(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}

/** Which pill a tap at (x, y) belongs to: the one whose hit area holds it, the nearer where two overlap; -1 for none. */
export function chipAt(boxes: Box[], x: number, y: number): number {
  let best = -1
  let near = Infinity
  for (let i = 0; i < boxes.length; i++) {
    if (!inside(hitBox(boxes[i]), x, y)) continue
    const d = Math.abs(x - (boxes[i].left + boxes[i].right) / 2)
    if (d < near) {
      near = d
      best = i
    }
  }
  return best
}

/** Whether two neighbouring pills' hit areas leave nothing between them. */
export function coversGap(a: Box, b: Box): boolean {
  return hitBox(a).right >= hitBox(b).left
}

export interface Press {
  x: number
  y: number
  t: number
}

/** A release that still counts as the tap `down` started. */
export function isTap(down: Press | null, up: Press): boolean {
  if (!down) return false
  return up.t - down.t <= TAP_MS && Math.hypot(up.x - down.x, up.y - down.y) <= TAP_SLOP
}

/** The press layer's opacity `ms` after the finger landed: PRESS_FROM at once, then an ease out to 1. */
export function pressAt(ms: number): number {
  if (ms <= 0) return PRESS_FROM
  const t = Math.min(1, ms / PRESS_IN_MS)
  const eased = 1 - Math.pow(1 - t, 3)
  return PRESS_FROM + (1 - PRESS_FROM) * eased
}

/**
 * The ink's three pieces for a pill at `left` of `width` and height `h` (chip-ink.tsx): two round ends of the pill's height
 * and a body between them, so moving and resizing it is translate and scale alone, and the round ends never stretch.
 * BODY is the body's drawn width before its scale.
 */
export const BODY = 100
export function inkParts(left: number, width: number, h: number): { start: number; end: number; body: number; scale: number } {
  const w = Math.max(width, h)
  return { start: left, end: left + w - h, body: left + h / 2, scale: (w - h) / BODY }
}
