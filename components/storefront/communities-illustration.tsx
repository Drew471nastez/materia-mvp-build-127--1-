import * as React from "react"

/**
 * ===========================================================================
 *  THE MARK ABOVE "NO COMMUNITIES YET"
 * ===========================================================================
 * It was a stock speech-bubble glyph at 24px in muted grey, the same icon
 * every empty state on the web uses, and it said nothing about this one.
 *
 * Drawn instead: two message cards, one resting behind the other, the front
 * one carrying three members and two lines of a thread, and a small dark
 * pill with three dots coming in over its corner. A room where people talk,
 * with nobody in it yet.
 *
 * EVERY COLOUR IS A TOKEN, never a hex. On the creator page `--card`,
 * `--foreground`, `--muted` and `--border` are rebound to the creator's
 * scheme (lib/store-builder/storefront-chrome), so on the default page this
 * is near-black ink on white cards, and on a black page it inverts with
 * everything else instead of being a dark drawing on a dark page.
 *
 * The depth is two drop shadows, a tight one and a soft one, the same pair
 * the profile avatar uses, drawn by an SVG filter because Safari does not
 * apply a CSS filter to an element inside an SVG. The filter region is the
 * whole drawing and then some, in user space, so no shadow is ever cut off
 * square at the edge of a box the browser guessed.
 */
export function CommunitiesIllustration({ className }: { className?: string }) {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const lift = `cm-lift-${id}`
  const ink = "var(--foreground, #111113)"
  const card = "var(--card, #ffffff)"
  const edge = "var(--border, #e5e7eb)"
  const well = "var(--muted, #f3f4f6)"

  return (
    <svg
      viewBox="0 0 128 100"
      width="128"
      height="100"
      fill="none"
      overflow="visible"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <filter
          id={lift}
          filterUnits="userSpaceOnUse"
          x="-16"
          y="-16"
          width="160"
          height="136"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#0f172a" floodOpacity="0.08" />
          <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#0f172a" floodOpacity="0.09" />
        </filter>
      </defs>

      {/* The card behind: an earlier message, tilted back and quieter. */}
      <g transform="rotate(-8 38 36)" filter={`url(#${lift})`}>
        <rect x="8.5" y="16.5" width="60" height="40" rx="11" style={{ fill: well, stroke: edge }} />
        <rect x="18" y="28" width="28" height="4" rx="2" style={{ fill: ink }} fillOpacity="0.16" />
        <rect x="18" y="37" width="40" height="4" rx="2" style={{ fill: ink }} fillOpacity="0.09" />
      </g>

      {/* The card in front, with the members and the start of a thread. */}
      <g filter={`url(#${lift})`}>
        <path
          d="M44 30.5h58a11 11 0 0 1 11 11v30a11 11 0 0 1-11 11H57l-8.4 6.7c-.66.52-1.6.05-1.6-.78V82.5h-3a11 11 0 0 1-11-11v-30a11 11 0 0 1 11-11Z"
          style={{ fill: card, stroke: edge }}
        />
        {/* Three members, overlapping, the nearest the darkest. */}
        <circle cx="70" cy="48" r="7.5" style={{ fill: ink, stroke: card }} fillOpacity="0.2" strokeWidth="2.5" />
        <circle cx="58.5" cy="48" r="7.5" style={{ fill: ink, stroke: card }} fillOpacity="0.46" strokeWidth="2.5" />
        <circle cx="47" cy="48" r="7.5" style={{ fill: ink, stroke: card }} strokeWidth="2.5" />
        <rect x="41" y="62" width="52" height="4" rx="2" style={{ fill: ink }} fillOpacity="0.17" />
        <rect x="41" y="70.5" width="32" height="4" rx="2" style={{ fill: ink }} fillOpacity="0.09" />
      </g>

      {/* Somebody about to say something. */}
      <g filter={`url(#${lift})`}>
        <rect x="92" y="19" width="30" height="17" rx="8.5" style={{ fill: ink }} />
        <circle cx="99.5" cy="27.5" r="1.9" style={{ fill: card }} />
        <circle cx="107" cy="27.5" r="1.9" style={{ fill: card }} fillOpacity="0.72" />
        <circle cx="114.5" cy="27.5" r="1.9" style={{ fill: card }} fillOpacity="0.45" />
      </g>
    </svg>
  )
}
