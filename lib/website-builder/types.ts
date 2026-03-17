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

export interface ThemeSettingsValues {
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

export type SchemaFieldType =
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
