/**
 * ===========================================================================
 *  THE WEBSITE BUILDER'S SETTINGS, AS THE GUIDE DRAWS THEM
 * ===========================================================================
 * The Builder guide page (content/developers/website-builder.md) shows every
 * control a section can declare and every theme setting in General Settings,
 * each drawn as the control the builder draws, with its default. The lists
 * are read from the modules the builder itself reads:
 *
 *   lib/storelib-theme/controls/registry.ts        every control type
 *   lib/website-builder/theme-settings-schema.ts   every theme setting
 *   lib/storelib-theme/color-schemes.ts            the built-in schemes
 *   lib/storelib-theme/typography.ts               the text styles
 *
 * so a setting added there is on the page the next time it is drawn. What a
 * setting DOES is words the schema does not carry; they are here, keyed by
 * the setting's id, and tests/developer-hub.test.ts fails the moment a
 * setting exists that this file has not described.
 */
import { CONTROLS, CONTROL_TYPES, type ControlType } from "@/lib/storelib-theme/controls/registry"
import { BUILT_IN_SCHEME_KEYS, DEFAULT_COLOR_SCHEMES, SCHEME_COLOR_GROUPS, SCHEME_COLOR_LABELS } from "@/lib/storelib-theme/color-schemes"
import { DEFAULT_TYPE_STYLES, TYPE_STYLE_KEYS, TYPE_STYLE_LABELS } from "@/lib/storelib-theme/typography"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SchemaField } from "@/lib/website-builder/types"

/** How a specimen is drawn. The builder's own control for that kind of value. */
export type SpecimenControl =
  | "text" | "textarea" | "richtext" | "number" | "toggle" | "select" | "radio" | "range"
  | "color" | "color_scheme" | "font" | "alignment" | "image" | "image_gallery" | "video"
  | "file" | "icon" | "url" | "picker" | "header" | "paragraph" | "divider"

export interface Specimen {
  id: string
  label: string
  control: SpecimenControl
  value?: string | number | boolean | null
  options?: string[]
  min?: number
  max?: number
  unit?: string
  placeholder?: string
  /** What it changes, in a sentence. Inline markdown. */
  does: string
}

export interface SchemeSwatch {
  key: string
  name: string
  colors: { group: string; label: string; value: string }[]
}

/* ── every control type ─────────────────────────────────────────────── */

const CONTROL_DRAWN_AS: Record<ControlType, SpecimenControl> = {
  text: "text", textarea: "textarea", richtext: "richtext", number: "number", toggle: "toggle",
  checkbox: "toggle", select: "select", radio: "radio", range: "range", color: "color",
  color_scheme: "color_scheme", font_picker: "font", alignment: "alignment", image_picker: "image",
  image_gallery: "image_gallery", video_picker: "video", file_picker: "file", community_picker: "picker",
  icon_picker: "icon", url: "url", page_picker: "picker", product_picker: "picker", header: "header",
  paragraph: "paragraph", divider: "divider",
  color_background: "color", inline_richtext: "richtext", html: "textarea", datetime: "text",
  focal_point: "image", video_url: "url", product_list: "picker", link_list: "picker",
  collection_picker: "picker", collection_list: "picker",
}

