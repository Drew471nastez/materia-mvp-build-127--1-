/**
 * ===========================================================================
 *  WHERE THE OLD BUILDER MEETS THE NEW ENGINE
 * ===========================================================================
 * The editor and the published page hold a section as `SectionInstance`
 * (`{ id, type, name, settings, blocks: [] }`) and the theme as
 * `ThemeSettingsValues`. The engine in lib/storelib-theme holds a section as
 * `SectionInstanceData` (`{ type, settings, blocks: {}, block_order }`) and
 * the theme as plain settings. This file is the only place that knows both
 * shapes, so the engine stays free of the application and the application
 * changes one file when the storage shape moves.
 *
 * It also owns the compiled sections. A `.storelib` file compiles once per
 * source text and every instance of it renders from the same compiled tree;
 * a change to an instance's settings never recompiles anything.
 */
/**
 * FROM THE MODULES, NOT FROM THE BARREL.
 *
 * `@/lib/storelib-theme` re-exports the packager, the packager needs jszip,
 * and a client component that imports the barrel therefore ships jszip to
 * every visitor of every published site — measured at 96 KB in the chunk
 * that carries this file, for code that packages a theme for download and
 * can never run on a storefront. Importing the two modules this file
 * actually uses keeps the graph honest.
 */
import { withStorelibIcons } from "./storelib-icons"
import { COMPILE_CACHE_LIMIT, compileBlock, compileSection, createLru } from "@/lib/storelib-theme/storelib/compile"
import { blockSourcePath, keyedFromList, type ListBlock } from "@/lib/storelib-theme/blocks"
import { renderSection } from "@/lib/storelib-theme/render"
import type { CompiledBlock, CompiledSection, RenderContext, SectionInstanceData, StorefrontData, ThemeError } from "@/lib/storelib-theme/types"
import type { StorefrontGlobals } from "@/lib/storelib-theme/globals"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import type { SectionInstance, ThemeSettingsValues } from "./types"
import { optimizeSectionMedia } from "./media-pass"
import { withNewTabAnchors } from "./new-tab"

/** `sections/<type>.storelib`, the path a section's source lives at. */
export function sectionSourcePath(type: string): string {
  return `sections/${type}.storelib`
}

/**
 * The source a section type renders from. The default theme's files are in
 * the bundle; a custom file saved from the code editor (Phase C) will be
 * consulted first, here, and nowhere else.
 */
export function sectionSource(type: string, overrides?: Record<string, string>): string | null {
  const path = sectionSourcePath(type)
  return overrides?.[path] ?? DEFAULT_THEME_SOURCES[path] ?? null
}

/**
 * A new section's starting settings: its preset's, and, for a section whose
 * title is the page's `<h1>` (a hero, a page's own title, search, 404), the
 * Heading 1 text style. Every section's heading followed Heading 2 unless it
 * chose otherwise, so Theme settings › Typography › Heading 1 reached none
 * of the page titles the theme ships. Only for a section being added: a page
 * already published keeps the size it has.
 */
export function newSectionSettings(type: string, preset: Record<string, unknown> | undefined, overrides?: Record<string, string>): Record<string, unknown> {
  const settings = { ...(preset ?? {}) }
  if (settings.heading_style !== undefined) return settings
  const src = sectionSource(type, overrides)
  const template = src?.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? ""
  const first = template.match(/<h([1-6])[\s>]/)
  if (first?.[1] === "1") settings.heading_style = "h1"
  return settings
}

/**
 * Whether a section of this type draws the page's product itself: its
 * template reads `product` or `page.product` (a product page of the
 * creator's own), as opposed to a grid that reads `products`.
 */
