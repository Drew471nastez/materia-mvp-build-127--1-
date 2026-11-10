/**
 * ===========================================================================
 *  A THEME CHANGES THE WHOLE LOOK, EVERY TIME
 * ===========================================================================
 * Picking a theme used to MERGE the theme's settings into the page's: every
 * setting the new theme did not name stayed as the old theme left it. From
 * Blocks to Air kept Blocks' grid pattern and its hard black shadow; from a
 * glowing theme to a flat one kept the glow; from a light theme to one that
 * names no Share style kept white buttons on a dark page. And a product
 * block keeps colours of its own (Colours for this block), so a block made
 * dark for a dark theme stayed a black slab on Air, its text now Air's dark
 * ink on black.
 *
 * lookFromTemplate() is what picking a theme does now, in one step and one
 * undo:
 *   - every look setting a theme can hold is reset first (LOOK_RESET), then
 *     the theme's own laid over it, so nothing of the old theme survives;
 *   - what is the person's own and not the theme's stays: the name's logo
 *     and its size and place, the header layout (the theme picker decides
 *     that one itself), the profile;
 *   - Share and Subscribe take the theme's style, or the one that suits its
 *     kind when it names none;
 *   - every block's own colours are cleared, so each block wears the theme.
 *     A colour chosen for a block after the theme stays until the next theme.
 */
import type { OnePage, OnePageBlock, OnePageTheme } from "./types"

/**
 * Every setting of the look a theme or the Design tab can set, at the value
 * the page reads as "nothing chosen". null reads as the renderer's own
 * default for each (lib/onepage/wallpaper, components/onepage/public-onepage).
 */
export const LOOK_RESET: Record<string, unknown> = {
  background_type: "solid",
  background_gradient: null,
  background_image_url: null,
  background_pattern: "none",
  pattern_color: null,
  pattern_opacity: null,
  allowed_patterns: null,
  noise_strength: null,
  image_noise: false,
  image_brightness: null,
  image_blur: null,
  video_brightness: null,
  animated_gradient: false,
  gradient_direction: null,
  gradient_color_1: null,
  gradient_color_2: null,
  gradient_animated: false,
  gradient_noise: false,
  secondary_text_color: null,
  title_font: null,
  title_color: null,
  button_hover_color: null,
  button_hover_animation: null,
  button_shadow: "none",
  button_shadow_color: null,
  button_border_width: 0,
  laser_glow_enabled: false,
  laser_glow_color: null,
  laser_glow_intensity: null,
  social_icon_style: null,
  social_icon_color: null,
  /* Round 40: what themes now set as well (lib/onepage/theme-layout). Null is a list, centred, regular buttons, the old Fill. */
  block_layout: null,
  header_align: null,
  button_size: null,
  button_hover_fill: null,
  button_hover_text: null,
  /* Round 42: how products are shown, and the cover picture (lib/onepage/theme-layout). Null is each block's own layout, and no cover. */
  product_layout: null,
  cover_image_url: null,
  /* Round W9: the skin, its material and scene (lib/onepage/theme-skin). Null is none. */
  theme_skin: null,
}

/**
 * THE CREATOR'S OWN TYPE AND FRAME, WHICH A THEME MAY ALSO SET (round W8).
 * The name's and bio's type, the profile picture's frame and the button's
 * text alignment and icon side are the creator's own (the Text and Buttons
 * settings), so picking a theme never resets them the way LOOK_RESET does.
 * A theme may still set them (Gazette's capitals, Acid's square picture):
 * then each is the theme's only for as long as it still holds what that
 * theme set. Picking the next theme takes back what the last one set and
 * lays on the new one's; a value the creator chose themselves (it is not
 * what the last theme set) stays, whatever the new theme says.
 */
export const THEME_TYPE_KEYS = [
  "title_size", "title_weight", "title_tracking", "title_case",
  "bio_size", "bio_weight", "bio_tracking", "bio_case",
  "avatar_size", "avatar_shape", "avatar_radius", "avatar_border_width", "avatar_border_color",
  "button_text_align", "button_icon_position",
] as const

