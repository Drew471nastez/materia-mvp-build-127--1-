/**
 * ===========================================================================
 *  WHAT A SECTION LETS THE PANEL CHANGE ABOUT ITS DESIGN
 * ===========================================================================
 * A section schema may declare:
 *
 *   "supports_color_scheme": true          a scheme picker (default: true when
 *                                          the schema has a color_scheme setting)
 *   "supports_color_overrides": true       the Customize colours panel; or a
 *                                          list of the slots it allows
 *   "supports_typography_overrides": true  Heading style and Body style
 *
 * The camelCase spellings are accepted too. Absent means the default, so a
 * section written before the flags existed behaves as it did.
 */
import { SECTION_OVERRIDE_KEYS, type SchemeColorKey } from "@/lib/storelib-theme/color-schemes"

export interface DesignSupport {
  colorScheme: boolean
  /** Empty when overrides are off. */
  colorOverrides: SchemeColorKey[]
  typography: boolean
}

type Loose =
  | {
      fields?: { id: string; type?: string }[]
      supports_color_scheme?: boolean
      supportsColorScheme?: boolean
      supports_color_overrides?: boolean | string[]
      supportsColorOverrides?: boolean | string[]
      supports_typography_overrides?: boolean
      supportsTypographyOverrides?: boolean
    }
  | null
  | undefined

function flag(schema: Loose, snake: string, camel: string): unknown {
  if (!schema) return undefined
  const s = schema as unknown as Record<string, unknown>
  return s[snake] !== undefined ? s[snake] : s[camel]
}

export function designSupport(schema: Loose): DesignSupport {
  const hasScheme = !!schema?.fields?.some((f) => f.id === "color_scheme" || f.type === "color_scheme")
  const scheme = flag(schema, "supports_color_scheme", "supportsColorScheme")
  const colorScheme = typeof scheme === "boolean" ? scheme : hasScheme
  const overrides = flag(schema, "supports_color_overrides", "supportsColorOverrides")
  let colorOverrides: SchemeColorKey[] = []
  if (Array.isArray(overrides)) {
    colorOverrides = overrides.filter((k): k is SchemeColorKey => typeof k === "string" && (SECTION_OVERRIDE_KEYS as string[]).includes(k))
  } else if (overrides === undefined ? colorScheme : overrides === true) {
    colorOverrides = [...SECTION_OVERRIDE_KEYS]
  }
  const typo = flag(schema, "supports_typography_overrides", "supportsTypographyOverrides")
  const typography = typeof typo === "boolean" ? typo : true
  return { colorScheme, colorOverrides, typography }
}

/** The schema keys `editorSchema()` carries across from a .storelib schema. */
export const DESIGN_SUPPORT_KEYS = [
  "supports_color_scheme", "supportsColorScheme",
  "supports_color_overrides", "supportsColorOverrides",
  "supports_typography_overrides", "supportsTypographyOverrides",
] as const
