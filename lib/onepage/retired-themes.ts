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
  "background_type": "gradient",
  "background_color": "#f2ecdf",
  "background_gradient": "radial-gradient(110% 55% at 0% 0%, #fffdf7 0%, #fffdf700 62%), radial-gradient(90% 50% at 100% 100%, #e3d8c4 0%, #e3d8c400 72%), linear-gradient(180deg, #f5f0e5 0%, #eee6d6 100%)",
  "background_image_url": "",
  "gradient_noise": true,
  "noise_strength": 14,
  "text_color": "#221e18",
  "secondary_text_color": "#5a5246",
  "button_color": "#fdfaf3",
  "button_text_color": "#221e18",
  "button_style": "filled",
  "button_border_radius": 6,
  "button_border_width": 1,
  "button_border_color": "#d9cfbd",
  "button_shadow": "subtle",
  "button_shadow_color": "#6b5236",
  "button_hover_animation": "lift",
  "font_family": "'DM Sans', sans-serif",
  "title_font": "'Newsreader', serif",
  "title_color": "#221e18",
  "title_weight": 500,
  "title_tracking": "tight",
  "social_icon_color": "#8c3f24",
  "spacing": "normal",
  "card_width": "standard",
  "header_layout": "classic",
  "laser_glow_enabled": false,
  "background_pattern": "paper",
  "pattern_color": "#8a7a5c40",
  "pattern_opacity": "low",
  "block_layout": "cards",
  "header_align": "left",
  "product_layout": "rows",
}

/*
  ROUND AT: PLASTER IS STOICISM. The owner: "The new theme, plaster, is bad ...
  It should be called stoicism". Plaster (round AS) was live, so a page may
  hold "plaster": it is moved to Stoicism the same way, with the creator's
  own changes kept, and the next save keeps it. The cover is the same file
  (public/images/onepage-themes/plaster.svg), so it stays where it is.
*/
/** Plaster's settings as round AS shipped them. */
export const PLASTER_LOOK: Readonly<Record<string, unknown>> = {
  background_type: "solid",
  background_color: "#0b0b0a",
  background_gradient: "",
  background_image_url: "",
  text_color: "#ece8df",
  secondary_text_color: "#a9a49a",
  button_color: "#ece8df",
  button_text_color: "#ece8df",
  button_style: "outline",
  button_border_radius: 0,
  button_border_width: 1,
  button_border_color: "#ece8df",
  button_shadow: "none",
  button_hover_animation: "fill",
  button_hover_fill: "#ece8df",
  button_hover_text: "#0b0b0a",
  font_family: "'Inter', sans-serif",
  title_font: "'Instrument Serif', serif",
  title_color: "#f4f1ea",
  title_size: "large",
  title_weight: 400,
  title_tracking: "tight",
  social_icon_color: "#ece8df",
  social_icon_style: "minimal",
  spacing: "normal",
  card_width: "standard",
  header_layout: "classic",
  laser_glow_enabled: false,
  background_pattern: "none",
  block_layout: "list",
  product_layout: "rows",
  header_align: "left",
  avatar_size: "small",
  avatar_border_width: 1,
  avatar_border_color: "#ece8df",
  cover_image_url: "https://storelib.com/images/onepage-themes/plaster.svg",
}

/** Stoicism's settings (components/onepage/themes/r40-themes AS_THEMES, id "stoicism"); tests/onepage-at1.test.ts fails if the two drift apart. */
export const STOICISM_LOOK: Readonly<Record<string, unknown>> = {
  background_type: "solid",
  background_color: "#0e0e0d",
  background_gradient: "",
  background_image_url: "",
  text_color: "#ece6da",
  secondary_text_color: "#aaa396",
  button_color: "#ece6da",
  button_text_color: "#121110",
  button_style: "filled",
  button_border_radius: 0,
  button_border_width: 1,
  button_border_color: "#ece6da",
  button_shadow: "none",
  button_hover_animation: "fill",
  button_hover_fill: "#0e0e0d",
  button_hover_text: "#ece6da",
  font_family: "'Inter', sans-serif",
  title_font: "'Instrument Serif', serif",
  title_color: "#f4efe6",
  title_size: "large",
  title_weight: 400,
  title_tracking: "tight",
  social_icon_color: "#ece6da",
  social_icon_style: "outline",
  spacing: "comfortable",
  card_width: "standard",
  header_layout: "classic",
  laser_glow_enabled: false,
  background_pattern: "none",
  block_layout: "list",
  product_layout: "rows",
  header_align: "left",
  avatar_size: "small",
  avatar_border_width: 1,
  avatar_border_color: "#ece6da",
  cover_image_url: "https://storelib.com/images/onepage-themes/plaster.svg",
  theme_skin: "stoicism",
}


