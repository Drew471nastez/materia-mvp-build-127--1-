/**
 * A BUTTON'S WORDS THAT CAN BE READ ON ITS FILL (round 56).
 *
 * The header's button took its fill and its label from the site's palette,
 * and a palette can pair them badly: a lime accent with an off-white label
 * read at 1.1:1 on a generated fitness site. The fill stays the site's; when
 * the label does not reach WCAG AA (4.5:1) on it, the label becomes the
 * palette colour that reads best there (the header's own background or its
 * text), and plain near-black or white only when neither does.
 *
 * Pure. Browser safe.
 */
import { contrastRatio, parseColor } from "@/lib/storelib-theme/contrast"

export const BUTTON_MIN_CONTRAST = 4.5

/** The ratio of two colours, or null when either is not a plain colour (a gradient, a variable). */
export function ratioOf(fg: string, bg: string): number | null {
  const a = parseColor(fg)
  const b = parseColor(bg)
  if (!a || !b || b.a < 1) return null
  return contrastRatio(a, b)
}

/**
 * The label for a fill: `label` when it reads at `min`, else the first of the palette's `candidates` that does, else
 * whichever of them, black and white reads best. A fill that is not a plain colour keeps its label.
 */
export function legibleLabel(fill: string, label: string, candidates: readonly string[] = [], min = BUTTON_MIN_CONTRAST): string {
  const own = ratioOf(label, fill)
  if (own === null || own >= min) return label
  for (const c of candidates) {
    const r = ratioOf(c, fill)
    if (r !== null && r >= min) return c
  }
  let best = label
  let bestRatio = own
  for (const c of [...candidates, "#111111", "#ffffff"]) {
    const r = ratioOf(c, fill)
    if (r !== null && r > bestRatio) {
      best = c
      bestRatio = r
    }
  }
  return best
}
