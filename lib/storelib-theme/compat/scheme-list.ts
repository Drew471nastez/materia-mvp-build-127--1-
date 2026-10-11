/**
 * ===========================================================================
 *  AN IMPORTED THEME'S OWN COLOUR SCHEMES, FOR A SECTION TO PICK FROM
 * ===========================================================================
 * A Shopify section's `color_scheme` setting names one of the theme's own
 * schemes ("scheme-1", "default", "scheme-4faf0e4d-…"), kept under
 * `shopify.color_schemes` in the install's settings. The sidebar offered
 * Storelib's schemes instead (Light, Dark…), so a section showed "Light"
 * whatever it used, and picking one wrote a key the theme does not have.
 *
 * This lists the theme's, in its own order, each with the three colours a
 * swatch needs. Shopify keeps no names for schemes, so they are numbered as
 * its editor numbers them. Pure.
 */
export interface ThemeScheme {
  id: string
  name: string
  background: string
  text: string
  accent: string
}

type O = Record<string, unknown>
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v)
const first = (s: O, keys: string[], fallback: string): string => {
  for (const k of keys) if (typeof s[k] === "string" && (s[k] as string).trim()) return (s[k] as string).trim()
  return fallback
}

/** The theme's schemes: under `color_schemes` (Dawn, Horizon and most), or the first group of them under another id. */
export function themeSchemeList(values: O | null | undefined): ThemeScheme[] {
  const v = values ?? {}
  const looksLikeGroup = (g: unknown) => isObj(g) && Object.values(g).length > 0 && Object.values(g).every((x) => isObj(x) && isObj((x as O).settings))
  const group = looksLikeGroup(v.color_schemes) ? (v.color_schemes as O) : (Object.values(v).find(looksLikeGroup) as O | undefined)
  if (!group) return []
  return Object.entries(group).map(([id, raw], i) => {
    const s = ((raw as O).settings ?? {}) as O
    const text = first(s, ["text", "foreground", "text_color", "foreground_heading", "heading_color", "heading"], "#121212")
    return {
      id,
      name: id === "default" ? "Default" : `Scheme ${i + 1}`,
      background: first(s, ["background"], "#ffffff"),
      text,
      accent: first(s, ["button", "primary", "primary_button_background", "btn_primary_background", "primary_color", "accent"], text),
    }
  })
}
