/**
 * ===========================================================================
 *  THE FONTS A THEME CHOSE ARE LOADED, NOT ONLY NAMED
 * ===========================================================================
 * Typography lets a creator pick from fifteen heading faces and nine body
 * faces, and the stylesheet duly said `font-family: "Playfair Display"`.
 * Nothing loaded Playfair Display. A visitor without it installed — which
 * is every visitor — saw the fallback stack, and the setting was a label
 * on a font nobody was shown. The editor canvas did the same, so the person
 * choosing could not see the choice either.
 *
 * This is the one stylesheet request that fixes both: the chosen families,
 * from Google Fonts, rendered by ThemePage on every surface that draws a
 * theme. The canvas and the published page therefore load the same file.
 *
 * ALLOW-LISTED FROM THE SCHEMA. Only a family the Typography panel offers
 * can be requested, and the list is read from the panel's own options rather
 * than kept here twice. A setting holding anything else — an old value, a
 * hand-edited one — requests nothing, because a URL built from a free string
 * is a URL somebody else gets to write.
 */
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"

const FONT_SETTINGS = ["font_heading", "font_body", "font_accent"] as const

/** Every family the panel can set, once. */
export const OFFERED_FAMILIES: ReadonlySet<string> = new Set(
  THEME_SETTINGS_GROUPS.flatMap((g) => g.fields ?? [])
    .filter((f) => (FONT_SETTINGS as readonly string[]).includes(f.id))
    .flatMap((f) => (f.options ?? []).map((o) => o.value))
    .filter((v): v is string => typeof v === "string" && v.trim() !== ""),
)

/** The weights the sections use: body, medium, semibold, bold. */
const WEIGHTS = "400;500;600;700"

/**
 * The families a theme is set to, deduplicated, in a stable order, filtered
 * to what may be requested. Exported for the tests.
 */
export function chosenFamilies(theme: Record<string, unknown> | null | undefined): string[] {
  if (!theme) return []
  const out: string[] = []
  for (const key of FONT_SETTINGS) {
    const v = theme[key]
    if (typeof v !== "string") continue
    const family = v.trim()
    if (!family || !OFFERED_FAMILIES.has(family) || out.includes(family)) continue
    out.push(family)
  }
  return out
}

/**
 * THE FAMILIES A SECTION PICKED FOR ITSELF. A `font_picker` setting in a
 * section names a family the theme's three fonts may not, and a name that
 * nothing loads draws in the browser's fallback. Every setting whose id
 * says font and whose value is one of the offered families is one: the
 * offered list is the filter, so a word that is not a font asks for nothing.
 */
export function sectionFamilies(sections: { settings?: Record<string, unknown> }[] | null | undefined): string[] {
  const out: string[] = []
  for (const s of sections ?? []) {
    for (const [key, v] of Object.entries(s.settings ?? {})) {
      if (!/font/i.test(key) || typeof v !== "string") continue
      const family = v.trim()
      if (family && OFFERED_FAMILIES.has(family) && !out.includes(family)) out.push(family)
    }
  }
  return out
}

/** The stylesheet URL, or null when there is nothing to load. */
export function fontStylesheetHref(theme: Record<string, unknown> | null | undefined, extra: string[] = []): string | null {
  const families = [...new Set([...chosenFamilies(theme), ...extra.filter((f) => OFFERED_FAMILIES.has(f))])]
  if (families.length === 0) return null
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${WEIGHTS}`).join("&")
  return `https://fonts.googleapis.com/css2?${q}&display=swap`
}
