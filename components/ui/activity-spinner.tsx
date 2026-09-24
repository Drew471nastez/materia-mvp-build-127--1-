import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE SPINNER A PHONE SHOWS WHEN SOMETHING TAKES A WHILE
 * ===========================================================================
 * The one iOS draws (UIActivityIndicatorView, the medium size): eight short
 * rounded spokes around a gap, the leading one darkest and each one behind it
 * a little lighter, turning in eighths rather than gliding. Asked for as
 * "a smooth clean iOS style rotating spinner, light gray".
 *
 * The spokes never change. What moves is the whole drawing, one eighth of a
 * turn every 100ms (`steps(8)` over 800ms, app/globals.css
 * `.activity-spinner`), so each spoke lands where the one ahead of it was and
 * the shading appears to run round the ring. One transform animation on one
 * element: the compositor runs it, and a busy main thread (a page being put
 * together, which is exactly when this is on screen) cannot make it stutter.
 *
 * Light gray by default, through `currentColor`, so a darker surface can pass
 * its own colour in `className`. Reduced motion slows it to a third of the
 * speed instead of stopping it: a still spinner reads as a frozen screen.
 */

const SPOKES = 8
/** The leading spoke is full strength; the one just ahead of it, the last in line, is this. */
const TAIL = 0.28

export function ActivitySpinner({
  size = 20,
  label = "Loading",
  className,
}: {
  /** The drawn diameter in px. 20 is the iOS medium indicator. */
  size?: number
  /** Read to a screen reader; the drawing itself is hidden from one. */
  label?: string
  className?: string
}) {
  return (
    <span role="status" aria-label={label} className={cn("inline-flex text-[#9ca3af]", className)}>
      <svg
        data-activity-spinner=""
        /* A .group on a touch screen strips transforms from what is inside it
           (app/globals.css); this one is the whole point, so it says so. */
        data-keep-transform=""
        className="activity-spinner"
        width={size}
        height={size}
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        {Array.from({ length: SPOKES }, (_, i) => (
          <rect
            key={i}
            x="9.05"
            y="1.4"
            width="1.9"
            height="5.4"
            rx="0.95"
            fill="currentColor"
            /* Clockwise from twelve. The turn is clockwise too, so spoke 0
               leads, spoke 7 (just behind it) is next darkest, and spoke 1
               (just ahead of it) is the faintest. */
            opacity={(1 - ((SPOKES - i) % SPOKES) * ((1 - TAIL) / (SPOKES - 1))).toFixed(3)}
            transform={`rotate(${(360 / SPOKES) * i} 10 10)`}
          />
        ))}
      </svg>
    </span>
  )
}