/** How the section panel draws each type, beyond what the registry says it is. */
export const CONTROL_PANEL_NOTES: Partial<Record<ControlType, string>> = {
  text: "A one-line box. A text setting whose id or label says gradient is drawn as the gradient editor instead.",
  textarea: "A box that grows as you type.",
  richtext: "A small editor with Paragraph, Heading 2 to 4, Bold, Italic, Link, bulleted and numbered lists. Pasting brings in plain text.",
  number: "A number box that keeps to its min, max and step, with the `unit` (px, %, s) inside its right edge. With `responsive`, a Desktop, Tablet, Phone switch sits above it.",
  toggle: "A switch.",
  checkbox: "The same switch as toggle. Prefer toggle in new sections.",
  select: "A dropdown.",
  radio: "Buttons side by side when there are three options or fewer, a dropdown when there are more.",
  range: "A slider with the number and unit beside it. Can be responsive.",
  color: "A swatch and its hex. It opens in place with a colour field, a hue slider, the hex and the colours already on the page. Hidden in a section panel, where colours come from the scheme.",
  color_scheme: "The scheme picker at the top of the section panel, each scheme painted in its own colours, with Edit beside each one.",
  font_picker: "A dropdown of the fonts Theme settings › Typography offers, each drawn in its own face, with The theme's font at the top. A family picked here is loaded on the page.",
  alignment: "Three buttons: left, centre, right. Can be responsive.",
  image_picker: "A dashed box: Add Image, click to upload or drag in. Filled, it shows the picture with Replace and Remove. JPEG, PNG, GIF, WebP, SVG or AVIF under 5 MB.",
  image_gallery: "A stack of image pickers, with an empty one at the end to add another.",
  video_picker: "The video, with an X to clear it, and a box to paste a hosted video link.",
  file_picker: "A box for a file's address.",
  community_picker: "A dropdown of your own communities, each saying when a visitor would not see it (a draft, a private one).",
  icon_picker: "A searchable grid of icons.",
  url: "The link picker: a search over your pages and products, or any address typed in (`/about`, `https://…`, `mailto:`).",
  page_picker: "A dropdown of the site's pages.",
  product_picker: "A dropdown of your products.",
  header: "A small heading that divides a long panel. Holds no value.",
  paragraph: "A line of help text in the panel. Holds no value.",
  divider: "A line across the panel. Holds no value.",
  color_background: "Solid or Gradient. Solid is the colour field; Gradient is the gradient editor with its stops, angle and the page's own colours.",
  inline_richtext: "One line you write in, with Bold, Italic and Link above it. Enter does not start a new line.",
  html: "A code box for pasted markup. What is not allowed is removed when it is saved, and the box says so.",
  datetime: "A date and a time, picked with the device's own picker. Clear empties it.",
  focal_point: "The picture it belongs to, with a point to drag or tap to where the picture should stay in view when it is cropped.",
  video_url: "A box to paste a YouTube or Vimeo link. It says which video it found, or why the link is not one.",
  product_list: "Your products in the order you chose, each with Up, Down and Remove, and Add product to pick more from your shop.",
  collection_picker: "Your collection with its picture and how many products are in it, a Change button that opens your collections with a search box, and an X to clear it. A hidden collection is marked Hidden.",
  collection_list: "Your collections in the order you chose, each with Up, Down and Remove, and Add collection to pick more.",
  link_list: "A dropdown of the site's menus. Menus are made in Theme settings › Menus; the header's own links are always there as Main menu.",
}

/**
 * WHERE THE REGISTRY'S OWN SENTENCE IS NOT WHAT SHIPS. The registry describes
 * a page picker as holding a page "by key" and a product picker a product
 * "by id"; the builder's panel stores the address it links to, which is what
 * a template then prints (app/website-builder/editor/[installId]/page.tsx,
 * the page_picker and product_picker branch of FieldEditor). The colour
 * scheme's sentence points at an internal document. The hub says what the
 * builder does; tests/developer-hub.test.ts keeps these keys to real types.
 */
export const CONTROL_DESCRIPTIONS: Partial<Record<ControlType, string>> = {
  color_scheme:
    "One of the theme's colour schemes, by key: the built-in `white`, `light`, `dark`, `black` and `highlight` (Light, Soft, Dark, Brand and Accent in the builder) or one the creator added.",
  page_picker:
    "One of the site's pages. The builder stores the page's address, such as `/about`, `/products` or `/` for home, so print it through the `url` filter.",
  product_picker:
    "One of the creator's products. The builder stores the product page's address, `/products/<slug>`, so print it through the `url` filter.",
}

/** What a control is, in a sentence: the registry's words, unless the builder does otherwise. */
export function controlDescription(t: ControlType): string {
  return CONTROL_DESCRIPTIONS[t] ?? CONTROLS[t].description
}

function exampleValue(ex: Record<string, unknown>): Specimen["value"] {
  const d = ex.default
  return typeof d === "string" || typeof d === "number" || typeof d === "boolean" ? d : null
}

