/**
 * ===========================================================================
 *  AN IMPORTED THEME'S COLOUR SCHEMES, AS A STORELIB SECTION READS THEM
 * ===========================================================================
 * Round AK. A section Storelib AI writes (or any Storelib section) placed in
 * an imported theme was drawn with no theme at all, so its Colour scheme
 * setting, which lists the theme's own schemes ("Scheme 1", "Scheme 2"...),
 * named schemes it could not find: every choice drew Storelib's white.
 *
 * Shopify's themes store a scheme as a handful of named colours. The common
 * names are read into Storelib's scheme keys: Dawn's (background, text,
 * button, button_label, secondary_button_label, background_gradient) and
 * Horizon's (foreground, foreground_heading, primary, border, the buttons'
 * own and their hover colours, inputs). A colour the theme does not have is
 * left for Storelib's scheme to fill (color-schemes.ts normalizeScheme).
 * Pure.
 */
export function nativeThemeFromShopifySchemes(stored: unknown): Record<string, unknown> {
  const list = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {}
  const color_schemes: Record<string, Record<string, string>> = {}
  let first: string | null = null
  for (const [id, raw] of Object.entries(list)) {
    if (!/^[a-z0-9_-]+$/i.test(id) || !raw || typeof raw !== "object") continue
    const s = ((raw as { settings?: unknown }).settings ?? {}) as Record<string, unknown>
    const pick = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        const v = s[k]
        if (typeof v === "string" && v.trim() && !/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(v.trim())) return v.trim()
      }
      return undefined
    }
    const text = pick("text", "foreground")
    const scheme: Record<string, string | undefined> = {
      name: typeof (raw as { name?: unknown }).name === "string" ? String((raw as { name?: unknown }).name) : undefined,
      background: pick("background"),
      gradient: pick("background_gradient"),
      text,
      heading: pick("foreground_heading", "heading") ?? text,
      accent: pick("primary", "accent", "button") ?? text,
      link: pick("primary", "link") ?? text,
      border: pick("border"),
      primary_button_background: pick("primary_button_background", "button"),
      primary_button_text: pick("primary_button_text", "button_label"),
      primary_button_border: pick("primary_button_border", "primary_button_background", "button"),
      primary_button_hover_background: pick("primary_button_hover_background", "primary_hover"),
      primary_button_hover_text: pick("primary_button_hover_text"),
      secondary_button_background: pick("secondary_button_background"),
      secondary_button_text: pick("secondary_button_text", "secondary_button_label"),
      secondary_button_border: pick("secondary_button_border", "secondary_button_label"),
      secondary_button_hover_background: pick("secondary_button_hover_background"),
      secondary_button_hover_text: pick("secondary_button_hover_text"),
      input_background: pick("input_background"),
      input_text: pick("input_text_color", "input_text"),
      input_border: pick("input_border_color", "input_border"),
    }
    color_schemes[id] = Object.fromEntries(Object.entries(scheme).filter(([, v]) => v !== undefined)) as Record<string, string>
    if (first === null) first = id
  }
  return first === null ? {} : { color_schemes, default_color_scheme: first }
}
