/**
 * ===========================================================================
 *  WAITING FOR A PLACE THAT IS NOT HERE YET: THE APP'S OWN iOS SPINNER
 * ===========================================================================
 * Round 9: "while a not yet loaded one is fetched a small iOS style spinner
 * (thin, grey, centred in the content area only) instead of a skeleton".
 * No grey shapes pretending to be the page, nothing over the frame around it
 * (the bar, the columns, the chips stay as they were).
 *
 * ROUND 12: EXACTLY THE ONE /app DRAWS. The community had a spinner of its
 * own (eight thin lines in a 24 unit box, a turn every 900ms) that read
 * close to the dashboard's and was not it. Every loader in a community is
 * now components/ui/activity-spinner.tsx itself: the same eight rounded
 * spokes, the same 26px, the same turn a second on the compositor
 * (app/globals.css .activity-spinner), the same slower turn for reduced
 * motion. `Spinner` stays as the community's name for it, so a button's
 * small one (16px, 18px) is that component at that size, as /app's editor
 * buttons draw it.
 *
 * It waits before it shows (WAIT_MS, then a short fade), so a place that
 * arrives quickly never shows it at all. Every member page's loading.tsx
 * draws it, and so does the feed while a list it has never read is on its
 * way (feed.tsx). Server safe: no hooks; the motion is CSS.
 */
import { PageTitle } from "./headers"
import { ActivitySpinner, SPINNER_SIZE } from "@/components/ui/activity-spinner"

/** How long a wait goes unmarked: most places arrive before this. */
export const WAIT_MS = 240

/** One turn: the app spinner's (app/globals.css .activity-spinner, one turn a second). */
export const SPIN_MS = 1000

/** The app's spinner. Its colour comes from `className` (text-*), light grey by default; a dark button passes white. */
export function Spinner({ size = SPINNER_SIZE, className = "", label = "" }: { size?: number; className?: string; label?: string }) {
  return (
    <span className="inline-flex shrink-0" data-place-spinner-glyph="">
      <ActivitySpinner size={size} label={label} className={className} />
    </span>
  )
}

const SPOKES = 8
/** The app spinner's faintest spoke (activity-spinner.tsx TAIL). */
const TAIL = 0.28

/*
  THE SAME SPOKES AS LINES, for a caller that draws them itself and fades
  them one by one (components/ui/pull-to-refresh.tsx, in a 24 unit box with
  a 2 unit stroke): the app spinner's geometry (a spoke from 3.2 to 8.6
  units out of 10, its ends round) scaled to 24 and pulled in by the
  stroke's round caps, the leading spoke straight up and darkest, each one
  behind it a step fainter down to the same tail.
*/
const LINES = Array.from({ length: SPOKES }, (_, i) => {
  const a = (-i * 2 * Math.PI) / SPOKES
  const at = (r: number) => [+(12 + r * Math.sin(a)).toFixed(3), +(12 - r * Math.cos(a)).toFixed(3)]
  const [x1, y1] = at(9.32)
  const [x2, y2] = at(4.84)
  return { x1, y1, x2, y2, opacity: +(1 - (i * (1 - TAIL)) / (SPOKES - 1)).toFixed(3) }
})

/** The spokes for a caller that draws them itself (components/ui/pull-to-refresh.tsx): where each runs and how faint it is. */
export const SPINNER_SPOKES = LINES

/**
 * The spinner in the middle of the content column, in a box tall enough
 * that the column does not collapse under the frame while it waits.
 * `compact` is the feed's: the height of a couple of posts, under the chips
 * and the composer.
 */
export function PlaceSpinner({ label = "Loading", compact = false, delay = WAIT_MS }: { label?: string; compact?: boolean; /** How long it waits before it shows. 0 where the wait already happened (the place host waits 250ms before it shows a place's waiting screen). */ delay?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`flex w-full items-center justify-center ${compact ? "h-[220px]" : "min-h-[min(56vh,460px)]"}`}
      style={delay > 0 ? { animation: `skeleton-reveal 200ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both` } : undefined}
      data-place-spinner={compact ? "list" : "page"}
    >
      <Spinner />
    </div>
  )
}

/**
 * A PLACE ON ITS WAY, WITH ITS TITLE ALREADY THERE (round 24). The spinner on its own left the column empty for its first
 * 240ms (it waits before it shows) and then drew only a spinner, so a place that was not read ahead opened on nothing; the
 * title then arrived with the page and everything under it moved. The place's own title line, exactly as its page draws it
 * (PageTitle), comes at once, the spinner under it after the wait, and when the page lands the title stays where it is and
 * only what is under it fades in (shell-frame.tsx). A detail the page has and the loading screen cannot know (a count) keeps
 * its line, so nothing moves.
 */
export function PlaceLoading({ title, detail = null, label, delay = WAIT_MS }: { title: string; detail?: string | null; label?: string; delay?: number }) {
  return (
    <div data-place-loading="">
      <PageTitle title={title} detail={detail} />
      <PlaceSpinner label={label ?? `Loading ${title.toLowerCase()}`} delay={delay} />
    </div>
  )
}
