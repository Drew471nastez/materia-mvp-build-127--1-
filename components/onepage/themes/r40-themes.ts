/**
 * ===========================================================================
 *  FIVE MORE THEMES (ROUND 40), EACH A DIFFERENT KIND OF PAGE
 * ===========================================================================
 * The owner: "Create five more themes, the best and clean, more unique and
 * different styles", "let themes control more things". Each one sets what a
 * theme could always set, and now also how the blocks are laid out
 * (block_layout), the button's hover colours (button_hover_fill and
 * button_hover_text, with the Fill or Pop hover), the button size, the
 * spacing and the header's alignment (lib/onepage/theme-layout). Picking any
 * other theme resets all of it (lib/onepage/theme-apply LOOK_RESET).
 *
 *   Gallery   a white gallery wall: warm off white, a soft serif title, thin
 *             framed buttons, pictures shown large as cards; a press turns a
 *             frame to ink.
 *   Swiss     a poster: concrete white, black bars with square ends, links
 *             two to a row, the header set flush left, and one signal red
 *             that each button turns to under the pointer.
 *   Ember     a room lit low: deep brown with grain, a fashion serif, amber
 *             outlined pills that fill with amber and rise.
 *   Lagoon    shallow water: a pale sea glass gradient, deep teal words and
 *             small rounded buttons in tight rows that turn a brighter teal.
 *   Atlas     a night range: the mountain photograph from the editor's own
 *             library, printed dark, a tall condensed title, white pills,
 *             links with pictures as large cards.
 *
 * No violet, no gradient buttons. Every text colour reads at 4.5:1 or more
 * on what is behind it, and every button's words on the button, at rest and
 * on hover (tests/onepage-themes-r40.test.ts measures each pair).
 *
 * Atlas's photo: Unsplash photo-1519681393784-d120267933ba, the "Mountains"
 * picture the Links tab's image library already offers. Unsplash License:
 * free for commercial use, no permission or credit needed
 * (https://unsplash.com/license).
 */

export const R40_THEMES = [
  {
    id: "gallery",
    name: "Gallery",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#f7f6f2",
      background_gradient: "",
      background_image_url: "",
      text_color: "#16150f",
      secondary_text_color: "#55524a",
      button_color: "#ffffff",
      button_text_color: "#16150f",
      button_style: "filled" as const,
      button_border_radius: 4,
      button_border_width: 1,
      button_border_color: "#e2ded3",
      button_shadow: "none",
      button_hover_animation: "fill",
      button_hover_fill: "#16150f",
      button_hover_text: "#f7f6f2",
      font_family: "'Inter', sans-serif",
      title_font: "'Fraunces', serif",
      title_color: "#16150f",
      social_icon_color: "#16150f",
      social_icon_style: "outline",
      spacing: "comfortable" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "cards",
      header_align: "center",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#16150f",
    solid_button_text_color: "#16150f",
    outline_button_text_color: "#16150f",
    glass_button_text_color: "#16150f",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "swiss",
    name: "Swiss",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#f2f1ec",
      background_gradient: "",
      background_image_url: "",
      text_color: "#0b0b0b",
      secondary_text_color: "#45443f",
      button_color: "#0b0b0b",
      button_text_color: "#f2f1ec",
      button_style: "filled" as const,
      button_border_radius: 0,
      button_border_width: 0,
      button_border_color: "#0b0b0b",
      button_shadow: "none",
      button_hover_animation: "fill",
      button_hover_fill: "#d42d17",
      button_hover_text: "#ffffff",
      font_family: "'Geist', sans-serif",
      title_font: "'Geist', sans-serif",
      title_color: "#0b0b0b",
      social_icon_color: "#0b0b0b",
      social_icon_style: "minimal",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "grid",
      header_align: "left",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#0b0b0b",
    solid_button_text_color: "#f2f1ec",
    outline_button_text_color: "#0b0b0b",
    glass_button_text_color: "#0b0b0b",
    share_style: "black",
    subscribe_style: "black",
  },
  {
    id: "ember",
    name: "Ember",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#1b1612",
      background_gradient: "",
      background_image_url: "",
      text_color: "#f4ece2",
      secondary_text_color: "#c2b5a6",
      button_color: "#f0a24a",
      button_text_color: "#f0a24a",
      button_style: "outline" as const,
      button_border_radius: 999,
      button_border_width: 2,
      button_border_color: "#f0a24a",
      button_shadow: "none",
      button_hover_animation: "pop",
      button_hover_fill: "#f0a24a",
      button_hover_text: "#1b1612",
      font_family: "'Manrope', sans-serif",
      title_font: "'Bodoni Moda', serif",
      title_color: "#f4ece2",
      social_icon_color: "#f0a24a",
      social_icon_style: "outline",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "grain",
      pattern_color: "#ffffff80",
      pattern_opacity: "low",
      block_layout: "list",
      header_align: "center",
    },
    profile_layout: "classic" as const,
    solid_button_text_color: "#1b1612",
    outline_button_text_color: "#f0a24a",
    glass_button_text_color: "#f4ece2",
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "lagoon",
    name: "Lagoon",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#cfeae3",
      background_gradient: "linear-gradient(175deg, #e7f5f1 0%, #bfe3da 100%)",
      background_image_url: "",
      text_color: "#0c3b35",
      secondary_text_color: "#23524b",
      button_color: "#0c3b35",
      button_text_color: "#eaf6f2",
      button_style: "filled" as const,
      button_border_radius: 14,
      button_border_width: 0,
      button_border_color: "#0c3b35",
      button_shadow: "subtle",
      button_shadow_color: "#0c3b35",
      button_hover_animation: "fill",
      button_hover_fill: "#12695e",
      button_hover_text: "#ffffff",
      button_size: "compact",
      font_family: "'Nunito', sans-serif",
      title_font: "'Fredoka', sans-serif",
      title_color: "#0c3b35",
      social_icon_color: "#0c3b35",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "compact",
      header_align: "center",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#0c3b35",
    solid_button_text_color: "#eaf6f2",
    outline_button_text_color: "#0c3b35",
    glass_button_text_color: "#0c3b35",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "atlas",
    name: "Atlas",
    category: "image",
    theme_config: {
      background_type: "image" as const,
      background_color: "#101a2b",
      background_gradient: "",
      background_image_url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80",
      text_color: "#ffffff",
      secondary_text_color: "#dbe4f0",
      button_color: "#ffffff",
      button_text_color: "#101a2b",
      button_style: "filled" as const,
      button_border_radius: 999,
      button_border_width: 0,
      button_border_color: "#ffffff",
      button_shadow: "subtle",
      button_shadow_color: "#000000",
      button_hover_animation: "pop",
      button_hover_fill: "#101a2b",
      button_hover_text: "#ffffff",
      font_family: "'Figtree', sans-serif",
      title_font: "'Big Shoulders', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      /* Printed down to 40% so white words read on the snow, with a fine grain. */
      image_brightness: 40,
      image_noise: true,
      noise_strength: 20,
      block_layout: "cards",
      header_align: "center",
    },
    profile_layout: "classic" as const,
    solid_button_text_color: "#101a2b",
    outline_button_text_color: "#ffffff",
    glass_button_text_color: "#ffffff",
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
]

