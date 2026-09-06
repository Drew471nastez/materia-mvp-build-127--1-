/**
 * WHAT IS A SURFACE ON A CREATOR PAGE, AND WHAT IS BACKGROUND.
 *
 * A creator page is one very light grey field with white objects sitting on
 * it — the subscribe bar, the product cards. Everything else is background.
 *
 * The reason this needs a rule rather than a stylesheet is that the theme
 * presets set white explicitly, in several places: the default preset ships
 * `pageBackgroundColor: "#ffffff"` and `featuredProductsBackgroundColor:
 * "#ffffff"`. So a page whose settings all say "white" was painting a white
 * block under the tab strip and a white page under that, which is what put a
 * seam across the middle and made the cards invisible against their own
 * section.
 *
 * WHITE MEANS "INHERIT" HERE. A stored white is treated as "nobody chose a
 * colour" — because in practice nobody did; it is what the preset happens to
 * carry. Any other colour is a real choice and is left exactly alone, so a
 * creator running a dark theme or a coloured section still gets it.
 */

/** The grey the page sits on. Light enough that nobody would call it grey. */
export const STOREFRONT_PAGE_BACKGROUND = "#f7f7f8"

const WHITE = new Set(["#fff", "#ffffff", "white", "rgb(255,255,255)", "rgb(255, 255, 255)", "transparent", ""])

/** Did anyone actually choose this colour, or is it the preset's default white? */
export function isInheritedWhite(colour?: string | null): boolean {
  if (!colour) return true
  return WHITE.has(colour.trim().toLowerCase())
}

/** The page's own background: the creator's choice, or the grey field. */
export function storefrontPageBackground(stored?: string | null): string {
  return isInheritedWhite(stored) ? STOREFRONT_PAGE_BACKGROUND : (stored as string)
}

/**
 * A section's background. `undefined` — not "transparent" — so callers can
 * tell "no background" apart from a colour and skip the style entirely.
 */
export function storefrontSectionBackground(stored?: string | null): string | undefined {
  return isInheritedWhite(stored) ? undefined : (stored as string)
}
