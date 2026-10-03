import { BUILT_IN_SCHEME_KEYS, DEFAULT_COLOR_SCHEMES as ENGINE_DEFAULT_COLOR_SCHEMES, legacySchemeValues } from "@/lib/storelib-theme/color-schemes"

// ============================================================
// Website Builder: Core Types
// ============================================================

export type ThemeStatus = "draft" | "published" | "unpublished"

export interface Theme {
  id: string
  name: string
  slug: string
  description: string | null
  preview_image_url: string | null
  author: string
  version: string
  is_built_in: boolean
  is_free: boolean
  price_cents: number
  tags: string[]
  category: string | null
  created_at: string
  updated_at: string
}

export interface ThemeInstall {
  id: string
  creator_id: string
  theme_id: string
  name: string
  status: ThemeStatus
  is_custom: boolean
  parent_install_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  /** When it last went live. Null until RUN_THEME_PUBLISHED_AT.sql has run
   *  and the theme has been published since. */
  published_at?: string | null
  // Joined
  theme?: Theme
  settings?: ThemeSettings
  pages?: ThemePage[]
}

export interface ThemeSettings {
  id: string
  install_id: string
  settings: ThemeSettingsValues
  draft_settings: ThemeSettingsValues | null
  created_at: string
  updated_at: string
}

// ── Global color schemes ──────────────────────────────────────
// Each theme defines 5 named color schemes. Sections pick one via
// section.settings.color_scheme. The renderer resolves the scheme
// from theme.color_schemes and applies its colors as the section's
// defaults.
//
// Every color slot from the Storelib spec is mapped here. Optional
// fields default to sensible values from DEFAULT_COLOR_SCHEMES so
// older saved schemes keep working.
export interface ColorSchemeValues {
  // ── Header ──
  store_title: string
  nav_link: string

  // ── Section ──
  bg: string
  inset_border: string

  // ── Text ──
  heading: string
  paragraph: string
  link: string
  link_underline: string
  // Legacy / shared
  text: string
  border: string

  // ── Primary Button ──
  primary_btn_bg: string
  primary_btn_text: string
  primary_btn_border: string
  primary_btn_hover_bg: string
  primary_btn_hover_text: string
  primary_btn_hover_border: string

  // ── Secondary Button ──
  secondary_btn_bg: string
  secondary_btn_text: string
  secondary_btn_border: string
  secondary_btn_hover_bg: string
  secondary_btn_hover_text: string
  secondary_btn_hover_border: string

  // ── Footer ──
  footer_link: string
  footer_link_underline: string

  // ── Misc ──
  borders: string
  on_sale: string

  // ── Subscription Page ──
  plan_bg: string
  plan_border: string
  plan_heading: string
  plan_paragraph: string
  plan_link: string
  plan_link_underline: string

  // ── Subscription Login Page ──
  login_form_bg: string
  login_form_border: string

  // ── Slideshow Section ──
  slideshow_controls: string
  slideshow_controls_bg: string

  // ── Image Overlay ──
  image_overlay_bg: string
  image_overlay_text: string

  // ── Announcement Bar ──
  announcement_bg: string
  announcement_text: string

  // ── Image Collage ──
  collage_title: string
  collage_subtitle: string
  collage_bg: string
  collage_link: string
  collage_link_underline: string

  // ── Header Dropdown ──
  header_dropdown_bg: string
  header_dropdown_link: string

  // ── Header Cart Notification ──
  cart_notification_bg: string
  cart_notification_text: string

  // ── Pagination ──
  pagination_bg: string
  pagination_text: string
  pagination_active_bg: string
  pagination_active_text: string

  // ── Course Curriculum ──
  curriculum_bg: string
  curriculum_list_title: string
  curriculum_lesson_title: string
  curriculum_icon: string
  curriculum_free_badge: string

  // ── Customer Reviews ──
  review_star: string
  review_verified: string
  review_recommended: string

  // ── Video Play Button ──
  video_play_bg: string
  video_play_icon: string

  // ── On Sale Badge ──
  sale_badge_bg: string
  sale_badge_text: string
  sale_badge_border: string

  // ── Out Of Stock Badge ──
  oos_badge_bg: string
  oos_badge_text: string
  oos_badge_border: string

  // ── Sale Time Remaining ──
  sale_time_bg: string
  sale_time_text: string
  sale_time_border: string

  // ── Inventory Low Message ──
  inventory_low_text: string

  // ── Description Tab ──
  desc_tab_bg: string
  desc_tab_text: string
  desc_tab_border: string

  // ── Slider List Section ──
  slider_controls: string
  slider_controls_bg: string
  /** A CSS gradient over the background, when the scheme has one. */
  gradient?: string
  name?: string
}
export type ColorSchemeKey = "white" | "light" | "dark" | "black" | "highlight"
export type ColorSchemes = Record<ColorSchemeKey, ColorSchemeValues>

