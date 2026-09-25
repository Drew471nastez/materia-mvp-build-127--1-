import * as React from "react"
import { STORELIB_S_PATH, STORELIB_S_TRANSFORM } from "@/components/storelib-mark"

/**
 * ===========================================================================
 *  THE STORELIB MARK, AS THE SHARE PILL AND THE SHARE SHEET DRAW IT
 * ===========================================================================
 * Three drawings, all from the real S (components/storelib-mark.tsx), so none
 * of them can drift from the logo:
 *
 *   GLYPH   the S on its own, no square around it, in `currentColor`.
 *   VIOLET  the S on its own in the logo's violet, lit along its top edge and
 *           sitting on a soft violet shadow. The grey address pill on the
 *           home page and in Settings wears it, at every size.
 *   TILE    the app icon: the violet square with the white S, lit from above
 *           and sitting on a soft violet shadow. The address row in the
 *           share panel wears it.
 *
 * The outline mark these replace (a square drawn as a line with the S inside)
 * read as a generic icon at pill size, and the S inside it was too small.
 */

/*
  The S's own box inside the 200 unit square, from its control points
  (x 55 to 147.4, y 44 to 155.9), with a unit of air on every side so the
  curves are never clipped.
*/
const S_VIEWBOX = "54 43 94.5 114"
const S_ASPECT = 94.5 / 114

/** The S alone, in `currentColor`. `size` is its height; the width follows the letter. */
export function StorelibGlyph({ size = 16, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={Math.round(size * S_ASPECT * 10) / 10}
      height={size}
      viewBox={S_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {/* data-keep-transform: globals.css flattens transforms inside a `.group` on touch screens, and this one places the S. */}
      <path d={STORELIB_S_PATH} transform={STORELIB_S_TRANSFORM} fill="currentColor" data-keep-transform="" />
    </svg>
  )
}

/**
 * THE S IN ITS OWN VIOLET, WITH A LITTLE DEPTH. "Make the Storelib S icon
 * not so dark: actually purple, with a little more depth, the same
 * everywhere." The share pill on Home and in Settings wears this at every
 * size. Flat logo violet (no gradient), a line of light along its top edges
 * (the shape less itself moved down a pixel, in white) and a soft violet
 * shadow a pixel under it: the same light and shade as the violet tile.
 *
 * The filter's numbers are in the S's own units: its box is 114 tall, so at
 * 15 or 16px a pixel is about 7 of them. Each drawing gets its own filter
 * id, so two pills on one page never share one.
 */
export const S_VIOLET = "#8b56fa"
/** `flat`: the logo's violet and nothing else, for a quiet surface like the share pill. */
export function StorelibVioletS({ size = 16, className, flat = false }: { size?: number; className?: string; flat?: boolean }) {
  const raw = React.useId()
  const id = `storelib-s-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <svg
      width={Math.round(size * S_ASPECT * 10) / 10}
      height={size}
      viewBox={S_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ overflow: "visible" }}
      data-storelib-s=""
    >
      <defs>
        <filter id={id} x="-25%" y="-20%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3.5" result="soft" />
          <feOffset in="soft" dy="6" result="drop" />
          <feFlood floodColor="#4c1d95" floodOpacity="0.32" />
          <feComposite in2="drop" operator="in" result="shadow" />
          <feOffset in="SourceAlpha" dy="6" result="down" />
          <feComposite in="SourceAlpha" in2="down" operator="out" result="rim" />
          <feFlood floodColor="#ffffff" floodOpacity="0.36" />
          <feComposite in2="rim" operator="in" result="light" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="light" />
          </feMerge>
        </filter>
      </defs>
      {/* data-keep-transform: globals.css flattens transforms inside a `.group` on touch screens, and this one places the S. */}
      <path d={STORELIB_S_PATH} transform={STORELIB_S_TRANSFORM} fill={S_VIOLET} filter={flat ? undefined : `url(#${id})`} data-keep-transform="" />
    </svg>
  )
}

/*
  THE DEPTH, THE WAY THE APP'S BUTTONS HAVE IT (components/ui/depth-button):
  the logo's own violet, flat, with a line of light along the top edge, a
  darker line inside the foot, and a small violet shadow under it. No
  gradient. The S carries a one pixel shade of its own so it sits on the
  tile rather than being printed on it.
*/
const TILE_BACKGROUND = "#8b56fa"
const TILE_SHADOW =
  "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(40,10,110,0.2), 0 1px 2px rgba(76,29,149,0.3), 0 3px 8px -2px rgba(139,86,250,0.45)"

/** The app icon: a violet tile with the white S. `round` makes it a circle, for a row of round buttons. */
export function StorelibTile({ size = 24, round = false, className }: { size?: number; round?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-grid",
        placeItems: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: round ? "9999px" : Math.round(size * 0.28),
        background: TILE_BACKGROUND,
        boxShadow: TILE_SHADOW,
        color: "#ffffff",
      }}
    >
      <StorelibGlyph
        size={Math.round(size * (round ? 0.46 : 0.56) * 10) / 10}
        style={{ filter: "drop-shadow(0 1px 0.5px rgba(40,10,110,0.35))" }}
      />
    </span>
  )
}
