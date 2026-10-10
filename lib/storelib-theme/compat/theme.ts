/**
 * ===========================================================================
 *  A THEME IN THE COMPATIBLE PROFILE, DRAWN BY STORELIB
 * ===========================================================================
 * The files of a theme imported from Shopify (see lib/storelib-theme/shopify/
 * convert.ts), kept in their own folders:
 *
 *   layout/theme.storelib        the page shell: <head>, the header and
 *                                footer groups, {{ content_for_layout }}
 *   sections/<type>.storelib     a section: its markup, and its schema twice,
 *                                once as Storelib's editor reads it and once
 *                                as the theme wrote it ("shopify")
 *   blocks/<type>.storelib       a theme block, the same way
 *   snippets/<name>.storelib     a snippet, markup only
 *   templates/<page>.json        a page's sections, as Shopify writes them
 *   sections/<group>.json        the header and footer groups
 *   config/settings_schema.json  the theme's settings, and the values in the
 *                                theme's Storelib settings under `shopify`
 *   locales/*.json               the words, for `| t`
 *   assets/*                     stylesheets, scripts, SVGs, pictures, fonts
 *
 * Drawing is the same on the server (a published page, a preview) and in
 * the browser (the builder's canvas): this module has no Node or DOM in it.
 * What differs is only what the builder leaves out on purpose: the theme's
 * own scripts, which run on the website's own address and never in the
 * builder, where they could act for the person signed in.
 */
import { compatFilter, escapeHtml } from "./filters"
import { CompatSyntaxError } from "./lexer"
import { parseCompat, type Parsed } from "./parser"
import { Ctx, OUTPUT, evaluate, renderString, renderTree, toList, toOutput, type Env } from "./runtime"
import { parseOutput } from "./expression"
import {
  SHOPIFY_ROUTES,
  blockAttributes,
  cartObject,
  collectionByHandle,
  collectionObject,
  fontLinks,
  fontObject,
  linklistObject,
  localizationObject,
  productObject,
  requestObject,
  schemesObject,
  typedSettings,
  type CardLike,
  type CartLineLike,
  type CollectionLike,
  type MenuLinkLike,
  type DynamicResolver,
  type Resources,
  type ShopifySetting,
} from "./objects"
import { formatMoney, type CompatRegisters } from "./filters"
import { shopifyBootstrap, withoutShopifyCdn } from "./shims"
import { blocksIntoDetails, contentForStatics } from "@/lib/website-builder/product-details-rule"

type O = Record<string, unknown>

// ── Files ────────────────────────────────────────────────────────────────────

/** `<template compat="shopify">` … `</template>`: the markup of a compatible file. */
export const COMPAT_ATTR = /^\s*<template\s+compat="shopify"\s*>/

export function isCompatSource(source: string | null | undefined): boolean {
  return !!source && COMPAT_ATTR.test(source)
}

/** A line of the theme's markup that is only `</template>` (an HTML template element) is guarded, so the file's own block does not end there. */
const GUARD = "{% comment %}{% endcomment %}"

export function wrapCompatTemplate(markup: string): string {
  const safe = markup.replace(/^([ \t]*<\/(?:template|style|script|schema)>[ \t]*)$/gm, `${GUARD}$1`)
  return `<template compat="shopify">\n${safe}\n</template>`
}

/** The markup and the schema of a compatible file. */
export function splitCompatFile(source: string): { markup: string; schema: O | null } {
  const lines = source.split("\n")
  const start = lines.findIndex((l) => COMPAT_ATTR.test(l))
  if (start < 0) return { markup: "", schema: null }
  let end = start + 1
  while (end < lines.length && !/^\s*<\/template>\s*$/.test(lines[end])) end++
  const markup = lines.slice(start + 1, end).join("\n").split(GUARD).join("")
  const rest = lines.slice(end + 1).join("\n")
  const sm = rest.match(/<schema>\s*([\s\S]*?)\s*<\/schema>/)
  let schema: O | null = null
  if (sm) {
    try { schema = JSON.parse(sm[1]) as O } catch { schema = null }
  }
  return { markup, schema }
}

/** A theme file's Shopify schema: the original, kept under "shopify", or the schema itself. */
export function shopifySchemaOf(schema: O | null): O {
  if (!schema) return {}
  const own = schema.shopify
  return own && typeof own === "object" ? (own as O) : schema
}

// ── Pages ────────────────────────────────────────────────────────────────────

/** A section on a page, as Storelib stores it. */
export interface CompatSectionInstance {
  id: string
  type: string
  settings?: Record<string, unknown>
  blocks?: CompatBlockInstance[]
  hidden?: boolean
  disabled?: boolean
  /** For a section of the Overlay group: the theme's group file it is drawn in (overlay-group). */
  slot?: string
}
export interface CompatBlockInstance {
  id: string
  type: string
  settings?: Record<string, unknown>
  blocks?: CompatBlockInstance[]
  static?: boolean
  hidden?: boolean
  disabled?: boolean
}

/** A policy of the shop: its address is /policies/<handle>, as on Shopify. */
export interface ShopPolicy {
  handle: string
  title: string
  body: string
}

const policyObjects = (list: ShopPolicy[] | undefined): O[] =>
  (list ?? []).map((p) => ({ id: p.handle, handle: p.handle, title: p.title, body: p.body, url: `/policies/${p.handle}` }))

/** Everything one page of the site is drawn with. */
export interface CompatPage {
  /** The header and footer groups' sections, as the page row stores them. Absent: the theme's group files. */
  groups?: { header?: CompatSectionInstance[]; footer?: CompatSectionInstance[]; overlay?: CompatSectionInstance[] }
  /** Shopify's template name: index, product, collection, list-collections, search, cart, page, 404, password. */
  template: string
  /** A page's suffix, for templates/page.contact.json: "contact". */
  suffix?: string
  path: string
  query?: Record<string, string>
  designMode: boolean
  host?: string
  title?: string
  description?: string
  products: CardLike[]
  /** Every product a picker may name (Resources.catalog); the shop's list when absent. */
  pickable?: CardLike[]
  collections: CollectionLike[]
  menus: Record<string, { title?: string; links: MenuLinkLike[] }>
  product?: CardLike & { descriptionHtml?: string } | null
  selectedVariantId?: string | null
  collection?: CollectionLike | null
  cart?: CartLineLike[]
  shop: { name: string; description?: string; url?: string; email?: string; currency?: string; moneyFormat?: string; policies?: ShopPolicy[] }
  customer?: O | null
  search?: { terms: string; results: CardLike[]; performed: boolean } | null
  /** `page` on a page template: its title and its body. */
  pageObject?: { title: string; content: string; handle: string; url: string } | null
  /** Products like the one a recommendations request names (/recommendations/products). */
  recommendations?: { products: CardLike[]; intent?: string } | null
  /** What the search box has found so far (/search/suggest). */
  predictive?: { terms: string; products: CardLike[]; collections: CollectionLike[]; queries?: string[] } | null
  /** The filters, sort and pages a collection or the search draws: lib/products/catalog-filters.ts. */
  catalog?: { filters?: O[]; sortBy?: string; pagination?: O } | null
}

