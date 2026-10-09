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

import type { Menu } from "./values"

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

export const THEME_FOLDERS = ["config", "layout", "templates", "sections", "blocks", "snippets", "assets", "locales"] as const
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

/**
 * One block in a section, or in another block. A theme block may hold blocks
 * of its own, keyed and ordered exactly like a section's, to a depth of
 * MAX_BLOCK_DEPTH. A STATIC block is one the template places itself with
 * `{% content_for "block", type: "…", id: "…" %}`: it is kept under its id
 * and is never in `block_order`, because its place is in the markup.
 */
export interface BlockInstanceData {
  type: string
  settings?: Record<string, unknown>
  hidden?: boolean
  static?: boolean
  blocks?: Record<string, BlockInstanceData>
  block_order?: string[]
  [key: string]: unknown
}

/** How deep blocks may nest inside a section. The same eight levels Shopify allows. */
export const MAX_BLOCK_DEPTH = 8

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
  /**
   * When the editor shows this setting: `{{ section.settings.source == 'chosen' }}`.
   * The panel only; a hidden setting keeps its value and a template still reads it.
   */
  visible_if?: string
  [key: string]: unknown
}

/**
 * A block the section declares for itself, in its own schema: a "local"
 * block. Its settings live here and nowhere else, and no other section can
 * use it.
 */
export interface BlockDefinition {
  type: string
  name: string
  settings: SettingDefinition[]
  /** How many of this block a section may hold. */
  limit?: number
  [key: string]: unknown
}

/**
 * ===========================================================================
 *  A PRESET, AS SHOPIFY WRITES ONE
 * ===========================================================================
 * What a section (or a theme block) is the moment somebody adds it: its
 * settings and the blocks it arrives with. Two spellings are read.
 *
 * The keyed one is Shopify's, and the one a theme block tree needs, because
 * a block placed by the template (`static`) has to be found again by its id:
 *
 *   "blocks": {
 *     "heading": { "type": "text", "settings": { "text": "Hello" } },
 *     "media":   { "type": "group", "blocks": { … }, "block_order": [ … ] }
 *   },
 *   "block_order": ["heading", "media"]
 *
 * The list is the older spelling and stays valid:
 *
 *   "blocks": [{ "type": "text", "settings": { … }, "blocks": [ … ] }]
 *
 * Both say the same thing, and lib/storelib-theme/blocks.ts reads either into
 * one tree.
 */
export interface PresetBlock {
  type: string
  settings?: Record<string, unknown>
  /** Placed by the template with `content_for "block"`. Needs an id. */
  static?: boolean
  /** In the list spelling, the id a static block is placed under. */
  id?: string
  blocks?: PresetBlock[] | Record<string, PresetBlock>
  block_order?: string[]
  [key: string]: unknown
}

export interface SectionPreset {
  name: string
  /** Where Add section files it. Defaults to the section's own category. */
  category?: string
  settings?: Record<string, unknown>
  blocks?: PresetBlock[] | Record<string, PresetBlock>
  block_order?: string[]
  [key: string]: unknown
}

/**
 * ===========================================================================
 *  A THEME BLOCK: `blocks/<type>.storelib`
 * ===========================================================================
 * A block with a file of its own, which any section that accepts it can hold:
 * Shopify's theme blocks, written in this language. Template, style and
 * schema like a section, no script (behaviour belongs to the section the
 * block sits in, which owns the sandbox).
 *
 * A file whose name starts with `_` is PRIVATE: `@theme` does not offer it,
 * and only a section or block that names it can hold it. That is how a
 * slideshow keeps its `_slide` from turning up in every other Add block menu.
 */
export interface ThemeBlockSchema {
  schema_version: number
  language_version?: number
  /** The file's name: `blocks/heading.storelib` is "heading". */
  type: string
  name: string
  description?: string
  settings: SettingDefinition[]
  /**
   * What it may hold: `["@theme"]` for any public theme block, or the types
   * by name. Absent means it holds nothing.
   */
  accepts?: string[]
  max_blocks?: number
  presets?: SectionPreset[]
  /** The element wrapped round it. `null` for none, when the template prints `{{ block.storelib_attributes }}` itself. */
  tag?: string | null
  /** Classes on that element, beside `sl-block`. */
  class?: string
  [key: string]: unknown
}

