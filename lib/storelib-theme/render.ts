/**
 * ===========================================================================
 *  ONE INSTANCE, RENDERED
 * ===========================================================================
 * A compiled section and a template instance go in; HTML and CSS come out.
 * This is the whole of what the storefront and the editor canvas need, and
 * it has no React in it, because the output has to be the same whether it is
 * put on a page by React, written into a static file, or diffed in a test.
 *
 * The section's root carries `data-section-id`, which is what its CSS is
 * scoped to and what its script receives as `root`. The id is the
 * instance's — it came from the template JSON, and it survives every
 * render, which is the point of it.
 */
import { followScheme, resolveSectionColors, styleAttr } from "./color-schemes"
import { schemeAsVariables } from "./scheme-vars"
import { resolveControlType } from "./controls/registry"
import { collectionBlock, resolveInstance, resolveSettings, themeTokens, type ResolvedBlock } from "./resolve"
import { sectionTypography } from "./typography"
import { cssForBlockInstance, cssForInstance } from "./storelib/css"
import { guardSectionMarkup, guardStyleText } from "./storelib/raw-html"
import { engineHtml, renderTemplate, stripDocumentMarkup, type CompiledTemplate } from "./storelib/template"
import { applySettingMarks } from "./storelib/marks"
import { MAX_BLOCK_DEPTH, type CompiledBlock, type CompiledSection, type ContentForRequest, type RenderContext, type SectionInstanceData, type StorefrontData } from "./types"
import { SITE_ROUTES, shopObject, type StorefrontGlobals } from "./globals"
import { SHOP_CURRENCY } from "@/lib/store/shop-money"
import { shopWords } from "@/lib/markets/ui-words"

export interface RenderInput {
  compiled: CompiledSection
  /** The instance's persistent id. */
  id: string
  instance: SectionInstanceData
  /** The theme's settings; tokens are derived from them. */
  theme: Record<string, unknown>
  /** Which template this is on, and what it is about. */
  page: RenderContext["page"]
  /** asset://… → URL for this account. */
  assets?: Record<string, string>
  /**
   * The creator's published products, block-shaped. Absent means the surface
   * did not supply any, and a section that asks for them draws none.
   */
  products?: RenderContext["products"]
  /**
   * What the storefront knows: the catalogue a product picker or list may
   * name, the menus, the shop, the creator, and on a product page the
   * product. Absent means none of it, and every setting that reads it
   * draws empty, which is what an export or a thumbnail wants.
   */
  data?: StorefrontData
  /**
   * What the page knows about the store and, on a page drawn for one visitor,
   * about them. Absent means `shop` from the theme alone, and no customer.
   */
  globals?: StorefrontGlobals
  /**
   * The theme's blocks, by type: blocks/<type>.storelib, compiled. Absent
   * means none, and `content_for` draws nothing.
   */
  blocks?: (type: string) => CompiledBlock | null
  /**
   * The builder's canvas only: a section whose template and blocks read the
   * scheme only where a variable can stand in for a colour prints
   * `var(--scheme-*)` there instead of the colour (scheme-vars.ts), and its
   * root says so (`data-scheme-vars`), so a scheme colour under a finger is
   * its root's variables alone. The published page never asks for it.
   */
  schemeVariables?: boolean
}