export interface CompatThemeOptions {
  /** A file in assets/ by name, as an address. */
  assetUrl: (name: string) => string | null
  /** A text file in assets/ (an SVG, a stylesheet) by name. */
  assetText?: (name: string) => string | null
  /** A picture setting's stored value as an address: "shopify://shop_images/x.jpg" is not one Storelib can reach. */
  imageUrl?: (value: string) => string
  /** Section names the theme used that Storelib keeps for its own: header → theme-header. */
  renamed?: Record<string, string>
  /** The theme's name, for window.Shopify.theme. */
  themeName?: string
  /** Section groups besides the header and footer whose sections the page holds (install.ts, CompatSettings.slots). */
  slots?: string[]
  /** A header or footer group under a name of the theme's own (install.ts, CompatSettings.chrome_groups). */
  chromeGroups?: Record<string, "header" | "footer">
}

export interface RenderedSection {
  html: string
  /** Problems while drawing, for the builder to show beside the section. */
  errors: string[]
}

// ── The theme ────────────────────────────────────────────────────────────────

export class CompatTheme {
  private parsed = new Map<string, Parsed | null>()
  private schemas = new Map<string, O>()
  private staticCache = new Map<string, { type: string; id: string }[]>()
  private locale: O | null
  private schemaLocale: O | null
  readonly settingsSchema: O[]
  readonly warnings: string[] = []
  /** What a page drew without: Shopify's own scripts, sections the theme does not have. Each once. */
  readonly diagnostics = new Set<string>()

  constructor(public readonly files: Record<string, string>, public readonly settingsValues: O, private opts: CompatThemeOptions) {
    this.locale = parseJsonLoose(files["locales/en.default.json"]) as O | null
    this.schemaLocale = parseJsonLoose(files["locales/en.default.schema.json"]) as O | null
    const ss = parseJsonLoose(files["config/settings_schema.json"])
    this.settingsSchema = Array.isArray(ss) ? (ss as O[]) : []
  }

  // ── Reading files ──

  private tree(path: string): Parsed | null {
    if (this.parsed.has(path)) return this.parsed.get(path)!
    const src = this.files[path]
    let out: Parsed | null = null
    if (src !== undefined) {
      const markup = isCompatSource(src) ? splitCompatFile(src).markup : src
      try {
        out = parseCompat(markup)
      } catch (e) {
        const line = e instanceof CompatSyntaxError ? ` line ${e.line}` : ""
        this.warnings.push(`${path}${line}: ${(e as Error).message}`)
        /* Read again as Shopify's lenient parser reads it: one bad tag in the layout no longer takes the header, the footer and the CSS with it. */
        try {
          out = parseCompat(markup, { lax: true })
        } catch {
          out = null
        }
      }
    }
    this.parsed.set(path, out)
    return out
  }

  private fileFor(folder: "sections" | "blocks" | "snippets" | "layout", name: string): string | null {
    for (const ext of [".storelib", ".liquid"]) {
      const p = `${folder}/${name}${ext}`
      if (this.files[p] !== undefined) return p
    }
    return null
  }

/** The static blocks a section's file places, read once. */
  private staticsOf(path: string): { type: string; id: string }[] {
    const key = `statics:${path}`
    const hit = this.staticCache.get(key)
    if (hit) return hit
    const list = contentForStatics(this.files[path] ?? "")
    this.staticCache.set(key, list)
    return list
  }

