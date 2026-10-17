/**
 * ===========================================================================
 *  WHAT THE SITE ALREADY LOOKS LIKE, FOR THE SURFACE THAT WAS NEVER TOLD
 * ===========================================================================
 * The page assistant is shown the page's palette, its spacing rhythm and the
 * section the creator has open. "Code a section" was shown a sentence. So the
 * one surface that writes a whole file from nothing — the one where every
 * colour, every spacing value and every font is decided at once — was the
 * surface with the least idea what site it was writing for, and the result
 * was a section that compiled, worked, and looked like it came from a
 * different website. Which it did.
 *
 * This is the site's own design system, read off the theme it is actually
 * saved in, compact enough to send on every request.
 *
 * IT GOES IN THE TURN, NOT THE SYSTEM PROMPT. It changes per install, and
 * anything that changes per install in the system prefix throws away the
 * prompt cache on both providers. The rules are the prefix; this is the
 * request.
 */

import {
  SCHEME_COLOR_KEYS,
  defaultSchemeKey,
  themeColorSchemes,
  type ColorScheme,
} from "@/lib/storelib-theme/color-schemes"
import { themeTypography } from "@/lib/storelib-theme/typography"

/**
 * The few scheme colours that say what a scheme LOOKS like.
 *
 * These are the canonical keys, the ones SCHEME_COLOR_KEYS declares and a
 * ColorScheme actually holds. A template can also read shorter aliases for
 * some of them (bg, paragraph, primary_btn_bg) because older themes were
 * written that way and legacySchemeValues keeps them working, but a name off
 * that alias list is not a key on this object and reads as undefined, which
 * is how the first version of this printed "bg" for every scheme and a value
 * for none of them.
 */
const SHOWN: readonly string[] = [
  "background",
  "text",
  "heading",
  "border",
  "accent",
  "primary_button_background",
  "primary_button_text",
]

function describeScheme(key: string, scheme: ColorScheme, isDefault: boolean): string {
  const parts = SHOWN.filter((k) => (SCHEME_COLOR_KEYS as readonly string[]).includes(k))
    .map((k) => {
      const v = (scheme as unknown as Record<string, unknown>)[k]
      return typeof v === "string" && v ? `${k} ${v}` : ""
    })
    .filter(Boolean)
  return `  ${key}${isDefault ? " (the theme's default)" : ""}: ${parts.join(", ")}`
}

export interface ThemeContextInput {
  /** The theme's settings object, as saved. */
  settings: Record<string, unknown> | null | undefined
  /** The section types already on the page or in the install, for coherence. */
  neighbours?: { type: string; name?: string }[]
}

/**
 * The theme's colours, type and buttons, plus what the site is already built
 * out of, as one block of text.
 *
 * Returns "" when there is no theme to describe, so a caller can drop it
 * rather than send a heading with nothing under it.
 */
export function describeThemeForAuthoring(input: ThemeContextInput): string {
  const settings = input.settings ?? {}
  const schemes = themeColorSchemes(settings)
  const keys = Object.keys(schemes)
  const defaultKey = defaultSchemeKey(settings, schemes)
  const typo = themeTypography(settings)

  const blocks: string[] = []

  if (keys.length) {
    blocks.push(
      [
        `COLOUR SCHEMES ON THIS SITE. Declare a color_scheme setting and read scheme.*; do not hardcode any of these values.`,
        ...keys.map((k) => describeScheme(k, schemes[k], k === defaultKey)),
      ].join("\n"),
    )
  }

  /* A font role is its family's name (lib/storelib-theme/typography.ts, ThemeFonts). Read as { family }, this line was never printed. */
  const fonts = typo.fonts as unknown as Record<string, unknown>
  const fontLine = ["heading", "body", "accent"]
    .map((role) => {
      const f = fonts?.[role]
      const family = typeof f === "string" ? f : (f as { family?: string } | undefined)?.family
      return family ? `${role} ${family}` : ""
    })
    .filter(Boolean)
    .join(", ")
  if (fontLine) {
    blocks.push(
      `TYPE ON THIS SITE: ${fontLine}. Use the theme's fonts and type scale rather than naming a family in the section.`,
    )
  }

  /**
   * Buttons are a theme decision that sections keep re-deciding. The radius
   * is the tell: a site of 4px buttons with one section of pills reads as
   * two websites.
   */
  /* Theme settings › Buttons saves button_shape and button_border_radius; the older names are read too. */
  const radius = settings["button_border_radius"] ?? settings["button_radius"] ?? settings["buttons_radius"] ?? settings["radius"]
  const style = settings["button_style"] ?? settings["buttons_style"]
  const shape = settings["button_shape"]
  const buttonBits = [
    typeof style === "string" && style ? `style ${style}` : "",
    typeof shape === "string" && shape ? `shape ${shape}` : "",
    typeof radius === "number" || typeof radius === "string" ? `radius ${radius}${typeof radius === "number" ? "px" : ""}` : "",
  ].filter(Boolean)
  if (buttonBits.length) {
    blocks.push(`BUTTONS ON THIS SITE: ${buttonBits.join(", ")}. Match them rather than inventing a button.`)
  }

  const neighbours = (input.neighbours ?? []).slice(0, 20)
  if (neighbours.length) {
    const list = neighbours.map((n) => n.name || n.type).join(", ")
    blocks.push(
      `THIS SITE IS ALREADY BUILT OUT OF: ${list}. The new section goes next to these, so it should look like it belongs with them rather than beside them.`,
    )
  }

  return blocks.join("\n\n")
}
