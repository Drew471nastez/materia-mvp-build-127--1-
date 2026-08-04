/**
 * The five glyphs in the bottom bar, in both of the states a tab bar has.
 *
 * Hand-drawn rather than taken from lucide, and the reason is that lucide has no
 * filled set — every icon in it is an outline built from strokes, so the only
 * way to "fill" one is to set `fill: currentColor` on paths that were never
 * drawn as closed shapes. On Home that nearly works; on Search it turns a
 * magnifying glass into a black disc with a stick, and on User it fuses the head
 * into the shoulders. A tab bar is the most-looked-at control in the app and it
 * cannot be the place where the icons are almost right.
 *
 * So each is a pair on the same 24-unit grid, with the same optical weight and
 * the same silhouette — the solid one is what the outline would be if you filled
 * the space it encloses, not a different drawing. Swapping between them moves
 * nothing.
 *
 * `.tab-icon-fill` on the solid variant is what makes the press satisfying: it
 * grows in from slightly small with a touch of overshoot, so becoming active
 * reads as the icon being pressed INTO its filled state rather than as one
 * picture being exchanged for another. It plays on mount, and the solid glyph
 * only mounts when the tab becomes active — so it plays exactly once per press
 * and never on a re-render.
 */

type Props = { active: boolean; className?: string }

const OUT = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      {children}
    </svg>
  )
}

export function HomeIcon({ active, className }: Props) {
  return (
    <Frame className={className}>
      {active ? (
        <path
          className="tab-icon-fill"
          d="M11.3 2.6a1.1 1.1 0 0 1 1.4 0l8 6.6c.3.2.4.5.4.9V20a1.5 1.5 0 0 1-1.5 1.5h-4.3a.7.7 0 0 1-.7-.7v-4.6a1.4 1.4 0 0 0-1.4-1.4h-2.4a1.4 1.4 0 0 0-1.4 1.4v4.6a.7.7 0 0 1-.7.7H4.4A1.5 1.5 0 0 1 2.9 20v-9.9c0-.4.1-.7.4-.9Z"
          fill="currentColor"
        />
      ) : (
        <path {...OUT} d="M3.6 10.2 12 3.3l8.4 6.9V20a1 1 0 0 1-1 1h-4.6v-5.1a1.9 1.9 0 0 0-1.9-1.9h-1.8a1.9 1.9 0 0 0-1.9 1.9V21H4.6a1 1 0 0 1-1-1Z" />
      )}
    </Frame>
  )
}

export function SearchIcon({ active, className }: Props) {
  return (
    <Frame className={className}>
      {active ? (
        <g className="tab-icon-fill">
          {/* A ring, not a disc: the glass has to keep its hole or the filled
              state stops being a magnifier. Drawn as a single even-odd path so
              it is one shape the fill animation can scale as a unit. */}
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M11 2.6a8.4 8.4 0 1 0 5.1 15.1l3.6 3.6a1.2 1.2 0 0 0 1.7-1.7l-3.6-3.6A8.4 8.4 0 0 0 11 2.6Zm0 2.6a5.8 5.8 0 1 1 0 11.6 5.8 5.8 0 0 1 0-11.6Z"
            fill="currentColor"
          />
        </g>
      ) : (
        <g {...OUT}>
          <circle cx="11" cy="11" r="7.2" />
          <path d="m20.2 20.2-4.1-4.1" />
        </g>
      )}
    </Frame>
  )
}

export function InboxIcon({ active, className }: Props) {
  return (
    <Frame className={className}>
      {active ? (
        <path
          className="tab-icon-fill"
          d="M4.6 3.4h14.8A2.2 2.2 0 0 1 21.6 5.6v9.2a2.2 2.2 0 0 1-2.2 2.2H9.2l-4 3.4a.8.8 0 0 1-1.3-.6V5.6a2.2 2.2 0 0 1 2.2-2.2Z"
          fill="currentColor"
        />
      ) : (
        <path {...OUT} d="M4.6 3.9h14.8a1.7 1.7 0 0 1 1.7 1.7v9.2a1.7 1.7 0 0 1-1.7 1.7H9.4l-4.5 3.8a.3.3 0 0 1-.5-.2V5.6a1.7 1.7 0 0 1 1.7-1.7Z" />
      )}
    </Frame>
  )
}

export function ProfileIcon({ active, className }: Props) {
  return (
    <Frame className={className}>
      {active ? (
        <g className="tab-icon-fill" fill="currentColor">
          <circle cx="12" cy="7.6" r="4.3" />
          <path d="M3.9 20.1c0-3.8 3.6-6.3 8.1-6.3s8.1 2.5 8.1 6.3a1.4 1.4 0 0 1-1.4 1.4H5.3a1.4 1.4 0 0 1-1.4-1.4Z" />
        </g>
      ) : (
        <g {...OUT}>
          <circle cx="12" cy="7.6" r="3.9" />
          <path d="M4.4 20.5c0-3.6 3.4-5.9 7.6-5.9s7.6 2.3 7.6 5.9a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1Z" />
        </g>
      )}
    </Frame>
  )
}