export interface Rendered {
  /** The section's markup, wrapped in its scoped root. */
  html: string
  /** Its CSS, scoped to this instance. Empty when the section has none. */
  css: string
  /** The script bundle, when the section has one. NOT executed here. */
  script: string | null
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  "$48.00 USD": THEME SETTINGS › CURRENCY FORMAT
 * ═══════════════════════════════════════════════════════════════════════════
 * Shopify's Show currency codes. Prices reach a section already formatted
 * (lib/website-builder/shop-products.ts: templates do not do money), so the
 * code is added here, to every price the page was handed, once per list.
 * Off, the lists go through untouched.
 */
/*
  THE CODE OF THE CURRENCY THE PRICE IS WRITTEN IN. Each card says which
  (`settings.currency`: the store's own, from Settings › Country & Currency,
  or the market's once lib/markets/pricing.ts pricesInMarket has converted
  it); the deployment's (lib/store/shop-money.ts) only when a card does not.
  It was always the deployment's, and only after a price that began with a
  dollar sign: a store selling in lei, euros or pounds turned Show currency
  codes on and no card changed, in the builder or on the website, and a
  dollar store on a lei deployment was labelled RON.
*/
const SHOP_CURRENCY_CODE = SHOP_CURRENCY
const coded = new WeakMap<object, unknown>()

/** "$48.00" to "$48.00 USD", "48,00 lei" to "48,00 lei RON", as Shopify's money_with_currency: the amount as written, then the code. */
export function withCurrencyCode(price: unknown, code: unknown): unknown {
  if (typeof price !== "string" || price.trim() === "") return price
  const c = typeof code === "string" && /^[A-Z]{3}$/.test(code) ? code : SHOP_CURRENCY_CODE
  /* A price that names its code already ("RON 48.00") is left as it is. */
  if (new RegExp(`(^|[^A-Z])${c}([^A-Z]|$)`).test(price)) return price
  /* Words with no amount in them ("Free") are not a price to label. */
  if (!/\d/.test(price)) return price
  return `${price.trim()} ${c}`
}

function codedCard<T extends { settings: Record<string, unknown> }>(card: T): T {
  const s = card.settings
  const code = s.currency
  const variants = Array.isArray(s.variants)
    ? (s.variants as Record<string, unknown>[]).map((v) => ({ ...v, price: withCurrencyCode(v.price, code), compare_price: withCurrencyCode(v.compare_price, code) }))
    : s.variants
  return { ...card, settings: { ...s, price: withCurrencyCode(s.price, code), compare_price: withCurrencyCode(s.compare_price, code), ...(variants !== undefined ? { variants } : {}) } }
}

function codedList<T extends { settings: Record<string, unknown> }>(list: T[] | undefined): T[] | undefined {
  if (!list) return list
  const hit = coded.get(list)
  if (hit) return hit as T[]
  const out = list.map(codedCard)
  coded.set(list, out)
  return out
}

function codedCollections(map: StorefrontData["collections"]): StorefrontData["collections"] {
  if (!map) return map
  const hit = coded.get(map)
  if (hit) return hit as StorefrontData["collections"]
  const out = Object.fromEntries(Object.entries(map).map(([k, c]) => [k, { ...c, products: codedList(c.products) ?? [] }]))
  coded.set(map, out)
  return out
}

export function renderSection(input: RenderInput): Rendered {
  const { compiled, id, instance } = input
  const assets = input.assets ?? {}
  const showCode = input.theme.currency_code_enabled === true
  const handed = input.data ?? {}
  const data: StorefrontData = showCode
    ? { ...handed, catalog: codedList(handed.catalog as { id: string; settings: Record<string, unknown> }[] | undefined), collections: codedCollections(handed.collections) }
    : handed
  if (showCode) input = { ...input, products: codedList(input.products) }
  const blockOf = input.blocks ?? (() => null)
  /* What this page is about, for a picker set to the page's own product or collection (resolve.ts CURRENT_REF). */
  const current = {
    product: data.product?.id ? { id: data.product.id, type: "product", settings: data.product as Record<string, unknown> } : null,
    collection: data.collection ?? null,
  }
  const resolveOpts = { assets, catalog: data.catalog, menus: data.menus, communities: data.communities, collections: data.collections, current }
  const { settings, blocks, statics } = resolveInstance(compiled.schema, instance, {
    ...resolveOpts,
    themeBlock: (type) => blockOf(type)?.schema ?? null,
  })
  const theme = themeTokens(input.theme)
  /**
   * The section's colours: its scheme, then its own overrides, resolved by
   * the same function the React renderers call. Exposed under both the
   * semantic names and the legacy ones.
   */
  const schemeSetting = compiled.schema.settings.find((s) => s.type === "color_scheme" || s.id === "color_scheme")
  /*
    A SECTION NOBODY GAVE A SCHEME TAKES THE THEME'S. Theme settings › Colors
    › "Default for new sections" was read by nothing: every section's schema
    says `"default": "white"`, and the schema's default filled the gap before
    the theme could. The panel showed the theme's choice and the page drew
    white. Now a scheme only counts when the section saved one, and the
    template's own `settings.color_scheme` names the scheme it really got.
  */
  const savedScheme = schemeSetting ? (input.instance.settings as Record<string, unknown> | undefined)?.[schemeSetting.id] : undefined
  const unsaved = schemeSetting && (savedScheme === undefined || savedScheme === null || savedScheme === "")
  const colorSettings = schemeSetting
    ? { ...settings, color_scheme: unsaved ? "" : settings[schemeSetting.id] }
    : settings
  const colors = resolveSectionColors(input.theme, colorSettings)
  if (schemeSetting && unsaved) settings[schemeSetting.id] = colors.key
  /* The builder's canvas: the scheme as its root's variables, when every template drawn here reads it only where one can stand in (scheme-vars.ts). */
  /* A block the section's own schema declares is drawn by the section's template, which was read with it; a theme block by its own file. */
  const local = new Set((compiled.schema.blocks ?? []).map((b) => b.type))
  const asVariables = input.schemeVariables === true && compiled.schemeVars === true && blockTypesIn(blocks, statics, compiled.statics, blockOf).every((t) => (local.has(t) && !blockOf(t)) || blockOf(t)?.schemeVars === true)
  const scheme = asVariables ? schemeAsVariables(colors.scheme, colors.legacy) : ({ ...colors.legacy, ...colors.scheme } as Record<string, string>)
  /* A colour setting still on `scheme.<name>` is that colour of THIS section's scheme: color-schemes.ts, followScheme. */
  followSchemeColours(compiled.schema.settings, settings, scheme)
  const blockDefs = new Map((compiled.schema.blocks ?? []).map((b) => [b.type, b.settings]))
  const follow = (list: ResolvedBlock[]) => {
    for (const b of list) {
      followSchemeColours(blockDefs.get(b.type) ?? blockOf(b.type)?.schema.settings ?? [], b.settings, scheme)
      follow(b.blocks)
      follow(Object.values(b.statics))
    }
  }
  follow(blocks)
  follow(Object.values(statics))
  const ctx: RenderContext = {
    settings,
    blocks,
    theme,
    scheme,
    page: input.page,
    products: input.products ?? [],
    /* Every published collection of the creator's the page was handed, in their order, block-shaped. */
    collections: Object.values(data.collections ?? {}).map(collectionBlock),
    section: { id, type: compiled.type },
    assets,
    /* The store: the theme's globals (globals.ts), with what only the server knows (storefront-data.ts). */
    shop: {
      ...shopObject(input.theme, { ...(data.shop?.name ? { name: data.shop.name } : {}), ...input.globals?.shop }),
      ...(data.shop?.description !== undefined ? { description: data.shop.description } : {}),
      ...(data.shop?.product_count !== undefined ? { product_count: data.shop.product_count } : {}),
    } as unknown as Record<string, unknown>,
    routes: SITE_ROUTES,
    customer: input.globals?.customer ?? null,
    wishlist: (input.globals?.wishlist ?? null) as unknown as Record<string, unknown> | null,
    creator: data.creator,
    product: data.product ?? null,
    collection: data.collection ?? null,
    reviews: data.reviews ?? null,
    /* The words a section draws itself, in the page's language: each English unless translated (lib/markets/ui-words.ts). */
    words: shopWords(data.words),
    request: {
      page_type: input.page.template,
      path: typeof input.page.path === "string" ? input.page.path : "",
      design_mode: input.page.in_editor === true,
    },
  }
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THEME BLOCKS, DRAWN WHERE THE TEMPLATE SAYS
   * ═════════════════════════════════════════════════════════════════════════
   * `{% content_for "blocks" %}` asks for the owner's blocks in order;
   * `{% content_for "block", type, id %}` for one static block. Each is drawn
   * by its own compiled file, wrapped in its element (`sl-block`, with
   * `data-block-id` so a click on the canvas selects it), and its own
   * `content_for` asks for ITS blocks, to MAX_BLOCK_DEPTH.
   *
   * A block whose file is gone draws nothing on a live page and says so in
   * the editor, so the person who removed the file sees what it took with it.
   */
  const inEditor = input.page.in_editor === true
  const blockCss = new Map<string, string>()
  const drawBlock = (node: ResolvedBlock, depth: number): string => {
    if (depth > MAX_BLOCK_DEPTH) return ""
    const attrs = `data-block-id="${escapeAttr(node.id)}" data-block-type="${escapeAttr(node.type)}"`
    const cb = blockOf(node.type)
    if (!cb) {
      return inEditor
        ? `<div class="sl-block sl-block--missing" ${attrs} style="padding:12px;border:1px dashed currentColor;opacity:.6;font:13px/1.4 system-ui,sans-serif">This theme has no blocks/${escapeHtml(node.type)}.storelib</div>`
        : ""
    }
    const blockCtx: RenderContext = {
      ...ctx,
      settings: node.settings,
      blocks: node.blocks,
      block: { id: node.id, type: node.type, settings: node.settings, blocks: node.blocks, storelib_attributes: engineHtml(attrs) },
      sectionScope: { settings, blocks },
      contentFor: contentForOf(node, depth),
    }
    const inner = renderTemplate(cb.template as CompiledTemplate, blockCtx, { marks: inEditor })
    if (cb.css) {
      if (cb.cssTemplate) {
        /* Per instance, and only for an id that cannot leave a selector. */
        if (SAFE_ID.test(node.id) && SAFE_ID.test(id)) {
          blockCss.set(`${node.type}#${node.id}`, cssForBlockInstance(renderTemplate(cb.cssTemplate as CompiledTemplate, blockCtx, { mode: "css" }), id, node.id))
        }
      } else if (!blockCss.has(node.type)) blockCss.set(node.type, cb.css)
    }
    const tag = cb.schema.tag === undefined ? "div" : cb.schema.tag
    if (tag === null) return inner
    const cls = ["sl-block", ...String(cb.schema.class ?? "").split(/\s+/).filter(Boolean)].join(" ")
    return `<${tag} class="${escapeAttr(cls)}" ${attrs}>${inner}</${tag}>`
  }
  const contentForOf = (owner: { blocks: ResolvedBlock[]; statics: Record<string, ResolvedBlock> }, depth: number) =>
    (req: ContentForRequest): string => {
      if (req.what === "blocks") return owner.blocks.map((b) => drawBlock(b, depth + 1)).join("")
      const saved = owner.statics[req.id]
      if (saved?.hidden) return ""
      if (saved && saved.type === req.type) return drawBlock(saved, depth + 1)
      /* Never edited yet: the block as its file describes it. */
      const cb = blockOf(req.type)
      const fresh: ResolvedBlock = {
        id: req.id,
        type: req.type,
        settings: cb ? resolveSettings(cb.schema.settings, undefined, resolveOpts) : {},
        blocks: [],
        statics: {},
      }
      if (cb) followSchemeColours(cb.schema.settings, fresh.settings, scheme)
      return drawBlock(fresh, depth + 1)
    }
  ctx.contentFor = contentForOf({ blocks, statics }, 0)

  /* No tag here acts on the whole document, whatever the file or a richtext
     setting held: storelib/template.ts, DOCUMENT_MARKUP. And nothing drawn
     runs anything, however the template spelled it: storelib/raw-html.ts,
     guardSectionMarkup. */
  /* In the builder, each output of a setting names its element first: storelib/marks.ts. Before the guards, so they see the markup as it will be. */
  const drawn = renderTemplate(compiled.template as CompiledTemplate, ctx, { marks: inEditor })
  const inner = guardSectionMarkup(stripDocumentMarkup(inEditor ? applySettingMarks(drawn) : drawn))
  const typo = sectionTypography(settings)
  const attrs = [
    `data-section-id="${escapeAttr(id)}"`,
    `data-section-type="${escapeAttr(compiled.type)}"`,
    `data-color-scheme="${escapeAttr(colors.key)}"`,
  ]
  if (asVariables) attrs.push("data-scheme-vars")
  if (typo.heading) attrs.push(`data-heading-style="${escapeAttr(typo.heading)}"`)
  if (typo.body) attrs.push(`data-body-style="${escapeAttr(typo.body)}"`)
  const rootStyle: Record<string, string> = { ...colors.vars, ...typo.vars }
  if (colors.scheme.gradient) rootStyle.background = colors.scheme.gradient
  attrs.push(`style="${escapeAttr(styleAttr(rootStyle))}"`)
  const html = `<div ${attrs.join(" ")}>${inner}</div>`
  const sectionCss = compiled.css
    ? cssForInstance(compiled.cssTemplate ? renderTemplate(compiled.cssTemplate as CompiledTemplate, ctx, { mode: "css" }) : compiled.css, id)
    : ""
  const css = [sectionCss, ...blockCss.values()].filter(Boolean).join("\n")
  return {
    html,
    /* It is written into a <style> element, which a `</style` would end early. */
    css: css ? guardStyleText(css) : "",
    script: compiled.script,
  }
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/

/** Every theme block type a section can draw: its blocks, its static blocks, those its template places, and theirs, to MAX_BLOCK_DEPTH. */
function blockTypesIn(blocks: ResolvedBlock[], statics: Record<string, ResolvedBlock>, placed: { type: string }[] | undefined, blockOf: (type: string) => CompiledBlock | null): string[] {
  const out = new Set<string>()
  const walk = (list: ResolvedBlock[], depth: number) => {
    if (depth > MAX_BLOCK_DEPTH) return
    for (const b of list) {
      if (!out.has(b.type)) {
        out.add(b.type)
        for (const p of blockOf(b.type)?.statics ?? []) walkType(p.type, depth + 1)
      }
      walk(b.blocks, depth + 1)
      walk(Object.values(b.statics), depth + 1)
    }
  }
  const walkType = (type: string, depth: number) => {
    if (depth > MAX_BLOCK_DEPTH || out.has(type)) return
    out.add(type)
    for (const p of blockOf(type)?.statics ?? []) walkType(p.type, depth + 1)
  }
  walk(blocks, 0)
  walk(Object.values(statics), 0)
  for (const p of placed ?? []) walkType(p.type, 0)
  return [...out]
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/** In place: each colour setting naming a scheme colour gets the colour itself. */
function followSchemeColours(defs: { id: string; type: string }[], values: Record<string, unknown>, scheme: Record<string, string>): void {
  for (const def of defs) {
    if (resolveControlType(def.type) !== "color") continue
    const v = values[def.id]
    if (typeof v === "string" && v.startsWith("scheme.")) values[def.id] = followScheme(v, scheme)
  }
}
