/**
 * ===========================================================================
 *  THE THEME SETTINGS THE SIDEBAR WRITES OUTSIDE ITS SCHEMA
 * ===========================================================================
 * update_theme takes the ids in THEME_SETTINGS_GROUPS (./operations
 * themeFieldsFor). A few of the sidebar's own controls write keys of their
 * own, drawn by custom panels rather than the schema, so the assistant was
 * refused every one of them as an unknown id: a request to make the
 * headings bigger, to use another logo on phones or to make a scheme the
 * default could only be answered "I can't".
 *
 *   typography_styles     Theme settings › Typography, the nine text styles
 *                         (size on a computer and a phone, weight, line
 *                         height, letter spacing, case, which font)
 *   use_mobile_logo,      Branding: another logo on phones, and its height
 *   mobile_logo_url,
 *   mobile_logo_width
 *   default_color_scheme  Colors: the scheme a section without one uses
 *
 * Each is held to what its control takes, as every other setting is.
 */
import type { SchemaField } from "../types"
import { themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import {
  FONT_ROLES,
  TEXT_TRANSFORMS,
  TYPE_STYLE_KEYS,
  TYPE_STYLE_LABELS,
  baseTypeStyles,
  normalizeTypeStyle,
  stripTypeStyleDefaults,
  themeTypography,
  type TypeStyle,
  type TypeStyleKey,
} from "@/lib/storelib-theme/typography"

/** The weights the Typography panel offers. */
export const TYPE_WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"] as const

/** The panel's limits (components/website-builder/editor/design-panels.tsx TypeStyleFields). */
const SIZE = { min: 8, max: 200 }
const LINE = { min: 0.8, max: 3 }
const TRACKING = { min: -5, max: 20 }

/** The scheme keys this theme has, for default_color_scheme: the built-in ones too, not only those the seller changed or added. */
export function schemeKeys(settings: Record<string, unknown>): string[] {
  return Object.keys(themeColorSchemes(settings))
}

/** The plain controls among them, checked by checkSettings like any other. */
export function themeExtraFields(settings: Record<string, unknown>): SchemaField[] {
  const schemes = schemeKeys(settings)
  return [
    { id: "use_mobile_logo", label: "Use a different logo on phones", type: "toggle" },
    { id: "mobile_logo_url", label: "Logo on phones (an image URL)", type: "image_picker" },
    { id: "mobile_logo_width", label: "Height of the logo on phones", type: "range", min: 20, max: 80, step: 2, unit: "px" },
    ...(schemes.length ? [{ id: "default_color_scheme", label: "The colour scheme a section without its own uses", type: "select" as const, options: schemes.map((k) => ({ value: k, label: k })) }] : []),
  ]
}

/** What the model is told about them, under update_theme. */
export function describeThemeExtras(): string {
  return [
    `Text styles: typography_styles {${TYPE_STYLE_KEYS.join("|")}: {font (${FONT_ROLES.join("|")}), weight (300-900), size (px ${SIZE.min}-${SIZE.max}, or {desktop, mobile}), line_height, letter_spacing (px), transform (${TEXT_TRANSFORMS.join("|")})}}; only what you send changes`,
    "Phones: use_mobile_logo, mobile_logo_url, mobile_logo_width (px 20-80)",
    "default_color_scheme: a key of color_schemes",
  ].join("\n")
}

const clamp = (n: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, n))
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const FIELDS = ["font", "weight", "size", "line_height", "letter_spacing", "transform"]

/**
 * A typography_styles write, merged onto what the theme has and stored as
 * the panel stores it (only what differs from the style's base). Partial:
 * {"h1": {"size": 60}} changes Heading 1's size and nothing else.
 */
export function typographyWrite(
  settings: Record<string, unknown>,
  raw: unknown,
): { value: Record<string, unknown>; notes: string[] } | { error: string } {
  if (!isPlain(raw)) return { error: `typography_styles takes an object of styles by key, e.g. {"h1": {"size": 56}}. Nothing was changed.` }
  const current = themeTypography(settings).styles
  const bases = baseTypeStyles(settings)
  const own = isPlain(settings.typography_styles) ? { ...settings.typography_styles } : {}
  const notes: string[] = []
  for (const [key, patch] of Object.entries(raw)) {
    if (!(TYPE_STYLE_KEYS as readonly string[]).includes(key)) return { error: `typography_styles has no style "${key}". Nothing was changed. The styles are: ${TYPE_STYLE_KEYS.join(", ")}.` }
    if (!isPlain(patch)) return { error: `typography_styles.${key} takes an object, e.g. {"size": 56, "weight": "700"}. Nothing was changed.` }
    const unknown = Object.keys(patch).find((f) => !FIELDS.includes(f))
    if (unknown) return { error: `typography_styles.${key} has no "${unknown}". Nothing was changed. It takes: ${FIELDS.join(", ")}.` }
    const was = current[key as TypeStyleKey]
    if (patch.font !== undefined && !(FONT_ROLES as readonly string[]).includes(String(patch.font))) return { error: `typography_styles.${key}.font is one of ${FONT_ROLES.join(", ")} (the theme's heading, body or accent family). Nothing was changed.` }
    if (patch.weight !== undefined && !(TYPE_WEIGHTS as readonly string[]).includes(String(patch.weight))) return { error: `typography_styles.${key}.weight is one of ${TYPE_WEIGHTS.join(", ")}. Nothing was changed.` }
    if (patch.transform !== undefined && !(TEXT_TRANSFORMS as readonly string[]).includes(String(patch.transform))) return { error: `typography_styles.${key}.transform is one of ${TEXT_TRANSFORMS.join(", ")}. Nothing was changed.` }
    const number = (f: string, v: unknown, r: { min: number; max: number }): number | null => {
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN
      if (!Number.isFinite(n)) return null
      const c = clamp(n, r)
      if (c !== n) notes.push(`${key}.${f} ${n} is outside ${r.min} to ${r.max}, so it is ${c}`)
      return c
    }
    let size = was.size
    if (patch.size !== undefined) {
      const s = patch.size
      const desktop = isPlain(s) ? (s.desktop === undefined ? was.size.desktop : number("size.desktop", s.desktop, SIZE)) : number("size", s, SIZE)
      const mobile = isPlain(s) ? (s.mobile === undefined ? was.size.mobile : number("size.mobile", s.mobile, SIZE)) : desktop
      if (desktop === null || mobile === null) return { error: `typography_styles.${key}.size is a number of pixels, or {"desktop": n, "mobile": n}. Nothing was changed.` }
      size = { desktop, mobile }
    }
    const line = patch.line_height === undefined ? was.line_height : number("line_height", patch.line_height, LINE)
    const tracking = patch.letter_spacing === undefined ? was.letter_spacing : number("letter_spacing", patch.letter_spacing, TRACKING)
    if (line === null || tracking === null) return { error: `typography_styles.${key}: line_height and letter_spacing are numbers. Nothing was changed.` }
    const next: TypeStyle = normalizeTypeStyle(
      { font: patch.font ?? was.font, weight: patch.weight ?? was.weight, size, line_height: line, letter_spacing: tracking, transform: patch.transform ?? was.transform },
      was,
    )
    const stripped = stripTypeStyleDefaults(next, bases[key as TypeStyleKey])
    if (Object.keys(stripped).length) own[key] = stripped
    else delete own[key]
  }
  return { value: own, notes }
}
