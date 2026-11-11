/**
 * ===========================================================================
 *  A THEME TAKEN OUT OF THE CATALOGUE, AND THE PAGES THAT STILL WEAR IT
 * ===========================================================================
 * The owner: "remove the Editorial theme completely". A page keeps its own
 * copy of a theme's settings, so a page that picked Editorial still holds
 * Editorial's newsprint, its Abril Fatface capitals, its halftone and its
 * cover photo after the theme is gone from the picker. No SQL rewrites those
 * rows: the page is moved to the closest theme still offered when it is
 * read (the live page, lib/onepage/public-shape, and the editor,
 * lib/onepage/context), and the next save keeps it.
 *
 * Only what is still the retired theme's own moves. A setting the creator
 * changed after picking it (a colour of their own, their own font, their own
 * cover) no longer holds the retired theme's value, so it stays. Every other
 * setting the retired theme set, or that is missing, takes the new theme's
 * value, or the page's "nothing chosen" when the new theme names none.
 *
 * Editorial goes to Paper: the same warm paper, a serif title set flush
 * left and products in rows, without the halftone, the capitals and the
 * stock cover. PAPER_LOOK is Paper's theme_config as the picker holds it
 * (components/onepage/tabs/design-tab); tests/onepage-themes-renaissance.test.ts
 * fails if the two drift apart.
 */

/** Editorial's settings as the picker last offered them (round 11, round AR). */
export const EDITORIAL_LOOK: Readonly<Record<string, unknown>> = {
  background_type: "solid",
  background_color: "#f2ede3",
  background_gradient: "",
  background_image_url: "",
  text_color: "#15130f",
  secondary_text_color: "#4a443a",
  button_color: "#15130f",
  button_text_color: "#f6f2ea",
  button_style: "filled",
  button_border_radius: 0,
  button_border_width: 0,
  button_border_color: "#15130f",
  button_shadow: "none",
  font_family: "'Source Serif Pro', serif",
  title_font: "'Abril Fatface', cursive",
  title_color: "#15130f",
  social_icon_color: "#c2361f",
  social_icon_style: "outline",
  spacing: "normal",
  card_width: "standard",
  header_layout: "classic",
  laser_glow_enabled: false,
  background_pattern: "halftone",
  pattern_color: "#15130f2e",
  pattern_opacity: "low",
  header_align: "left",
  title_case: "upper",
  button_text_align: "left",
  button_icon_position: "right",
  product_layout: "rows",
  cover_image_url: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=1600&q=80",
}

/** Paper's settings (components/onepage/tabs/design-tab, id "paper"). */
export const PAPER_LOOK: Readonly<Record<string, unknown>> = {
  background_type: "solid",
  background_color: "#f3eee4",
  background_gradient: "",
  background_image_url: "",
  text_color: "#23201b",
  secondary_text_color: "#5e574c",
  button_color: "#fbf8f2",
  button_text_color: "#23201b",
  button_style: "filled",
  button_border_radius: 6,
  button_border_width: 1,
  button_border_color: "#ddd5c6",
  button_shadow: "none",
  font_family: "'DM Sans', sans-serif",
  title_font: "'Source Serif Pro', serif",
  title_color: "#23201b",
  social_icon_color: "#23201b",
  spacing: "normal",
  card_width: "standard",
  header_layout: "classic",
  laser_glow_enabled: false,
  background_pattern: "paper",
  pattern_color: "#8a7a5c40",
  pattern_opacity: "low",
  block_layout: "cards",
  header_align: "left",
  product_layout: "rows",
}

/** A retired theme's id, its last settings, and the theme (id and settings) a page wearing it moves to. */
export const RETIRED_THEMES: Readonly<Record<string, { look: Readonly<Record<string, unknown>>; to: string; toLook: Readonly<Record<string, unknown>> }>> = {
  editorial: { look: EDITORIAL_LOOK, to: "paper", toLook: PAPER_LOOK },
}

/** Is this the id of a theme no longer offered? */
export const isRetiredTheme = (id: unknown): boolean => typeof id === "string" && Object.prototype.hasOwnProperty.call(RETIRED_THEMES, id)

/**
 * The theme as it should be drawn: unchanged for any theme still offered,
 * and, for a retired one, moved to its successor with the creator's own
 * changes kept. Never throws on a hand edited or partial theme.
 */
export function withoutRetiredTheme<T>(theme: T): T {
  const own = theme as unknown as Record<string, unknown> | null | undefined
  if (!own || typeof own !== "object" || !isRetiredTheme(own.template_id)) return theme
  const { look, to, toLook } = RETIRED_THEMES[own.template_id as string]
  const next: Record<string, unknown> = { ...own, template_id: to }
  for (const key of new Set([...Object.keys(look), ...Object.keys(toLook)])) {
    const cur = own[key]
    /* The retired theme's own value, or nothing at all: the successor's. A value the creator chose stays. */
    const fromTheme = cur === undefined || cur === null || (key in look && look[key] === cur)
    if (!fromTheme) continue
    if (key in toLook) next[key] = toLook[key]
    else if (key === "cover_image_url" || key === "title_case" || key === "button_text_align" || key === "button_icon_position") next[key] = null
    else delete next[key]
  }
  /* The stock cover went with Editorial; its framing goes with it. */
  if (next.cover_image_url == null && "cover_crop" in next) next.cover_crop = null
  return next as unknown as T
}

/** A page row or editor page with both of its themes (the draft and the published copy) moved off a retired theme. */
export function withoutRetiredThemes<P extends { theme?: unknown; published_theme?: unknown } | null | undefined>(page: P): P {
  if (!page) return page
  const theme = withoutRetiredTheme(page.theme)
  const published = withoutRetiredTheme(page.published_theme)
  if (theme === page.theme && published === page.published_theme) return page
  return { ...page, theme, published_theme: published }
}
