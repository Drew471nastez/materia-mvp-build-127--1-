/**
 * ===========================================================================
 *  TWO DARK THEMES IN CLEAN: VELVET AND BASALT
 * ===========================================================================
 * The owner: two more themes in the picker's Clean group, both dark, "clean,
 * smooth, high quality", each with its own button, type and surface, "not two
 * recolours of the same thing", no purple gradients, no glass, no neon.
 * Every other Clean theme is a light page; these are the same restraint at
 * night, and they sit at the end of Clean (./theme-order).
 *
 *   Velvet   a warm near black, like dark wool or a walnut room. The name
 *            in Newsreader, a book face set large and tight, the rest in
 *            DM Sans. Buttons are solid warm ivory slabs with a soft 8px
 *            corner that turn camel under the pointer. Centred and roomy;
 *            a link with a picture is drawn as a large card, products as
 *            rows: a writer's or a photographer's page.
 *   Basalt   cool graphite stone with a fine grain, lighter at the top as a
 *            surface under a lamp. The name in Geist, set semibold and
 *            tight, the rest in Inter, flush left. Buttons are tonal: a 14%
 *            tint of pale steel with a hairline edge and a crisp 4px corner,
 *            that fill with the steel under the pointer. Products as tiles:
 *            a developer's, designer's or studio's page.
 *
 * What they do not share: the surface (flat warm black against a grained
 * cool gradient), the type (a serif name centred against a grotesque name
 * flush left), the button (a solid ivory slab with an 8px corner against a
 * tonal tint with a 4px corner and an edge), the hover's colour (camel
 * against steel), the social icons (outlined against bare), the picture
 * links (large cards against a plain list) and the products (rows against
 * tiles). Both keep to settings the editor already has, so a creator can
 * change any one of them, and lib/onepage/theme-apply resets all of it on
 * the next pick.
 *
 * Every word reads at 4.5:1 or more on what is behind it, at rest and under
 * the pointer (tests/onepage-dark-themes.test.ts measures each pair, and
 * scripts/check-onepage-dark-themes.mjs measures a whole page of each on
 * pixels).
 */

export const DARK_CLEAN_THEMES = [
  {
    id: "velvet",
    name: "Velvet",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#15120e",
      background_gradient: "",
      background_image_url: "",
      text_color: "#f1eadf",
      secondary_text_color: "#b4a999",
      button_color: "#efe6d8",
      button_text_color: "#1a1612",
      button_style: "filled" as const,
      button_border_radius: 8,
      button_border_width: 0,
      button_border_color: "#efe6d8",
      button_shadow: "none",
      button_hover_animation: "fill",
      button_hover_fill: "#d8b98f",
      button_hover_text: "#1a1612",
      font_family: "'DM Sans', sans-serif",
      title_font: "'Newsreader', serif",
      title_color: "#f6efe4",
      title_size: "large",
      title_weight: 400,
      title_tracking: "tight",
      social_icon_color: "#efe6d8",
      social_icon_style: "outline",
      spacing: "comfortable" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "cards",
      product_layout: "rows",
      header_align: "center",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#1a1612",
    solid_button_text_color: "#1a1612",
    outline_button_text_color: "#f1eadf",
    glass_button_text_color: "#f1eadf",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "basalt",
    name: "Basalt",
    category: "dark",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#17191d",
      background_gradient: "linear-gradient(180deg, #1f2227 0%, #181a1e 48%, #131518 100%)",
      background_image_url: "",
      gradient_noise: true,
      noise_strength: 12,
      text_color: "#e6eaee",
      secondary_text_color: "#9ea6b0",
      button_color: "#dde3e9",
      button_text_color: "#dde3e9",
      button_style: "soft" as const,
      button_border_radius: 4,
      button_border_width: 1,
      button_border_color: "#4a525c",
      button_shadow: "none",
      button_hover_animation: "fill",
      button_hover_fill: "#dde3e9",
      button_hover_text: "#131518",
      font_family: "'Inter', sans-serif",
      title_font: "'Geist', sans-serif",
      title_color: "#f2f4f6",
      title_weight: 600,
      title_tracking: "tight",
      social_icon_color: "#c9d0d7",
      social_icon_style: "minimal",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "list",
      product_layout: "grid",
      header_align: "left",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#dde3e9",
    solid_button_text_color: "#131518",
    outline_button_text_color: "#e6eaee",
    glass_button_text_color: "#e6eaee",
    share_style: "black",
    subscribe_style: "black",
  },
]
