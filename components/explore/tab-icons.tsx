/**
 * The four glyphs in the bottom bar, in both of the states a tab bar has.
 *
 * Hand-drawn rather than taken from lucide, because lucide has no filled set —
 * every icon in it is built from strokes, so the only way to "fill" one is to
 * set `fill: currentColor` on paths that were never closed shapes. On Home that
 * nearly works; on Search it turns a magnifying glass into a black disc with a
 * stick, and on User it fuses the head into the shoulders. A tab bar is the
 * most-looked-at control in the app and cannot be where the icons are almost
 * right.
 *
 * Each is a pair on the same 24-unit grid with the same silhouette, so the solid
 * one is what the outline would be if you filled the space it encloses — not a
 * different drawing.
 *
 * ---------------------------------------------------------------------------
 * BOTH ARE ALWAYS RENDERED, stacked, and that is the change that matters
 * ---------------------------------------------------------------------------
 * The solid glyph used to be mounted only while its tab was active, with a
 * keyframe animation playing on mount. That made the arrival lovely and the
 * DEPARTURE nothing at all: the tab you were leaving had its filled icon
 * removed from the DOM on the same frame the new one started springing in, so
 * one side of every switch was a considered animation and the other was a cut.
 * Watching the two together is what reads as unfinished — the bar does one
 * thing beautifully and the opposite thing not at all.
 *
 * Stacked and cross-faded, the two states are one continuous movement in both
 * directions, and it comes free: a CSS transition runs backwards as readily as
 * forwards. Which also makes it correct under interruption. A keyframe restarts
 * from its first frame every time it is re-triggered, so tapping quickly
 * between two tabs produced a glyph that jumped back to 0.48 scale mid-flight;
 * a transition reverses from wherever it actually is. That is the accuracy
 * part — the icon can no longer be somewhere the finger never put it.
 */

type Props = { active: boolean; className?: string }

const OUT = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

/**
 * The two layers, in a box the size the caller asked for.
 *
 * `data-active` rather than a class so the whole state lives in one attribute
 * that CSS can read for both children at once — see `.tab-glyph` in
 * app/globals.css.
 */
function Glyph({
  active,
  className,
  outline,
  solid,
}: Props & { outline: React.ReactNode; solid: React.ReactNode }) {
  return (
    <span className={`tab-glyph ${className ?? ""}`} data-active={active ? "1" : undefined}>
      <svg viewBox="0 0 24 24" className="tab-glyph-out" aria-hidden focusable="false">
        {outline}
      </svg>
      <svg viewBox="0 0 24 24" className="tab-glyph-in" aria-hidden focusable="false">
        {solid}
      </svg>
    </span>
  )
}

export function HomeIcon({ active, className }: Props) {
  return (
    <Glyph
      active={active}
      className={className}
      outline={<path {...OUT} d="M3.6 10.2 12 3.3l8.4 6.9V20a1 1 0 0 1-1 1h-4.6v-5.1a1.9 1.9 0 0 0-1.9-1.9h-1.8a1.9 1.9 0 0 0-1.9 1.9V21H4.6a1 1 0 0 1-1-1Z" />}
      solid={
        <path
          fill="currentColor"
          d="M11.3 2.6a1.1 1.1 0 0 1 1.4 0l8 6.6c.3.2.4.5.4.9V20a1.5 1.5 0 0 1-1.5 1.5h-4.3a.7.7 0 0 1-.7-.7v-4.6a1.4 1.4 0 0 0-1.4-1.4h-2.4a1.4 1.4 0 0 0-1.4 1.4v4.6a.7.7 0 0 1-.7.7H4.4A1.5 1.5 0 0 1 2.9 20v-9.9c0-.4.1-.7.4-.9Z"
        />
      }
    />
  )
}

export function SearchIcon({ active, className }: Props) {
  return (
    <Glyph
      active={active}
      className={className}
      outline={
        <g {...OUT}>
          <circle cx="11" cy="11" r="7.2" />
          <path d="m20.2 20.2-4.1-4.1" />
        </g>
      }
      solid={
        // A ring, not a disc: the glass has to keep its hole or the filled state
        // stops being a magnifier. One even-odd path, so it is a single shape
        // the transform scales as a unit.
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="currentColor"
          d="M11 2.6a8.4 8.4 0 1 0 5.1 15.1l3.6 3.6a1.2 1.2 0 0 0 1.7-1.7l-3.6-3.6A8.4 8.4 0 0 0 11 2.6Zm0 2.6a5.8 5.8 0 1 1 0 11.6 5.8 5.8 0 0 1 0-11.6Z"
        />
      }
    />
  )
}

export function InboxIcon({ active, className }: Props) {
  return (
    <Glyph
      active={active}
      className={className}
      outline={<path {...OUT} d="M4.6 3.9h14.8a1.7 1.7 0 0 1 1.7 1.7v9.2a1.7 1.7 0 0 1-1.7 1.7H9.4l-4.5 3.8a.3.3 0 0 1-.5-.2V5.6a1.7 1.7 0 0 1 1.7-1.7Z" />}
      solid={
        <path
          fill="currentColor"
          d="M4.6 3.4h14.8A2.2 2.2 0 0 1 21.6 5.6v9.2a2.2 2.2 0 0 1-2.2 2.2H9.2l-4 3.4a.8.8 0 0 1-1.3-.6V5.6a2.2 2.2 0 0 1 2.2-2.2Z"
        />
      }
    />
  )
}

export function ProfileIcon({ active, className }: Props) {
  return (
    <Glyph
      active={active}
      className={className}
      outline={
        <g {...OUT}>
          <circle cx="12" cy="7.6" r="3.9" />
          <path d="M4.4 20.5c0-3.6 3.4-5.9 7.6-5.9s7.6 2.3 7.6 5.9a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1Z" />
        </g>
      }
      solid={
        <g fill="currentColor">
          <circle cx="12" cy="7.6" r="4.3" />
          <path d="M3.9 20.1c0-3.8 3.6-6.3 8.1-6.3s8.1 2.5 8.1 6.3a1.4 1.4 0 0 1-1.4 1.4H5.3a1.4 1.4 0 0 1-1.4-1.4Z" />
        </g>
      }
    />
  )
}
