/**
 * ===========================================================================
 *  THE CATEGORIES ICON
 * ===========================================================================
 * Round 10: the four square grid (lucide's LayoutGrid) read as "apps" or
 * "dashboard" and is on every product on the internet; the owner asked for
 * something subtle, simple and not generic, and explicitly not a 2x2 grid of
 * squares or a sparkle.
 *
 * So it draws what Explore's categories actually look like: chips. A pill
 * and a dot on top, a dot and a pill under it, staggered the way the pill
 * row wraps, the two rows mirrored so the shape is balanced in its square.
 * Lucide's geometry (a 24px box, round caps and joins) so it sits with the
 * field's search glyph and every other icon on the page, at the 1.8 stroke
 * this control has always drawn at, a hair under the search glyph's 2 so
 * the field still leads with search. No fill: an outline among outlines.
 *
 * Used by ./search-categories-button, which both the hero's field and the
 * header's field draw, so the one icon is everywhere categories open.
 */
import type { SVGProps } from "react"

export function CategoriesIcon({ strokeWidth = 1.8, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-categories-icon=""
      {...props}
    >
      <rect x="3" y="4" width="11" height="6.5" rx="3.25" />
      <circle cx="18.25" cy="7.25" r="2.25" />
      <circle cx="5.75" cy="16.75" r="2.25" />
      <rect x="10" y="13.5" width="11" height="6.5" rx="3.25" />
    </svg>
  )
}
