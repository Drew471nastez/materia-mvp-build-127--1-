/**
 * ===========================================================================
 *  THE PAGE'S LOOK FOR THE BLOCKS THAT ARE NOT LINKS
 * ===========================================================================
 * Round 41, the owner: "all controls (buttons, typography, header, design,
 * wallpaper, social icons, footer) apply to everything and connect." The
 * blocks of components/onepage/extra-blocks, creator-blocks and
 * storelib-blocks each read the theme their own way. What the audit found:
 *
 *   HOVER        a link button answers a pointer with the page's choice (Lift,
 *                Fade, Zoom, Glow, Fill, Pop, Underline, None: `.op-btn` in
 *                app/globals.css); the map's Open in Maps, the contact
 *                form's Send and a lead magnet's button did not move at all.
 *                pressableProps gives them the same class, variables and
 *                data attributes, so they answer exactly as a link does,
 *                and stay still inside a group or a carousel as links do.
 *   BUTTON SIZE  Compact and Large changed every link and none of these.
 *                buttonPadScale is the same step for their padding.
 *   CORNERS      a Pill page (999px) drew the FAQ, the countdown, the map
 *                and the video frames as ovals. boxRadius stops a box at
 *                22px, as the course, shelf and testimonial cards already
 *                did; a single line button keeps the page's own corners.
 *   TITLE FONT   the Heading block ignored the title font of Typography.
 *
 * One rule each, read by all three files, so the next block reads them too.
 */
import type { CSSProperties } from "react"
import { buttonHover, buttonHoverVars, buttonShadow, buttonSize, themeButtonStyle, type ButtonThemeLike } from "./button-style"

/** The largest corner a box (several lines, a frame, a card) takes; a pill page's 999 would make it an oval. */
export const BOX_RADIUS_MAX = 22

export function boxRadius(theme: ButtonThemeLike, max = BOX_RADIUS_MAX): number {
  const r = Number(theme.button_border_radius ?? 8)
  return Math.max(0, Math.min(Number.isFinite(r) ? r : 8, max))
}

/** The step Compact and Large take from Regular, for a block's own padding (BUTTON_SIZE_CLASS's ratio, about). */
export function buttonPadScale(theme: ButtonThemeLike): number {
  const size = buttonSize(theme)
  return size === "compact" ? 0.7 : size === "large" ? 1.2 : 1
}

export type PressableProps = {
  className: string
  style: CSSProperties
  "data-hover": string
  "data-shadow": string
}

/**
 * A block's button as the page's button: its fill, corners, border and
 * shadow (themeButtonStyle), and its hover (`.op-btn`, buttonHoverVars).
 * `still` inside a group or a carousel, as a link there is.
 */
export function pressableProps(theme: ButtonThemeLike, still = false): PressableProps {
  return {
    className: "op-btn",
    style: { ...themeButtonStyle(theme), ...buttonHoverVars(theme) },
    "data-hover": still ? "none" : buttonHover(theme),
    "data-shadow": buttonShadow(theme),
  }
}

/** A colour at a share, whatever form it was saved in (`${hex}10` broke on rgb() and on #abc). */
export function tintOf(color: string | null | undefined, percent: number): string {
  const c = String(color || "").trim() || "#000000"
  return `color-mix(in srgb, ${c} ${Math.max(0, Math.min(100, percent))}%, transparent)`
}