/**
 * ===========================================================================
 *  TWO MORE (ROUND 42): A COVER PAGE AND A PRICE LIST
 * ===========================================================================
 * The owner: "Themes should differ in layout style too, not just colours:
 * some with an image hero, some that display product blocks differently".
 * Each sets the two things a theme can now set (lib/onepage/theme-layout):
 *
 *   Folio     a printed catalogue: warm stone, a wide cover photograph across
 *             the top with the round photo set over its edge, a newspaper
 *             serif title, ink buttons, and products as tiles two to a row.
 *   Ledger    a price list: near black, mono title, the header flush left,
 *             tight rows of small light buttons, and products as list rows
 *             with the price on a pill at the end.
 *
 * Folio's photo: Unsplash photo-1507400492013-162706c8c05e, the "Ocean"
 * picture the editor's wallpaper library already offers (Unsplash License).
 * tests/onepage-themes-r42.test.ts measures every text and button pair.
 */
export const R42_THEMES = [
  {
    id: "folio",
    name: "Folio",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#f5f2ec",
      background_gradient: "",
      background_image_url: "",
      text_color: "#1d2329",
      secondary_text_color: "#4d5560",
      button_color: "#1d2329",
      button_text_color: "#f5f2ec",
      button_style: "filled" as const,
      button_border_radius: 10,
      button_border_width: 0,
      button_border_color: "#1d2329",
      button_shadow: "none",
      button_hover_animation: "fill",
      button_hover_fill: "#3a4f63",
      button_hover_text: "#ffffff",
      font_family: "'Inter', sans-serif",
      title_font: "'Newsreader', serif",
      title_color: "#1d2329",
      social_icon_color: "#1d2329",
      social_icon_style: "outline",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "list",
      header_align: "center",
      cover_image_url: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=1600&q=80",
      product_layout: "grid",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#1d2329",
    solid_button_text_color: "#f5f2ec",
    outline_button_text_color: "#1d2329",
    glass_button_text_color: "#1d2329",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "ledger",
    name: "Ledger",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#121412",
      background_gradient: "",
      background_image_url: "",
      text_color: "#ecebe4",
      secondary_text_color: "#a7a69d",
      button_color: "#ecebe4",
      button_text_color: "#121412",
      button_style: "filled" as const,
      button_border_radius: 6,
      button_border_width: 0,
      button_border_color: "#ecebe4",
      button_shadow: "none",
      button_hover_animation: "fill",
      button_hover_fill: "#9fd3c7",
      button_hover_text: "#121412",
      button_size: "compact",
      font_family: "'Geist', sans-serif",
      title_font: "'Geist Mono', monospace",
      title_color: "#ecebe4",
      social_icon_color: "#ecebe4",
      social_icon_style: "minimal",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "compact",
      header_align: "left",
      product_layout: "rows",
    },
    profile_layout: "classic" as const,
    solid_button_text_color: "#121412",
    outline_button_text_color: "#ecebe4",
    glass_button_text_color: "#ecebe4",
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
]