/** A theme block, compiled: everything needed to draw any instance of it. */
export interface CompiledBlock {
  type: string
  schema: ThemeBlockSchema
  language_version: number
  template: unknown
  /** Scoped to `[data-block-type="<type>"]`, or per instance when it reads a setting. */
  css: string
  cssTemplate?: unknown
  /** The blocks its template places itself, with `content_for "block"`. */
  statics: { type: string; id: string }[]
  sourceHash: string
}

/** The `<schema>` block of a `.storelib` file. */
export interface SectionSchema {
  schema_version: number
  /**
   * The version of the template language this section is written in. Absent
   * means 1, permanently: see lib/storelib-theme/language.ts.
   */
  language_version?: number
  type: string
  name: string
  category?: string
  version?: string
  description?: string
  icon?: string
  settings: SettingDefinition[]
  /** The section's own blocks. */
  blocks?: BlockDefinition[]
  /**
   * The THEME blocks it accepts, read out of `blocks` where the schema wrote
   * `{ "type": "@theme" }` or `{ "type": "heading" }`. A section holds its
   * own blocks or theme blocks, never both, which is Shopify's rule too.
   */
  accepts?: string[]
  max_blocks?: number
  presets?: SectionPreset[]
  /** Where this section may be placed. Absent means anywhere. */
  allowed_templates?: string[]
  disabled_templates?: string[]
  /**
   * The section groups it may sit in, Shopify's spelling:
   * `{ "groups": ["header"] }` for an announcement bar that sits above the
   * header. Absent, a section is a page section (the "template" group), and
   * an `announcement` category means the header group. See
   * schema/normalise.ts, sectionGroupsOf.
   */
  enabled_on?: SectionPlacement
  /** The groups it may not sit in. One of enabled_on or disabled_on, never both. */
  disabled_on?: SectionPlacement
  /**
   * "header" or "footer": this section IS the site's header (or footer), and
   * replaces the built-in one wherever it is used. One per theme. The look
   * is the section's; the live values (menu, logo, cart, search, account)
   * stay connected.
   */
  kind?: "header" | "footer"
  /** What the script may reach. Absent means nothing beyond `root`. */
  capabilities?: string[]
  /** Renames of setting ids across versions, oldest first. */
  migrations?: { from: string; to: string; since: string }[]
  [key: string]: unknown
}

