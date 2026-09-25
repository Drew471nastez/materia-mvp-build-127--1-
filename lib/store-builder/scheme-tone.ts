/**
 * ===========================================================================
 *  IS THIS SCHEME DARK: ASKED OF ITS COLOURS, NEVER OF ITS NAME
 * ===========================================================================
 * The product page, its skeletons and the builder's loading states used to
 * decide "dark" by the scheme's NAME: `themePreset === "astrid"`. So a new
 * dark scheme could not be added to the picker at all: the creator page reads
 * its page colour and goes dark (lib/store-builder/storefront-chrome.ts), and
 * the product page it opens onto stayed light, with black stars and a white
 * category pill on a near-black page.
 *
 * One answer now, from the page colour the scheme paints, by the same
 * perceived lightness the creator page's chrome already uses. Any scheme
 * whose page is dark is dark everywhere; astrid is dark because its page is
 * #111113, not because of what it is called.
 */
import { themePresets } from "./defaults"
import type { ThemePreset } from "./types"
import { parseColor } from "@/lib/storelib-theme/contrast"

/**
 * Names stored on older pages that no longer exist in `themePresets`, and
 * were dark when they did. A page still carrying one keeps the dark answer it
 * had (the refund line and the section renderer listed these by name).
 */
const RETIRED_DARK = new Set(["midnight", "dark", "noir", "obsidian"])

/** Perceived lightness, 0 (black) to 1 (white); 1 for anything that is not a colour. */
export function colourLightness(colour: string | null | undefined): number {
  const c = parseColor(colour)
  if (!c) return 1
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
}

/** Dark enough that type on it has to be light. False for anything that is not a colour. */
export function isDarkColour(colour: string | null | undefined): boolean {
  return colourLightness(colour) < 0.5
}

/** The page colour a scheme paints, or undefined for a name that is not a scheme. */
export function schemePageColour(preset: string | null | undefined): string | undefined {
  if (!preset || !(preset in themePresets)) return undefined
  const theme = themePresets[preset as ThemePreset]
  return theme.sections?.pageBackgroundColor || theme.colors?.background
}

/** Is this scheme's page dark. Decided by its page colour; an unknown name is light. */
export function isDarkScheme(preset: string | null | undefined): boolean {
  if (!preset) return false
  const page = schemePageColour(preset)
  if (page !== undefined) return isDarkColour(page)
  return RETIRED_DARK.has(preset.toLowerCase())
}
