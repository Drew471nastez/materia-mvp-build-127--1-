/**
 * ===========================================================================
 *  GENERAL SETTINGS, IN TEN GROUPS
 * ===========================================================================
 * Every control here is read by something a visitor sees: the theme
 * stylesheet (lib/website-builder/theme-css.ts), the `theme` object a
 * section reads (lib/storelib-theme/resolve.ts), or the page itself
 * (components/website-builder/theme/ThemePage.tsx). tests/settings-cleanup
 * holds each id to a reader.
 *
 * TAKEN OUT OF THE PANEL, NOT OUT OF THE DATA. A key that is no longer here
 * stays in a saved theme and is still read where it was read:
 *
 *   SEO (seo_*)                 Website settings › SEO & Social.
 *   Announcement bar            The Announcement bar section, in the Header
 *     (announcement_bar_*)      group. A site that still has the old bar on
 *                               sees the Old announcement bar switch below,
 *                               and only that, until it turns it off.
 *   Page colours other than     Each section's colour scheme. The page's
 *     the three below           own --theme-* properties are still written.
 *   button_size                 Never reached a button.
 *   button_font_weight          Typography › Button, which it seeds.
 *   brand_image_width           Read by nothing.
 *   container_radius,           Layout › Card corner radius and Card
 *     container_shadow          shadow, which reach the same boxes.
 */
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

/** The six controls a product card and a collection card share, under their own keys. */
function cardFields(kind: "product" | "collection"): ThemeSettingsGroup["fields"] {
  return [
    {
      id: `${kind}_card_style`,
      label: "Style",
      type: "radio",
      default: "standard",
      options: [
        { label: "Standard", value: "standard" },
        { label: "Card", value: "card" },
      ],
    },
    { id: `${kind}_card_image_padding`, label: "Image padding", type: "range", min: 0, max: 24, step: 2, default: 0, unit: "px" },
    {
      id: `${kind}_card_align`,
      label: "Text alignment",
      type: "radio",
      default: "left",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
      ],
    },
    { id: `${kind}_card_radius`, label: "Corner radius", type: "range", min: 0, max: 40, step: 1, default: 8, unit: "px" },
    { id: `${kind}_card_border`, label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 0, unit: "px" },
    { id: `${kind}_card_shadow`, label: "Shadow", type: "select", default: "none", options: SHADOWS_OPTIONS },
  ]
}

