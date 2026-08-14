import type { SVGProps } from "react"

/**
 * ===========================================================================
 *  THE FIVE DEPARTMENTS, DRAWN
 * ===========================================================================
 *
 * lucide ships exactly ONE garment — `Shirt` — and this is a second-hand
 * clothing marketplace whose two largest departments are both clothing. So the
 * set was being made out of whatever else was in the box: a diamond for Femei, a
 * clapperboard for Divertisment, a jigsaw knob for Hobbyuri. Every one of those
 * is a real, well-drawn icon and not one of them is a picture of what is in the
 * department — they are the marks a template reaches for when the right object
 * does not exist, which is exactly what makes a row of tiles read as generic.
 *
 * These are the objects. A dress, a t-shirt, a teddy, a book, a pair of dice —
 * five things you could actually buy on this site, and five outlines you could
 * tell apart with the labels covered.
 *
 * ---------------------------------------------------------------------------
 * TO LUCIDE'S OWN SPEC, BECAUSE THEY SIT NEXT TO LUCIDE'S ICONS
 * ---------------------------------------------------------------------------
 * 24×24 viewBox, `currentColor`, no fill, 2px stroke with round caps and joins,
 * and every shape drawn inside the same 2px margin lucide keeps. Half a set in
 * one drawing language and half in another is worse than any single icon in it:
 * the departments appear beside `Search`, `ChevronRight` and `SlidersHorizontal`
 * on every surface that uses them, and a stroke weight that is a fraction off is
 * the kind of wrong nobody can name and everybody sees.
 *
 * `strokeWidth` is a prop for the same reason lucide's is: these are drawn at
 * 15px in a pill and 18px in a tile, and a hairline that is right at 24 is heavy
 * at 15.
 */

type GlyphProps = SVGProps<SVGSVGElement> & { strokeWidth?: number }

function Glyph({ strokeWidth = 2, children, ...props }: GlyphProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

/**
 * FEMEI — an A-line dress.
 *
 * Two paths that share their endpoints: the V of the neckline, and the
 * silhouette from shoulder to waist to hem. Drawn as two rather than one so the
 * neckline keeps its own round join at the point of the V, which is the detail
 * that stops it reading as a bell.
 */
export function Dress(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M9.5 3 12 6.2 14.5 3" />
      <path d="M9.5 3 10.3 9 5.6 19.6a1 1 0 0 0 .9 1.4h11a1 1 0 0 0 .9-1.4L13.7 9 14.5 3" />
    </Glyph>
  )
}

/** BĂRBAȚI — a t-shirt: sleeves, body, and the collar as its own arc. */
export function Tee(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M8.6 3 4.4 5.6a1 1 0 0 0-.35 1.35l1.6 2.7a1 1 0 0 0 1.4.35l.85-.5V20a1 1 0 0 0 1 1h5.4a1 1 0 0 0 1-1V9.5l.85.5a1 1 0 0 0 1.4-.35l1.6-2.7A1 1 0 0 0 19.6 5.6L15.4 3" />
      <path d="M8.6 3a3.4 3.4 0 0 0 6.8 0" />
    </Glyph>
  )
}

/**
 * COPII — a teddy.
 *
 * Circles, deliberately: this is the one department whose contents have no
 * single shape — cărucioare, îmbăiere, rechizite, jucării — so it is the one
 * that has to be named by an association rather than by an object. The pair of
 * ears is what keeps it from being another round face at 15px.
 */
export function Teddy(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="6.6" cy="6.8" r="2.6" />
      <circle cx="17.4" cy="6.8" r="2.6" />
      <circle cx="12" cy="13.8" r="6.4" />
      <path d="M9.8 12.6h.01" />
      <path d="M14.2 12.6h.01" />
      <circle cx="12" cy="15.6" r="2.1" />
    </Glyph>
  )
}

/** DIVERTISMENT — an open book. Cărți and Reviste are half the department, and
 *  a book is the object that reads as "something somebody already owned". */
export function OpenBook(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 6.6C10 5 7.2 4.4 4.3 4.85A1 1 0 0 0 3.5 5.85v11.3a1 1 0 0 0 1.15 1c2.6-.35 5.2.15 7.35 1.55 2.15-1.4 4.75-1.9 7.35-1.55a1 1 0 0 0 1.15-1V5.85a1 1 0 0 0-.8-1C16.8 4.4 14 5 12 6.6Z" />
      <path d="M12 6.6v13.1" />
    </Glyph>
  )
}

/** HOBBYURI — two dice. Carduri, jocuri de societate, puzzle-uri, miniaturi. */
export function Dice(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="9" width="12" height="12" rx="2.6" />
      <path d="M6.8 12.8h.01" />
      <path d="M11.2 17.2h.01" />
      <path d="M9 9V5.6A2.6 2.6 0 0 1 11.6 3h6.8A2.6 2.6 0 0 1 21 5.6v6.8a2.6 2.6 0 0 1-2.6 2.6H15" />
      <path d="M17.6 7.4h.01" />
    </Glyph>
  )
}
