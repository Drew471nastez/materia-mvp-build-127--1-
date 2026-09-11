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
}
export type ColorSchemeKey = "white" | "light" | "dark" | "black" | "highlight"
export type ColorSchemes = Record<ColorSchemeKey, ColorSchemeValues>

// Helper to build a complete scheme from a small palette
function buildScheme(p: {
  bg: string; text: string; heading: string; paragraph: string; border: string;
  link: string; primaryBtnBg: string; primaryBtnText: string;
  secondaryBtnBg: string; secondaryBtnText: string;
  navLink: string; storeTitle: string; accent: string;
}): ColorSchemeValues {
  return {
    // Header
    store_title: p.storeTitle,
    nav_link: p.navLink,
    // Section
    bg: p.bg,
    inset_border: p.border,
    // Text
    heading: p.heading,
    paragraph: p.paragraph,
    link: p.link,
    link_underline: p.link,
    text: p.text,
    border: p.border,
    // Primary button
    primary_btn_bg: p.primaryBtnBg,
    primary_btn_text: p.primaryBtnText,
    primary_btn_border: p.primaryBtnBg,
    primary_btn_hover_bg: p.accent,
    primary_btn_hover_text: p.primaryBtnText,
    primary_btn_hover_border: p.accent,
    // Secondary button
    secondary_btn_bg: p.secondaryBtnBg,
    secondary_btn_text: p.secondaryBtnText,
    secondary_btn_border: p.secondaryBtnText,
    secondary_btn_hover_bg: p.secondaryBtnText,
    secondary_btn_hover_text: p.secondaryBtnBg,
    secondary_btn_hover_border: p.secondaryBtnText,
    // Footer
    footer_link: p.link,
    footer_link_underline: p.link,
    // Misc
    borders: p.border,
    on_sale: "#ef4444",
    // Subscription Page
    plan_bg: p.bg,
    plan_border: p.border,
    plan_heading: p.heading,
    plan_paragraph: p.paragraph,
    plan_link: p.link,
    plan_link_underline: p.link,
    // Subscription Login Page
    login_form_bg: p.bg,
    login_form_border: p.border,
    // Slideshow
    slideshow_controls: p.text,
    slideshow_controls_bg: p.bg,
    // Image Overlay
    image_overlay_bg: "rgba(0,0,0,0.4)",
    image_overlay_text: "#ffffff",
    // Announcement Bar
    announcement_bg: p.heading,
    announcement_text: p.bg,
    // Image Collage
    collage_title: p.heading,
    collage_subtitle: p.paragraph,
    collage_bg: p.bg,
    collage_link: p.link,
    collage_link_underline: p.link,
    // Header Dropdown
    header_dropdown_bg: p.bg,
    header_dropdown_link: p.text,
    // Cart Notification
    cart_notification_bg: p.heading,
    cart_notification_text: p.bg,
    // Pagination
    pagination_bg: p.bg,
    pagination_text: p.text,
    pagination_active_bg: p.heading,
    pagination_active_text: p.bg,
    // Course Curriculum
    curriculum_bg: p.bg,
    curriculum_list_title: p.heading,
    curriculum_lesson_title: p.text,
    curriculum_icon: p.text,
    curriculum_free_badge: "#10b981",
    // Customer Reviews
    review_star: "#f59e0b",
    review_verified: "#10b981",
    review_recommended: "#6366f1",
    // Video Play Button
    video_play_bg: "rgba(0,0,0,0.6)",
    video_play_icon: "#ffffff",
    // On Sale Badge
    sale_badge_bg: "#ef4444",
    sale_badge_text: "#ffffff",
    sale_badge_border: "#ef4444",
    // Out Of Stock Badge
    oos_badge_bg: "#9ca3af",
    oos_badge_text: "#ffffff",
    oos_badge_border: "#9ca3af",
    // Sale Time Remaining
    sale_time_bg: "#fef3c7",
    sale_time_text: "#92400e",
    sale_time_border: "#fde68a",
    // Inventory Low Message
    inventory_low_text: "#ef4444",
    // Description Tab
    desc_tab_bg: p.bg,
    desc_tab_text: p.text,
    desc_tab_border: p.border,
    // Slider List
    slider_controls: p.text,
    slider_controls_bg: p.bg,
  }
}

export const DEFAULT_COLOR_SCHEMES: ColorSchemes = {
  white: buildScheme({
    bg: "#ffffff", text: "#5C5B63", heading: "#0f172a", paragraph: "#5C5B63", border: "#e2e8f0",
    link: "#0f172a", primaryBtnBg: "#000000", primaryBtnText: "#ffffff",
    secondaryBtnBg: "#ffffff", secondaryBtnText: "#0f172a",
    navLink: "#5C5B63", storeTitle: "#0f172a", accent: "#1f2937",
  }),
  light: buildScheme({
    bg: "#f8fafc", text: "#0f172a", heading: "#0f172a", paragraph: "#475569", border: "#e2e8f0",
    link: "#0f172a", primaryBtnBg: "#0f172a", primaryBtnText: "#ffffff",
    secondaryBtnBg: "#ffffff", secondaryBtnText: "#0f172a",
    navLink: "#0f172a", storeTitle: "#0f172a", accent: "#1f2937",
  }),
  dark: buildScheme({
    bg: "#1f2937", text: "#f8fafc", heading: "#ffffff", paragraph: "#cbd5e1", border: "#374151",
    link: "#f8fafc", primaryBtnBg: "#ffffff", primaryBtnText: "#0f172a",
    secondaryBtnBg: "transparent", secondaryBtnText: "#ffffff",
    navLink: "#f8fafc", storeTitle: "#ffffff", accent: "#e5e7eb",
  }),
  black: buildScheme({
    bg: "#000000", text: "#ffffff", heading: "#ffffff", paragraph: "#cbd5e1", border: "#1f2937",
    link: "#ffffff", primaryBtnBg: "#ffffff", primaryBtnText: "#000000",
    secondaryBtnBg: "transparent", secondaryBtnText: "#ffffff",
    navLink: "#ffffff", storeTitle: "#ffffff", accent: "#e5e7eb",
  }),
  highlight: buildScheme({
    bg: "#fde2e4", text: "#1f2937", heading: "#1f2937", paragraph: "#475569", border: "#fbcfd1",
    link: "#1f2937", primaryBtnBg: "#1f2937", primaryBtnText: "#fde2e4",
    secondaryBtnBg: "transparent", secondaryBtnText: "#1f2937",
    navLink: "#1f2937", storeTitle: "#1f2937", accent: "#0f172a",
  }),
}

export interface ThemeSettingsValues {
  // Global color schemes
  color_schemes?: ColorSchemes

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
}

export interface BlockInstance {
  id: string
  type: string
  settings: Record<string, unknown>
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

export type PageKey = "home" | "product" | "about" | "contact"

export const PAGE_META: Record<PageKey, { label: string; icon: string }> = {
  home: { label: "Home page", icon: "home" },
  product: { label: "Product page", icon: "shopping-bag" },
  about: { label: "About page", icon: "info" },
  contact: { label: "Contact page", icon: "mail" },
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
}

export interface BlockSchema {
  type: string
  name: string
  fields: SchemaField[]
}

export interface SectionPreset {
  name: string
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
  max_blocks?: number
  presets?: SectionPreset[]
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