/** A stored default as the option label a dropdown shows for it: "md" is drawn as "Medium". */
function shownDefault(options: unknown, value: Specimen["value"]): Specimen["value"] {
  if (!Array.isArray(options) || typeof value !== "string") return value
  const hit = options.find((o) => (typeof o === "string" ? o === value : String((o as { value?: unknown }).value) === value))
  if (hit === undefined) return value
  return typeof hit === "string" ? hit : String((hit as { label?: unknown }).label ?? value)
}

function optionLabels(options: unknown): string[] | undefined {
  if (!Array.isArray(options)) return undefined
  return options.map((o) =>
    typeof o === "string" ? o : String((o as { label?: unknown; value?: unknown }).label ?? (o as { value?: unknown }).value ?? ""),
  )
}

export function controlSpecimens(): Specimen[] {
  return CONTROL_TYPES.map((t) => {
    const c = CONTROLS[t]
    const ex = c.example as Record<string, unknown>
    return {
      id: t,
      label: typeof ex.label === "string" ? ex.label : c.label,
      control: CONTROL_DRAWN_AS[t],
      value: shownDefault(ex.options, exampleValue(ex)),
      options: optionLabels(ex.options),
      min: typeof ex.min === "number" ? ex.min : undefined,
      max: typeof ex.max === "number" ? ex.max : undefined,
      unit: typeof ex.unit === "string" ? ex.unit : undefined,
      does: `${controlDescription(t)} ${CONTROL_PANEL_NOTES[t] ?? ""}`.trim(),
    }
  })
}

/* ── every theme setting ────────────────────────────────────────────── */

/**
 * What each theme setting changes. `as` is where the panel draws a setting
 * differently from its schema entry, so the picture matches the builder.
 */