/**
 * ===========================================================================
 *  TWO MORE (ROUND AP): A POSTER AND A NOTEBOOK
 * ===========================================================================
 * The owner: "add the two more themes which are completely different". Each
 * is a page no other theme makes, in its layout, its type and its colour:
 *
 *   Cobalt    a poster: the creator's photo across the top fading into a
 *             saturated cobalt, a wide grotesque name, and cream Soft pills
 *             (the tint of their colour, the only theme that uses Soft) in
 *             roomy rows. The only bright Hero; Midnight and Neon are night.
 *   Notebook  a page from a notebook: warm paper ruled in pale blue, a
 *             handwritten name set flush left, and ink outlined buttons two
 *             to a row (the Mixed layout, which no theme used).
 *
 * Both set only what picking another theme resets (lib/onepage/theme-apply
 * LOOK_RESET), so nothing of them stays behind.
 * tests/onepage-themes-ap.test.ts measures every text and button pair.
 */
export const AP_THEMES = [
  {
    id: "cobalt",
    name: "Cobalt",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#1f3bc4",
      background_gradient: "linear-gradient(180deg, #2343d6 0%, #182f9e 100%)",
      background_image_url: "",
      text_color: "#fff4dc",
      secondary_text_color: "#e4e8ff",
      button_color: "#fff4dc",
      button_text_color: "#fff4dc",
      button_style: "soft" as const,
      button_border_radius: 999,
      button_border_width: 0,
      button_border_color: "#fff4dc",
      button_shadow: "none",
      button_hover_animation: "fill",
      button_hover_fill: "#fff4dc",
      button_hover_text: "#182f9e",
      font_family: "'Lato', sans-serif",
      title_font: "'Bricolage Grotesque', sans-serif",
      title_color: "#fff4dc",
      social_icon_color: "#fff4dc",
      social_icon_style: "filled",
      spacing: "comfortable" as const,
      card_width: "standard" as const,
      header_layout: "hero",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "list",
      header_align: "center",
    },
    profile_layout: "hero" as const,
    light_button_text_color: "#fff4dc",
    solid_button_text_color: "#182f9e",
    outline_button_text_color: "#fff4dc",
    glass_button_text_color: "#fff4dc",
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "notebook",
    name: "Notebook",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#f8f5ec",
      background_gradient: "",
      background_image_url: "",
      text_color: "#1f2a52",
      secondary_text_color: "#4a5375",
      button_color: "#1f2a52",
      button_text_color: "#1f2a52",
      button_style: "outline" as const,
      button_border_radius: 4,
      button_border_width: 2,
      button_border_color: "#1f2a52",
      button_shadow: "none",
      button_hover_animation: "fill",
      button_hover_fill: "#1f2a52",
      button_hover_text: "#f8f5ec",
      font_family: "'Quicksand', sans-serif",
      title_font: "'Caveat', cursive",
      title_color: "#1f2a52",
      social_icon_color: "#1f2a52",
      social_icon_style: "minimal",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "lines",
      pattern_color: "#5b7bd166",
      pattern_opacity: "low",
      block_layout: "masonry",
      header_align: "left",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#1f2a52",
    solid_button_text_color: "#f8f5ec",
    outline_button_text_color: "#1f2a52",
    glass_button_text_color: "#1f2a52",
    share_style: "white",
    subscribe_style: "white",
  },
]

/** The order the kinds are listed in, in All: light, gradient, dark, then pictures, as the catalogue always was. */
export const THEME_KIND_ORDER = ["light", "gradient", "dark", "image"] as const

/** The catalogue with these (and round 42's) laid into their kinds, each kind keeping its own order and the new ones at its end. */
export function withR40Themes<T extends { category: string }>(base: readonly T[]): T[] {
  const all = [...base, ...(R40_THEMES as unknown as T[]), ...(R42_THEMES as unknown as T[]), ...(AP_THEMES as unknown as T[])]
  const rank = (c: string) => {
    const i = (THEME_KIND_ORDER as readonly string[]).indexOf(c)
    return i < 0 ? THEME_KIND_ORDER.length : i
  }
  return all.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.category) - rank(b.t.category) || a.i - b.i).map((x) => x.t)
}