  /** Whether a block of `owner`'s type can hold a block of `type`: named in its schema, or a public theme block where it takes "@theme". */
  private blockTakes = (owner: string, type: string): boolean => {
    const schema = this.schemaOf("blocks", owner)
    const named = (Array.isArray(schema.blocks) ? (schema.blocks as O[]) : []).map((b) => String(b.type ?? ""))
    if (named.includes(type)) return true
    if (/^shopify:\/\/apps\//.test(type)) return named.includes("@app")
    return !type.startsWith("_") && named.includes("@theme") && this.fileFor("blocks", type) !== null
  }

  schemaOf(folder: "sections" | "blocks", type: string): O {
    const key = `${folder}/${type}`
    const hit = this.schemas.get(key)
    if (hit) return hit
    const path = this.fileFor(folder, type)
    let schema: O = {}
    if (path) {
      const src = this.files[path]
      if (isCompatSource(src)) schema = shopifySchemaOf(splitCompatFile(src).schema)
      else {
        const t = this.tree(path)
        if (t?.schema) schema = (parseJsonLoose(t.schema) as O) ?? {}
      }
    }
    schema = this.schemaWords(schema)
    this.schemas.set(key, schema)
    return schema
  }

  /** A schema's defaults written as `t:` keys, as the words in the theme's schema locale (Shopify does the same). */
  private schemaWords(schema: O): O {
    const word = (v: unknown): unknown => {
      if (typeof v !== "string" || !v.startsWith("t:")) return v
      let cur: unknown = this.schemaLocale
      for (const part of v.slice(2).split(".")) cur = cur && typeof cur === "object" ? (cur as O)[part] : undefined
      if (typeof cur === "string") return cur
      const t = this.translate(v.slice(2))
      return typeof t === "string" ? t : ""
    }
    const settings = (list: unknown): unknown =>
      Array.isArray(list) ? list.map((s) => (s && typeof s === "object" && "default" in s ? { ...(s as O), default: word((s as O).default) } : s)) : list
    const out: O = { ...schema, settings: settings(schema.settings) }
    if (!Array.isArray(schema.settings)) delete out.settings
    if (Array.isArray(schema.blocks)) out.blocks = (schema.blocks as O[]).map((b) => (b && typeof b === "object" && Array.isArray(b.settings) ? { ...b, settings: settings(b.settings) } : b))
    return out
  }

  /** The CSS of every section, block and snippet's {% stylesheet %}, once each, as Shopify bundles it. */
  stylesheetBundle(): string {
    const parts: string[] = []
    for (const path of Object.keys(this.files).sort()) {
      if (!/^(sections|blocks|snippets)\/[^/]+\.(storelib|liquid)$/.test(path)) continue
      const t = this.tree(path)
      /* A <style> tag written inside {% stylesheet %} would end the bundle's own. */
      const css = t?.stylesheet.replace(/<\/?style\b[^>]*>/gi, "").trim()
      if (css) parts.push(`/* ${path} */\n${css}`)
    }
    return parts.join("\n")
  }

  /**
   * The script of every {% javascript %}, once each. Drawn on the website only.
   *
   * ONE FILE'S MISTAKE IS ITS OWN. Every section's script shares one
   * <script>, so a syntax error in any of them (a `<script>` tag written
   * inside {% javascript %}, as themes do) stopped every other section's
   * script on every page: the cart drawer, the variant picker, add to cart.
   * The tags around a script are taken off, a script that still does not
   * read is left out and named in the diagnostics, and each one runs in its
   * own try, so one that throws as it starts stops only itself.
   */
  private jsBundle: string | null = null
  javascriptBundle(): string {
    if (this.jsBundle !== null) return this.jsBundle
    const parts: string[] = []
    for (const path of Object.keys(this.files).sort()) {
      if (!/^(sections|blocks|snippets)\/[^/]+\.(storelib|liquid)$/.test(path)) continue
      const t = this.tree(path)
      const code = t?.javascript.replace(/<\/?script\b[^>]*>/gi, "").trim()
      if (!code) continue
      if (!readsAsScript(code)) {
        this.diagnostics.add(`The script in ${path} does not read as JavaScript and was left out`)
        continue
      }
      parts.push(`/* ${path} */\ntry{(function(){\n${code}\n})();}catch(e){console.error(${JSON.stringify(path)},e)}`)
    }
    this.jsBundle = parts.join("\n")
    return this.jsBundle
  }

  // ── The context ──

  private translate = (key: string): unknown => {
    let cur: unknown = this.locale
    for (const part of key.split(".")) {
      if (!cur || typeof cur !== "object") return null
      cur = (cur as O)[part]
    }
    return cur ?? null
  }

  private resources(page: CompatPage, schemes: Record<string, O>): Resources {
    return {
      products: page.products,
      catalog: page.pickable,
      collections: page.collections,
      menus: page.menus,
      schemes,
      imageUrl: (v) => (this.opts.imageUrl ? this.opts.imageUrl(v) : /^https?:\/\//.test(v) || v.startsWith("/") ? v : ""),
      currentPath: page.path,
      current: page.product ?? null,
    }
  }

  /** The whole context of a page, made once and shared by every section drawn on it. */
  pageContext(page: CompatPage): Ctx {
    const schemeSetting = this.settingsSchema.flatMap((g) => (Array.isArray(g.settings) ? (g.settings as O[]) : [])).find((s) => s.type === "color_scheme_group") as { id?: string; definition?: ShopifySetting[] } | undefined
    const schemes = schemesObject(schemeSetting, schemeSetting?.id ? this.settingsValues[schemeSetting.id] : undefined)
    const res = this.resources(page, schemes)
    const allSettings = this.settingsSchema.flatMap((g) => (Array.isArray(g.settings) ? (g.settings as ShopifySetting[]) : []))
    /* The theme's own settings may name each other ("{{ settings.color_palette.color3 }}"): read once the page's context exists. */
    let pageCtx: Ctx | null = null
    /* The theme's own settings name a product exactly or none (a gift wrap of the store it came from is not the shop's first product). */
    const settings = typedSettings(allSettings, this.settingsValues, res, resolverFor(() => pageCtx), { exactProducts: true })
    if (schemeSetting?.id) settings[schemeSetting.id] = schemes
    const currency = page.shop.currency ?? "USD"
    const moneyFormat = page.shop.moneyFormat ?? "${{amount}}"

    const productObj = page.product ? productObject(page.product, { descriptionHtml: page.product.descriptionHtml, selectedVariantId: page.selectedVariantId }) : null
    const collections: O = {}
    for (const c of page.collections) collections[c.handle] = collectionByHandle(res, c.handle)
    const allCard: CollectionLike = { id: "all", title: "Products", handle: "all", url: "/collections/all", products: page.products, products_count: page.products.length }
    collections.all = collectionByHandle(res, "all") ?? collectionObject(allCard)
    const collection = page.collection ? collectionObject(page.collection, undefined, page.catalog ? { filters: page.catalog.filters ?? [], sort_by: page.catalog.sortBy ?? "" } : {}) : page.template === "collection" ? collections.all as O : null

    const linklists: O = {}
    for (const [handle, m] of Object.entries(page.menus)) linklists[handle] = linklistObject(handle, m.title ?? handle, m.links, page.path)
    const all_products: O = {}
    for (const p of page.products) {
      const handle = String(p.settings.slug ?? "")
      if (handle) Object.defineProperty(all_products, handle, { enumerable: true, get: () => productObject(p) })
    }
    const cart = cartObject(page.cart ?? [], currency)
    const search = page.search
      ? { performed: page.search.performed, terms: page.search.terms, results: page.search.results.map((p) => ({ ...productObject(p), object_type: "product" })), results_count: page.search.results.length, types: ["product"], filters: page.catalog?.filters ?? [], sort_by: page.catalog?.sortBy ?? "", sort_options: [], default_sort_by: "relevance", url: `/search?q=${encodeURIComponent(page.search.terms)}` }
      : { performed: false, terms: "", results: [], results_count: 0, types: ["product"], filters: [], sort_options: [] }
    const shop = {
      [OUTPUT]: page.shop.name,
      name: page.shop.name,
      description: page.shop.description ?? "",
      url: page.shop.url ?? "",
      secure_url: page.shop.url ?? "",
      domain: page.host ?? "",
      permanent_domain: page.host ?? "",
      email: page.shop.email ?? "",
      currency,
      money_format: moneyFormat,
      money_with_currency_format: `${moneyFormat} ${currency}`,
      enabled_currencies: [{ iso_code: currency, symbol: "$", name: currency }],
      /* What Storelib's checkout takes (Stripe): cards and the two wallets. No PayPal, which it does not take. */
      enabled_payment_types: ["visa", "master", "american_express", "apple_pay", "google_pay"],
      locale: "en",
      published_locales: [{ iso_code: "en", name: "English", primary: true, root_url: "/" }],
      /* The creator's own policies (Website settings), as Shopify's shop.policies and shop.<name>_policy: a footer's policy links read these. */
      policies: policyObjects(page.shop.policies),
      ...Object.fromEntries(policyObjects(page.shop.policies).map((p) => [String(p.handle).replace(/-/g, "_"), p])),
      brand: { logo: null, square_logo: null, colors: {}, slogan: "", short_description: page.shop.description ?? "" },
      metafields: {},
      customer_accounts_enabled: true,
      customer_accounts_optional: true,
      accepts_gift_cards: false,
      products_count: page.products.length,
      collections_count: page.collections.length,
      types: [],
      vendors: [],
    }
    const template = { [OUTPUT]: page.suffix ? `${page.template}.${page.suffix}` : page.template, name: page.template, suffix: page.suffix ?? null, directory: null }

    const globals: O = {
      settings,
      shop,
      cart,
      routes: SHOPIFY_ROUTES,
      request: requestObject(page.template, page.path, page.designMode, page.host),
      localization: localizationObject(currency),
      template,
      page_title: page.title ?? defaultPageTitle(page),
      page_description: page.description ?? page.shop.description ?? "",
      canonical_url: page.host ? `https://${page.host}${page.path}` : page.path,
      handle: page.product ? productObj?.handle : page.collection?.handle ?? "",
      content_for_header: shopifyBootstrap({ shopName: page.shop.name, host: page.host, currency, designMode: page.designMode, themeName: this.opts.themeName }),
      collections,
      all_products,
      linklists,
      product: productObj,
      collection,
      search,
      customer: page.customer ?? null,
      page: page.pageObject ? { [OUTPUT]: page.pageObject.title, ...page.pageObject, id: page.pageObject.handle, template_suffix: page.suffix ?? null, metafields: {} } : null,
      /* A blog page draws the theme's blog with its title and no posts (Storelib keeps none), never a white page with nothing in it. */
      blog: page.template === "blog" || page.template === "article" ? emptyBlog(page.path) : null,
      blogs: {},
      articles: {},
      pages: {},
      images: {},
      metaobjects: {},
      powered_by_link: "",
      current_page: Number(page.query?.page ?? 1) || 1,
      current_tags: [],
      additional_checkout_buttons: false,
      content_for_additional_checkout_buttons: "",
      recommendations: page.recommendations
        ? { performed: true, products: page.recommendations.products.map((p) => productObject(p)), products_count: page.recommendations.products.length, intent: page.recommendations.intent ?? "related" }
        : { performed: false, products: [], products_count: 0, intent: "related" },
      predictive_search: page.predictive
        ? {
            performed: true,
            terms: page.predictive.terms,
            resources: {
              products: page.predictive.products.map((p) => productObject(p)),
              collections: page.predictive.collections.map((c) => collectionByHandle(res, c.handle) ?? collectionObject(c)),
              pages: [],
              articles: [],
              queries: (page.predictive.queries ?? []).map((q) => ({ [OUTPUT]: q, text: q, styled_text: escapeHtml(q), url: `/search?q=${encodeURIComponent(q)}` })),
            },
            types: ["product", "collection", "query"],
          }
        : { performed: false, terms: "", resources: { products: [], collections: [], pages: [], articles: [], queries: [] }, types: [] },
      scripts: [],
      checkout: null,
      gift_card: null,
      order: null,
    }
    const registers: CompatRegisters = {
      assetUrl: (name) => this.opts.assetUrl(name),
      /* A file from Shopify's Files page never comes in the zip: the theme's own asset or media file by that name. */
      fileUrl: (name) => this.opts.assetUrl(name) ?? "",
      assetText: (name) => this.opts.assetText?.(name) ?? null,
      moneyFormat,
      moneyWithCurrencyFormat: `${moneyFormat} ${currency}`,
      currency,
      translate: this.translate,
    }
    const ctx = new Ctx(globals, this.env(page))
    pageCtx = ctx
    ctx.registers.compat = registers
    ctx.registers.page = page
    ctx.registers.res = res
    return ctx
  }

  private env(page: CompatPage): Env {
    return {
      snippet: (name) => {
        const p = this.fileFor("snippets", name)
        return p ? this.tree(p) : null
      },
      filter: (name) => compatFilter(name),
      section: (ctx, name) => this.renderStaticSection(ctx, name),
      sections: (ctx, group) => this.renderGroup(ctx, group),
      contentFor: (ctx, what, args) => this.contentFor(ctx, what, args),
      placedBlock: (ctx, name, args, content) => this.placedBlock(ctx, name, args, content),
      form: (ctx, type, obj, args) => formMarkup(ctx, type, obj, args),
      paginate: (ctx, list, by) => paginateList(ctx, list, by, page),
    }
  }

  // ── Sections ──

  /** One section, as Shopify draws it: wrapped in its shopify-section element. */
  renderSection(ctx: Ctx, instance: CompatSectionInstance, index = 0, group?: string): RenderedSection {
    const r = this.renderSectionRaw(ctx, instance, index, group)
    return { html: this.finish(r.html), errors: r.errors }
  }

  /** The page with Shopify's CDN taken out of it, each address it named kept in the diagnostics. */
  finish(html: string): string {
    return withoutShopifyCdn(html, (url) => this.diagnostics.add(`A script or stylesheet from Shopify's servers was left out: ${url}`))
  }

  /** The type a section is stored under: Shopify's `header` is Storelib's `theme-header`. */
  typeOf(type: string): string {
    return this.opts.renamed?.[type] ?? type
  }

  private renderSectionRaw(ctx: Ctx, instance: CompatSectionInstance, index = 0, group?: string): RenderedSection {
    const path = this.fileFor("sections", instance.type)
    const tree = path ? this.tree(path) : null
    if (!tree && instance.type === "rich_text" && group === undefined) {
      const drawn = this.renderAsThemePage(ctx, instance, index)
      if (drawn) return drawn
    }
    if (!tree) {
      this.diagnostics.add(`A page names the section "${instance.type}", which this theme does not have`)
      return { html: "", errors: [`There is no section called ${instance.type}`] }
    }
    /* A product section's blocks are drawn in its Details column, never under the product (lib/website-builder/product-details-rule.ts). */
    const homed = blocksIntoDetails(instance.type, instance.blocks, this.blockTakes, this.staticsOf(path!))
    if (homed) instance = { ...instance, blocks: homed }
    ;(ctx.registers.drawnIds as Set<string> | undefined)?.add(instance.id)
    const schema = this.schemaOf("sections", instance.type)
    const res = ctx.registers.res as Resources
    let holder: Ctx | null = null
    const section = this.sectionObject(instance, schema, res, index, group, resolverFor(() => holder))
    /* On a product page a section's `closest.product` is that product; on a collection page, its collection. */
    const closest: O = {}
    for (const k of ["product", "collection", "article", "blog", "page"]) if (ctx.globals[k]) closest[k] = ctx.globals[k]
    const child = ctx.child({ section, closest })
    holder = child
    child.registers.section = section
    child.registers.sectionInstance = instance
    child.registers.closest = closest
    const errors: string[] = []
    let html = ""
    /* Each section has the page's markup budget of its own: one long listing no longer blanks every section after it, the footer included. */
    const charsBefore = child.out.chars
    const said = Array.isArray(child.registers.liquidErrors) ? (child.registers.liquidErrors as string[]) : (child.registers.liquidErrors = [] as string[])
    const from = said.length
    try {
      html = renderTree(tree, child)
    } catch (e) {
      errors.push((e as Error).message)
    }
    errors.push(...said.slice(from, from + 5))
    child.out.chars = charsBefore
    const cls = typeof schema.class === "string" ? ` ${escapeHtml(schema.class)}` : ""
    const tag = typeof schema.tag === "string" && /^(div|section|article|aside|header|footer|main|nav)$/.test(schema.tag) ? schema.tag : "div"
    return { html: `<${tag} id="shopify-section-${escapeHtml(instance.id)}" class="shopify-section${group ? ` shopify-section-group-${escapeHtml(/-group$/.test(group) ? group : `${group}-group`)}` : ""}${cls}" data-section-id="${escapeHtml(instance.id)}" data-section-type="${escapeHtml(instance.type)}">${html}</${tag}>`, errors }
  }

  private sectionObject(instance: CompatSectionInstance, schema: O, res: Resources, index: number, group: string | undefined, dyn: DynamicResolver): O {
    const settingsSchema = (Array.isArray(schema.settings) ? schema.settings : []) as ShopifySetting[]
    const localBlocks = (Array.isArray(schema.blocks) ? schema.blocks : []) as O[]
    const blocks = (instance.blocks ?? []).filter((b) => !b.disabled && !b.hidden).map((b) => this.blockObject(b, localBlocks, res, dyn))
    return {
      [OUTPUT]: instance.id,
      id: instance.id,
      type: instance.type,
      settings: typedSettings(settingsSchema, instance.settings, res, dyn),
      blocks,
      block_order: blocks.map((b) => b.id),
      index: index + 1,
      index0: index,
      /* Shopify's own words: header, footer, aside, custom.<name>, or template. */
      location: !group ? "template" : this.opts.chromeGroups?.[group] ?? (/^(header|footer|aside)(-group)?$/.test(group) ? group.replace(/-group$/, "") : `custom.${group.replace(/-group$/, "")}`),
      __instance: instance,
    }
  }

  private blockObject(b: CompatBlockInstance, localDefs: O[], res: Resources, dyn: DynamicResolver): O {
    const local = localDefs.find((d) => d.type === b.type && Array.isArray(d.settings))
    const schema = local ?? this.schemaOf("blocks", b.type)
    const settingsSchema = (Array.isArray(schema.settings) ? schema.settings : []) as ShopifySetting[]
    const children = (b.blocks ?? []).filter((c) => !c.disabled && !c.hidden)
    return {
      [OUTPUT]: b.id,
      id: b.id,
      type: b.type,
      settings: typedSettings(settingsSchema, b.settings, res, dyn),
      shopify_attributes: blockAttributes(b.id),
      blocks: children.map((c) => this.blockObject(c, [], res, dyn)),
      __instance: b,
      __local: !!local,
    }
  }

  /** `{% content_for 'blocks' %}` and `{% content_for 'block', type:, id: %}`: theme blocks, in order, each drawn by its own file. */
  private contentFor(ctx: Ctx, what: string, args: O): string {
    if (what !== "blocks" && what !== "block") return ""
    const owner = (ctx.registers.block as O | undefined) ?? (ctx.registers.section as O | undefined)
    if (!owner) return ""
    const instance = owner.__instance as CompatSectionInstance | CompatBlockInstance
    const children = (instance.blocks ?? []).filter((c) => !c.disabled && !c.hidden)
    const res = ctx.registers.res as Resources
    /* What a block's caller hands it: `closest.product: product` and the rest. */
    const closest = { ...((ctx.registers.closest as O | undefined) ?? {}) }
    const extra: O = {}
    for (const [k, v] of Object.entries(args)) {
      if (k.startsWith("closest.")) closest[k.slice(8)] = v
      else if (k !== "type" && k !== "id") extra[k] = v
    }
    const draw = (b: CompatBlockInstance) => {
      const path = this.fileFor("blocks", b.type)
      const tree = path ? this.tree(path) : null
      if (!tree) return ""
      let holder: Ctx | null = null
      const block = this.blockObject(b, [], res, resolverFor(() => holder))
      const c = ctx.child({ block, closest, ...extra })
      holder = c
      c.registers.block = block
      c.registers.closest = closest
      return renderTree(tree, c)
    }
    if (what === "blocks") return children.filter((b) => !b.static).map(draw).join("")
    const type = toOutput(args.type)
    const id = toOutput(args.id)
    if ((instance.blocks ?? []).some((c) => c.id === id && (c.hidden || c.disabled))) return ""
    const found = children.find((b) => b.id === id) ?? { id, type, settings: {}, static: true }
    return draw(found)
  }

  /**
   * `{% block 'header', tag: 'div' %}…{% endblock %}`: Shopify's newest
   * themes (Skeleton) place their header, footer and each page's parts this
   * way, in the layout and the templates, with no section around them. The
   * block is drawn by blocks/<name>, from its schema's defaults or the
   * values settings_data.json keeps for it by name, with the tag's own
   * arguments as variables and what stood between the tags as `content`.
   * A name the theme has no file for draws only that content.
   */
  private placedBlock(ctx: Ctx, name: string, args: O, content: string): string {
    const path = this.fileFor("blocks", name)
    const tree = path ? this.tree(path) : null
    if (!tree) return content
    const res = ctx.registers.res as Resources
    const stored = (this.settingsValues.blocks as Record<string, O> | undefined)?.[name]
    const instance: CompatBlockInstance = { id: name, type: name, settings: (stored?.settings as O | undefined) ?? {}, blocks: [] }
    let holder: Ctx | null = null
    const block = this.blockObject(instance, [], res, resolverFor(() => holder))
    const c = ctx.child({ ...args, block, content })
    holder = c
    c.registers.block = block
    try {
      return renderTree(tree, c)
    } catch (e) {
      this.warnings.push(`blocks/${name}: ${(e as Error).message}`)
      return content
    }
  }

  /**
   * STORELIB'S OWN TEXT SECTION ON AN IMPORTED THEME'S PAGE. The refund,
   * privacy, terms and shipping pages every site is given hold their words
   * in a `rich_text` section, which an imported theme does not have, so the
   * page drew as nothing between the header and the footer. It is drawn as
   * the theme draws a page: the main section of templates/page.json (or the
   * theme's page section), with `page.title` and `page.content` the
   * section's heading and words, under the section's own id so it is
   * selected in the builder as itself.
   */
  private renderAsThemePage(ctx: Ctx, instance: CompatSectionInstance, index: number): RenderedSection | null {
    const settings = (instance.settings ?? {}) as O
    const body = typeof settings.body === "string" ? settings.body : ""
    const title = typeof settings.heading === "string" ? settings.heading : ""
    const fromTemplate = groupSections(this.files["templates/page.json"]).find((s) => !s.disabled && this.fileFor("sections", this.typeOf(s.type)))
    const fallback = ["main-page", "page-default", "page"].find((t) => this.fileFor("sections", t))
    const main: CompatSectionInstance | null = fromTemplate ? { ...fromTemplate, type: this.typeOf(fromTemplate.type) } : fallback ? { id: "main", type: fallback, settings: {} } : null
    if (!main) return null
    const handle = String((ctx.registers.page as CompatPage | undefined)?.path ?? "").replace(/^\/+/, "") || "page"
    const page = { [OUTPUT]: title, title, content: body, handle, id: handle, url: `/${handle}`, template_suffix: null, metafields: {} }
    const drawn = this.renderSectionRaw(ctx.child({ page }), { ...main, id: instance.id }, index)
    return drawn.html ? drawn : null
  }

  /** `{% section 'x' %}` in a layout: a section with no instance on a page, drawn from its defaults. */
  private renderStaticSection(ctx: Ctx, name: string): string {
    /* The page's own copy first: an older theme's header, imported into the Header group under its name so it can be edited. */
    const groups = (ctx.registers.page as CompatPage | undefined)?.groups
    const placed = [...(groups?.header ?? []), ...(groups?.footer ?? []), ...(groups?.overlay ?? [])].find((s) => s.id === name)
    if (placed) return placed.hidden || placed.disabled ? "" : this.renderSectionRaw(ctx, { ...placed, type: this.typeOf(placed.type) }).html
    /* settings_data.json keeps a static section's values under `sections`, by its name. */
    const stored = (this.settingsValues.sections as Record<string, O> | undefined)?.[name]
    const instance = stored && typeof stored === "object" ? instanceFromJson(name, stored) : { id: name, type: name, settings: {} }
    return this.renderSectionRaw(ctx, { ...instance, type: this.typeOf(instance.type) }).html
  }

  /** `{% sections 'header-group' %}`: the group's sections, from the page's own copy when it has one. */
  private renderGroup(ctx: Ctx, group: string): string {
    const page = ctx.registers.page as CompatPage
    const key = this.opts.chromeGroups?.[group] ?? group.replace(/-group$/, "")
    /* Another group the page holds (an overlay, an aside): its sections are the Overlay group's that name it. */
    /* A group is the page's when the import said so (slots) or when the page holds its sections (an install whose Overlay group was filled in later). */
    const isSlot = this.opts.slots?.includes(group) || (page.groups?.overlay ?? []).some((s) => s.slot === group)
    const own = key === "header" || key === "footer" ? page.groups?.[key] : isSlot ? (page.groups?.overlay ?? []).filter((s) => s.slot === group) : undefined
    const list: CompatSectionInstance[] = own ?? groupSections(this.files[`sections/${group}.json`]).map((s) => ({ ...s, type: this.typeOf(s.type) }))
    return list.filter((s) => !s.disabled && !s.hidden).map((s, i) => this.renderSectionRaw(ctx, s, i, group).html).join("")
  }

  // ── The layout ──

  /** The whole document of a page: the layout, with the page's sections where it says. */
  renderDocument(ctx: Ctx, content: string, head: { extraHead?: string; extraBodyEnd?: string; layout?: string } = {}): string {
    /* `{% layout 'alternate' %}` in a template: that layout when the theme has it, the theme's own otherwise. */
    const path = (head.layout && head.layout !== "theme" ? this.fileFor("layout", head.layout) : null) ?? this.fileFor("layout", "theme")
    const tree = path ? this.tree(path) : null
    if (!tree) return `<!doctype html><html><head><meta charset="utf-8">${head.extraHead ?? ""}</head><body>${content}${head.extraBodyEnd ?? ""}</body></html>`
    ctx.globals.content_for_layout = content
    const drawnIds = new Set<string>()
    ctx.registers.drawnIds = drawnIds
    let drawn: string
    try {
      drawn = renderTree(tree, ctx)
    } catch (e) {
      /* Past the page's budget: the page's own content still shows, never a server error. */
      this.diagnostics.add(`The layout could not be drawn: ${(e as Error).message}`)
      drawn = `<!doctype html><html><head><meta charset="utf-8"></head><body>${content}</body></html>`
    }
    /*
      THE OVERLAY GROUP'S OTHER SECTIONS. A section added to the Overlay
      group in the builder (a phone tab bar, a popup, a back to top button)
      names no group file of the theme's, so no {% sections %} in the layout
      draws it. Every one the layout did not draw goes at the end of the
      body, where a fixed bar or a popup sits anyway.
    */
    const overlay = ((ctx.registers.page as CompatPage | undefined)?.groups?.overlay ?? []).filter((s) => !s.hidden && !s.disabled && !drawnIds.has(s.id))
    if (overlay.length) {
      const rest = overlay.map((s, i) => this.renderSectionRaw(ctx, { ...s, type: this.typeOf(s.type) }, i, s.slot || "overlay-group").html).join("")
      drawn = /<\/body>/i.test(drawn) ? drawn.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${rest}</body>`) : `${drawn}${rest}`
    }
    let html = this.finish(drawn)
    /* A layout without a </head> (or without a </body>) still gets what goes there: at the top of the body, at the end of the page. */
    if (head.extraHead) html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${head.extraHead}</head>`) : /<body\b[^>]*>/i.test(html) ? html.replace(/<body\b[^>]*>/i, (m) => `${m}${head.extraHead}`) : `${head.extraHead}${html}`
    if (head.extraBodyEnd) html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${head.extraBodyEnd}</body>`) : `${html}${head.extraBodyEnd}`
    return html
  }

  /**
   * The layout, for the builder's canvas, which draws the sections itself:
   * what the head holds (its styles, the font links, the variables written
   * from the theme's settings), the attributes of <html> and <body>, and the
   * elements the header group, the page and the footer group sit inside.
   */
  layoutShell(ctx: Ctx): LayoutShell {
    const MARK = (n: string) => `\u0000SL:${n}\u0000`
    const path = this.fileFor("layout", "theme")
    const tree = path ? this.tree(path) : null
    if (!tree) return { headStyles: [], headLinks: [], htmlAttrs: "", bodyAttrs: "", wrappers: { header: [], content: [], footer: [] } }
    const c = ctx.child({ content_for_layout: MARK("content") })
    const env = { ...c.env, sections: (_x: Ctx, group: string) => MARK(group.replace(/-group$/, "")) }
    const cc = new Ctx(c.globals, env, { registers: c.registers, steps: c.steps, out: c.out })
    let html = ""
    try { html = renderTree(tree, cc) } catch (e) { this.warnings.push(`layout: ${(e as Error).message}`) }
    const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? ""
    const headStyles = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
    const headLinks = [...head.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)].map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1] ?? "").filter(Boolean)
    const htmlAttrs = html.match(/<html\b([^>]*)>/i)?.[1] ?? ""
    const bodyAttrs = html.match(/<body\b([^>]*)>/i)?.[1] ?? ""
    const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? ""
    return { headStyles, headLinks, htmlAttrs, bodyAttrs, wrappers: { header: ancestorsOf(body, MARK("header")), content: ancestorsOf(body, MARK("content")), footer: ancestorsOf(body, MARK("footer")) } }
  }

  /** The font stylesheets the theme's font settings need. */
  fontStylesheets(ctx: Ctx): string[] {
    const fonts = Object.values((ctx.globals.settings ?? {}) as O).filter((v) => v && typeof v === "object" && typeof (v as O).family === "string" && "fallback_families" in (v as O)) as O[]
    return fontLinks(fonts)
  }
}

/** Dynamic sources read in a context that exists by the time a value is read. */
function resolverFor(get: () => Ctx | null): DynamicResolver {
  return {
    value: (expr) => {
      const c = get()
      if (!c) return null
      try { return evaluate(parseOutput(expr, 0), c) } catch { return null }
    },
    text: (src) => {
      const c = get()
      if (!c) return src
      try { return renderString(src, c) } catch { return src }
    },
  }
}

/** Whether a script parses. Only a syntax error says no: where eval is not allowed (a page's policy), every script is taken as it is. */
function readsAsScript(code: string): boolean {
  try {
    new Function(code)
    return true
  } catch (e) {
    return !(e instanceof SyntaxError)
  }
}

export interface LayoutShell {
  /** The text of each <style> in the head, in order: the theme's variables, its colour schemes. */
  headStyles: string[]
  /** The stylesheets the head links to. */
  headLinks: string[]
  htmlAttrs: string
  bodyAttrs: string
  /** The open elements each part sits inside, outermost first: `<main id="MainContent" …>`. */
  wrappers: { header: { tag: string; attrs: string }[]; content: { tag: string; attrs: string }[]; footer: { tag: string; attrs: string }[] }
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])

/** The elements still open where `mark` sits in `html`, outermost first. */
function ancestorsOf(html: string, mark: string): { tag: string; attrs: string }[] {
  const at = html.indexOf(mark)
  if (at < 0) return []
  const stack: { tag: string; attrs: string }[] = []
  const re = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<\/?([a-zA-Z][\w-]*)([^>]*)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && m.index < at) {
    if (!m[2]) continue
    const tag = m[2].toLowerCase()
    if (m[0].startsWith("</")) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag)
      if (i >= 0) stack.length = i
    } else if (!VOID.has(tag) && !m[0].endsWith("/>")) {
      stack.push({ tag, attrs: m[3] })
    }
  }
  return stack
}

/** A group file's sections, in order. */
export function groupSections(json: string | undefined): CompatSectionInstance[] {
  const g = parseJsonLoose(json) as { sections?: Record<string, O>; order?: string[] } | null
  if (!g?.sections) return []
  const order = Array.isArray(g.order) ? g.order : Object.keys(g.sections)
  return order.filter((id) => g.sections![id]).map((id) => instanceFromJson(id, g.sections![id]))
}

/** A blog of no posts, named by its address (/blogs/news is News). */
function emptyBlog(path: string): Record<string, unknown> {
  const handle = path.match(/^\/blogs\/([^/?#]+)/)?.[1] ?? "news"
  const title = handle.replace(/[-_]+/g, " ").replace(/^./, (x) => x.toUpperCase())
  return { [OUTPUT]: title, id: handle, handle, title, url: `/blogs/${handle}`, articles: [], articles_count: 0, tags: [], all_tags: [], comments_enabled: false, moderated: false, metafields: {} }
}

/**
 * `page_title` where the caller named none, as Shopify names it per page:
 * the builder's canvas draws a cart or a product without a title, and a
 * theme's breadcrumb read the shop's name there ("Home > My store").
 */
export function defaultPageTitle(page: CompatPage): string {
  switch (page.template) {
    case "product": return String(page.product?.settings?.title ?? "") || page.shop.name
    case "collection": return page.collection?.title ?? "Products"
    case "page": return page.pageObject?.title ?? page.shop.name
    case "cart": return "Your Shopping Cart"
    case "list-collections": return "Collections"
    case "search": return page.search?.performed ? `Search: ${page.search.results.length} results found for "${page.search.terms}"` : "Search"
    case "404": return "404 Not Found"
    case "blog": return "Blog"
    case "article": return "Article"
    case "customers/account": return "Account"
    default: return page.shop.name
  }
}

/** A section as a Shopify template JSON holds it, as the instance Storelib stores. */
export function instanceFromJson(id: string, s: O): CompatSectionInstance {
  return { id, type: String(s.type ?? ""), settings: (s.settings as O) ?? {}, blocks: blocksFromJson(s.blocks as O | undefined, s.block_order as string[] | undefined), disabled: s.disabled === true }
}

function blocksFromJson(blocks: O | undefined, order: string[] | undefined): CompatBlockInstance[] {
  if (!blocks) return []
  const ids = Array.isArray(order) ? [...order, ...Object.keys(blocks).filter((k) => !order.includes(k))] : Object.keys(blocks)
  return ids.filter((id) => blocks[id]).map((id) => {
    const b = blocks[id] as O
    return { id, type: String(b.type ?? ""), settings: (b.settings as O) ?? {}, blocks: blocksFromJson(b.blocks as O | undefined, b.block_order as string[] | undefined), static: b.static === true, disabled: b.disabled === true }
  })
}

export function parseJsonLoose(text: string | undefined | null): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    try {
      return JSON.parse(text.replace(/^﻿/, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))
    } catch {
      return null
    }
  }
}

// ── Forms ────────────────────────────────────────────────────────────────────

let formSeq = 0

/**
 * Shopify's forms, posted to Storelib: a product form adds to the site's own
 * cart (/cart/add), the cart form updates it or goes to checkout (/cart), a
 * contact form and a newsletter form reach the creator's inbox and
 * Subscribers (/contact), a sign in form is the site's account sign in.
 */
function formMarkup(ctx: Ctx, type: string, obj: unknown, args: O): { open: string; close: string; form: O } {
  const section = ctx.registers.section as O | undefined
  const id = typeof args.id === "string" && args.id ? args.id : `${type.replace(/_/g, "-")}-${toOutput(section?.id ?? "x")}-${++formSeq}`
  const action: Record<string, string> = {
    product: "/cart/add",
    cart: "/cart",
    contact: "/contact",
    customer: "/contact#contact_form",
    customer_login: "/account/login",
    create_customer: "/account/login",
    recover_customer_password: "/account/login",
    reset_customer_password: "/account/login",
    activate_customer_password: "/account/login",
    customer_address: "/account",
    localization: "/localization",
    new_comment: "#",
    guest_login: "/account/login",
    storefront_password: "/password",
    currency: "/cart/update",
  }
  const attrs: string[] = [`method="post"`, `action="${action[type] ?? "#"}"`, `id="${escapeHtml(id)}"`, `accept-charset="UTF-8"`]
  for (const [k, v] of Object.entries(args)) {
    if (k === "id" || k === "return_to" || v === null || v === undefined || v === false) continue
    if (/^on/i.test(k) || !/^[a-zA-Z_:][-\w:.]*$/.test(k)) continue
    attrs.push(v === true ? k.replace(/_/g, "-") : `${k.replace(/_/g, "-")}="${escapeHtml(toOutput(v))}"`)
  }
  if (type === "product") attrs.push(`enctype="multipart/form-data"`, `data-type="add-to-cart-form"`)
  if (type === "contact" || type === "customer") attrs.push(`data-storelib-form="${type === "customer" ? "subscribe" : "contact"}"`)
  const hidden = [`<input type="hidden" name="form_type" value="${escapeHtml(type)}">`, `<input type="hidden" name="utf8" value="✓">`]
  if (type === "product" && obj && typeof obj === "object") {
    const variant = (obj as O).selected_or_first_available_variant as O | undefined
    if (variant?.id) hidden.push(`<input type="hidden" name="product-id" value="${escapeHtml(toOutput((obj as O).id))}">`)
  }
  if (typeof args.return_to === "string") hidden.push(`<input type="hidden" name="return_to" value="${escapeHtml(args.return_to)}">`)
  return {
    open: `<form ${attrs.join(" ")}>${hidden.join("")}`,
    close: `</form>`,
    form: { id, posted_successfully: (ctx.registers.page as CompatPage | undefined)?.query?.[`${type}_posted`] === "true", errors: null, email: "", body: "", name: "", phone: "", password_needed: false },
  }
}

// ── Pagination ───────────────────────────────────────────────────────────────

function paginateList(ctx: Ctx, list: unknown, by: number, page: CompatPage): { page: unknown; paginate: O } {
  const items = toList(list)
  const pages = Math.max(1, Math.ceil(items.length / by))
  const current = Math.min(pages, Math.max(1, Number(page.query?.page ?? 1) || 1))
  const url = (n: number) => {
    const q = new URLSearchParams({ ...(page.query ?? {}), page: String(n) })
    return `${page.path}?${q.toString()}`
  }
  const parts: O[] = []
  for (let n = 1; n <= pages; n++) {
    if (pages > 7 && n !== 1 && n !== pages && Math.abs(n - current) > 2) {
      if (parts[parts.length - 1]?.title !== "…") parts.push({ title: "…", is_link: false })
      continue
    }
    parts.push(n === current ? { title: String(n), is_link: false } : { title: String(n), url: url(n), is_link: true })
  }
  void ctx
  return {
    page: items.slice((current - 1) * by, current * by),
    paginate: {
      current_page: current,
      current_offset: (current - 1) * by,
      items: items.length,
      page_size: by,
      pages,
      parts,
      previous: current > 1 ? { title: "« Previous", url: url(current - 1), is_link: true } : null,
      next: current < pages ? { title: "Next »", url: url(current + 1), is_link: true } : null,
      page_param: "page",
    },
  }
}

/** Money, formatted the shop's way, for code outside a template (the cart endpoints). */
export function shopMoney(cents: number, format = "${{amount}}"): string {
  return formatMoney(cents, format)
}

/** A setting value's font, for code outside a template. */
export { fontObject }