export const THEME_SETTING_DOCS: Record<string, { does: string; as?: Partial<Specimen> }> = {
  brand_name: { does: "The store's name, used by the header when there is no logo and in the page title." },
  logo_url: { does: "The logo in the header. Kept in step with the header's own Store Logo." },
  logo_width: {
    does: "How tall the logo is drawn. The Logo and brand panel shows it as Logo height.",
    as: { label: "Logo height", min: 24, max: 120, value: 40, unit: "px" },
  },
  favicon_url: { does: "The small icon in the browser tab. A square image, 64 by 64 or larger." },
  tagline: { does: "A line under the store's name, where a section or the footer shows it." },

  primary_color: { does: "The colour of the page's own parts outside any section: the cart notice's button, the free shipping bar and the cookie banner's accent." },
  background_color: { does: "The page behind every section, and the browser's own background around it on a phone." },
  text_color: { does: "Text on the page outside any section. Each section's text is its colour scheme's." },

  font_heading: { does: "The font every heading style uses unless a style says otherwise." },
  font_body: { does: "The font for body text and buttons." },
  font_accent: { does: "A third font a text style can pick. Empty means the heading font." },

  button_style: { does: "What a button looks like before a section changes it: filled, outlined or text only." },
  button_shape: { does: "Square corners, rounded, or fully round ends." },
  button_border_radius: { does: "Exactly how round a button is when Button shape is Rounded." },
  button_shadow: { does: "A small shadow under every button." },
  button_transition: { does: "What a button does under the pointer." },

  page_width: { does: "The widest the content of a section gets on a large screen." },
  content_padding_x: { does: "The space between content and the screen's edges." },
  section_gap: { does: "Space added between every two sections." },
  spacing_scale: { does: "Multiplies every section's own spacing: below 1 tighter, above 1 roomier." },
  border_radius: { does: "How round the corners of cards and boxes in sections are, read as `theme.radius.medium`." },
  card_shadow: { does: "How much shadow a card casts: the boxes a section marks `[data-container]`, such as a feature card or a plan. None until you pick one." },
  image_border_radius: { does: "How round the corners of pictures and videos in sections are, on every `[data-media]`." },

  breadcrumbs_enabled: { does: "A Home > Shop > product trail under the header on every page but the home page. A page with breadcrumbs of its own keeps those instead." },
  breadcrumbs_separator: { does: "What sits between the steps of the trail: a slash, a chevron or a dot." },

  animations_enabled: { does: "Sections ease in as they scroll into view. Visitors who ask their device for less motion never see it." },
  animation_style: { does: "How a section arrives: rising, fading, sliding or growing." },
  animation_duration: { does: "How long the arrival takes." },
  animation_stagger: { does: "The delay between items arriving in a row, such as cards." },

  pill_radius: { does: "How round the option buttons a product's variants are picked with are. Drawn on every `[data-variant-pill]` once set." },
  pill_border_width: { does: "The thickness of those buttons' outline." },

  input_radius: { does: "How round every text box, dropdown and text area in a section is: search, sign in, newsletter, contact." },
  input_border_width: { does: "The thickness of their outline." },
  input_border_opacity: { does: "How strong that outline is, as a share of the section's text colour." },

  product_card_style: { does: "Standard puts the frame on the picture; Card puts it round the whole card, on a faint fill, with the words inset. On every `[data-card=\"product\"]`." },
  product_card_image_padding: { does: "Space between a product card's picture and its frame." },
  product_card_align: { does: "Product cards' words on the left or centred." },
  product_card_radius: { does: "How round a product card's corners are." },
  product_card_border: { does: "The thickness of a product card's outline. 0 is none." },
  product_card_shadow: { does: "How much shadow a product card casts." },

  collection_card_style: { does: "The same choice for collection cards: frame the picture, or the whole card. On every `[data-card=\"collection\"]`." },
  collection_card_image_padding: { does: "Space between a collection card's picture and its frame." },
  collection_card_align: { does: "Collection cards' words on the left or centred." },
  collection_card_radius: { does: "How round a collection card's corners are." },
  collection_card_border: { does: "The thickness of a collection card's outline." },
  collection_card_shadow: { does: "How much shadow a collection card casts." },

  container_border: { does: "The thickness of a card's outline, on every `[data-container]`. 0 is none." },

  media_border: { does: "An outline round pictures and videos in sections, on every `[data-media]`." },
  media_shadow: { does: "How much shadow they cast." },

  popup_radius: { does: "How round menus that drop down and boxes that pop up are, the header's dropdown among them." },
  popup_border: { does: "The thickness of their outline." },
  popup_shadow: { does: "How much shadow they cast." },

  badge_position: { does: "Which corner of a product card's picture the Sale and Sold out labels sit in." },
  badge_radius: { does: "How round those labels are." },
  badge_sale_show: { does: "A Sale label on a product with a price to compare against." },
  badge_sale_text: { does: "The words of that label. Sale unless you type others." },
  badge_sale_bg: { does: "The Sale label's colour." },
  badge_sale_color: { does: "The Sale label's text colour." },
  badge_soldout_bg: { does: "The Sold out label's colour." },
  badge_soldout_color: { does: "The Sold out label's text colour." },

  brand_headline: { does: "A line about the shop. Any text setting can show it with Insert shop data, `{{ shop.brand_headline }}`, and a section reads it as `theme.brand.headline`." },
  brand_description: { does: "A few lines about the shop, `{{ shop.brand_description }}` or `theme.brand.description`." },
  brand_image: { does: "A picture for the brand, `{{ shop.brand_image }}` or `theme.brand.image`." },

  announcement_bar_enabled: { does: "The old bar above the header, shown only to a site that still has it on. The Announcement bar section in the Header group replaced it; turn this off once you have added one." },

  social_twitter: { does: "Your X profile, for the social icons." },
  social_instagram: { does: "Your Instagram profile." },
  social_youtube: { does: "Your YouTube channel." },
  social_tiktok: { does: "Your TikTok profile." },
  social_linkedin: { does: "Your LinkedIn page." },
  social_discord: { does: "Your Discord server invite." },
  social_facebook: { does: "Your Facebook page." },
  social_pinterest: { does: "Your Pinterest profile." },
  social_twitch: { does: "Your Twitch channel." },
  social_github: { does: "Your GitHub profile." },
  social_threads: { does: "Your Threads profile." },
  social_snapchat: { does: "Your Snapchat profile." },
  social_bluesky: { does: "Your Bluesky profile." },
  social_whatsapp: { does: "A wa.me link that opens a chat with you on WhatsApp." },
  social_spotify: { does: "Your Spotify artist page, show or playlist." },
  social_soundcloud: { does: "Your SoundCloud profile." },
  social_website: { does: "Another website of yours, drawn as a globe." },
  social_email: { does: "An email address, drawn as an envelope that opens the visitor's mail app. Type the address; `mailto:` is added for you." },
  social_show_in_header: { does: "Shows the same icons in the header." },
  social_show_in_footer: { does: "Shows an icon for each filled-in link in the footer, in the footer's text colour, each named for its platform for screen readers. On unless switched off." },

  cart_type: { does: "What Add to cart does: open the cart drawer, go to the cart page, or show a short notice. Read as `theme.cart.type` and as `data-cart-type` on the page." },
  currency_code_enabled: { does: "Prices read $48.00 USD rather than $48.00, on every price a section draws from the shop." },
  free_shipping_threshold: { does: "The order total above which shipping is free. 0 turns it off." },
  free_shipping_bar: { does: "Shows the cart how far it is from free shipping." },



  custom_css: {
    does: "Your own CSS for every page of the site. Each rule is kept inside the page, so it cannot reach the builder; `@import`, scripts in values and addresses that are not https are left out, and the box says which.",
    as: { control: "textarea", value: ".card__title { letter-spacing: 0.02em; }" },
  },

  menus: {
    does: "Named lists of links, two levels deep, that a section shows through a `link_list` setting. They belong to the store, so every theme shows the same ones, and they are edited in Navigation. Each menu gets a handle from its first name, such as `footer`, which is what a section stores. The header's own links are the menu `main-menu` without being made here.",
    as: { control: "picker", value: "Main menu, Footer" },
  },
}

