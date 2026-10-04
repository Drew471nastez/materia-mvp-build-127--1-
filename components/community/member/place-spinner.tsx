/**
 * ===========================================================================
 *  WAITING FOR A PLACE THAT IS NOT HERE YET: A SMALL iOS SPINNER
 * ===========================================================================
 * Round 9: "while a not yet loaded one is fetched a small iOS style spinner
 * (thin, grey, centred in the content area only) instead of a skeleton".
 * Eight thin spokes with round ends, each a step fainter than the one before,
 * turned a spoke at a time (steps), as the system's activity indicator is:
 * no grey shapes pretending to be the page, nothing over the frame around it
 * (the bar, the columns, the chips stay as they were).
 *
 * It waits before it shows (WAIT_MS, then a short fade), so a place that
 * arrives quickly never shows it at all. Every member page's loading.tsx
 * draws it, and so does the feed while a list it has never read is on its
 * way (feed.tsx). Server safe: no hooks; the motion is CSS (the spin
 * stops for reduced motion and the spokes stay as a still mark).
 */

/** How long a wait goes unmarked: most places arrive before this. */
export const WAIT_MS = 160

const SPOKES = 8

/* Each spoke from 4.75 to 9.25 units out of the centre, the first straight up and the rest going back round, worked out once. */
const LINES = Array.from({ length: SPOKES }, (_, i) => {
  const a = (-i * 2 * Math.PI) / SPOKES
  const at = (r: number) => [+(12 + r * Math.sin(a)).toFixed(3), +(12 - r * Math.cos(a)).toFixed(3)]
  const [x1, y1] = at(9.25)
  const [x2, y2] = at(4.75)
  return { x1, y1, x2, y2, opacity: +(1 - (i * 0.85) / SPOKES).toFixed(3) }
})

export function Spinner({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={`text-[#8a8f98] motion-safe:animate-[spin_0.8s_steps(8,end)_infinite] ${className}`}
      data-place-spinner-glyph=""
    >
      {LINES.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity={l.opacity} />
      ))}
    </svg>
  )
}

/**
 * The spinner in the middle of the content column, in a box tall enough
 * that the column does not collapse under the frame while it waits.
 * `compact` is the feed's: the height of a couple of posts, under the chips
 * and the composer.
 */
export function PlaceSpinner({ label = "Loading", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`flex w-full items-center justify-center ${compact ? "h-[220px]" : "min-h-[min(56vh,460px)]"}`}
      style={{ animation: `skeleton-reveal 200ms cubic-bezier(0.22, 1, 0.36, 1) ${WAIT_MS}ms both` }}
      data-place-spinner={compact ? "list" : "page"}
    >
      <Spinner />
    </div>
  )
}
