/**
 * ===========================================================================
 *  THE PLACES' ICONS, DRAWN BY HAND
 * ===========================================================================
 * Round 11: "new icons for Classroom, Calendar, Members, About (and
 * Community): simple, regular, hand set, not the AI look; consistent
 * stroke". A pack's icons each brought their own idea of weight and detail
 * (a smiling house, a cap on a square, a cup with a star); these are drawn
 * here on one 24px grid, from the same few parts: a 1.75 stroke with round
 * ends and joins, 2.5px corners, nothing smaller than 2px across, and no
 * decoration that is not the thing itself.
 *
 *   Community     a house: the community's home
 *   Learn         a lesson: a screen with a play mark and the progress
 *                 line under it (round 13, when the Classroom became Learn
 *                 and its courses programs of video lessons)
 *   Calendar      a page with two rings and its header line
 *   Members       two people, one in front
 *   Leaderboards  three steps of a podium
 *   About         an i in a circle
 *
 * The open place's icon is the same drawing a little heavier (2px) with a
 * soft fill inside its outline, so the shape never changes between the two,
 * only its weight. Server safe, no hooks.
 */
import type { TabKey } from "./nav"

const STROKE = 1.75
const STROKE_ON = 2

/** Each icon's parts: the outlines that are stroked, and which of them take the soft fill when the place is open. */
const DRAWN: Record<TabKey, { lines: string[]; fill?: string[] }> = {
  home: {
    lines: ["M4.5 10.2 12 4.25l7.5 5.95v8.3a1.75 1.75 0 0 1-1.75 1.75h-3.5V15a2.25 2.25 0 0 0-4.5 0v5.25h-3.5A1.75 1.75 0 0 1 4.5 18.5z"],
    fill: ["M4.5 10.2 12 4.25l7.5 5.95v8.3a1.75 1.75 0 0 1-1.75 1.75h-3.5V15a2.25 2.25 0 0 0-4.5 0v5.25h-3.5A1.75 1.75 0 0 1 4.5 18.5z"],
  },
  classroom: {
    lines: ["M6.25 4.5h11.5A2.25 2.25 0 0 1 20 6.75v7.5a2.25 2.25 0 0 1-2.25 2.25H6.25A2.25 2.25 0 0 1 4 14.25v-7.5A2.25 2.25 0 0 1 6.25 4.5z", "M10.5 8.1v4.8l4-2.4z", "M4 19.75h5.45", "M13.55 19.75H20", "M11.5 21a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z"],
    fill: ["M6.25 4.5h11.5A2.25 2.25 0 0 1 20 6.75v7.5a2.25 2.25 0 0 1-2.25 2.25H6.25A2.25 2.25 0 0 1 4 14.25v-7.5A2.25 2.25 0 0 1 6.25 4.5z"],
  },
  events: {
    lines: ["M6.25 5.5h11.5A2.25 2.25 0 0 1 20 7.75v10A2.25 2.25 0 0 1 17.75 20H6.25A2.25 2.25 0 0 1 4 17.75v-10A2.25 2.25 0 0 1 6.25 5.5z", "M4 10h16", "M8.25 3.75v3.5", "M15.75 3.75v3.5"],
    fill: ["M6.25 5.5h11.5A2.25 2.25 0 0 1 20 7.75v10A2.25 2.25 0 0 1 17.75 20H6.25A2.25 2.25 0 0 1 4 17.75v-10A2.25 2.25 0 0 1 6.25 5.5z"],
  },
  members: {
    lines: ["M9.25 11.25a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M3.75 19.25c.55-3 2.75-4.75 5.5-4.75s4.95 1.75 5.5 4.75", "M15.5 5.6a2.75 2.75 0 0 1 0 5.3", "M17.25 14.6c1.6.5 2.65 1.95 3 4.15"],
    fill: ["M9.25 11.25a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M3.75 19.25c.55-3 2.75-4.75 5.5-4.75s4.95 1.75 5.5 4.75z"],
  },
  leaderboard: {
    lines: ["M9.25 8.25h5.5v11.5h-5.5z", "M3.75 13.25h5.5v6.5h-5.5z", "M14.75 11.25h5.5v8.5h-5.5z"],
    fill: ["M9.25 8.25h5.5v11.5h-5.5z"],
  },
  about: {
    lines: ["M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5z", "M12 11v5.25", "M12 7.9v.1"],
    fill: ["M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5z"],
  },
}

export function PlaceIcon({ place, on = false, size = 20, className = "" }: { place: TabKey; on?: boolean; size?: number; className?: string }) {
  const d = DRAWN[place]
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden className={className} data-place-icon={place} data-on={on ? "true" : "false"}>
      {on && d.fill ? d.fill.map((p, i) => <path key={`f${i}`} d={p} fill="currentColor" fillOpacity={0.13} stroke="none" />) : null}
      {d.lines.map((p, i) => (
        <path key={i} d={p} stroke="currentColor" strokeWidth={on ? STROKE_ON : STROKE} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}
