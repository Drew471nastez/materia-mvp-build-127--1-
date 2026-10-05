/**
 * ===========================================================================
 *  A POPOVER THAT IS ALWAYS WHOLE ON SCREEN (round 12)
 * ===========================================================================
 * The composer's emoji and GIF popovers were drawn at a fixed height (360px
 * and 420px). Radix flips a popover to the side with more room and slides it
 * sideways into the window, but it never makes one shorter, so where neither
 * side had the room (a composer near the top of the window, a browser zoomed
 * to 125%, a short laptop screen) the popover ran off the top edge
 * (images 70 and 71).
 *
 * Spread FIT_POPOVER on a Radix Popover.Content and give it fitBox(w, h):
 *
 *   - it opens on the side with the room (Radix's flip, best fit when
 *     neither side has all of it) and is slid sideways to stay inside,
 *     12px from every edge (collisionPadding), at any scroll position;
 *   - its height is the smaller of what it wants and what that side has
 *     (Radix's --radix-popover-content-available-height, measured against
 *     the window as it is now, so zoom and a short window are counted),
 *     and what is inside scrolls rather than spilling over;
 *   - its width never passes the window's less the same 12px a side.
 *
 * Plain data and one function: safe for any client component.
 */
import type { CSSProperties } from "react"

export const POPOVER_EDGE = 12

export const FIT_POPOVER = {
  avoidCollisions: true,
  collisionPadding: POPOVER_EDGE,
  sticky: "always",
  hideWhenDetached: false,
} as const

/** A popover box `w` wide and up to `h` tall, never more than the room it has. */
export function fitBox(w: number, h: number): CSSProperties {
  return {
    width: `min(${w}px, calc(100vw - ${POPOVER_EDGE * 2}px))`,
    height: `min(${h}px, var(--radix-popover-content-available-height, ${h}px))`,
    maxHeight: `var(--radix-popover-content-available-height, ${h}px)`,
  }
}

/** The sizes the community asks for: GIFs about 340 by 380, emoji about 320 by 340. */
export const GIF_POPOVER = { w: 340, h: 380 }
export const EMOJI_POPOVER = { w: 320, h: 340 }