/*
  ROUND 17, the owner: "delete the Folio template", "get rid of the Midnight theme", "I don't like the Grunge theme".
  Their settings as the picker last offered them, and where a page wearing one goes:
    Folio     to Paper (both warm paper, a serif name, products in rows; without Folio's stock cover)
    Midnight  to Nova (both a night page with glass pills; Midnight's Hero, which was the theme's, goes with it)
    Grunge    to Grunge Zine (the same toner and paper, its second version)
*/
export const FOLIO_LOOK: Readonly<Record<string, unknown>> = {
  "background_type": "solid",
  "background_color": "#f5f2ec",
  "background_gradient": "",
  "background_image_url": "",
  "text_color": "#1d2329",
  "secondary_text_color": "#4d5560",
  "button_color": "#1d2329",
  "button_text_color": "#f5f2ec",
  "button_style": "filled",
  "button_border_radius": 10,
  "button_border_width": 0,
  "button_border_color": "#1d2329",
  "button_shadow": "none",
  "button_hover_animation": "fill",
  "button_hover_fill": "#3a4f63",
  "button_hover_text": "#ffffff",
  "font_family": "'Inter', sans-serif",
  "title_font": "'Newsreader', serif",
  "title_color": "#1d2329",
  "social_icon_color": "#1d2329",
  "social_icon_style": "outline",
  "spacing": "normal",
  "card_width": "standard",
  "header_layout": "classic",
  "laser_glow_enabled": false,
  "background_pattern": "none",
  "block_layout": "list",
  "header_align": "center",
  "cover_image_url": "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=1600&q=80",
  "product_layout": "grid",
}
export const MIDNIGHT_LOOK: Readonly<Record<string, unknown>> = {
  "background_type": "solid",
  "background_color": "#020617",
  "background_gradient": "",
  "background_image_url": "",
  "text_color": "#f8fafc",
  "secondary_text_color": "#94a3b8",
  "button_color": "rgba(255, 255, 255, 0.1)",
  "button_text_color": "#ffffff",
  "button_style": "glass",
  "button_border_radius": 10,
  "button_border_width": 1,
  "button_border_color": "#182b49",
  "button_shadow": "subtle",
  "font_family": "'Inter', sans-serif",
  "title_font": "'Oswald', sans-serif",
  "title_color": "#f8fafc",
  "social_icon_color": "#3b82f6",
  "spacing": "normal",
  "card_width": "standard",
  "header_layout": "hero",
  "laser_glow_enabled": false,
  "button_hover_animation": "zoom",
  "allowed_patterns": ["none", "stars"],
  "background_pattern": "stars",
  "pattern_color": "#ffffff",
  "pattern_opacity": "medium",
}
export const GRUNGE_LOOK: Readonly<Record<string, unknown>> = {
  "background_type": "solid",
  "background_color": "#e7e5de",
  "background_gradient": "",
  "background_image_url": "",
  "text_color": "#0d0d0d",
  "secondary_text_color": "#2e2e2c",
  "button_color": "#f4f3ee",
  "button_text_color": "#0d0d0d",
  "button_style": "filled",
  "button_border_radius": 0,
  "button_border_width": 2,
  "button_border_color": "#0d0d0d",
  "button_shadow": "none",
  "button_hover_animation": "fill",
  "button_hover_fill": "#0d0d0d",
  "button_hover_text": "#f1efe8",
  "font_family": "'JetBrains Mono', monospace",
  "title_font": "'Archivo Black', sans-serif",
  "title_color": "#0d0d0d",
  "social_icon_color": "#0d0d0d",
  "social_icon_style": "outline",
  "spacing": "normal",
  "card_width": "standard",
  "header_layout": "classic",
  "laser_glow_enabled": false,
  "background_pattern": "none",
  "block_layout": "list",
  "header_align": "left",
  "theme_skin": "grunge",
  "title_case": "upper",
  "title_size": "large",
  "avatar_shape": "square",
  "avatar_border_width": 3,
  "avatar_border_color": "#0d0d0d",
}
export const NOVA_LOOK: Readonly<Record<string, unknown>> = {
  "background_image_url": "",
  "spacing": "normal",
  "card_width": "standard",
  "header_layout": "classic",
  "laser_glow_enabled": false,
  "background_type": "gradient",
  "background_color": "#0a0c12",
  "background_gradient": "radial-gradient(34% 24% at 66% 58%, #67c7f259 0%, #67c7f200 100%), radial-gradient(52% 36% at 22% 20%, #c08af233 0%, #c08af200 100%), radial-gradient(60% 40% at 86% 92%, #3b5bdb38 0%, #3b5bdb00 100%), radial-gradient(90% 60% at 50% 100%, #1a2436 0%, #1a243600 100%), linear-gradient(180deg, #0a0c12 0%, #0f131b 100%)",
  "animated_gradient": true,
  "gradient_motion": "orbs",
  "gradient_noise": true,
  "noise_strength": 10,
  "text_color": "#ffffff",
  "secondary_text_color": "#c3cad6",
  "button_color": "#ffffff",
  "button_text_color": "#ffffff",
  "button_style": "glass",
  "button_border_radius": 999,
  "button_border_width": 1,
  "button_border_color": "#ffffff40",
  "button_shadow": "none",
  "button_hover_animation": "glow",
  "font_family": "'Inter', sans-serif",
  "title_font": "'Sora', sans-serif",
  "title_color": "#ffffff",
  "title_weight": 600,
  "title_tracking": "tight",
  "social_icon_color": "#ffffff",
  "background_pattern": "stars",
  "pattern_color": "#ffffff59",
  "pattern_opacity": "low",
  "block_layout": "list",
  "header_align": "center",
}
export const GRUNGE_ZINE_LOOK: Readonly<Record<string, unknown>> = {
  "background_type": "solid",
  "background_color": "#ece6d6",
  "background_gradient": "",
  "background_image_url": "",
  "text_color": "#111111",
  "secondary_text_color": "#2a2a2a",
  "button_color": "#f3eee2",
  "button_text_color": "#111111",
  "button_style": "filled",
  "button_border_radius": 0,
  "button_border_width": 2,
  "button_border_color": "#111111",
  "button_shadow": "none",
  "button_hover_animation": "fill",
  "button_hover_fill": "#c8141b",
  "button_hover_text": "#ffffff",
  "font_family": "'JetBrains Mono', monospace",
  "title_font": "'Anton', sans-serif",
  "title_color": "#111111",
  "social_icon_color": "#111111",
  "social_icon_style": "outline",
  "spacing": "normal",
  "card_width": "standard",
  "header_layout": "classic",
  "laser_glow_enabled": false,
  "background_pattern": "none",
  "block_layout": "list",
  "header_align": "left",
  "theme_skin": "grunge2",
  "title_case": "upper",
  "title_size": "large",
  "avatar_shape": "square",
  "avatar_border_width": 3,
  "avatar_border_color": "#111111",
}

/** A retired theme's id, its last settings, and the theme (id and settings) a page wearing it moves to. */
export const RETIRED_THEMES: Readonly<Record<string, { look: Readonly<Record<string, unknown>>; to: string; toLook: Readonly<Record<string, unknown>> }>> = {
  editorial: { look: EDITORIAL_LOOK, to: "paper", toLook: PAPER_LOOK },
  plaster: { look: PLASTER_LOOK, to: "stoicism", toLook: STOICISM_LOOK },
  folio: { look: FOLIO_LOOK, to: "paper", toLook: PAPER_LOOK },
  midnight: { look: MIDNIGHT_LOOK, to: "nova", toLook: NOVA_LOOK },
  grunge: { look: GRUNGE_LOOK, to: "grunge2", toLook: GRUNGE_ZINE_LOOK },
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
