/**
 * ===========================================================================
 *  RENAISSANCE
 * ===========================================================================
 * Wave 15, the owner: "I like the Renaissance theme, but I don't like the
 * white rectangle (the thin white frame around the page)", "make the
 * background smoother and cleaner", "make Renaissance more Renaissance: the
 * theme, the structure, all of it". This replaces round 3's modern grotesk,
 * white hairlines and "no gold, no serif".
 *
 * The page sits in front of Titian's "Bacchus and Ariadne" (public domain;
 * its skin, scripts/onepage-skins/renaissance.mjs, shows it whole and still
 * behind the page, with a soft scrim only under the words that sit on it).
 * A classical composition: the header centred, the picture a tondo in a gilt
 * ring, the name in Cormorant Garamond, reading in EB Garamond, links as
 * lapis gallery plaques framed in a gilt hairline that fill ivory under the
 * pointer, the product's button the ivory plaque. The palette is the
 * painting's: ultramarine night, Ariadne's lapis robe, the ivory of her
 * sleeve, gilt only ever as a line.
 *
 * Every colour here reads at 4.5:1 or more on what is behind it, at rest and
 * on hover (tests/onepage-themes-renaissance.test.ts).
 */
export const RENAISSANCE_THEMES = [
  {
    id: "renaissance",
    name: "Renaissance",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#121a33",
      background_gradient: "",
      background_image_url: "",
      text_color: "#f4ecda",
      secondary_text_color: "#ece2cc",
      button_color: "#17224a",
      button_text_color: "#f4ecda",
      button_style: "filled" as const,
      button_border_radius: 2,
      button_border_width: 1,
      button_border_color: "#c6a15b",
      button_shadow: "none",
      button_shadow_color: "#000000",
      button_hover_animation: "fill",
      button_hover_fill: "#f4ecda",
      button_hover_text: "#17224a",
      font_family: "'EB Garamond', serif",
      title_font: "'Cormorant Garamond', serif",
      title_color: "#f8f1e2",
      social_icon_color: "#f4ecda",
      social_icon_style: "outline",
      spacing: "comfortable" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "list",
      header_align: "center",
      theme_skin: "renaissance",
      title_weight: 600,
      title_size: "large",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#17224a",
    solid_button_text_color: "#f4ecda",
    outline_button_text_color: "#f4ecda",
    glass_button_text_color: "#f4ecda",
    share_style: "glass",
    subscribe_style: "glass",
  },
]