/**
 * THE LEGACY VIEW OF THE ENGINE'S SCHEMES. The five built-in schemes live in
 * lib/storelib-theme/color-schemes.ts as twenty-one semantic values each;
 * this is those same schemes spelled out under the eighty slot names the
 * React renderers were written against. Derived, never copied, so the two
 * renderer families cannot disagree about a default.
 */
export const DEFAULT_COLOR_SCHEMES: ColorSchemes = Object.fromEntries(
  BUILT_IN_SCHEME_KEYS.map((key) => [key, legacySchemeValues(ENGINE_DEFAULT_COLOR_SCHEMES[key]) as unknown as ColorSchemeValues]),
) as ColorSchemes

export interface ThemeSettingsValues {
  // Global color schemes: keyed by scheme key, each holding only what
  // differs from the built-in default (semantic keys, see the engine).
  color_schemes?: Record<string, Record<string, unknown>>
  /** The scheme a section gets when it names none. */
  default_color_scheme?: string
  /** Per text style, only what differs from the default. */
  typography_styles?: Record<string, unknown>
  font_accent?: string

  // Branding
  brand_name?: string
  logo_url?: string
  favicon_url?: string

  // Colors
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  background_color?: string
  surface_color?: string
  text_color?: string
  text_secondary_color?: string
  border_color?: string

  // Typography
  font_heading?: string
  font_body?: string
  font_size_base?: number

  // Layout
  button_style?: "rounded" | "square" | "pill"
  border_radius?: number
  page_width?: number
  spacing_scale?: number

  // Announcement bar
  announcement_bar_enabled?: boolean
  announcement_bar_text?: string
  announcement_bar_bg?: string
  announcement_bar_color?: string

  // Social
  social_links?: Record<string, string>

  // SEO
  seo_title?: string
  seo_description?: string

  [key: string]: unknown
}

// ── Section & Block instances ────────────────────────────────

export interface SectionInstance {
  id: string
  type: string
  name: string
  settings: Record<string, unknown>
  blocks?: BlockInstance[]
  hidden?: boolean
  /**
   * The section group it sits in, when it is not on the page itself: an
   * announcement bar above the header, a header written as a section file.
   * The built-in header and footer are in theirs without it. See
   * lib/storelib-theme/section-groups.ts.
   */
  group?: "header" | "footer"
}

export interface BlockInstance {
  id: string
  type: string
  settings: Record<string, unknown>
  /** Kept, and not drawn. */
  hidden?: boolean
  /** Placed by its template with `content_for "block"`: edited, never moved or deleted. */
  static?: boolean
  /** A theme block's own blocks, in order. See lib/website-builder/block-tree.ts. */
  blocks?: BlockInstance[]
}

// ── Page templates ───────────────────────────────────────────

export interface ThemePage {
  id: string
  install_id: string
  page_key: PageKey
  sections: SectionInstance[]
  draft_sections: SectionInstance[] | null
  created_at: string
  updated_at: string
}

/**
 * "products", "search" and "404" are pages the site has whether or not
 * anybody has arranged them: the shop, the search results and the page for
 * an address the site does not have, built from the home page's header and
 * footer and a section each until the creator opens one in the builder,
 * after which what they saved is what is served.
 */
export type PageKey = "home" | "product" | "about" | "contact" | "products" | "search" | "404" | "account" | "login" | "wishlist" | "password"

/**
 * The account, its sign in page and the wishlist are pages every website
 * has as well (lib/website-builder/account-pages), built the same way as the
 * shop until a creator arranges them. The sign in page is served at
 * /account/login; see pagePath in lib/website-builder/site-pages.
 */
export const PAGE_META: Record<PageKey, { label: string; icon: string }> = {
  home: { label: "Home page", icon: "home" },
  product: { label: "Product page", icon: "shopping-bag" },
  about: { label: "About page", icon: "info" },
  contact: { label: "Contact page", icon: "mail" },
  products: { label: "Shop", icon: "grid" },
  search: { label: "Search", icon: "search" },
  "404": { label: "404 page", icon: "search" },
  account: { label: "Account", icon: "user" },
  login: { label: "Sign in", icon: "user" },
  wishlist: { label: "Wishlist", icon: "heart" },
  /* What visitors see while the website asks for a password: Website Settings, Publishing. */
  password: { label: "Password page", icon: "lock" },
}

// ── Custom files ─────────────────────────────────────────────

export interface ThemeCustomFile {
  id: string
  install_id: string
  path: string
  content: string
  created_at: string
  updated_at: string
}

// ── Schema field types ───────────────────────────────────────

/**
 * The registry's control names (lib/storelib-theme/controls/registry.ts) and
 * the older names the JSON schemas used for some of them. FieldEditor
 * resolves either through the registry, so `link` and `url` are one control.
 */
