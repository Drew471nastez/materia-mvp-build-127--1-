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

/**
 * Heavier, and round everywhere it can be.
 *
 * 1.9 was a UI weight — right for a settings row, thin for the one control that
 * is on screen on every page and is looked at more than anything else in the
 * app. At 25px a 1.9 stroke is under 8% of the glyph's height, which is why the
 * bar read as delicate rather than as furniture. 2.15 is the weight the rest of
 * the bar's typography is set in.
 *
 * Round caps and round joins were already here; what changed is that the
 * drawings now have curves for them to act on. Every corner below is an arc
 * with a stated radius rather than a mitre softened after the fact — a 3.6-unit
 * radius on the bubble, a semicircle for the shoulders, an arc across the roof
 * apex. A round join can only take the edge off a corner; it cannot make a
 * shape round, and the difference between the two is the whole of what a bar of
 * icons reads as.
 */
const OUT = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.15,
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
      // The roof APEX is an arc, not a mitre. A 24-unit house whose ridge is a
      // point has one sharp feature in a bar of otherwise soft shapes, and it
      // is the first thing the eye lands on — a round linejoin only shaves it,
      // because the two roof lines meet at a shallow angle and a join can only
      // fit a radius as large as the corner allows. Stating the arc puts the
      // radius where the drawing wants it.
      outline={
        <path
          {...OUT}
          d="M13 3.5 20.4 9.6a2.1 2.1 0 0 1 .7 1.6V18.6A2.5 2.5 0 0 1 18.6 21.1H16.1V16.4A2.4 2.4 0 0 0 13.7 14H10.3A2.4 2.4 0 0 0 7.9 16.4V21.1H5.4A2.5 2.5 0 0 1 2.9 18.6V11.2a2.1 2.1 0 0 1 .7-1.6L11 3.5a1.6 1.6 0 0 1 2 0Z"
        />
      }
      solid={
        <path
          fill="currentColor"
          d="M13.1 2.9 20.8 9.2a2.4 2.4 0 0 1 .9 1.8V18.7A2.8 2.8 0 0 1 18.9 21.5H16.2a.9.9 0 0 1-.9-.9V16.3A2.1 2.1 0 0 0 13.2 14.2H10.8a2.1 2.1 0 0 0-2.1 2.1V20.6a.9.9 0 0 1-.9.9H5.1A2.8 2.8 0 0 1 2.3 18.7V11a2.4 2.4 0 0 1 .9-1.8L10.9 2.9a1.7 1.7 0 0 1 2.2 0Z"
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
          <circle cx="10.9" cy="10.9" r="7.3" />
          <path d="m20.4 20.4-4.3-4.3" />
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
          d="M10.9 2.3a8.6 8.6 0 1 0 5.3 15.4l3.6 3.6a1.35 1.35 0 0 0 1.9-1.9l-3.6-3.6A8.6 8.6 0 0 0 10.9 2.3Zm0 3a5.6 5.6 0 1 1 0 11.2 5.6 5.6 0 0 1 0-11.2Z"
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
      // A 3.6-unit corner instead of 1.7, which is the difference between a
      // rectangle with the edges taken off and a bubble. The tail is rounded at
      // its tip for the same reason the roof is: it is the one point on the
      // shape, and a point is what makes a soft icon look accidental.
      outline={
        <path
          {...OUT}
          d="M7.2 4.2H16.8A3.6 3.6 0 0 1 20.4 7.8V13A3.6 3.6 0 0 1 16.8 16.6H9.4L4.9 20.4a.85.85 0 0 1-1.3-.65V7.8A3.6 3.6 0 0 1 7.2 4.2Z"
        />
      }
      solid={
        <path
          fill="currentColor"
          d="M7 3.9H17A3.8 3.8 0 0 1 20.8 7.7V13.1A3.8 3.8 0 0 1 17 16.9H9.5L4.7 20.9a.9.9 0 0 1-1.5-.7V7.7A3.8 3.8 0 0 1 7 3.9Z"
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
        // The shoulders are a true SEMICIRCLE — one arc whose width is exactly
        // twice its radius — rather than a shallow curve fitted between two
        // straight ends. The old shape rose slowly from the corners and read as
        // a bucket under a head; a half-round reads as a person, and it is the
        // roundest the silhouette can be while still being one.
        <g {...OUT}>
          <circle cx="12" cy="7.7" r="3.85" />
          <path d="M4.6 19.9a7.4 7.4 0 0 1 14.8 0 1.35 1.35 0 0 1-1.35 1.35H5.95A1.35 1.35 0 0 1 4.6 19.9Z" />
        </g>
      }
      solid={
        <g fill="currentColor">
          <circle cx="12" cy="7.6" r="4.25" />
          <path d="M4.2 19.75a7.8 7.8 0 0 1 15.6 0 1.5 1.5 0 0 1-1.5 1.5H5.7a1.5 1.5 0 0 1-1.5-1.5Z" />
        </g>
      }
    />
  )
}
