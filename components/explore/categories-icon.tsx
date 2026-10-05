/**
 * ===========================================================================
 *  THE CATEGORIES ICON
 * ===========================================================================
 * Round 10 drew chips (a pill and a dot over a dot and a pill). The owner
 * found it busy and asked for something simpler and more regular, the most
 * neutral thing that still says "choose a kind". Round 11: a plain list,
 * three rows, each a dot and a line, evenly spaced.
 *
 * WHY NOT THE OTHER NEUTRAL ONES. Sliders are already Explore's filter
 * button at the end of the pill row just under this field (lucide's
 * SlidersHorizontal), so two slider icons a few pixels apart would mean two
 * different things. Four plain lines is the header's menu (and at 18px the
 * rows run together, drawn and looked at). A grid outline is a window. A
 * list of kinds is what the panel it opens is.
 *
 * The SAME STROKE AS THE SEARCH GLYPH it sits beside: lucide's 24px box,
 * round caps and joins, and a 2 stroke (lucide's Search draws at 2), so the
 * two ends of the field are one family. The dots are zero length strokes,
 * so they are exactly the stroke's own width and round. The rows are 6px
 * apart and the whole mark spans 3 to 21, centred in its square.
 *
 * Used by ./search-categories-button, which both the hero's field and the
 * header's field draw, so the one icon is everywhere categories open.
 */
import type { SVGProps } from "react"

export function CategoriesIcon({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  )
}
