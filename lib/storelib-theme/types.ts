/**
 * ===========================================================================
 *  THE STORELIB THEME FORMAT, AS TYPES
 * ===========================================================================
 * Everything in `lib/storelib-theme` is built on what is defined here, and
 * this file imports nothing from the rest of the application on purpose. A
 * theme is a set of files and the data that fills them; the engine that reads
 * them must survive any refactor of the editor that edits them.
 *
 * Two ideas carry the whole design, and the types keep them apart:
 *
 *   SOURCE   how a section works — its markup, its style, its schema.
 *            One `.storelib` file per section. Changing it never touches
 *            anybody's content.
 *
 *   INSTANCE what a person put in it — a template entry with a type, the
 *            settings they changed, their blocks. Never the schema, never
 *            the CSS, never a default they did not move.
 *
 * See docs/theme/00-architecture-and-migration.md.
 */

// ── Versions ────────────────────────────────────────────────────────────────

/** The version of the `.storelib` section format this engine reads. */
export const SECTION_SCHEMA_VERSION = 1

/** The version of the theme package format (`theme.json`, the zip). */
export const THEME_FORMAT_VERSION = 1

/** The engine's own version, for `theme.json` compatibility checks. */
export const ENGINE_VERSION = 1

export const THEME_FORMAT = "storelib-theme" as const

// ── The filesystem ──────────────────────────────────────────────────────────

/**
 * A theme, as the files that make it up. Paths are POSIX, relative to the
 * theme root, and never begin with `/` or contain `..`. Binary assets are
 * not in here — they are referenced by `asset://` and carried separately.
 */
export type ThemeFiles = Record<string, string>

export const THEME_FOLDERS = ["config", "layout", "templates", "sections", "snippets", "assets", "locales"] as const
export type ThemeFolder = (typeof THEME_FOLDERS)[number]

/** `theme.json` */
export interface ThemeManifest {
  format: typeof THEME_FORMAT
  format_version: number
  name: string
  version: string
  author?: string
  description?: string
  engine: {
    /** The lowest engine version that can render this theme. */
    min: number
  }
  /** Anything a later format adds is kept and written back untouched. */
  [key: string]: unknown
}

// ── Templates: instance data ───────────────────────────────────────────────

/**
 * One section on a page. Exactly what a person changed, and nothing about
 * how the section works. IDs are persistent: they are minted when the
 * instance is created and survive save, refresh, reorder, duplicate (the
 * copy gets a new one), export and import.
 */
export interface SectionInstanceData {
  type: string
  /** Only the settings whose value differs from the schema default. */
  settings?: Record<string, unknown>
  blocks?: Record<string, BlockInstanceData>
  block_order?: string[]
  hidden?: boolean
  /** A name the person gave it, if they renamed it. */
  name?: string
  /** Room for the editor and extensions; never read by the renderer. */
  meta?: Record<string, unknown>
  [key: string]: unknown
}

export interface BlockInstanceData {
  type: string
  settings?: Record<string, unknown>
  hidden?: boolean
  [key: string]: unknown
}

/** `templates/<name>.json` */
export interface Template {
  sections: Record<string, SectionInstanceData>
  order: string[]
  /** Sections rendered by the layout rather than the page: header, footer. */
  groups?: Record<string, string>
  [key: string]: unknown
}

// ── Sections: source ────────────────────────────────────────────────────────

/**
 * A responsive value. Every breakpoint is filled by the time a template sees
 * it; a person may have set only `desktop`, and the resolver fills the rest
 * downwards.
 */
export interface ResponsiveValue<T = unknown> {
  desktop: T
  tablet: T
  mobile: T
}

export const BREAKPOINTS = ["desktop", "tablet", "mobile"] as const
export type Breakpoint = (typeof BREAKPOINTS)[number]

/**
 * One setting in a schema. The `type` names an entry in the control
 * registry, which owns what the value may be and which editor control draws
 * it. Everything else here is what the control needs to draw itself.
 */
export interface SettingDefinition {
  type: string
  id: string
  label?: string
  default?: unknown
  info?: string
  placeholder?: string
  /** select, radio */
  options?: { label: string; value: string }[]
  /** range, number */
  min?: number
  max?: number
  step?: number
  unit?: string
  /** A value per breakpoint rather than one. */
  responsive?: boolean
  [key: string]: unknown
}

export interface BlockDefinition {
  type: string
  name: string
  settings: SettingDefinition[]
  /** How many of this block a section may hold. */
  limit?: number
  [key: string]: unknown
}

export interface SectionPreset {
  name: string
  settings?: Record<string, unknown>
  blocks?: { type: string; settings?: Record<string, unknown> }[]
  [key: string]: unknown
}

