import type { SVGProps } from "react"

/**
 * ===========================================================================
 *  THE ONE DEPARTMENT GLYPH THAT HAD TO BE DRAWN
 * ===========================================================================
 *
 * The Browse menu's five departments were Sparkles / ShoppingBag / Gift /
 * Music / Lightbulb — a wand, a carrier bag, a present, a quaver and a bulb
 * against Femei, Bărbați, Copii, Divertisment and Hobbyuri. Four of those five
 * are the icons a template reaches for when nobody has decided what the row
 * means: a sparkle stands for "special", a gift for "nice", a bulb for "idea".
 * None of them is a thing you can buy here, and a shopper opening the menu was
 * reading the words and ignoring the pictures, which is a picture doing no
 * work at all.
 *
 * Four of the five have honest replacements in the icon set already in this
 * app — a shirt, a baby, a record, a pair of dice — and those are used
 * directly. Apparel is where lucide runs out: it ships exactly one garment,
 * and giving it to Bărbați leaves Femei with nothing that is not a symbol for
 * a gender rather than a picture of a thing.
 *
 * So this is a dress, drawn to lucide's own spec — 24x24 box, no fill, stroke
 * from `currentColor`, round caps and joins, 2 as the default weight passed
 * through as a prop — because half a set in one drawing language and half in
 * another is more obviously wrong than any single icon in it.
 *
 * `SVGProps` and a spread rather than a hand-written prop list: the callers
 * pass `className` today and `strokeWidth`, `aria-hidden` and `style` in three
 * other places in this codebase, and a component that silently drops the prop
 * you gave it is worse than one that never accepted it.
 */
export function Dress({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Shoulders down through the bodice, in at the waist, out to the hem —
          one open path, so the shape is read as a silhouette rather than as a
          filled blob at 18px. The hem curves, because a straight line across
          the bottom is a lampshade. */}
      <path d="M9.5 3 8.4 7.2l.8 3.3-3.7 9.5c2.2 1.1 10.8 1.1 13 0l-3.7-9.5.8-3.3L14.5 3" />
      {/* The neckline. Without it the top edge is flat and the whole thing is a
          bell; this is the two strokes that make it a dress. */}
      <path d="M9.5 3c.5 1.5 1.4 2.2 2.5 2.2s2-.7 2.5-2.2" />
      {/* The waist seam, joining the two vertices the outline already has
          there. It is what stops the middle reading as a fold in a curtain. */}
      <path d="M9.2 10.5h5.6" />
    </svg>
  )
}