/** `enabled_on` and `disabled_on`: section groups, and optionally page templates. */
export interface SectionPlacement {
  groups?: ("header" | "footer" | "template")[]
  templates?: string[]
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
  /**
   * The language version this section was compiled as: what it declared, or 1
   * when it declared nothing. Carried on the compiled result so that when the
   * language does change, the renderer can keep an old file behaving the way
   * its author wrote it rather than the way the engine now prefers.
   */
  language_version: number
  /** The template as an interpretable tree — see storelib/template.ts. */
  template: unknown
  /** CSS already scoped to `[data-section-id="…"]`, with the id left as a placeholder. */
  css: string
  /**
   * The same CSS as an interpretable tree, when it reads a setting. Scoping
   * happens once, at compile; the expressions are filled per instance, which
   * is a string walk rather than another parse.
   */
  cssTemplate?: unknown
  /** The script's source, checked and wrapped; null when there is none. */
  script: string | null
  /** The theme blocks its template places itself, with `content_for "block"`. */
  statics?: { type: string; id: string }[]
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
  /**
   * THE CREATOR'S ACTUAL PRODUCTS, newest first, in the same shape a block
   * has, so `{% for block in products %}` takes the body a section already
   * wrote for `{% for block in blocks %}`. The language has no `assign` and
   * no partials, and this is the cheapest way to offer a section both
   * without asking it to keep two copies of one card.
   *
   * OPTIONAL, and empty when absent. A surface that has no catalogue to
   * offer is a normal thing — the export, a test fixture, a thumbnail — and
   * a section reading `products` there draws nothing rather than something
   * wrong. Only published products belonging to THIS creator ever appear
   * here; see lib/website-builder/shop-products.ts.
   */
  products?: { id: string; type: string; settings: Record<string, unknown> }[]
  /**
   * The creator's published collections the page was handed, block-shaped
   * like `products`: `{% for block in collections %}` with
   * `block.settings.title`, `image`, `url`, `products_count`. The
   * collections page is handed every one; other pages only the ones their
   * settings name. Empty when absent.
   */
  collections?: { id: string; type: string; settings: Record<string, unknown> }[]
  /** Theme tokens: colors, typography, radius, spacing, schemes, and the raw settings. */
  theme: Record<string, unknown>
  /**
   * The colour scheme this instance chose, resolved: whichever setting is a
   * `color_scheme` (or is called `color_scheme`), looked up in
   * `theme.schemes`. The language has no dynamic index, so the engine does
   * the lookup and a template reads `scheme.bg`.
   */
  scheme: Record<string, unknown>
  /**
   * What page this is on, and what that page is about.
   *
   * `page.in_editor` is true only while the builder is drawing, and it is the
   * one sanctioned difference between the two surfaces. A section with no
   * blocks yet needs to say so to the person adding them and must say nothing
   * at all to a visitor: fifteen sections in this theme were printing "Add
   * questions in the sidebar" onto live pages, because there was no way for a
   * template to tell where it was. There is now, and it is the only thing of
   * its kind — everything else about a render is identical on both surfaces,
   * which is what tests/storelib-parity.test.ts holds them to.
   */
  page: { template: string; in_editor?: boolean; [key: string]: unknown }
  /** The instance's id. Used for scoping; not for a template to invent ids. */
  section: { id: string; type: string }
  /** `asset://…` → URL, for the `asset` filter. */
  assets: Record<string, string>
  /**
   * The store, the addresses every website answers on, and the visitor when
   * the page is drawn for one. See lib/storelib-theme/globals.ts. Optional:
   * a surface that gives none still has `shop` from the theme and `routes`,
   * and reads `customer` and `wishlist` as null.
   */
  shop?: Record<string, unknown>
  routes?: Record<string, unknown>
  customer?: Record<string, unknown> | null
  wishlist?: Record<string, unknown> | null
  /**
   * WHAT THE STOREFRONT KNOWS ABOUT ITSELF, the same facts a dynamic source
   * fills a setting with (lib/storelib-theme/dynamic.ts): the shop's name
   * and address, the creator's public profile, and on a product page the
   * product. Optional and empty when absent, so a section reading
   * `{{ shop.name }}` in a thumbnail draws nothing rather than failing.
   */
  creator?: StorefrontData["creator"]
  /** The product this page is about. Present on the product template only. */
  product?: StorefrontData["product"]
  /**
   * The collection this page is about, on /collections/<handle>: title,
   * handle, description, image, url, products_count and its products,
   * block-shaped. Null on every other page.
   */
  collection?: StorefrontCollection | null
  /**
   * Inside a theme block's template: the block being drawn. `settings` and
   * `blocks` are then the block's own, and `section` is still the section
   * it sits in, so `{{ section.settings.x }}` reads the section.
   */
  block?: Record<string, unknown>
  /** The section's settings and blocks while a block inside it is drawn. */
  sectionScope?: { settings: Record<string, unknown>; blocks: unknown[] }
  /**
   * What `{% content_for %}` draws here: the owner's theme blocks in order,
   * or one static block by type and id. Set by render.ts; absent, both draw
   * nothing.
   */
  contentFor?: (request: ContentForRequest) => string
  /** Inside a theme block: the product or collection it was drawn for (ContentForRequest.closest). */
  closest?: Record<string, unknown>
}

