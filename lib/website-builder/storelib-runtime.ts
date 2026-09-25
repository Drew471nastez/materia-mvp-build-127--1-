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
import { COMPILE_CACHE_LIMIT, compileSection, createLru } from "@/lib/storelib-theme/storelib/compile"
import { renderSection } from "@/lib/storelib-theme/render"
import type { CompiledSection, RenderContext, SectionInstanceData, ThemeError } from "@/lib/storelib-theme/types"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import type { SectionInstance, ThemeSettingsValues } from "./types"

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

/** The editor's shape → the engine's. Blocks keep their ids and their order. */
export function toInstanceData(section: SectionInstance): SectionInstanceData {
  const blocks = section.blocks ?? []
  return {
    type: section.type,
    settings: section.settings,
    blocks: Object.fromEntries(blocks.map((b) => [b.id, { type: b.type, settings: b.settings }])),
    block_order: blocks.map((b) => b.id),
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
): StorelibRendered {
  const c = compiledSection(section.type, overrides)
  if (c.ok === false) return c
  const r = renderSection({
    compiled: c.value,
    id: section.id,
    instance: toInstanceData(section),
    theme: theme as unknown as Record<string, unknown>,
    page: withPageProduct(page, products),
    products,
  })
  return {
    ok: true,
    html: r.html,
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
 */
export function withPageProduct(
  page: { template: string; in_editor?: boolean; [key: string]: unknown },
  products?: RenderContext["products"],
): { template: string; in_editor?: boolean; [key: string]: unknown } {
  if (page.template !== "product" || page.product !== undefined || page.in_editor !== true) return page
  const first = products?.[0]
  return first ? { ...page, product: first } : page
}
