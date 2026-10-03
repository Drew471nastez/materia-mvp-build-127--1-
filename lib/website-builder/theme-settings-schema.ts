// ============================================================
// Website Builder: Theme-settings schema groups
// Drives the "Theme settings" panel in the Store Editor
// ============================================================
import { COOKIE_ACCEPT_TEXT, COOKIE_DECLINE_TEXT, SITE_COOKIE_TEXT } from "@/lib/consent/copy"
import { SOCIAL_PLATFORMS } from "./social-links"
import type { SelectOption, ThemeSettingsGroup } from "./types"

/** The four shadows the theme has, as every Shadow control offers them. */
const SHADOWS_OPTIONS: SelectOption[] = [
  { label: "None", value: "none" },
  { label: "Small", value: "sm" },
  { label: "Medium", value: "md" },
  { label: "Large", value: "lg" },
]

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
      /* Image border radius moved to Media, where Shopify files it: same setting, same key. */
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
    /**
     * THE OPTION BUTTONS A PRODUCT'S VARIANTS ARE PICKED WITH. Compiled to
     * `--theme-pill-radius` and `--theme-pill-border-width` and drawn on
     * every `[data-variant-pill]`, once set.
     */
    id: "variant_pills",
    label: "Variant pills",
    icon: "layout",
    fields: [
      { id: "pill_radius", label: "Corner radius", type: "range", min: 0, max: 40, step: 1, default: 40, unit: "px" },
      { id: "pill_border_width", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 1, unit: "px" },
    ],
  },
  {
    /** Every text box, dropdown and text area a section draws: search, sign in, newsletter, contact. */
    id: "inputs",
    label: "Inputs",
    icon: "layout",
    fields: [
      { id: "input_radius", label: "Corner radius", type: "range", min: 0, max: 24, step: 1, default: 8, unit: "px" },
      { id: "input_border_width", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 1, unit: "px" },
      { id: "input_border_opacity", label: "Border opacity", type: "range", min: 10, max: 100, step: 5, default: 25, unit: "%" },
    ],
  },
  {
    /**
     * PRODUCT CARDS, AS SHOPIFY'S THEME SETTINGS HAVE THEM. Drawn by the
     * theme stylesheet (lib/website-builder/theme-css.ts) on every element
     * marked `data-card="product"`, and only once a value is set here, so
     * a site that never opened the group looks exactly as it did.
     */
    id: "product_cards",
    label: "Product cards",
    icon: "layout",
    fields: [
      {
        id: "product_card_style",
        label: "Style",
        type: "radio",
        default: "standard",
        options: [
          { label: "Standard", value: "standard" },
          { label: "Card", value: "card" },
        ],
      },
      { id: "product_card_image_padding", label: "Image padding", type: "range", min: 0, max: 24, step: 2, default: 0, unit: "px" },
      {
        id: "product_card_align",
        label: "Text alignment",
        type: "radio",
        default: "left",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
        ],
      },
      { id: "product_card_radius", label: "Corner radius", type: "range", min: 0, max: 40, step: 1, default: 8, unit: "px" },
      { id: "product_card_border", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 0, unit: "px" },
      { id: "product_card_shadow", label: "Shadow", type: "select", default: "none", options: [
          { label: "None", value: "none" },
          { label: "Small", value: "sm" },
          { label: "Medium", value: "md" },
          { label: "Large", value: "lg" },
        ] },
    ],
  },
  {
    /**
     * COLLECTION CARDS, AS SHOPIFY'S THEME SETTINGS HAVE THEM. Drawn by the
     * theme stylesheet (lib/website-builder/theme-css.ts) on every element
     * marked `data-card="collection"`, and only once a value is set here, so
     * a site that never opened the group looks exactly as it did.
     */
    id: "collection_cards",
    label: "Collection cards",
    icon: "layout",
    fields: [
      {
        id: "collection_card_style",
        label: "Style",
        type: "radio",
        default: "standard",
        options: [
          { label: "Standard", value: "standard" },
          { label: "Card", value: "card" },
        ],
      },
      { id: "collection_card_image_padding", label: "Image padding", type: "range", min: 0, max: 24, step: 2, default: 0, unit: "px" },
      {
        id: "collection_card_align",
        label: "Text alignment",
        type: "radio",
        default: "left",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
        ],
      },
      { id: "collection_card_radius", label: "Corner radius", type: "range", min: 0, max: 40, step: 1, default: 8, unit: "px" },
      { id: "collection_card_border", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 0, unit: "px" },
      { id: "collection_card_shadow", label: "Shadow", type: "select", default: "none", options: [
          { label: "None", value: "none" },
          { label: "Small", value: "sm" },
          { label: "Medium", value: "md" },
          { label: "Large", value: "lg" },
        ] },
    ],
  },
  {
    /** Boxes text sits in: the panel over an image, a column with a background. `[data-container]`. */
    id: "content_containers",
    label: "Content containers",
    icon: "layout",
    fields: [
      { id: "container_radius", label: "Corner radius", type: "range", min: 0, max: 40, step: 1, default: 8, unit: "px" },
      { id: "container_border", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 0, unit: "px" },
      { id: "container_shadow", label: "Shadow", type: "select", default: "none", options: SHADOWS_OPTIONS },
    ],
  },
  {
    /**
     * Pictures and videos in sections, marked `[data-media]`. The radius
     * is the Layout group's old Image border radius, the same setting under
     * the name Shopify files it.
     */
    id: "media",
    label: "Media",
    icon: "image",
    fields: [
      { id: "image_border_radius", label: "Corner radius", type: "range", min: 0, max: 24, step: 1, default: 8, unit: "px" },
      { id: "media_border", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 0, unit: "px" },
      { id: "media_shadow", label: "Shadow", type: "select", default: "none", options: SHADOWS_OPTIONS },
    ],
  },
  {
    /** Menus that drop down and boxes that pop up over the page: `[data-popup]`. */
    id: "popups",
    label: "Dropdowns and pop-ups",
    icon: "layout",
    fields: [
      { id: "popup_radius", label: "Corner radius", type: "range", min: 0, max: 24, step: 1, default: 12, unit: "px" },
      { id: "popup_border", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 1, unit: "px" },
      { id: "popup_shadow", label: "Shadow", type: "select", default: "md", options: SHADOWS_OPTIONS },
    ],
  },
  {
    /**
     * The Sale and Sold out labels on a product card. Sale appears when a
     * product has a price to compare against; Sold out when its stock has
     * run out. Their colours are the badges', not the section's.
     */
    id: "badges",
    label: "Badges",
    icon: "layout",
    fields: [
      {
        id: "badge_position",
        label: "Position on cards",
        type: "select",
        default: "top_left",
        options: [
          { label: "Top left", value: "top_left" },
          { label: "Top right", value: "top_right" },
          { label: "Bottom left", value: "bottom_left" },
        ],
      },
      { id: "badge_radius", label: "Corner radius", type: "range", min: 0, max: 40, step: 1, default: 40, unit: "px" },
      { id: "badge_sale_show", label: "Show Sale on discounted products", type: "toggle", default: true },
      { id: "badge_sale_text", label: "Sale label", type: "text", placeholder: "Sale" },
      { id: "badge_sale_bg", label: "Sale background", type: "color", default: "#dc2626" },
      { id: "badge_sale_color", label: "Sale text", type: "color", default: "#ffffff" },
      { id: "badge_soldout_bg", label: "Sold out background", type: "color", default: "#1a1a2e" },
      { id: "badge_soldout_color", label: "Sold out text", type: "color", default: "#ffffff" },
    ],
  },
  {
    /**
     * WHO THE SHOP IS, in Shopify's words: a headline, a description and a
     * picture. Any text setting can show them through Insert shop data
     * (`{{ shop.brand_headline }}`), and a section reads them as
     * `theme.brand`.
     */
    id: "brand",
    label: "Brand information",
    icon: "image",
    fields: [
      { id: "brand_headline", label: "Headline", type: "text", placeholder: "Small batch candles, poured in Leeds" },
      { id: "brand_description", label: "Description", type: "textarea", placeholder: "A few lines about what you make and why" },
      { id: "brand_image", label: "Image", type: "image" },
      { id: "brand_image_width", label: "Image width", type: "range", min: 50, max: 550, step: 5, default: 100, unit: "px" },
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
      /* One field per platform, in the order the icons are drawn: see
         lib/website-builder/social-links.ts, which the footer and the
         header read too. */
      ...SOCIAL_PLATFORMS.map((p) => ({
        id: p.key,
        label: p.key === "social_twitter" ? "X (Twitter) URL" : `${p.label} URL`,
        type: "link" as const,
        placeholder: p.placeholder,
      })),
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
     *
     * The cart is real now (site-cart.tsx, /cart, the cart checkout), so
     * Cart type came back, as a control over something: tests/site-pages
     * holds it to the cart doing what it says.
     */
    id: "cart",
    label: "Cart",
    icon: "shopping-bag",
    fields: [
      /*
        WHAT ADD TO CART DOES, as Shopify asks it: open the cart drawer, go
        to the cart page, or show a short notice and stay. The value is the
        theme's, read as `theme.cart.type` and on the page root as
        `data-cart-type`; SiteCartProvider (site-cart.tsx) does it on Add to cart.
      */
      {
        id: "cart_type",
        label: "Cart type",
        type: "select",
        default: "drawer",
        options: [
          { label: "Drawer", value: "drawer" },
          { label: "Page", value: "page" },
          { label: "Notification", value: "notification" },
        ],
      },
      { id: "free_shipping_threshold", label: "Free shipping threshold ($)", type: "number", min: 0, default: 0, unit: "$" },
      { id: "free_shipping_bar", label: "Show free shipping progress bar", type: "toggle", default: false },
    ],
  },
  {
    /** Shopify's Currency format: "$48.00 USD" rather than "$48.00", on every price a section draws. */
    id: "currency",
    label: "Currency format",
    icon: "shopping-bag",
    fields: [
      { id: "currency_code_enabled", label: "Show currency codes", type: "toggle", default: false },
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
  {
    /**
     * THE CREATOR'S OWN CSS, for the whole storefront. Stored as typed and
     * drawn through cleanCustomCss (lib/storelib-theme/custom-css.ts): scoped
     * to the page, never able to leave its <style>, with what was left out
     * named under the box.
     */
    id: "custom_css",
    label: "Custom CSS",
    icon: "code",
    fields: [{ id: "custom_css", label: "Custom CSS", type: "css", placeholder: ".card__title { letter-spacing: 0.02em; }" }],
  },
]