export type ContentForRequest = ({ what: "blocks" } | { what: "block"; type: string; id: string }) & {
  /**
   * What the blocks drawn are about, Shopify's `closest`: `{% content_for
   * "block", type: "_product-card", id: "card", closest.product: product %}`
   * inside a loop draws the card for that product. Passed down to the
   * blocks inside it until one is given another.
   */
  closest?: Record<string, unknown>
}

/**
 * The storefront's own facts, handed to a render by whoever has them. The
 * engine only reads this; the application builds it from the creator's
 * rows, published values only, with every piece of markup already cleaned.
 */
/**
 * One of the creator's communities as a `community_picker` setting carries
 * it: public facts only, read on the server (lib/communities/server/blocks.ts)
 * for a community that is the creator's own, published and public, while
 * communities are on. Printed on its own the setting is `url`.
 */
export interface StorefrontCommunity {
  id: string
  name: string
  tagline: string
  /** /community/<slug>, the community's own page. */
  url: string
  /** The cover picture's address, or "". */
  image: string
  /** The logo's address, or "". */
  logo: string
  /** Active members, a count of rows. */
  members: number
  /** "1 member", "1.2k members". */
  members_label: string
  posts: number
  /** Scheduled events still to come that every member may attend. */
  events: number
  /** "Free", "$19/month", "$49", or "". */
  price: string
  /** "Join for free", "Join for $19/month", "Request to join". */
  join_label: string
}

/**
 * One of the creator's collections, as a section reads it: a published
 * collection of this creator's and nothing else. `products` holds the first
 * of its published products, block-shaped like `products`.
 */
export interface StorefrontCollection {
  id: string
  title: string
  /** The collection's slug, as Shopify calls it. */
  handle: string
  /** Plain words, never markup. */
  description: string
  /** Its own picture, or its first product's, or "". */
  image: string
  /** /collections/<handle>. */
  url: string
  /** How many published products are in it. */
  products_count: number
  products: { id: string; type: string; settings: Record<string, unknown> }[]
}

export interface StorefrontData {
  /** Products a `product_picker` or `product_list` may name, block-shaped. */
  catalog?: { id: string; type?: string; settings: Record<string, unknown> }[]
  /** The creator's communities a `community_picker` may name, by id. */
  communities?: Record<string, StorefrontCommunity>
  /**
   * The creator's published collections a `collection_picker` or
   * `collection_list` may name, by id, in the creator's order. The same
   * list is the page's `collections`. Absent means none, and every
   * collection setting is empty.
   */
  collections?: Record<string, StorefrontCollection>
  /** Menus by handle, for `link_list`. */
  menus?: Record<string, Menu>
  shop?: { name?: string; description?: string; url?: string; product_count?: number }
  creator?: { name?: string; headline?: string; bio?: string; avatar?: string }
  product?: {
    id?: string
    title?: string
    price?: string
    compare_price?: string
    /** Words only. */
    description?: string
    /** Cleaned against the rich text allow list. Output with `raw`. */
    description_html?: string
    image?: string
    images?: string[]
    url?: string
    /** "What's included", one line each. */
    includes?: string[]
    /** The product's custom fields by name, plain words. */
    fields?: Record<string, string>
  } | null
  /** The collection the page is about, on a collection page only. */
  collection?: StorefrontCollection | null
}

// ── Limits ──────────────────────────────────────────────────────────────────

/** Fixed from the start rather than discovered by an outage. */
export const LIMITS = {
  /** Bytes. The whole package. */
  packageBytes: 50 * 1024 * 1024,
  /** Bytes. One asset. */
  assetBytes: 15 * 1024 * 1024,
  /** Bytes. One source file, including a section such as sections/flux_header.storelib. */
  sourceBytes: 5000 * 1024,
  /** Bytes. A section's compiled script. */
  scriptBytes: 64 * 1024,
  /** Bytes. A section's CSS. Same ceiling as a source file, so a large generated stylesheet still imports. */
  cssBytes: 5000 * 1024,
  filesPerPackage: 2000,
  sectionsPerTemplate: 60,
  blocksPerSection: 50,
  settingsPerSchema: 120,
} as const
