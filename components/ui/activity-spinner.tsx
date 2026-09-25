import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE SPINNER A PHONE SHOWS WHEN SOMETHING TAKES A WHILE
 * ===========================================================================
 * The one iOS draws (UIActivityIndicatorView): eight short rounded spokes
 * around a gap, the leading one darkest and each one behind it a little
 * lighter. Asked for as "a smooth clean iOS style rotating spinner, light
 * gray", and then "bigger, just a little bit, more smooth, clean, only
 * smooth".
 *
 * BIGGER. 26px across where it was 20: the same drawing (a 20 unit viewBox),
 * so the spokes, their gap and their rounding grow with it.
 *
 * SMOOTH. It used to turn an eighth at a time (`steps(8)`), which is how the
 * system indicator moves, and on a phone it read as a judder: a jump every
 * 100ms. Now the whole drawing turns continuously, one turn a second on a
 * linear curve (app/globals.css `.activity-spinner`), so every frame at 60
 * or 120Hz moves it by the same small angle. The spokes keep their stepped
 * shading, which is what makes it the iOS indicator and not a ring.
 *
 * One transform animation on one HTML box around the drawing (not on the SVG
 * itself: WebKit composites an HTML box's transform, where an SVG's may be
 * painted on the main thread). The compositor runs it, so a busy main thread
 * (a page being put together, which is exactly when this is on screen)
 * cannot make it stutter.
 *
 * Light gray by default, through `currentColor`, so a darker surface can pass
 * its own colour in `className`. Reduced motion slows it to a third of the
 * speed instead of stopping it: a still spinner reads as a frozen screen.
 */

/**
 * How long a part of a page waits before it shows the spinner: the same half
 * second a phone waits for a slow page (NAV_PHONE_SPINNER_AFTER_MS in
 * lib/ui/app-navigation.ts; tests/app-shell-motion.test.ts holds the two
 * equal). This file has no "use client", so it keeps its own copy: a server
 * component importing a value from a client module gets a reference, not
 * the number.
 */
export const SPINNER_WAIT_MS = 500

/** The drawn diameter, in px, everywhere it is used. */
export const SPINNER_SIZE = 26

/**
 * ===========================================================================
 *  WHERE A SPINNER THAT STANDS IN FOR A WHOLE PAGE SITS
 * ===========================================================================
 * "Move that loading thing a little bit more up." The middle of the content
 * area is the geometric middle, and on a tall phone that reads low: a page's
 * weight is in its top half (the heading, the first card), and the eye looks
 * for it there. So the spinner sits at the optical middle, 40% of the way
 * down: three rows, 2fr, the spinner, 3fr. Its centre is at
 * 0.4 * (height - 26) + 13, which is 40.3% of a 390x844 phone's content area
 * and of a 1280x860 screen's (scripts/check-app-stage.mjs measures it).
 *
 * Grid rows, not a transform or a percentage top: nothing to strip inside a
 * .group on a touch screen, and no number to keep in step with anything. The
 * slow page's surface (components/app/app-stage.tsx) and the native cold
 * start (app/app/cold-start.tsx) both use it, so a cold start and a slow
 * page put the spinner in the same place.
 */
export function PageSpinner({ label }: { label?: string }) {
  return (
    <div data-page-spinner="" className="grid h-full w-full grid-rows-[2fr_auto_3fr] justify-items-center">
      <ActivitySpinner label={label} className="row-start-2" />
    </div>
  )
}

/**
 * A PART OF A PAGE THAT IS STILL COMING: the room it will take, empty, and
 * the spinner in the middle of it only once SPINNER_WAIT_MS has passed. The
 * delay is CSS, so a server render needs no effect to start it.
 *
 * Charts, tables, lists and figures no longer use this: they draw their own
 * shapes in light gray (components/ui/shimmer), as asked, "not the spinner
 * in the charts loading and the tables loading". This is left for a slot
 * with no shape worth drawing.
 *
 * `size` is for a slot the width of a line of text (a figure, a bank name),
 * where the full spinner would be taller than what it stands in for.
 */
export function WaitingArea({
  className,
  label = "Loading",
  size,
}: {
  className?: string
  label?: string
  size?: number
}) {
  return (
    <div data-waiting-area="" className={cn("flex items-center justify-center", className)}>
      <span
        className="inline-flex opacity-0"
        style={{ animation: `skeleton-reveal 150ms ease-out ${SPINNER_WAIT_MS}ms forwards` }}
      >
        <ActivitySpinner label={label} size={size} />
      </span>
    </div>
  )
}

const SPOKES = 8
/** The leading spoke is full strength; the one just ahead of it, the last in line, is this. */
const TAIL = 0.28

export function ActivitySpinner({
  size = SPINNER_SIZE,
  label = "Loading",
  className,
}: {
  /** The drawn diameter in px. */
  size?: number
  /** Read to a screen reader; the drawing itself is hidden from one. */
  label?: string
  className?: string
}) {
  return (
    <span role="status" aria-label={label} className={cn("inline-flex text-[#9ca3af]", className)}>
      <span
        data-activity-spinner=""
        /* A .group on a touch screen strips transforms from what is inside it
           (app/globals.css); this one is the whole point, so it says so. */
        data-keep-transform=""
        className="activity-spinner"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg width={size} height={size} viewBox="0 0 20 20" className="block">
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
    </span>
  )
}