export function drawsTheProduct(type: string, overrides?: Record<string, string>): boolean {
  if (type === "product") return true
  const src = overrides?.[sectionSourcePath(type)]
  if (!src) return false
  const template = src.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? ""
  return /\{\{-?\s*(?:page\.)?product\.|\{%-?\s*(?:if|unless|for)\b[^%]*\b(?:page\.)?product\b(?!s)/.test(template)
}

/** Whether this section type is rendered by the engine rather than a React renderer. */
export function isStorelibSection(type: string, overrides?: Record<string, string>): boolean {
  return sectionSource(type, overrides) !== null
}

type Compiled = { ok: true; value: CompiledSection } | { ok: false; errors: ThemeError[] }

/**
 * One compile per distinct source text. The key is the text itself, so an
 * edited file is a new entry and an unchanged one is a hit — and because
 * every save of every file is a new key, it is bounded: see createLru.
 */
const compiled = createLru<Compiled>(COMPILE_CACHE_LIMIT)

export function compiledSection(type: string, overrides?: Record<string, string>): Compiled {
  const source = sectionSource(type, overrides)
  if (source === null) {
    return { ok: false, errors: [{ stage: "package", message: `There is no ${sectionSourcePath(type)}`, file: sectionSourcePath(type) }] }
  }
  const hit = compiled.get(source)
  if (hit) return hit
  // No `expectType`: the path IS the type here, so the schema's own line
  // adds nothing but a second place to keep in step. See the files route.
  // `lenient`: this is a saved file being drawn, not a save; see compile.ts.
  const r = compileSection(source, { file: sectionSourcePath(type), lenient: true })
  const out: Compiled = r.ok === true ? { ok: true, value: r.value } : { ok: false, errors: r.errors }
  compiled.set(source, out)
  return out
}

/** `blocks/<type>.storelib`: a theme block's own file. */
export { blockSourcePath }

/** The source a theme block draws from: the install's own file first, then the theme's. */
export function blockSource(type: string, overrides?: Record<string, string>): string | null {
  const path = blockSourcePath(type)
  return overrides?.[path] ?? DEFAULT_THEME_SOURCES[path] ?? null
}

type CompiledB = { ok: true; value: CompiledBlock } | { ok: false; errors: ThemeError[] }
const compiledBlocks = createLru<CompiledB>(COMPILE_CACHE_LIMIT)

/** A theme block, compiled once per distinct source text, like a section. */
export function compiledBlock(type: string, overrides?: Record<string, string>): CompiledB {
  const source = blockSource(type, overrides)
  if (source === null) {
    return { ok: false, errors: [{ stage: "package", message: `There is no ${blockSourcePath(type)}`, file: blockSourcePath(type) }] }
  }
  const key = `${type}\0${source}`
  const hit = compiledBlocks.get(key)
  if (hit) return hit
  const r = compileBlock(source, { file: blockSourcePath(type), type, lenient: true })
  const out: CompiledB = r.ok === true ? { ok: true, value: r.value } : { ok: false, errors: r.errors }
  compiledBlocks.set(key, out)
  return out
}

/** What renderSection asks for a block type: its compiled file, or nothing. */
export function blockLookup(overrides?: Record<string, string>): (type: string) => CompiledBlock | null {
  return (type) => {
    const c = compiledBlock(type, overrides)
    return c.ok === true ? c.value : null
  }
}

/** The editor's shape → the engine's. Blocks keep their ids, their order, and the blocks inside them. */
export function toInstanceData(section: SectionInstance): SectionInstanceData {
  const { blocks, block_order } = keyedFromList(section.blocks as ListBlock[] | undefined)
  return {
    type: section.type,
    settings: section.settings,
    blocks,
    block_order,
    hidden: section.hidden,
    name: section.name,
  }
}

export type StorelibRendered =
  | {
      ok: true
      html: string
      css: string
      /**
       * The section's checked `<script>`, wrapped as a function body, or
       * null. It is NOT run here and never on the page: it goes to the
       * sandbox frame. See components/website-builder/sections/section-sandbox.
       */
      script: string | null
      /** What its schema declared, which is what the sandbox will grant. */
      capabilities: string[]
    }
  | { ok: false; errors: ThemeError[] }

/**
 * An instance to markup and scoped CSS. Pure: the same section and theme
 * give the same strings on the server and in the browser, which is what
 * lets React hydrate the result without a mismatch.
 */
export function renderStorelibSection(
  section: SectionInstance,
  theme: ThemeSettingsValues,
  page: { template: string; in_editor?: boolean; [key: string]: unknown } = { template: "index" },
  overrides?: Record<string, string>,
  /**
   * The creator's published products, block-shaped, for a section that draws
   * the catalogue rather than hand-typed cards. Last and optional so every
   * existing caller is unchanged, and absent means a section that asks for
   * products draws none — which is what the export and a thumbnail want.
   */
  products?: RenderContext["products"],
  /**
   * The shop's own facts: the catalogue pickers name, the menus, the shop,
   * the creator and on a product page the product. Built by
   * lib/website-builder/storefront-data.ts; absent means none of them.
   */
  data?: StorefrontData,
  /**
   * The store and, on a page drawn for one visitor, the visitor: `shop`,
   * `customer`, `wishlist` (lib/storelib-theme/globals.ts). Absent is the
   * theme's own `shop` and nobody signed in.
   */
  globals?: StorefrontGlobals,
  /** The builder's canvas only: scheme colours printed as the variables the section's root holds (lib/storelib-theme/scheme-vars.ts). */
  opts?: { schemeVariables?: boolean },
): StorelibRendered {
  const c = compiledSection(section.type, overrides)
  if (c.ok === false) return c
  /*
    NO HEART ON A STORE WITHOUT A WISHLIST (round 66). With the header's wishlist icon off (./chrome-logo.ts sets
    `wishlist_off`) a visitor has no way to the hearts' list, so a card draws none. The account page keeps its own
    list of what was saved.
  */
  if ((theme as unknown as { wishlist_off?: unknown }).wishlist_off === true && section.type !== "main_account" && section.settings?.show_wishlist !== false) {
    section = { ...section, settings: { ...section.settings, show_wishlist: false } }
  }
  /*
    THE COLLECTION A COLLECTION TEMPLATE IS ABOUT, IN THE BUILDER TOO. The
    live route hands the page's collection as `collection`; the builder has
    no handle in its address, so while it draws the Collection page template
    the first of the creator's collections stands in, as the newest product
    does on the Product page (withPageProduct below).
  */
  if (page.template === "collection" && page.in_editor === true && data && !data.collection) {
    const first = Object.values(data.collections ?? {})[0]
    if (first) data = { ...data, collection: first }
  }
  const r = renderSection({
    compiled: c.value,
    id: section.id,
    instance: toInstanceData(section),
    theme: theme as unknown as Record<string, unknown>,
    page: withPageProduct(page, products),
    products,
    data,
    globals,
    blocks: blockLookup(overrides),
    ...(opts?.schemeVariables ? { schemeVariables: true } : {}),
  })
  return {
    ok: true,
    /* Every picture and video sized, lazy and faded in, whoever wrote the section: ./media-pass.ts. */
    /* A link set to open in a new tab (a menu's, a link setting's) drawn as one, on the site and in the canvas alike: ./new-tab.ts. */
    /* Round Q: an element marked data-storelib-icon="bag" gets the site's icon drawn in it, on the server (./storelib-icons.ts). */
    html: withStorelibIcons(withNewTabAnchors(optimizeSectionMedia(r.html))),
    css: r.css,
    script: c.value.script ?? null,
    capabilities: c.value.schema.capabilities ?? [],
  }
}

/**
 * ===========================================================================
 *  THE PRODUCT A PRODUCT PAGE IS ABOUT, IN THE BUILDER TOO
 * ===========================================================================
 * On a live product page the route hands its sections the product as
 * `page.product` (components/website-builder/theme/render-product.tsx). The
 * builder has no product in its address, so a section written for the
 * product page would draw an empty page there and the creator would be
 * designing blind. While the builder is drawing the product template and
 * nobody said which product, the newest one stands in: the same card the
 * site would draw, so what is designed is what is published.
 *
 * Only in the builder, and only on the product template. A visitor's page
 * without a product is a missing product, never somebody else's.
 *
 * The live route calls that template "product" and the builder, which names
 * every page but home `page.<key>` (lib/website-builder/site-pages.ts), calls
 * it "page.product". Both are the product page. The card has no description,
 * so it gets an empty one: `page.product` has the same fields either way.
 */
const PRODUCT_TEMPLATES = new Set(["product", "page.product"])

export function withPageProduct(
  page: { template: string; in_editor?: boolean; [key: string]: unknown },
  products?: RenderContext["products"],
): { template: string; in_editor?: boolean; [key: string]: unknown } {
  if (!PRODUCT_TEMPLATES.has(page.template) || page.product !== undefined || page.in_editor !== true) return page
  const first = products?.[0]
  if (!first) return page
  const settings = (first as { settings?: Record<string, unknown> }).settings ?? {}
  return { ...page, product: { ...first, settings: { description: "", ...settings } } }
}