export const THEME_SETTINGS_GROUPS: ThemeSettingsGroup[] = [
  {
    /*
      The store name, logo, logo height, favicon and tagline are drawn by
      BrandingTabPanel in the editor, kept in step with the header's Store
      Logo. The fields after the header are drawn as usual.
    */
    id: "branding",
    label: "Logo and brand",
    icon: "image",
    fields: [
      { id: "brand_name", label: "Store name", type: "text", placeholder: "My Store" },
      { id: "logo_url", label: "Logo image", type: "image" },
      { id: "logo_width", label: "Logo width (px)", type: "range", min: 60, max: 300, step: 10, default: 120, unit: "px" },
      { id: "favicon_url", label: "Favicon", type: "image" },
      { id: "tagline", label: "Tagline", type: "text", placeholder: "Your trusted digital store" },
      /**
       * WHO THE SHOP IS, in Shopify's words: a headline, a description and a
       * picture. Any text setting can show them through Insert shop data
       * (`{{ shop.brand_headline }}`), and a section reads them as
       * `theme.brand`.
       */
      { id: "hdr_brand", label: "Brand information", type: "header", info: "Not drawn anywhere by itself. A section shows it where you insert it: in any text box, Insert shop data › Brand headline, Brand description or Brand image. Store name, logo and favicon above are the header's and the browser tab's." },
      { id: "brand_headline", label: "Headline", type: "text", placeholder: "Small batch candles, poured in Leeds" },
      { id: "brand_description", label: "Description", type: "textarea", placeholder: "A few lines about what you make and why" },
      { id: "brand_image", label: "Image", type: "image" },
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
    /*
      Shown inside the Colors panel, behind "Page colors". Not a top-level
      group: a section paints with its scheme, so these are only what is
      behind and around the sections. Background and text paint the page
      root; Primary is the cart notice's button, the free shipping bar and
      the cookie banner's accent.
    */
    id: "colors",
    label: "Page colors",
    icon: "palette",
    fields: [
      { id: "background_color", label: "Page background", type: "color", default: "#ffffff" },
      { id: "text_color", label: "Page text", type: "color", default: "#0f172a" },
      { id: "primary_color", label: "Primary", type: "color", default: "#6366f1" },
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
      // Sizes, weights, line heights, spacing and case are the text styles
      // (Heading 1 to Caption) in theme.typography_styles, rendered by
      // TypographyPanel, each with a desktop and a phone size. The older
      // flat controls (font_size_base, line_height_base, heading_weight,
      // heading_transform, heading_letter_spacing, button_font_weight) still
      // seed those styles' defaults.
    ],
  },
  {
    /*
      Every button a section marks as one (buttonSelector in
      lib/storelib-theme/typography.ts), the option buttons a product's
      variants are picked with (`[data-variant-pill]`), and every text box,
      dropdown and text area a section draws.
    */
    id: "buttons",
    label: "Buttons and inputs",
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
      { id: "button_border_radius", label: "Corner radius when rounded", type: "range", min: 0, max: 32, step: 1, default: 8, unit: "px" },
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
      { id: "hdr_pills", label: "Variant pills", type: "header" },
      { id: "pill_radius", label: "Corner radius", type: "range", min: 0, max: 40, step: 1, default: 40, unit: "px" },
      { id: "pill_border_width", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 1, unit: "px" },
      { id: "hdr_inputs", label: "Text boxes", type: "header" },
      { id: "input_radius", label: "Corner radius", type: "range", min: 0, max: 24, step: 1, default: 8, unit: "px" },
      { id: "input_border_width", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 1, unit: "px" },
      { id: "input_border_opacity", label: "Border opacity", type: "range", min: 10, max: 100, step: 5, default: 25, unit: "%" },
    ],
  },
  {
    /*
      The page's frame (lib/website-builder/theme-css.ts): width, side
      padding and the space between sections, read by every section through
      --theme-page-width, --theme-padding-x, --theme-spacing-scale and the
      section gap rule. Then the corners and shadows of what sits in a
      section: cards (`theme.radius.medium`, `[data-container]`), pictures
      (`[data-media]`), dropdowns (`[data-popup]`), and the breadcrumb bar
      (lib/website-builder/theme-breadcrumbs.ts).
    */
    /*
      The defaults are what a site that never opened Layout is drawn with
      (theme-css.ts): 1280 and 24. They said 1240 and 32, so the sliders
      started on numbers the page was not using.
    */
    id: "layout",
    label: "Layout",
    icon: "layout",
    fields: [
      { id: "page_width", label: "Max page width", type: "range", min: 900, max: 1800, step: 20, default: 1280, unit: "px" },
      { id: "content_padding_x", label: "Side padding", type: "range", min: 8, max: 80, step: 4, default: 24, unit: "px" },
      { id: "section_gap", label: "Section gap", type: "range", min: 0, max: 80, step: 4, default: 0, unit: "px" },
      { id: "spacing_scale", label: "Spacing scale", type: "range", min: 0.5, max: 2.0, step: 0.1, default: 1.0, info: "Multiplies every section's top and bottom padding." },
      { id: "hdr_cards", label: "Cards", type: "header" },
      { id: "border_radius", label: "Card corner radius", type: "range", min: 0, max: 24, step: 1, default: 8, unit: "px" },
      { id: "card_shadow", label: "Card shadow", type: "select", default: "none", options: SHADOWS_OPTIONS },
      { id: "container_border", label: "Card border thickness", type: "range", min: 0, max: 4, step: 1, default: 0, unit: "px" },
      { id: "hdr_media", label: "Images and video", type: "header" },
      { id: "image_border_radius", label: "Corner radius", type: "range", min: 0, max: 24, step: 1, default: 8, unit: "px" },
      { id: "media_border", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 0, unit: "px" },
      { id: "media_shadow", label: "Shadow", type: "select", default: "none", options: SHADOWS_OPTIONS },
      { id: "hdr_popups", label: "Dropdowns and pop-ups", type: "header" },
      { id: "popup_radius", label: "Corner radius", type: "range", min: 0, max: 24, step: 1, default: 12, unit: "px" },
      { id: "popup_border", label: "Border thickness", type: "range", min: 0, max: 4, step: 1, default: 1, unit: "px" },
      { id: "popup_shadow", label: "Shadow", type: "select", default: "md", options: SHADOWS_OPTIONS },
      { id: "hdr_breadcrumbs", label: "Breadcrumbs", type: "header" },
      { id: "breadcrumbs_enabled", label: "Show on every page but home", type: "toggle", default: true },
      { id: "breadcrumbs_separator", label: "Separator", type: "select", default: "slash",
        options: [
          { label: "/  Slash", value: "slash" },
          { label: "›  Chevron", value: "chevron" },
          { label: "Thin chevron", value: "line" },
          { label: "→  Arrow", value: "arrow" },
          { label: "·  Dot", value: "dot" },
          { label: "|  Line", value: "pipe" },
        ],
      },
      { id: "breadcrumbs_style", label: "Style", type: "select", default: "plain",
        options: [
          { label: "Plain", value: "plain" },
          { label: "Pill", value: "pill" },
        ],
      },
      { id: "breadcrumbs_home_icon", label: "Home as an icon", type: "toggle", default: false },
    ],
  },
  {
    /**
     * PRODUCT AND COLLECTION CARDS, AS SHOPIFY'S THEME SETTINGS HAVE THEM.
     * Drawn by the theme stylesheet (lib/website-builder/theme-css.ts) on
     * every element marked `data-card="product"` or `data-card="collection"`,
     * and only once a value is set here, so a site that never opened the
     * group looks exactly as it did. Then the Sale and Sold out badges, and
     * what Add to cart does.
     */
    id: "product_cards",
    label: "Product cards",
    icon: "shopping-bag",
    fields: [
      { id: "hdr_product_cards", label: "Product cards", type: "header" },
      ...cardFields("product"),
      { id: "hdr_collection_cards", label: "Collection cards", type: "header" },
      ...cardFields("collection"),
      /*
        The Sale and Sold out labels on a product card. Sale appears when a
        product has a price to compare against; Sold out when its stock has
        run out. Their colours are the badges', not the section's.
      */
      { id: "hdr_badges", label: "Badges", type: "header" },
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
      { id: "badge_sale_text", label: "Sale label", type: "text", placeholder: "Sale", default: "Sale" },
      { id: "badge_sale_bg", label: "Sale background", type: "color", default: "#dc2626" },
      { id: "badge_sale_color", label: "Sale text", type: "color", default: "#ffffff" },
      { id: "badge_soldout_bg", label: "Sold out background", type: "color", default: "#1a1a2e" },
      { id: "badge_soldout_color", label: "Sold out text", type: "color", default: "#ffffff" },
      /* Shopify's Currency format: "$48.00 USD" rather than "$48.00", on every price a section draws. */
      { id: "currency_code_enabled", label: "Show currency codes", type: "toggle", default: false },
    ],
  },
  {
    /*
      CART AND CHECKOUT, A GROUP OF ITS OWN. It shared one group with the
      product cards, so what a card looks like and what Add to cart does sat
      in one long list. Same keys, read where they always were.
    */
    id: "cart",
    label: "Cart and checkout",
    icon: "shopping-cart",
    fields: [
      /*
        WHAT ADD TO CART DOES, as Shopify asks it: open the cart drawer, go
        to the cart page, or show a short notice and stay. The value is the
        theme's, read as `theme.cart.type` and on the page root as
        `data-cart-type`; SiteCartProvider (site-cart.tsx) does it on Add to
        cart. The free shipping bar reads the same cart's subtotal.
      */
      {
        id: "cart_type",
        label: "When someone adds to cart",
        type: "select",
        default: "drawer",
        options: [
          { label: "Open the cart drawer", value: "drawer" },
          { label: "Go to the cart page", value: "page" },
          { label: "Show a short notice", value: "notification" },
        ],
      },
      { id: "free_shipping_threshold", label: "Free shipping threshold ($)", type: "number", min: 0, default: 0, unit: "$", info: "0 uses the amount from your shipping rates." },
      { id: "free_shipping_bar", label: "Show free shipping progress bar", type: "toggle", default: false },
    ],
  },
  {
    id: "social",
    label: "Social links",
    icon: "share-2",
    fields: [
      /* One field per platform, in the order the icons are drawn: see
         lib/website-builder/social-links.ts, which the footer and the
         header read too. Only the ones filled in are drawn. */
      ...SOCIAL_PLATFORMS.map((p) => ({
        id: p.key,
        label: p.key === "social_twitter" ? "X (Twitter)" : p.label,
        type: (p.key === "social_email" ? "text" : "link") as "text" | "link",
        placeholder: p.placeholder,
      })),
      { id: "social_show_in_footer", label: "Show icons in footer", type: "toggle", default: true },
      { id: "social_show_in_header", label: "Show icons in header", type: "toggle", default: false },
    ],
  },
  {
    /*
      THE COOKIE BANNER, A THEME SETTING. It is part of how the site looks
      and reads, so it is set beside the colours and fonts, with the page
      drawn next to it, rather than in Website settings › Policies, which
      now opens this group. Same keys as before, read by ThemePage
      (SiteCookieStyle) into the one consent banner. The colours only show
      once "Use my own colours" is on (visible_if).
    */
    id: "cookies",
    label: "Cookie banner",
    icon: "cookie",
    fields: [
      { id: "cookie_banner_show", label: "Show the cookie banner", type: "toggle", default: true, info: "Off: no banner, and nothing optional is stored for your visitors." },
      { id: "cookie_banner_text", label: "Message", type: "textarea", default: SITE_COOKIE_TEXT, visible_if: "{{ section.settings.cookie_banner_show }}" },
      { id: "cookie_accept_text", label: "Accept button", type: "text", default: COOKIE_ACCEPT_TEXT, visible_if: "{{ section.settings.cookie_banner_show }}" },
      { id: "cookie_decline_text", label: "Reject button", type: "text", default: COOKIE_DECLINE_TEXT, visible_if: "{{ section.settings.cookie_banner_show }}" },
      { id: "cookie_banner_enabled", label: "Use my own colours", type: "toggle", default: false, info: "Off: white with dark text.", visible_if: "{{ section.settings.cookie_banner_show }}" },
      { id: "cookie_bg", label: "Background", type: "color", default: "#0f172a", visible_if: "{{ section.settings.cookie_banner_show and section.settings.cookie_banner_enabled }}" },
      { id: "cookie_text_color", label: "Text", type: "color", default: "#ffffff", visible_if: "{{ section.settings.cookie_banner_show and section.settings.cookie_banner_enabled }}" },
    ],
  },
  {
    id: "animations",
    label: "Animations",
    icon: "sparkles",
    fields: [
      /* Off until switched on, which is what every page has always drawn (section-anchors.ts themeAnimation): the panel said on while nothing moved, and a section's Animation read "Same as theme (None)". */
      { id: "animations_enabled", label: "Enable scroll animations", type: "toggle", default: false },
      {
        id: "animation_style",
        label: "Animation style",
        type: "select",
        default: "fade-up",
        /*
          The page's default; each section can choose its own in its panel
          (Animation), so a page can have one section from the left, the next
          from the right and another that zooms. Alternate sides does that
          turn by turn on its own.
        */
        options: [
          { label: "Fade up", value: "fade-up" },
          { label: "Fade", value: "fade-in" },
          { label: "Rise", value: "rise" },
          { label: "Blur in", value: "blur-in" },
          { label: "Zoom", value: "zoom-in" },
          { label: "From the right", value: "slide-left" },
          { label: "From the left", value: "slide-right" },
          { label: "Alternate sides", value: "alternate" },
        ],
        info: "Each section can pick its own in its settings.",
      },
      { id: "animation_duration", label: "Duration (ms)", type: "range", min: 200, max: 1200, step: 50, default: 600, unit: "ms" },
      { id: "animation_stagger", label: "Stagger delay (ms)", type: "range", min: 0, max: 200, step: 10, default: 80, unit: "ms" },
      /*
        THE INTRO: a screen with the creator's own mark that plays as a
        visitor arrives, then lifts away. Drawn on the live site only
        (components/website-builder/theme/site-intro.tsx).
      */
      { id: "hdr_intro", label: "Intro", type: "header" },
      { id: "intro_enabled", label: "Show an intro when someone opens the site", type: "toggle", default: false },
      { id: "intro_video", label: "Video", type: "video_picker", info: "Plays muted, then the site opens. Leave empty to use a picture." },
      { id: "intro_image", label: "Picture or GIF", type: "image", info: "Empty uses your logo, or your store name when there is no logo." },
      { id: "intro_background", label: "Background", type: "color", default: "#ffffff" },
      {
        id: "intro_style",
        label: "Arrives by",
        type: "select",
        default: "grow",
        options: [
          { label: "Growing in", value: "grow" },
          { label: "Fading in", value: "fade" },
          { label: "Rising", value: "rise" },
          { label: "Fading in, then lifting away", value: "reveal" },
        ],
      },
      { id: "intro_duration", label: "On screen for (ms)", type: "range", min: 800, max: 6000, step: 100, default: 1800, unit: "ms" },
      { id: "intro_size", label: "Size (px)", type: "range", min: 60, max: 480, step: 10, default: 160, unit: "px" },
      {
        id: "intro_repeat",
        label: "Shows",
        type: "select",
        default: "session",
        options: [
          { label: "Once per visit", value: "session" },
          { label: "On every page load", value: "always" },
        ],
      },
      /* Between two pages of the site: the browser's own view transition (site-intro.tsx). */
      { id: "hdr_page_transition", label: "Page transitions", type: "header" },
      {
        id: "page_transition",
        label: "Between pages",
        type: "select",
        default: "none",
        options: [
          { label: "None", value: "none" },
          { label: "Fade", value: "fade" },
          { label: "Slide", value: "slide" },
          { label: "Rise", value: "rise" },
        ],
      },
      { id: "page_transition_duration", label: "Transition length (ms)", type: "range", min: 150, max: 800, step: 50, default: 300, unit: "ms" },
    ],
  },
  {
    /*
      THE OLD ANNOUNCEMENT BAR. The bar is a section now, in the Header
      group, with its own colours and messages. ThemePage still draws the
      old one for a site that switched it on, so that site sees this switch
      and nobody else does (shownWhen).
    */
    id: "announcement",
    label: "Old announcement bar",
    icon: "megaphone",
    shownWhen: "announcement_bar_enabled",
    fields: [
      {
        id: "announcement_bar_enabled",
        label: "Show the old announcement bar",
        type: "toggle",
        default: false,
        info: "Replaced by the Announcement bar section in the Header group. Add one there, then turn this off.",
      },
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