/** The `<schema>` block of a `.storelib` file. */
export interface SectionSchema {
  schema_version: number
  type: string
  name: string
  category?: string
  version?: string
  description?: string
  icon?: string
  settings: SettingDefinition[]
  blocks?: BlockDefinition[]
  max_blocks?: number
  presets?: SectionPreset[]
  /** Where this section may be placed. Absent means anywhere. */
  allowed_templates?: string[]
  disabled_templates?: string[]
  /** What the script may reach. Absent means nothing beyond `root`. */
  capabilities?: string[]
  /** Renames of setting ids across versions, oldest first. */
  migrations?: { from: string; to: string; since: string }[]
  [key: string]: unknown
}

/** The four blocks of a `.storelib` file, with where each one begins. */
export interface StorelibSource {
  template: SourceBlock
  style: SourceBlock & { scoped: boolean }
  script: SourceBlock | null
  schema: SourceBlock
}

export interface SourceBlock {
  text: string
  /** 1-based line of the file on which the block's content begins. */
  line: number
}

// ── Compiled ────────────────────────────────────────────────────────────────

/** A section, compiled from source and ready to render any instance of it. */
export interface CompiledSection {
  type: string
  schema: SectionSchema
  /** The template as an interpretable tree — see storelib/template.ts. */
  template: unknown
  /** CSS already scoped to `[data-section-id="…"]`, with the id left as a placeholder. */
  css: string
  /** The script's source, checked and wrapped; null when there is none. */
  script: string | null
  /** SHA-256 of the source it came from, for caching. */
  sourceHash: string
}

// ── Errors ──────────────────────────────────────────────────────────────────

export interface ThemeError {
  /** Which stage refused: parse, schema, template, css, script, package. */
  stage: "parse" | "schema" | "template" | "css" | "script" | "package"
  message: string
  /** Path within the theme, when the error is about a file. */
  file?: string
  /** 1-based line in that file, when known. */
  line?: number
  column?: number
  /** A dotted path into the schema or settings, when the error is about data. */
  path?: string
}

export type Result<T> = { ok: true; value: T; warnings?: ThemeError[] } | { ok: false; errors: ThemeError[] }

// ── Assets ──────────────────────────────────────────────────────────────────

export const ASSET_SCHEME = "asset://"

/** `asset://<sha256-hex>` */
export type AssetRef = `asset://${string}`

export function isAssetRef(v: unknown): v is AssetRef {
  return typeof v === "string" && v.startsWith(ASSET_SCHEME) && /^[a-f0-9]{16,64}$/.test(v.slice(ASSET_SCHEME.length))
}

export interface AssetRecord {
  /** The hash, and the identity. Two identical files are one asset. */
  id: string
  filename: string
  mime_type: string
  width?: number
  height?: number
  size: number
  hash: string
  alt_text?: string
  created_at: string
  /** Where it can be fetched from, for THIS account. Never exported. */
  url?: string
}

// ── The context a section renders against ──────────────────────────────────

/**
 * What a template can read. Every field is the resolved, plain-data form —
 * defaults already applied, assets already turned into URLs, responsive
 * values already filled — so the template language never has to do any of
 * that and cannot get it wrong.
 */
export interface RenderContext {
  /** This instance's settings, resolved. */
  settings: Record<string, unknown>
  /** This instance's blocks, in order, each with resolved settings. */
  blocks: { id: string; type: string; settings: Record<string, unknown> }[]
  /** Theme tokens: colors, typography, radius, spacing, schemes, and the raw settings. */
  theme: Record<string, unknown>
  /**
   * The colour scheme this instance chose, resolved: whichever setting is a
   * `color_scheme` (or is called `color_scheme`), looked up in
   * `theme.schemes`. The language has no dynamic index, so the engine does
   * the lookup and a template reads `scheme.bg`.
   */
  scheme: Record<string, unknown>
  /** What page this is on, and what that page is about. */
  page: { template: string; [key: string]: unknown }
  /** The instance's id. Used for scoping; not for a template to invent ids. */
  section: { id: string; type: string }
  /** `asset://…` → URL, for the `asset` filter. */
  assets: Record<string, string>
}

// ── Limits ──────────────────────────────────────────────────────────────────

/** Fixed from the start rather than discovered by an outage. */
export const LIMITS = {
  /** Bytes. The whole package. */
  packageBytes: 50 * 1024 * 1024,
  /** Bytes. One asset. */
  assetBytes: 15 * 1024 * 1024,
  /** Bytes. One source file. */
  sourceBytes: 512 * 1024,
  /** Bytes. A section's compiled script. */
  scriptBytes: 64 * 1024,
  /** Bytes. A section's CSS. */
  cssBytes: 128 * 1024,
  filesPerPackage: 2000,
  sectionsPerTemplate: 60,
  blocksPerSection: 50,
  settingsPerSchema: 120,
} as const
