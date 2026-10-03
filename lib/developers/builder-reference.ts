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
}

/** How the section panel draws each type, beyond what the registry says it is. */
export const CONTROL_PANEL_NOTES: Partial<Record<ControlType, string>> = {
  text: "A one-line box. A text setting whose id or label says gradient is drawn as the gradient editor instead.",
  textarea: "A box that grows as you type.",
  richtext: "A small editor with Paragraph, Heading 2 to 4, Bold, Italic, Link, bulleted and numbered lists. Pasting brings in plain text.",
  number: "A number box that keeps to its min, max and step. With `responsive`, a Desktop, Tablet, Phone switch sits above it.",
  toggle: "A switch.",
  checkbox: "The same switch as toggle. Prefer toggle in new sections.",
  select: "A dropdown.",
  radio: "Buttons side by side when there are three options or fewer, a dropdown when there are more.",
  range: "A slider with the number and unit beside it. Can be responsive.",
  color: "A swatch and its hex. It opens in place with a colour field, a hue slider, the hex and the colours already on the page. Hidden in a section panel, where colours come from the scheme.",
  color_scheme: "The scheme picker at the top of the section panel, each scheme painted in its own colours, with Edit beside each one.",
  font_picker: "A dropdown whose options are drawn in their own font.",
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
    does: "How tall the logo is drawn. The Branding panel shows it as Logo height.",
    as: { label: "Logo height", min: 24, max: 120, value: 40, unit: "px" },
  },
  favicon_url: { does: "The small icon in the browser tab. A square image, 64 by 64 or larger." },
  tagline: { does: "A line under the store's name, where a section or the footer shows it." },

  primary_color: { does: "The page's main colour, outside any section." },
  primary_hover_color: { does: "The main colour under the pointer." },
  secondary_color: { does: "A second colour for the page's own parts." },
  accent_color: { does: "Small highlights outside sections." },
  background_color: { does: "The page behind every section." },
  surface_color: { does: "Cards and panels outside sections." },
  surface_alt_color: { does: "A second, slightly different surface." },
  text_color: { does: "Headings outside sections." },
  text_secondary_color: { does: "Body text outside sections." },
  text_muted_color: { does: "Captions and quiet text outside sections." },
  border_color: { does: "Lines and borders outside sections." },
  link_color: { does: "Links outside any section." },
  link_hover_color: { does: "Those links under the pointer." },
  success_color: { does: "Confirmations, such as a sign-up that went through." },
  error_color: { does: "Errors, such as a form that needs fixing." },

  font_heading: { does: "The font every heading style uses unless a style says otherwise." },
  font_body: { does: "The font for body text and buttons." },
  font_accent: { does: "A third font a text style can pick. Empty means the heading font." },

  button_style: { does: "What a button looks like before a section changes it: filled, outlined or text only." },
  button_shape: { does: "Square corners, rounded, or fully round ends." },
  button_border_radius: { does: "Exactly how round a rounded button is." },
  button_size: { does: "The default padding and text size of a button." },
  button_font_weight: { does: "How heavy button text is." },
  button_shadow: { does: "A soft shadow under every button." },
  button_transition: { does: "What a button does under the pointer." },

  page_width: { does: "The widest the content of a section gets on a large screen." },
  content_padding_x: { does: "The space between content and the screen's edges." },
  section_gap: { does: "Space added between every two sections." },
  spacing_scale: { does: "Multiplies every section's own spacing: below 1 tighter, above 1 roomier." },
  border_radius: { does: "How round the corners of cards are." },
  card_shadow: { does: "How much shadow a card casts." },
  image_border_radius: { does: "How round the corners of images are." },

  animations_enabled: { does: "Sections ease in as they scroll into view. Visitors who ask their device for less motion never see it." },
  animation_style: { does: "How a section arrives: rising, fading, sliding or growing." },
  animation_duration: { does: "How long the arrival takes." },
  animation_stagger: { does: "The delay between items arriving in a row, such as cards." },

  announcement_bar_enabled: { does: "A thin bar across the top of every page." },
  announcement_bar_text: { does: "What the bar says." },
  announcement_bar_messages: { does: "More messages, one per line. With more than one, the bar shows them in turn, with arrows to move between them; it stops while the pointer or the keyboard is on it, and does not move by itself for a visitor who asks their device for less motion." },
  announcement_bar_rotate: { does: "How long each message stays before the next one." },
  announcement_bar_link_text: { does: "The words of the link at the end of the bar." },
  announcement_bar_link_url: { does: "Where that link goes." },
  announcement_bar_bg: { does: "The bar's colour." },
  announcement_bar_color: { does: "The colour of the bar's text." },
  announcement_bar_scrolling: { does: "The message moves across the bar instead of standing still." },
  announcement_bar_dismissible: { does: "Visitors can close the bar with an X." },

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
  social_show_in_header: { does: "Shows an icon for each filled-in profile in the header." },
  social_show_in_footer: { does: "Shows them in the footer." },

  free_shipping_threshold: { does: "The order total above which shipping is free. 0 turns it off." },
  free_shipping_bar: { does: "Shows the cart how far it is from free shipping." },

  seo_title: { does: "The title search results and browser tabs show when a page has none of its own." },
  seo_description: { does: "The sentence search results show under the title." },
  seo_og_image: { does: "The picture a link to your site shows when it is shared." },
  seo_twitter_card: { does: "A small or a large picture when a link is shared on X." },
  seo_robots: { does: "Off asks search engines not to list the site." },

  cookie_banner_show: { does: "Shows the cookie banner, which asks visitors before storing anything optional. Off: no banner, and nothing optional is stored for the site's visitors. On unless switched off." },
  cookie_banner_enabled: { does: "Use my own colours: the banner takes the two colours below instead of Storelib's white." },
  cookie_banner_text: { does: "What the banner says. Starts as the site's default sentence." },
  cookie_accept_text: { does: "The words on the accept button." },
  cookie_decline_text: { does: "The words on the reject button." },
  cookie_bg: { does: "The banner's colour." },
  cookie_text_color: { does: "The banner's text colour." },

  menus: {
    does: "Named lists of links, two levels deep, that a section shows through a `link_list` setting. Each menu gets a handle from its first name, such as `footer`, which is what a section stores. The header's own links are the menu `main-menu` without being made here.",
    as: { control: "picker", value: "Main menu, Footer" },
  },
}

const THEME_DRAWN_AS: Record<string, SpecimenControl> = {
  text: "text", textarea: "textarea", richtext: "richtext", number: "number", toggle: "toggle", checkbox: "toggle",
  select: "select", radio: "radio", range: "range", color: "color", font: "font", font_picker: "font", image: "image",
  image_picker: "image", link: "url", url: "url", color_scheme: "color_scheme",
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
    items: g.fields.map(fieldSpecimen),
  }))
}

/** Every theme setting id, for the test that every one is described. */
export function themeSettingIds(): string[] {
  return THEME_SETTINGS_GROUPS.flatMap((g) => g.fields.map((f) => f.id))
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
    const size = s.size.desktop === s.size.tablet && s.size.tablet === s.size.mobile
      ? `${s.size.desktop}`
      : `${s.size.desktop} / ${s.size.tablet} / ${s.size.mobile}`
    return [TYPE_STYLE_LABELS[k], `\`${k}\``, s.font, s.weight, size, String(s.line_height), s.letter_spacing ? String(s.letter_spacing) : "0"]
  })
}