const THEME_DRAWN_AS: Record<string, SpecimenControl> = {
  text: "text", textarea: "textarea", richtext: "richtext", number: "number", toggle: "toggle", checkbox: "toggle",
  select: "select", radio: "radio", range: "range", color: "color", font: "font", font_picker: "font", image: "image",
  image_picker: "image", link: "url", url: "url", color_scheme: "color_scheme", css: "textarea",
}

function fieldSpecimen(f: SchemaField): Specimen {
  const doc = THEME_SETTING_DOCS[f.id]
  const base: Specimen = {
    id: f.id,
    label: f.label,
    control: THEME_DRAWN_AS[f.type as string] ?? "text",
    value: shownDefault(f.options, typeof f.default === "string" || typeof f.default === "number" || typeof f.default === "boolean" ? f.default : null),
    options: optionLabels(f.options),
    min: f.min,
    max: f.max,
    unit: f.unit,
    placeholder: f.placeholder,
    does: doc?.does ?? "",
  }
  return { ...base, ...(doc?.as ?? {}) }
}

/** The groups General Settings shows, in its order, each with its settings drawn. */
export function themeSettingGroups(): { id: string; label: string; items: Specimen[] }[] {
  return THEME_SETTINGS_GROUPS.filter((g) => g.fields.length > 0).map((g) => ({
    id: g.id,
    label: g.label,
    items: g.fields.filter((f) => f.type !== "header").map(fieldSpecimen),
  }))
}

/** Every theme setting id, for the test that every one is described. */
export function themeSettingIds(): string[] {
  return THEME_SETTINGS_GROUPS.flatMap((g) => g.fields.filter((f) => f.type !== "header").map((f) => f.id))
}

/* ── the built-in schemes and text styles ───────────────────────────── */

export function builtInSchemes(): SchemeSwatch[] {
  return BUILT_IN_SCHEME_KEYS.map((key) => {
    const s = DEFAULT_COLOR_SCHEMES[key]
    return {
      key,
      name: s.name,
      colors: SCHEME_COLOR_GROUPS.flatMap((g) => g.keys.map((k) => ({ group: g.label, label: SCHEME_COLOR_LABELS[k], value: s[k] }))),
    }
  })
}

export function typeStyleRows(): string[][] {
  return TYPE_STYLE_KEYS.map((k) => {
    const s = DEFAULT_TYPE_STYLES[k]
    const size = s.size.desktop === s.size.mobile ? `${s.size.desktop}` : `${s.size.desktop} / ${s.size.mobile}`
    return [TYPE_STYLE_LABELS[k], `\`${k}\``, s.font, s.weight, size, String(s.line_height), s.letter_spacing ? String(s.letter_spacing) : "0"]
  })
}
