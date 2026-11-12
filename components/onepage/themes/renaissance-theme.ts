/**
 * ===========================================================================
 *  RENAISSANCE
 * ===========================================================================
 * The owner, round 3: "make the Renaissance theme much cooler and cleaner",
 * after Shopify Editions Winter '26, "The Renaissance Edition": classical
 * oil painting as the backdrop, crisp modern type over it (large, white,
 * confident), thin white editorial frames; modern meets classical, never a
 * costume.
 *
 * The page sits on Titian's "Bacchus and Ariadne" (public domain; its skin,
 * scripts/onepage-skins/renaissance.mjs, draws it with a scrim where words sit
 * and fades it into the painting's ultramarine night). The name and every word
 * are Geist, a modern grotesk, white; links are panels of that night in a
 * single white hairline, square cornered, and fill white with ink words under
 * the pointer; the product's button is white. No gold, no serif, no gradient.
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
      background_color: "#0e1220",
      background_gradient: "",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#dfe2ea",
      button_color: "#0e1220",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 2,
      button_border_width: 1,
      button_border_color: "#ffffff",
      button_shadow: "none",
      button_shadow_color: "#000000",
      button_hover_animation: "fill",
      button_hover_fill: "#ffffff",
      button_hover_text: "#0e1220",
      font_family: "'Geist', sans-serif",
      title_font: "'Geist', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      social_icon_style: "outline",
      spacing: "comfortable" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "list",
      header_align: "left",
      theme_skin: "renaissance",
      title_weight: 700,
      title_size: "large",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#ffffff",
    solid_button_text_color: "#ffffff",
    outline_button_text_color: "#ffffff",
    glass_button_text_color: "#ffffff",
    share_style: "white",
    subscribe_style: "white",
  },
]
