/**
 * ===========================================================================
 *  RENAISSANCE
 * ===========================================================================
 * The owner: "a new theme called Renaissance: classical painting tones,
 * refined readable serif typography, warm or gilded accents used with
 * restraint, a tasteful painterly or textured background".
 *
 * A page on an old master's canvas: warm primed linen under a soft sky,
 * mottled like aged varnish, blue-green hills far off at the foot. The name
 * in Cormorant Garamond, everything else in EB Garamond, a Garamond cut for
 * reading. Links are ivory panels in a gilt frame (a gold hairline and a
 * second one inside it) and turn madder red under the pointer; products are
 * bought with a lapis button. Gold is only ever a line: frames, the rule
 * under a heading, the ring round the picture. The material and the scene
 * are its skin (lib/onepage/theme-skin, scripts/onepage-skins/renaissance.mjs).
 *
 * Every colour here reads at 4.5:1 or more on what is behind it, at rest and
 * on hover (tests/onepage-themes-renaissance.test.ts).
 */
export const RENAISSANCE_THEMES = [
  {
    id: "renaissance",
    name: "Renaissance",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#ece1c8",
      background_gradient: "",
      background_image_url: "",
      text_color: "#2a1d13",
      secondary_text_color: "#56422f",
      button_color: "#f7f0de",
      button_text_color: "#2a1d13",
      button_style: "filled" as const,
      button_border_radius: 3,
      button_border_width: 1,
      button_border_color: "#a8843f",
      button_shadow: "subtle",
      button_shadow_color: "#4a2f17",
      button_hover_animation: "fill",
      button_hover_fill: "#6b2a1f",
      button_hover_text: "#f7f0de",
      font_family: "'EB Garamond', serif",
      title_font: "'Cormorant Garamond', serif",
      title_color: "#2a1d13",
      social_icon_color: "#3b2a1c",
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
    light_button_text_color: "#2a1d13",
    solid_button_text_color: "#2a1d13",
    outline_button_text_color: "#2a1d13",
    glass_button_text_color: "#2a1d13",
    share_style: "white",
    subscribe_style: "white",
  },
]
