// ============================================================
// Website Builder: Theme-settings schema groups
// Drives the "Theme settings" panel in the Store Editor
// ============================================================
import { COOKIE_ACCEPT_TEXT, COOKIE_DECLINE_TEXT, SITE_COOKIE_TEXT } from "@/lib/consent/copy"
import type { ThemeSettingsGroup } from "./types"

export const THEME_SETTINGS_GROUPS: ThemeSettingsGroup[] = [
  {
    id: "branding",
    label: "Branding",
    icon: "image",
    fields: [
      { id: "brand_name", label: "Store name", type: "text", placeholder: "My Store" },
      { id: "logo_url", label: "Logo image", type: "image" },
      { id: "logo_width", label: "Logo width (px)", type: "range", min: 60, max: 300, step: 10, default: 120, unit: "px" },
      { id: "favicon_url", label: "Favicon", type: "image" },
      { id: "tagline", label: "Tagline", type: "text", placeholder: "Your trusted digital store" },
    ],
  },
  {
    id: "color_schemes",
    label: "Colors",
    icon: "palette",
    // The schemes. Rendered by ColorsPanel; the values live in
    // theme.color_schemes, theme.default_color_scheme and
    // theme.color_scheme_remaps (see lib/storelib-theme/color-schemes.ts).
    fields: [],
  },
  {
    // Shown inside the Colors panel, behind "Page colors". Not a top-level
    // group in the panel: the page's own colours are the advanced case.
    id: "colors",
    label: "Page colors",
    icon: "palette",
    fields: [
      { id: "primary_color", label: "Primary", type: "color", default: "#6366f1" },
      { id: "primary_hover_color", label: "Primary hover", type: "color", default: "#4f46e5" },
      { id: "secondary_color", label: "Secondary", type: "color", default: "#8b5cf6" },
      { id: "accent_color", label: "Accent", type: "color", default: "#f59e0b" },
      { id: "background_color", label: "Page background", type: "color", default: "#ffffff" },
      { id: "surface_color", label: "Surface / card", type: "color", default: "#f8fafc" },
      { id: "surface_alt_color", label: "Surface alt", type: "color", default: "#f1f5f9" },
      { id: "text_color", label: "Heading text", type: "color", default: "#0f172a" },
      { id: "text_secondary_color", label: "Body text", type: "color", default: "#64748b" },
      { id: "text_muted_color", label: "Muted text", type: "color", default: "#94a3b8" },
      { id: "border_color", label: "Border", type: "color", default: "#e2e8f0" },
      { id: "link_color", label: "Link color", type: "color", default: "#6366f1" },
      { id: "link_hover_color", label: "Link hover", type: "color", default: "#4f46e5" },
      { id: "success_color", label: "Success", type: "color", default: "#10b981" },
      { id: "error_color", label: "Error", type: "color", default: "#ef4444" },
    ],
  },
  {
    id: "typography",
    label: "Typography",
    icon: "type",
    fields: [
      {
        id: "font_heading",
        label: "Heading font",
        type: "font",
        default: "Inter",
        options: [
          { label: "Inter", value: "Inter" },
          { label: "Plus Jakarta Sans", value: "Plus Jakarta Sans" },
          { label: "Space Grotesk", value: "Space Grotesk" },
          { label: "DM Sans", value: "DM Sans" },
          { label: "Poppins", value: "Poppins" },
          { label: "Montserrat", value: "Montserrat" },
          { label: "Raleway", value: "Raleway" },
          { label: "Oswald", value: "Oswald" },
          { label: "Bebas Neue", value: "Bebas Neue" },
          { label: "Playfair Display", value: "Playfair Display" },
          { label: "Cormorant Garamond", value: "Cormorant Garamond" },
          { label: "Lora", value: "Lora" },
          { label: "Merriweather", value: "Merriweather" },
          { label: "Libre Baskerville", value: "Libre Baskerville" },
          { label: "EB Garamond", value: "EB Garamond" },
        ],
      },
      {
        id: "font_body",
        label: "Body font",
        type: "font",
        default: "Inter",
        options: [
          { label: "Inter", value: "Inter" },
          { label: "DM Sans", value: "DM Sans" },
          { label: "Plus Jakarta Sans", value: "Plus Jakarta Sans" },
          { label: "Space Grotesk", value: "Space Grotesk" },
          { label: "Poppins", value: "Poppins" },
          { label: "Nunito", value: "Nunito" },
          { label: "Source Sans 3", value: "Source Sans 3" },
          { label: "Lato", value: "Lato" },
          { label: "Open Sans", value: "Open Sans" },
        ],
      },
      {
        id: "font_accent",
        label: "Accent font",
        type: "font",
        default: "",
        options: [
          { label: "Same as heading font", value: "" },
          { label: "Inter", value: "Inter" },
          { label: "DM Sans", value: "DM Sans" },
          { label: "Plus Jakarta Sans", value: "Plus Jakarta Sans" },
          { label: "Space Grotesk", value: "Space Grotesk" },
          { label: "Poppins", value: "Poppins" },
          { label: "Nunito", value: "Nunito" },
          { label: "Source Sans 3", value: "Source Sans 3" },
          { label: "Lato", value: "Lato" },
          { label: "Open Sans", value: "Open Sans" },
        ],
      },
      // Sizes, weights, line heights, spacing and transforms are the text
      // styles (Heading 1 to Caption) in theme.typography_styles, rendered by
      // TypographyPanel. The older flat controls (font_size_base,
      // line_height_base, heading_weight, heading_transform,
      // heading_letter_spacing) still seed those styles' defaults.
    ],
  },
  {
    id: "buttons",
    label: "Buttons",
    icon: "layout",
    fields: [
      {
        id: "button_style",
        label: "Default style",
        type: "radio",
        default: "filled",
        options: [
          { label: "Filled", value: "filled" },
          { label: "Outline", value: "outline" },
          { label: "Ghost", value: "ghost" },
        ],
      },
      {
        id: "button_shape",
        label: "Button shape",
        type: "radio",
        default: "rounded",
        options: [
          { label: "Square", value: "square" },
          { label: "Rounded", value: "rounded" },
          { label: "Pill", value: "pill" },
        ],
      },
      { id: "button_border_radius", label: "Border radius (px)", type: "range", min: 0, max: 32, step: 1, default: 8, unit: "px" },
      {
        id: "button_size",
        label: "Default size",
        type: "select",
        default: "md",
        options: [
          { label: "Small", value: "sm" },
          { label: "Medium", value: "md" },
          { label: "Large", value: "lg" },
          { label: "Extra large", value: "xl" },
        ],
      },
      { id: "button_font_weight", label: "Font weight", type: "select", default: "600",
        options: [
          { label: "Normal (400)", value: "400" },
          { label: "Medium (500)", value: "500" },
          { label: "Semibold (600)", value: "600" },
          { label: "Bold (700)", value: "700" },
        ],
      },
      { id: "button_shadow", label: "Button shadow", type: "toggle", default: false },
      {
        id: "button_transition",
        label: "Hover animation",
        type: "select",
        default: "fade",
        options: [
          { label: "None", value: "none" },
          { label: "Fade", value: "fade" },
          { label: "Lift", value: "lift" },
          { label: "Scale", value: "scale" },
        ],
      },
    ],
  },
  {
    id: "layout",
    label: "Layout",
    icon: "layout",
    fields: [
      { id: "page_width", label: "Max page width", type: "range", min: 900, max: 1800, step: 20, default: 1240, unit: "px" },
      { id: "content_padding_x", label: "Side padding", type: "range", min: 8, max: 80, step: 4, default: 32, unit: "px" },
      { id: "section_gap", label: "Section gap", type: "range", min: 0, max: 80, step: 4, default: 0, unit: "px" },
      { id: "spacing_scale", label: "Spacing scale", type: "range", min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
      { id: "border_radius", label: "Card border radius", type: "range", min: 0, max: 24, step: 1, default: 8, unit: "px" },
      { id: "card_shadow", label: "Card shadow", type: "select", default: "sm",
        options: [
          { label: "None", value: "none" },
          { label: "Small", value: "sm" },
          { label: "Medium", value: "md" },
          { label: "Large", value: "lg" },
        ],
      },
      { id: "image_border_radius", label: "Image border radius", type: "range", min: 0, max: 24, step: 1, default: 8, unit: "px" },
    ],
  },
  {
    id: "animations",
    label: "Animations",
    icon: "sparkles",
    fields: [
      { id: "animations_enabled", label: "Enable scroll animations", type: "toggle", default: true },
      {
        id: "animation_style",
        label: "Animation style",
        type: "select",
        default: "fade-up",
        options: [
          { label: "Fade up", value: "fade-up" },
          { label: "Fade", value: "fade-in" },
          { label: "Slide left", value: "slide-left" },
          { label: "Slide right", value: "slide-right" },
          { label: "Zoom", value: "zoom-in" },
        ],
      },
      { id: "animation_duration", label: "Duration (ms)", type: "range", min: 200, max: 1200, step: 50, default: 600, unit: "ms" },
      { id: "animation_stagger", label: "Stagger delay (ms)", type: "range", min: 0, max: 200, step: 10, default: 80, unit: "ms" },
    ],
  },
  {
    id: "announcement",
    label: "Announcement bar",
    icon: "megaphone",
    fields: [
      { id: "announcement_bar_enabled", label: "Show announcement bar", type: "toggle", default: false },
      { id: "announcement_bar_text", label: "Message", type: "text", placeholder: "Free shipping on orders over $50!" },
      /* More than one message takes turns: ThemePage's AnnouncementBar. */
      { id: "announcement_bar_messages", label: "More messages", type: "textarea", placeholder: "One message per line" },
      { id: "announcement_bar_rotate", label: "Seconds per message", type: "range", min: 3, max: 10, step: 1, default: 5, unit: "s" },
      { id: "announcement_bar_link_text", label: "Link text", type: "text", placeholder: "Shop now" },
      { id: "announcement_bar_link_url", label: "Link URL", type: "link" },
      { id: "announcement_bar_bg", label: "Background", type: "color", default: "#6366f1" },
      { id: "announcement_bar_color", label: "Text color", type: "color", default: "#ffffff" },
      { id: "announcement_bar_scrolling", label: "Scrolling marquee", type: "toggle", default: false },
      { id: "announcement_bar_dismissible", label: "Allow dismiss", type: "toggle", default: true },
    ],
  },
  {
    /**
     * THE SITE'S MENUS: named lists of links a section shows through a
     * `link_list` setting. The header's own links are the main menu without
     * being made here. Drawn by MenusEditor
     * (components/website-builder/editor/controls/menus-editor.tsx) and
     * cleaned on save by sanitizeThemeSettings.
     */
    id: "menus",
    label: "Menus",
    icon: "list",
    fields: [{ id: "menus", label: "Menus", type: "menus" }],
  },
  {
    id: "social",
    label: "Social links",
    icon: "share-2",
    fields: [
      { id: "social_twitter", label: "Twitter / X URL", type: "link", placeholder: "https://x.com/username" },
      { id: "social_instagram", label: "Instagram URL", type: "link", placeholder: "https://instagram.com/username" },
      { id: "social_youtube", label: "YouTube URL", type: "link", placeholder: "https://youtube.com/@channel" },
      { id: "social_tiktok", label: "TikTok URL", type: "link", placeholder: "https://tiktok.com/@username" },
      { id: "social_linkedin", label: "LinkedIn URL", type: "link" },
      { id: "social_discord", label: "Discord URL", type: "link" },
      { id: "social_facebook", label: "Facebook URL", type: "link" },
      { id: "social_pinterest", label: "Pinterest URL", type: "link" },
      { id: "social_twitch", label: "Twitch URL", type: "link" },
      { id: "social_github", label: "GitHub URL", type: "link" },
      { id: "social_show_in_header", label: "Show icons in header", type: "toggle", default: false },
      { id: "social_show_in_footer", label: "Show icons in footer", type: "toggle", default: true },
    ],
  },
  {
    /**
     * THE CART CONTROLS WENT WITH THE CART. Storelib sells one thing at a
     * time — Buy goes straight to /checkout?productId= — so there was never
     * anything to put in a basket: the count came from an event nothing
     * dispatched, the drawer could only say it was empty, and "Page" sent
     * people to /cart, which is not a route in this product. Three controls
     * over nothing.
     *
     * The free shipping bar stays because it is a bar, it draws, and a
     * creator who ships something physical can say what it costs.
     */
    id: "cart",
    label: "Shipping",
    icon: "shopping-bag",
    fields: [
      { id: "free_shipping_threshold", label: "Free shipping threshold ($)", type: "number", min: 0, default: 0 },
      { id: "free_shipping_bar", label: "Show free shipping progress bar", type: "toggle", default: false },
    ],
  },
  {
    id: "seo",
    label: "SEO",
    icon: "search",
    fields: [
      { id: "seo_title", label: "Default page title", type: "text", placeholder: "My Store | Storelib" },
      { id: "seo_description", label: "Meta description", type: "textarea", placeholder: "Discover our collection of digital products..." },
      { id: "seo_og_image", label: "Social share image (OG)", type: "image" },
      { id: "seo_twitter_card", label: "Twitter card type", type: "select", default: "summary_large_image",
        options: [
          { label: "Summary", value: "summary" },
          { label: "Summary with large image", value: "summary_large_image" },
        ],
      },
      { id: "seo_robots", label: "Allow search indexing", type: "toggle", default: true },
    ],
  },
  {
    id: "cookies",
    label: "Cookie & privacy",
    icon: "shield",
    fields: [
      /* The same settings as Website Settings › Policies › Cookie banner. */
      { id: "cookie_banner_show", label: "Show the cookie banner", type: "toggle", default: true },
      { id: "cookie_banner_text", label: "Banner text", type: "textarea", placeholder: SITE_COOKIE_TEXT },
      { id: "cookie_accept_text", label: "Accept button text", type: "text", placeholder: COOKIE_ACCEPT_TEXT },
      { id: "cookie_decline_text", label: "Reject button text", type: "text", placeholder: COOKIE_DECLINE_TEXT },
      { id: "cookie_banner_enabled", label: "Use my own colours", type: "toggle", default: false },
      { id: "cookie_bg", label: "Banner background", type: "color", default: "#0f172a" },
      { id: "cookie_text_color", label: "Text color", type: "color", default: "#ffffff" },
    ],
  },
]