export type SchemaFieldType =
  | "url"
  | "image_picker"
  | "video_picker"
  | "icon_picker"
  | "font_picker"
  | "color_scheme"
  | "checkbox"
  | "divider"
  | "image_gallery"
  | "file_picker"
  | "page_picker"
  | "product_picker"
  | "community_picker"
  | "text"
  | "textarea"
  | "richtext"
  | "image"
  | "color"
  | "select"
  | "toggle"
  | "range"
  | "number"
  | "link"
  | "repeater"
  | "icon"
  | "alignment"
  | "spacing"
  | "header"
  | "paragraph"
  | "video"
  | "font"
  | "radio"
  /* The types added with the Shopify gap work, and Shopify's own names. */
  | "inline_richtext"
  | "html"
  | "color_background"
  | "datetime"
  | "focal_point"
  | "video_url"
  | "product_list"
  | "link_list"
  | "text_alignment"
  | "product"
  | "page"
  /* The theme's menus, edited in Theme settings › Menus. Not a section setting. */
  | "menus"

export interface SelectOption {
  label: string
  value: string
}

export interface SchemaField {
  id: string
  label: string
  type: SchemaFieldType
  default?: unknown
  options?: SelectOption[]
  min?: number
  max?: number
  step?: number
  unit?: string
  placeholder?: string
  info?: string
  /**
   * The setting may hold a different value per breakpoint. Declared in the
   * .storelib schema and, for a while, dropped on the way here: the engine
   * honoured it, the templates read `settings.columns.desktop`, and the
   * editor drew one control, so a value a phone needed could be set by
   * hand-editing the file and by no other means.
   */
  responsive?: boolean
  /** product_list: how many it holds. */
  limit?: number
  /** video_url: which hosts it takes. */
  accept?: string[]
  /** focal_point: the id of the picture setting it points into. */
  image?: string
  /** paragraph: the words it shows. */
  content?: string
  /** When the panel shows it. See lib/storelib-theme/visible-if.ts. */
  visible_if?: string
}

export interface BlockSchema {
  type: string
  name: string
  fields: SchemaField[]
  /**
   * How many of THIS kind of block the section holds, as distinct from
   * `max_blocks`, which is how many it holds in total. A slideshow that takes
   * eight slides and one caption needs both. It was declared in the schema
   * and dropped on the way here, so it could never be enforced.
   */
  limit?: number
  /** A theme block, from blocks/<type>.storelib, rather than one the section declares. */
  theme?: boolean
  /** A theme block whose file name starts with `_`: offered only where it is named. */
  private?: boolean
  /** What it may hold: "@theme" or theme block types. Absent, it holds nothing. */
  accepts?: string[]
  max_blocks?: number
  /** What Add block offers for it: each a state it arrives in. */
  presets?: SectionPreset[]
  /** The blocks its template places itself. */
  statics?: { type: string; id: string }[]
}

export interface SectionPreset {
  name: string
  /** Where Add section files this preset; the section's category when absent. */
  category?: string
  settings: Record<string, unknown>
  blocks?: BlockInstance[]
}

export interface SectionSchema {
  type: string
  name: string
  description?: string
  icon?: string
  category?: string
  fields: SchemaField[]
  blocks?: BlockSchema[]
  /** The theme blocks it accepts: "@theme", or types by name. */
  accepts?: string[]
  /** The blocks its template places itself, with `content_for "block"`. */
  statics?: { type: string; id: string }[]
  max_blocks?: number
  presets?: SectionPreset[]
  /** What the panel may change about the section's design. See design-support.ts. */
  supports_color_scheme?: boolean
  supportsColorScheme?: boolean
  supports_color_overrides?: boolean | string[]
  supportsColorOverrides?: boolean | string[]
  supports_typography_overrides?: boolean
  supportsTypographyOverrides?: boolean
  /**
   * Where it may be placed, from a .storelib schema: Shopify's enabled_on
   * and disabled_on (`{ groups: ["header"] }`), and `kind` for a section
   * that replaces the built-in header or footer. See
   * lib/storelib-theme/schema/normalise.ts, sectionGroupsOf.
   */
  enabled_on?: { groups?: string[]; templates?: string[] }
  disabled_on?: { groups?: string[]; templates?: string[] }
  kind?: "header" | "footer"
}

// ── Editor state ─────────────────────────────────────────────

export type EditorPanel =
  | { type: "pages" }
  | { type: "section"; sectionId: string }
  | { type: "theme_settings"; group?: string }
  | { type: "add_section" }

export interface EditorState {
  installId: string
  themeInstall: ThemeInstall | null
  currentPage: PageKey
  sections: SectionInstance[]
  settingsDraft: ThemeSettingsValues
  selectedPanel: EditorPanel
  isDirty: boolean
  isSaving: boolean
  devicePreview: "desktop" | "mobile"
}

// ── Virtual theme file tree ──────────────────────────────────

export interface ThemeFileNode {
  path: string
  name: string
  type: "file" | "folder"
  children?: ThemeFileNode[]
  isCustomized?: boolean // has a store_theme_custom_files override
  language?: string
}

// ── Theme settings schema groups ────────────────────────────

export interface ThemeSettingsGroup {
  id: string
  label: string
  icon: string
  fields: SchemaField[]
}