/** What these keys are after picking `template`, coming from `previous` (the theme the page had, when known). */
function typeKeysFor(current: Record<string, unknown>, template: ThemeTemplateLike, previous?: ThemeTemplateLike | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const was = previous?.theme_config ?? {}
  const next = template.theme_config
  for (const k of THEME_TYPE_KEYS) {
    const cur = current[k]
    const fromTheme = cur == null || (k in was && was[k] === cur)
    if (!fromTheme) continue
    out[k] = k in next ? next[k] : null
  }
  return out
}

/** The colours a block can keep of its own, by block type. */
export const BLOCK_COLOUR_FIELDS: Record<string, readonly string[]> = {
  product: ["block_background_color", "text_color", "button_color", "button_text_color"],
}

export interface ThemeTemplateLike {
  id: string
  category?: string
  theme_config: Record<string, unknown>
  share_style?: string
  subscribe_style?: string
}

/** Share and Subscribe for a theme that names none: white on a light page, glass on anything else. */
export function buttonStyleFor(template: ThemeTemplateLike, which: "share_style" | "subscribe_style"): string {
  const named = template[which]
  if (named) return named
  return template.category === "light" ? "white" : "glassmorphism"
}

/** The page with this block's own colours taken off, or the same block when it has none. */
export function withoutOwnColours(block: OnePageBlock): OnePageBlock {
  const fields = BLOCK_COLOUR_FIELDS[block.type]
  const data = block.data as unknown as Record<string, unknown> | null | undefined
  if (!fields || !data || !fields.some((f) => data[f] != null && data[f] !== "")) return block
  const next = { ...data }
  for (const f of fields) next[f] = null
  return { ...block, data: next as unknown as OnePageBlock["data"] }
}

/**
 * The page after picking this theme. `headerLayout` is what the picker chose
 * for the header (a Hero theme, or classic for a picture or gradient).
 * `previous` is the theme the page wore, so what it set of THEME_TYPE_KEYS
 * is taken back; without it, any value there is kept as the creator's.
 */
export function lookFromTemplate(page: OnePage, template: ThemeTemplateLike, headerLayout?: "classic" | "hero", previous?: ThemeTemplateLike | null): OnePage {
  const own = (page.theme ?? {}) as unknown as Record<string, unknown>
  const config = { ...template.theme_config }
  for (const k of THEME_TYPE_KEYS) delete config[k]
  const theme = {
    ...page.theme,
    ...LOOK_RESET,
    ...config,
    ...typeKeysFor(own, template, previous),
    template_id: template.id,
    ...(headerLayout ? { header_layout: headerLayout } : {}),
  } as OnePageTheme
  const settings = {
    ...page.settings,
    share_style: buttonStyleFor(template, "share_style"),
    subscribe_style: buttonStyleFor(template, "subscribe_style"),
  } as OnePage["settings"]
  const recolour = (blocks: OnePageBlock[] | null | undefined) => (blocks ? blocks.map(withoutOwnColours) : blocks)
  return { ...page, theme, settings, draft_blocks: recolour(page.draft_blocks) as OnePageBlock[] }
}

/* ── Readable on whatever it sits on ─────────────────────────────────── */

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance of a #rgb or #rrggbb colour; null for anything else (a gradient, rgba, a name). */
export function luminanceOf(color: string | null | undefined): number | null {
  const m = typeof color === "string" ? color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i) : null
  if (!m) return null
  const hex = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  const n = Number.parseInt(hex, 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrastRatio(a: string, b: string): number | null {
  const la = luminanceOf(a)
  const lb = luminanceOf(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * `preferred` when it can be read on `background`, else near black or white,
 * whichever reads. Text a person chose themselves is passed as `chosen` and
 * always wins: this only rescues the colour that was inherited.
 */
export function readableOn(background: string, preferred: string, chosen?: string | null): string {
  if (chosen) return chosen
  const ratio = contrastRatio(background, preferred)
  if (ratio === null || ratio >= 3) return preferred
  const lum = luminanceOf(background) ?? 1
  return lum > 0.4 ? "#111827" : "#ffffff"
}
