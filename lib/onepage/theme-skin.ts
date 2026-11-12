/**
 * ===========================================================================
 *  A THEME'S SKIN: THE MATERIAL, NOT ONLY THE COLOURS (round W9)
 * ===========================================================================
 * The owner: "create a Frutiger Aero template, very well done, very complex
 * and good, clean, adapted for all things. Also Mac OS X Aqua-like themes,
 * MSN Messenger / XP internet-like templates, Cyber Y2K too", "one more Bold
 * & Playful, apply styles to all blocks and buttons and everything", "one
 * more Grunge".
 *
 * A theme's settings say what colour a button is, its corners and border,
 * its shadow. None of them can say "glass with a gel highlight", "a window
 * with a title bar", "chrome", "a sticker with a hard shadow" or "a
 * photocopy". A skin is the one setting that can: `theme_skin` names it, the
 * page carries it as `data-op-skin` on its root (with the theme's own colours
 * as CSS variables, skinVars), and app/onepage-skins.css draws it over every
 * block the page draws, keyed on what the blocks already carry (.op-btn,
 * [data-product-block], [data-email-form], [data-onepage-faq], ...). The
 * scene behind the page (clouds and bubbles, pinstripes, sparkles, blobs,
 * xerox grain) is components/onepage/themes/theme-skin-scene.tsx.
 *
 * It composes with everything else a theme sets: the colours are still the
 * theme's (a creator who changes the button colour sees it in the gel), the
 * layout is still the page's (List, Grid, Cards, Compact, Mixed tiles), and
 * picking another theme takes the skin away with the rest of the look
 * (lib/onepage/theme-apply LOOK_RESET). A skin over a photo or a video keeps
 * its material but draws no scene: the creator's picture is the scene.
 */

/**
 * Every skin a theme can name. Anything else, or nothing, is no skin: the page as it always was.
 *
 * Round W10: a second version of each of the six ("aero2" is Aero Aquarium,
 * "aqua2" Aqua Graphite, "messenger2" Messenger Olive, "y2k2" Y2K Kawaii,
 * "playful2" Playful Night, "grunge2" Grunge Zine), drawn by the same
 * family of rules with its own palette and scene (scripts/onepage-skins/),
 * and three more that stand alone: Classic 98, Vaporwave and Arcade.
 */
export const THEME_SKINS = [
  "aero", "aqua", "messenger", "y2k", "playful", "grunge",
  "aero2", "aqua2", "messenger2", "y2k2", "playful2", "grunge2",
  "classic98", "vaporwave", "arcade",
  /* Renaissance: an old master's canvas, ivory panels in gilt frames (scripts/onepage-skins/renaissance.mjs). */
  "renaissance",
  /* Stoicism (round AT, was Plaster): dark stone with pale veins and a faint construction, ivory tablets with an inner rule (scripts/onepage-skins/stoicism.mjs). */
  "stoicism",
] as const
export type ThemeSkin = (typeof THEME_SKINS)[number]

type SkinThemeLike = {
  theme_skin?: unknown
  background_type?: unknown
  button_color?: unknown
  button_text_color?: unknown
  text_color?: unknown
  secondary_text_color?: unknown
  button_hover_fill?: unknown
  button_hover_text?: unknown
} | null | undefined

/** The skin a saved theme names, or null. A hand edited value names none. */
export function themeSkinOf(theme: SkinThemeLike): ThemeSkin | null {
  const s = theme?.theme_skin
  return typeof s === "string" && (THEME_SKINS as readonly string[]).includes(s) ? (s as ThemeSkin) : null
}

/** Is the skin's scene drawn? Only over the theme's own colour or gradient: a photo or a video is the creator's scene. */
export function skinSceneOf(theme: SkinThemeLike): ThemeSkin | null {
  const skin = themeSkinOf(theme)
  if (!skin) return null
  return theme?.background_type === "solid" || theme?.background_type === "gradient" ? skin : null
}

const hex = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : fallback)

/**
 * The theme's colours as the skin's stylesheet reads them, so the material
 * wears whatever the creator chose: --sk-surface is the button colour,
 * --sk-ink its words, --sk-page-ink and --sk-page-soft the page's words,
 * --sk-accent and --sk-accent-ink the hover's. Empty for no skin.
 */
export function skinVars(theme: SkinThemeLike): Record<string, string> {
  if (!themeSkinOf(theme)) return {}
  const surface = hex(theme?.button_color, "#ffffff")
  const ink = hex(theme?.button_text_color, "#111111")
  const page = hex(theme?.text_color, "#111111")
  return {
    "--sk-surface": surface,
    "--sk-ink": ink,
    "--sk-page-ink": page,
    "--sk-page-soft": hex(theme?.secondary_text_color, page),
    "--sk-accent": hex(theme?.button_hover_fill, surface),
    "--sk-accent-ink": hex(theme?.button_hover_text, ink),
  }
}

/** The attributes a page's root carries for its skin: none at all without one. */
export function skinRootProps(theme: SkinThemeLike): { "data-op-skin"?: ThemeSkin } {
  const skin = themeSkinOf(theme)
  return skin ? { "data-op-skin": skin } : {}
}
