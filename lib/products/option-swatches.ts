/**
 * ===========================================================================
 *  A COLOUR OPTION'S OWN SWATCHES
 * ===========================================================================
 * A colour option's values are drawn as colours from their names ("Navy",
 * "Dark green": ./product-page-model.ts swatchColor), and a value whose name
 * is no colour ("Ocean", "Sunset") as its variant's photo. A seller can set
 * one of their own per value in Products › Variants (the dot beside it):
 *
 *   "#rrggbb"   that colour, whatever the name says
 *   "photo"     the photo of a variant with that value, even for "Red"
 *
 * Kept on the option as `product_options.swatches` (run-now part 286), only
 * for values the option still has. Read by every picker that draws
 * swatches: the Storelib theme's Variant picker, and an imported Shopify
 * theme's `value.swatch` (lib/storelib-theme/compat/objects.ts). Pure.
 */

export const MAX_SWATCHES = 100

/** A seller's swatch as it may be kept: a six digit hex colour (lower case), or "photo". Null for anything else. */
export function cleanSwatch(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const v = raw.trim().toLowerCase()
  if (v === "photo") return "photo"
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null
}

/** The swatches of an option's values, only for values it has, at most MAX_SWATCHES. Empty when none. */
export function cleanSwatches(raw: unknown, values: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  const has = new Set(values)
  for (const [value, swatch] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_SWATCHES) break
    if (!has.has(value) || value === "__proto__") continue
    const s = cleanSwatch(swatch)
    if (s) out[value] = s
  }
  return out
}
