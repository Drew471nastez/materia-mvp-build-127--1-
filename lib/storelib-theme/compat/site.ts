/**
 * ===========================================================================
 *  A WEBSITE WITH AN IMPORTED SHOPIFY THEME, ANSWERING ITS VISITORS
 * ===========================================================================
 * Every address a Shopify theme's markup and scripts reach for, answered by
 * Storelib from the creator's own shop. Nothing here talks to Shopify:
 *
 *   pages             /  /products/<handle>  /collections  /collections/<handle>
 *                     /search  /cart  /pages/<handle>  /<page>  /blogs/…  /password
 *   section rendering ?section_id=<id or name>  ?sections=a,b   (any page)
 *   the cart          /cart.js  /cart/add(.js)  /cart/change(.js)
 *                     /cart/update(.js)  /cart/clear(.js)   a cookie holds it
 *   checkout          /cart with `checkout`, /checkout: Storelib's own
 *                     basket checkout (/api/checkout/cart), with the lines
 *   products as data  /products/<handle>.js  .json
 *   search box        /search/suggest(.json)?q=  with section_id
 *   recommendations   /recommendations/products?product_id=&section_id=
 *   forms             /contact (contact and newsletter): Storelib's own
 *                     contact and subscribe endpoints
 *
 * Pure apart from what `SiteData` hands it, so the route, the preview and
 * the tests all drive the same function.
 */
import { escapeHtml, handleize } from "./filters"
import type { CardLike, CollectionLike, MenuLinkLike, CartLineLike } from "./objects"
import { cartObject, productObject } from "./objects"
import { OUTPUT, LFloat } from "./runtime"
import type { CompatPage, CompatTheme } from "./theme"
import { drawPage, drawSection, pageContextFor, pageParts, type StoredSection } from "./page"
import { templateOfPage } from "./install"
import { assetType, binaryOf } from "./install"
import { renderString } from "./runtime"
import { facet } from "./facets"

type O = Record<string, unknown>

export interface SiteData {
  creatorId: string
  theme: CompatTheme
  /** The published page rows, by key. */
  pages: Record<string, StoredSection[]>
  products: (CardLike & { descriptionHtml?: string })[]
  /** Every published product a picker may name (memberships and tiers included). */
  pickable?: CardLike[]
  collections: CollectionLike[]
  menus: Record<string, { title?: string; links: MenuLinkLike[] }>
  shop: CompatPage["shop"]
  host: string
  /** The page as Shopify's theme editor shows it: the builder's preview. */
  designMode?: boolean
  /** A product's own page data (its description as markup), when the catalogue's card is not enough. */
  product?: (handle: string) => Promise<(CardLike & { descriptionHtml?: string }) | null>
  /** Scripts the page carries besides the theme's: the preview's banner. */
  extraBodyEnd?: string
}

/** The policies a shop has, by their Shopify handle: also the page key Storelib keeps each under. */
export const POLICY_HANDLES = ["refund-policy", "privacy-policy", "terms-of-service", "shipping-policy"] as const

/** One line of the cart, as the cookie keeps it. */
export interface CartEntry {
  k: string
  p: string
  v: string | null
  q: number
  props?: Record<string, string>
}

export interface SiteRequest {
  method: string
  path: string
  query: URLSearchParams
  /** A posted form or JSON body, flattened to fields. */
  body: O | null
  cart: CartEntry[]
  /** The theme's cart note, kept beside the lines. */
  note?: string
  /** A script's request (JSON body, X-Requested-With, Accept: application/json): answered with JSON, as Shopify does, whatever the address ends in. */
  ajax?: boolean
}

export interface SiteResponse {
  status: number
  type: string
  body: string | Uint8Array
  headers?: Record<string, string>
  /** The cart after this request, when it changed. */
  cart?: CartEntry[]
  note?: string
}

const MAX_LINES = 50
const MAX_QTY = 99

// ── Answers ─────────────────────────────────────────────────────────────────

const html = (body: string, status = 200): SiteResponse => ({ status, type: "text/html; charset=utf-8", body, headers: { "Cache-Control": "private, no-store" } })
const json = (value: unknown, status = 200, extra: Partial<SiteResponse> = {}): SiteResponse => ({ status, type: "application/json; charset=utf-8", body: JSON.stringify(value), headers: { "Cache-Control": "private, no-store" }, ...extra })
const redirect = (to: string, extra: Partial<SiteResponse> = {}): SiteResponse => ({ status: 303, type: "text/plain", body: "", headers: { Location: to, "Cache-Control": "private, no-store" }, ...extra })

export async function answer(site: SiteData, req: SiteRequest): Promise<SiteResponse> {
  const path = decodePath(req.path)
  const method = req.method.toUpperCase()

  /* ── the cart ── */
  const cartRoute = path.match(/^\/cart(?:\/(add|change|update|clear))?(\.js|\.json)?$/)
  if (cartRoute && (method === "POST" || cartRoute[2])) {
    const [, action, ext] = cartRoute
    if (method === "GET" && !action) return json(cartJson(site, req.cart, req.note ?? ""))
    if (method !== "POST") return json({ status: 405, message: "Method not allowed" }, 405)
    return cartAction(site, req, action ?? "update", !!ext || (req.ajax === true && !!action))
  }
  if (path === "/checkout" || path === "/cart/checkout") return checkoutHandoff(site, req.cart)

  /* ── forms ── */
  if (method === "POST" && (path === "/contact" || path === "/account" || path === "/contact/")) return formHandoff(site, req)
  /* Storelib's own menus link the shop as /products; Shopify sends that address to every product, as here. */
  if (path === "/products" && (method === "GET" || method === "HEAD")) {
    const q = req.query.toString()
    return redirect(`/collections/all${q ? `?${q}` : ""}`)
  }
  if (method === "POST" && path === "/localization") return redirect(safeReturn(req.body?.return_to) ?? "/")

  /* ── products as data ── */
  const productData = path.match(/^\/products\/([^/]+)\.(js|json)$/)
  if (productData) {
    const card = await findProduct(site, productData[1])
    if (!card) return json({ status: 404, message: "Not found" }, 404)
    const obj = productObject(card, { descriptionHtml: card.descriptionHtml })
    return json(productData[2] === "json" ? { product: productJson(obj) } : productJson(obj))
  }

  /* ── the search box ── */
  if (/^\/search\/suggest(\.json)?$/.test(path)) {
    const terms = (req.query.get("q") ?? "").trim().slice(0, 200)
    const limit = Math.min(10, Math.max(1, Number(req.query.get("resources[limit]") ?? 4) || 4))
    const found = searchProducts(site.products, terms).slice(0, limit)
    const collections = site.collections.filter((c) => terms && c.title.toLowerCase().includes(terms.toLowerCase())).slice(0, limit)
    const page = basePage(site, req, { template: "search", path: "/search", predictive: { terms, products: found, collections, queries: terms ? [terms] : [] } })
    const sectionId = req.query.get("section_id")
    if (sectionId) return sectionsAnswer(site, page, site.pages.search ?? [], [sectionId], false)
    return json({ resources: { results: { products: found.map((c) => productJson(productObject(c))), collections: collections.map((c) => ({ id: c.id, title: c.title, handle: c.handle, url: c.url ?? `/collections/${c.handle}` })), queries: terms ? [{ text: terms, styled_text: escapeHtml(terms), url: `/search?q=${encodeURIComponent(terms)}` }] : [] } } })
  }

  /* ── recommendations ── */
  if (/^\/recommendations\/products(\.json)?$/.test(path)) {
    const id = req.query.get("product_id") ?? ""
    const limit = Math.min(10, Math.max(1, Number(req.query.get("limit") ?? 4) || 4))
    const intent = req.query.get("intent") ?? "related"
    const products = site.products.filter((p) => p.id !== id && String(p.settings.slug ?? "") !== id && p.settings.available !== false).slice(0, limit)
    const about = site.products.find((p) => p.id === id || String(p.settings.slug ?? "") === id) ?? null
    const page = basePage(site, req, { template: "product", path: "/recommendations/products", product: about, recommendations: { products, intent } })
    const sectionId = req.query.get("section_id")
    if (sectionId) return sectionsAnswer(site, page, site.pages.product ?? [], [sectionId], false)
    return json({ products: products.map((c) => productJson(productObject(c))) })
  }

  /* ── pages ── */
  const route = await pageFor(site, path, req)
  if (!route) return notFound(site, req)
  const sectionId = req.query.get("section_id")
  const sections = req.query.get("sections")
  if (sectionId) return sectionsAnswer(site, route.page, route.sections, [sectionId], false)
  if (sections) return sectionsAnswer(site, route.page, route.sections, sections.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5), true)
  const drawn = drawPage(site.theme, route.page, route.sections, { scripts: true, extraBodyEnd: site.extraBodyEnd, content: route.content })
  return html(drawn.html, route.status ?? 200)
}

function decodePath(p: string): string {
  try {
    const d = decodeURIComponent(p)
    return d.length > 1 ? d.replace(/\/+$/, "") : d
  } catch {
    return p
  }
}

/** A `return_to` that stays on this website. */
function safeReturn(v: unknown): string | null {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : null
}

// ── Pages ───────────────────────────────────────────────────────────────────

interface Route {
  page: CompatPage
  sections: StoredSection[]
  status?: number
  /** Drawn in the theme's layout in place of the page's own sections. */
  content?: string
}

const escapeText = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * A page that is the theme's layout around content of Storelib's own: the
 * home page's header, footer and overlay groups, and `content` where the
 * page's sections would be. A policy with no page template, and the
 * visitor's account pages.
 */
function shell(site: SiteData, req: SiteRequest, path: string, title: string, content: string, template = "page"): Route {
  const chrome = (sectionsOf(site, "home") ?? []).filter((s) => s.group === "header" || s.group === "footer" || s.group === "overlay")
  return { page: basePage(site, req, { template, path, title }), sections: chrome, content }
}

/**
 * THE VISITOR'S ACCOUNT, IN THE THEME. Signing in, orders and the wishlist
 * are Storelib's own pages (lib/site-accounts), which cannot draw a Shopify
 * theme's header and footer. So the theme draws them, and the account page
 * is shown between them in a frame of the same site, as tall as its
 * content; a link pressed inside opens at the top, in this shell again.
 */
function accountShell(site: SiteData, req: SiteRequest, path: string): Route {
  const q = new URLSearchParams(req.query)
  q.set("sl_embed", "1")
  const src = `${path}?${q.toString()}`
  const title = path === "/wishlist" ? "Wishlist" : path.startsWith("/account/login") ? "Sign in" : "Account"
  const content = `<div class="sl-account" style="width:100%"><iframe id="sl-account-frame" title="${escapeText(title)}" src="${escapeText(src)}" style="display:block;width:100%;min-height:560px;border:0;background:transparent"></iframe></div>
<script>(function(){var f=document.getElementById("sl-account-frame");if(!f)return;var ro=null;function fit(){try{var d=f.contentDocument;if(!d||!d.body)return;var h=Math.max(d.body.scrollHeight,d.documentElement.scrollHeight);if(h>0)f.style.height=h+"px"}catch(e){}}
f.addEventListener("load",function(){try{var d=f.contentDocument;if(d&&d.head&&!d.querySelector("base[target]")){var b=d.createElement("base");b.target="_top";d.head.appendChild(b)}if(ro)ro.disconnect();ro=new ResizeObserver(fit);ro.observe(d.body)}catch(e){}fit()});})();</script>`
  return shell(site, req, path, title, content, path === "/wishlist" ? "page" : "customers/account")
}

function basePage(site: SiteData, req: SiteRequest, extra: Partial<CompatPage> & { template: string; path: string }): CompatPage {
  return {
    designMode: site.designMode === true,
    host: site.host,
    query: Object.fromEntries(req.query.entries()),
    products: site.products,
    pickable: site.pickable,
    collections: site.collections,
    menus: site.menus,
    shop: site.shop,
    cart: cartLines(site, req.cart),
    ...extra,
  }
}

/**
 * Sections for a page key, wearing the site's header, footer and overlay:
 * the home page's, as the builder draws every page (universal-chrome.ts,
 * withUniversalChrome). A page's own copy is used only where home has none
 * of that group. Reading the page's own copy first drew a stale header, or
 * a page with a header and no footer, where the builder showed home's.
 */
function sectionsOf(site: SiteData, key: string): StoredSection[] | null {
  const own = site.pages[key]
  if (!own) return null
  const parts = pageParts(own)
  if (key === "home" || !site.pages.home) return [...parts.header, ...parts.template, ...parts.footer, ...parts.overlay]
  const home = pageParts(site.pages.home)
  const pick = (group: "header" | "footer" | "overlay") => (home[group].length ? home[group] : parts[group])
  return [...pick("header"), ...parts.template, ...pick("footer"), ...pick("overlay")]
}

async function pageFor(site: SiteData, path: string, req: SiteRequest): Promise<Route | null> {
  /* The account pages and the wishlist, drawn by Storelib inside the theme's header and footer (accountShell). */
  if ((path === "/account" || path.startsWith("/account/") || path === "/wishlist") && path !== "/account/logout") return accountShell(site, req, path)
  const at = (key: string, extra: Partial<CompatPage> = {}, status?: number): Route | null => {
    const sections = sectionsOf(site, key)
    if (!sections) return null
    const { template, suffix } = templateOfPage(key)
    return { page: basePage(site, req, { template, suffix, path, ...extra }), sections, status }
  }
  if (path === "/" || path === "") return at("home", { title: site.shop.name })

  const product = path.match(/^(?:\/collections\/[^/]+)?\/products\/([^/]+)$/)
  if (product) {
    const card = await findProduct(site, product[1])
    if (!card) return null
    return at("product", { product: card, selectedVariantId: req.query.get("variant") ?? variantForOptionValues(card, req.query.get("option_values")), title: String(card.settings.title ?? "") })
  }

  if (path === "/collections") return at("collections", { title: "Collections" })
  const collection = path.match(/^\/collections\/([^/]+)$/)
  if (collection) {
    const handle = collection[1]
    const own = site.collections.find((c) => c.handle === handle || c.id === handle)
    const c: CollectionLike | null = own ?? (handle === "all" ? { id: "all", title: "Products", handle: "all", url: "/collections/all", products: site.products, products_count: site.products.length } : null)
    if (!c) return null
    /* Filtered (availability, price, options, type), then sorted, as the theme's filter and sort controls ask. */
    const { filters, products } = facet(c.products ?? [], req.query, path)
    const sorted = sortProducts(products, req.query.get("sort_by"))
    return at("collection", { collection: { ...c, products: sorted, products_count: sorted.length }, title: c.title, catalog: { filters, sortBy: req.query.get("sort_by") ?? "" } })
  }

  if (path === "/search") {
    const terms = (req.query.get("q") ?? "").trim().slice(0, 200)
    const found = terms ? searchProducts(site.products, terms) : []
    const { filters, products } = facet(found, req.query, path)
    const results = sortProducts(products, req.query.get("sort_by"))
    return at("search", { search: { terms, results, performed: !!terms }, title: terms ? `Search: ${terms}` : "Search", catalog: { filters, sortBy: req.query.get("sort_by") ?? "" } })
  }

  if (path === "/cart") return at("cart", { title: "Your cart" })
  if (path === "/password") return at("password")

  /*
    A POLICY, at Shopify's /policies/<handle> or Storelib's /<handle>: the
    creator's own words (Website settings), drawn in the theme's page
    template like any page, or alone in its layout when it has none.
  */
  const policyMatch = path.match(/^\/policies\/([a-z-]+)$/) ?? path.match(/^\/(refund-policy|privacy-policy|terms-of-service|shipping-policy)$/)
  if (policyMatch) {
    const policy = (site.shop.policies ?? []).find((p) => p.handle === policyMatch[1])
    if (!policy) return null
    const pageObject = { title: policy.title, content: policy.body, handle: policy.handle, url: `/policies/${policy.handle}` }
    const viaPage = at("page", { pageObject, title: policy.title })
    if (viaPage) return viaPage
    return shell(site, req, path, policy.title, `<div class="page-width" style="max-width:72ch;margin:0 auto;padding:48px 20px"><h1>${escapeText(policy.title)}</h1><div class="rte">${policy.body}</div></div>`)
  }

  /* A theme's wishlist page (page.wishlist, its phone tab bar's heart) is the visitor's wishlist, which Storelib keeps. */
  if (path === "/pages/wishlist" && !site.pages.wishlist) return accountShell(site, req, "/wishlist")
  const pageMatch = path.match(/^\/pages\/([a-z0-9-]+)$/) ?? path.match(/^\/([a-z0-9][a-z0-9-]*)$/)
  if (pageMatch) {
    const handle = pageMatch[1]
    const title = handle.replace(/-/g, " ").replace(/^./, (x) => x.toUpperCase())
    const pageObject = { title, content: "", handle, url: `/pages/${handle}` }
    return at(handle, { pageObject, title }) ?? (path.startsWith("/pages/") ? at("page", { pageObject, title }) : null)
  }

  if (/^\/blogs\/[^/]+$/.test(path)) return at("blog", { title: "Blog" })
  if (/^\/blogs\/[^/]+\/[^/]+$/.test(path)) return at("article", { title: "Article" })
  return null
}

async function notFound(site: SiteData, req: SiteRequest): Promise<SiteResponse> {
  const sections = sectionsOf(site, "404") ?? sectionsOf(site, "home")
  if (!sections) return html("<!doctype html><title>Not found</title><p>This page does not exist.</p>", 404)
  const page = basePage(site, req, { template: "404", path: req.path, title: "Page not found" })
  /* A script on a page that is not there still asks for sections by name (a search box's empty state). */
  const one = req.query.get("section_id")
  const many = req.query.get("sections")
  if (one) return sectionsAnswer(site, page, sections, [one], false)
  if (many) return sectionsAnswer(site, page, sections, many.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5), true)
  return html(drawPage(site.theme, page, sections, { scripts: true, extraBodyEnd: site.extraBodyEnd }).html, 404)
}

/**
 * Shopify's section rendering API: the named sections of a page, each wrapped
 * as on the page. A name that is not a section of the page is drawn from the
 * theme's file of that name (a cart drawer, a product card), as Shopify does.
 */
function sectionsAnswer(site: SiteData, page: CompatPage, sections: StoredSection[], ids: string[], many: boolean): SiteResponse {
  const ctx = pageContextFor(site.theme, page, sections)
  const one = (id: string): string | null => {
    const at = sections.findIndex((s) => s.id === id)
    if (at >= 0) {
      const s = sections[at]
      const group = s.group === "header" || s.group === "footer" ? s.group : undefined
      return drawSection(site.theme, ctx, s, at, group).html
    }
    const type = site.theme.typeOf(id)
    if (!/^[A-Za-z0-9_-]+$/.test(type) || site.theme.files[`sections/${type}.storelib`] === undefined) return null
    return drawSection(site.theme, ctx, { id, type, settings: {} }).html
  }
  if (!many) {
    const out = one(ids[0])
    return out === null ? html("", 404) : html(out)
  }
  const out: Record<string, string | null> = {}
  for (const id of ids) out[id] = one(id)
  return json(out)
}

// ── Products ────────────────────────────────────────────────────────────────

async function findProduct(site: SiteData, handle: string): Promise<(CardLike & { descriptionHtml?: string }) | null> {
  const card = site.products.find((p) => String(p.settings.slug ?? "") === handle || p.id === handle || handleize(String(p.settings.title ?? "")) === handle) ?? null
  if (site.product) {
    const full = await site.product(handle).catch(() => null)
    if (full) return full
  }
  return card
}

/**
 * `?option_values=0-1,1-0`: the variant a set of option values names, by the
 * ids `product.options_with_values` gives each value. What a theme's option
 * picker asks for when a visitor chooses Large.
 */
export function variantForOptionValues(card: CardLike, raw: string | null): string | null {
  if (!raw) return null
  const p = productObject(card)
  const wanted: string[] = []
  for (const id of raw.split(",")) {
    const [pos, vi] = id.split("-").map(Number)
    const option = ((p.options_with_values as O[]) ?? [])[pos]
    const value = ((option?.values as O[]) ?? [])[vi]
    if (value) wanted[pos] = String(value.name)
  }
  const variants = (p.variants as O[]) ?? []
  const match = variants.find((v) => wanted.every((w, i) => w === undefined || (v.options as string[])[i] === w))
  return match ? String(match.id) : null
}

function searchProducts(products: CardLike[], terms: string): CardLike[] {
  const words = terms.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return products.filter((p) => {
    const hay = `${String(p.settings.title ?? "")} ${String(p.settings.category ?? "")} ${String(p.settings.description ?? "")}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

const priceOf = (p: CardLike) => Number(String(p.settings.price ?? "").replace(/[^0-9.]/g, "")) || 0

function sortProducts(list: CardLike[], sort: string | null): CardLike[] {
  const out = [...list]
  switch (sort) {
    case "price-ascending": return out.sort((a, b) => priceOf(a) - priceOf(b))
    case "price-descending": return out.sort((a, b) => priceOf(b) - priceOf(a))
    case "title-ascending": return out.sort((a, b) => String(a.settings.title).localeCompare(String(b.settings.title)))
    case "title-descending": return out.sort((a, b) => String(b.settings.title).localeCompare(String(a.settings.title)))
    case "created-ascending": return out.reverse()
    default: return out
  }
}

/** A drop of the engine as plain JSON: its printed value for a picture, numbers for floats. */
function plain(v: unknown, depth = 0): unknown {
  if (depth > 6) return null
  if (v instanceof LFloat) return v.v
  if (Array.isArray(v)) return v.map((x) => plain(x, depth + 1))
  if (v && typeof v === "object") {
    const o = v as O
    if (o.media_type === "image" && typeof o.src === "string") return o.src
    const out: O = {}
    for (const [k, x] of Object.entries(o)) {
      if (k.startsWith("__") || k === "product" || k === "preview_image") continue
      out[k] = plain(x, depth + 1)
    }
    return out
  }
  return v
}

/** /products/<handle>.js, as Shopify's Ajax API writes a product. */
export function productJson(p: O): O {
  const variants = ((p.variants as O[]) ?? []).map((v) => ({
    id: v.id, title: v.title, option1: v.option1, option2: v.option2, option3: v.option3, options: v.options,
    price: v.price, compare_at_price: v.compare_at_price, available: v.available, sku: v.sku, requires_shipping: v.requires_shipping,
    featured_image: v.featured_image ? { src: (v.featured_image as O).src } : null, name: v.name, public_title: v.title === "Default Title" ? null : v.title,
  }))
  const images = ((p.images as O[]) ?? []).map((i) => i.src)
  return {
    id: p.id, title: p.title, handle: p.handle, description: p.description, url: p.url, vendor: p.vendor, type: p.type, tags: p.tags,
    price: p.price, price_min: p.price_min, price_max: p.price_max, price_varies: p.price_varies, compare_at_price: p.compare_at_price,
    available: p.available, variants, images, featured_image: images[0] ?? null, media: ((p.media as O[]) ?? []).map((m) => ({ id: m.id, media_type: "image", src: m.src, alt: m.alt, position: m.position, preview_image: { src: m.src } })),
    options: ((p.options_with_values as O[]) ?? []).map((o) => ({ name: o.name, position: o.position, values: ((o.values as O[]) ?? []).map((x) => x.name) })),
  }
}

// ── The cart ────────────────────────────────────────────────────────────────

interface Indexed {
  card: CardLike
  variantId: string
}

function variantIndex(site: SiteData): Map<string, Indexed> {
  const out = new Map<string, Indexed>()
  for (const card of site.products) {
    out.set(card.id, { card, variantId: card.id })
    const variants = Array.isArray(card.settings.variants) ? (card.settings.variants as O[]) : []
    for (const v of variants) if (typeof v.id === "string") out.set(v.id, { card, variantId: v.id })
  }
  return out
}

function cartLines(site: SiteData, entries: CartEntry[]): CartLineLike[] {
  const byId = new Map(site.products.map((p) => [p.id, p]))
  return entries.flatMap((e) => {
    const card = byId.get(e.p)
    if (!card) return []
    return [{ key: e.k, productId: e.p, variantId: e.v, quantity: e.q, product: productObject(card), properties: e.props }]
  })
}

function cartJson(site: SiteData, entries: CartEntry[], note: string): O {
  const cart = cartObject(cartLines(site, entries), site.shop.currency ?? "USD", note)
  const items = ((cart.items as O[]) ?? []).map(lineJson)
  return {
    token: "storelib",
    note,
    attributes: {},
    original_total_price: cart.original_total_price,
    total_price: cart.total_price,
    total_discount: 0,
    total_weight: 0,
    item_count: cart.item_count,
    items,
    requires_shipping: cart.requires_shipping,
    currency: site.shop.currency ?? "USD",
    items_subtotal_price: cart.items_subtotal_price,
    cart_level_discount_applications: [],
  }
}

function lineJson(i: O): O {
  const product = (i.product ?? {}) as O
  const variant = (i.variant ?? {}) as O
  const image = (i.image as O | null)?.src ?? null
  return {
    id: i.variant_id, key: i.key, quantity: i.quantity, title: i.title, price: i.price, original_price: i.price, discounted_price: i.price,
    line_price: i.line_price, original_line_price: i.line_price, final_price: i.price, final_line_price: i.line_price, total_discount: 0, discounts: [],
    properties: i.properties ?? {}, product_id: i.product_id, variant_id: i.variant_id, sku: "", vendor: "", url: i.url, image, featured_image: image ? { url: image, alt: String(product.title ?? "") } : null,
    handle: product.handle, requires_shipping: i.requires_shipping, product_title: product.title, product_description: "", product_type: product.type,
    variant_title: variant.title === "Default Title" ? null : variant.title, variant_options: variant.options ?? [], options_with_values: plain(i.options_with_values),
    gift_card: false, has_components: false, quantity_rule: { min: 1, max: null, increment: 1 },
  }
}

const field = (body: O | null, k: string): unknown => (body ? body[k] : undefined)

function lineKey(p: string, v: string | null, props?: Record<string, string>): string {
  const extra = props && Object.keys(props).length ? `:${Object.entries(props).map(([a, b]) => `${a}=${b}`).sort().join("&")}` : ""
  return `${v ?? p}${extra}`
}

/** Items a cart/add posts: `id` and `quantity`, or `items: [{ id, quantity, properties }]`. */
function itemsOf(body: O | null): { id: string; quantity: number; properties?: Record<string, string> }[] {
  let items = field(body, "items")
  /*
    A multipart form posts the lines flat: items[0][id], items[0][quantity],
    items[0][properties][Engraving]. Gathered into the list a JSON body
    sends, whichever way the fields arrived.
  */
  const flat: O[] = Array.isArray(items) ? (items as O[]).map((x) => (x && typeof x === "object" ? { ...(x as O) } : {})) : []
  for (const [k, v] of Object.entries(body ?? {})) {
    const m = k.match(/^items\[(\d{1,2})\]\[(\w+)\](?:\[([^\]]{1,60})\])?$/)
    if (!m || typeof v !== "string") continue
    const at = (flat[Number(m[1])] ??= {})
    if (m[3] && m[2] === "properties") at.properties = { ...((at.properties as O) ?? {}), [m[3]]: v }
    else if (!m[3]) at[m[2]] = v
  }
  if (flat.some((x) => x && x.id !== undefined)) items = flat.filter((x) => x && x.id !== undefined)
  const props = (v: unknown) => (v && typeof v === "object" ? Object.fromEntries(Object.entries(v as O).filter(([, x]) => typeof x === "string").slice(0, 10)) as Record<string, string> : undefined)
  if (Array.isArray(items)) return items.filter((x) => x && typeof x === "object").map((x) => ({ id: String((x as O).id ?? ""), quantity: Number((x as O).quantity ?? 1) || 1, properties: props((x as O).properties) }))
  const id = field(body, "id")
  if (id === undefined || id === null || id === "") return []
  const properties: Record<string, string> = {}
  for (const [k, v] of Object.entries(body ?? {})) {
    const m = k.match(/^properties\[(.+)\]$/)
    if (m && typeof v === "string") properties[m[1]] = v
  }
  return [{ id: String(id), quantity: Number(field(body, "quantity") ?? 1) || 1, properties: Object.keys(properties).length ? properties : props(field(body, "properties")) }]
}

function sectionsFor(site: SiteData, req: SiteRequest, cart: CartEntry[], note: string): Record<string, string | null> | undefined {
  const raw = field(req.body, "sections")
  const ids = (Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : []).map((s) => s.trim()).filter(Boolean).slice(0, 5)
  if (!ids.length) return undefined
  const from = safeReturn(field(req.body, "sections_url")) ?? "/cart"
  const after: SiteRequest = { ...req, cart, note, query: new URLSearchParams(from.split("?")[1] ?? "") }
  const key = from.split("?")[0] === "/" ? "home" : from.split("?")[0] === "/cart" ? "cart" : null
  const sections = sectionsOf(site, key ?? "cart") ?? sectionsOf(site, "home") ?? []
  const page = basePage(site, after, { template: key === "home" ? "index" : "cart", path: from.split("?")[0] })
  const r = sectionsAnswer(site, page, sections, ids, true)
  return JSON.parse(String(r.body)) as Record<string, string | null>
}

function cartAction(site: SiteData, req: SiteRequest, action: string, ajax: boolean): SiteResponse {
  const index = variantIndex(site)
  /* Copies: what was asked with is never changed under the caller. */
  let cart = req.cart.map((e) => ({ ...e }))
  let note = req.note ?? ""
  const error = (message: string, status = 422) => (ajax ? json({ status, message, description: message }, status) : redirect("/cart"))

  if (action === "add") {
    const items = itemsOf(req.body)
    if (!items.length) return error("Choose an option to add.")
    const added: CartEntry[] = []
    /* What was asked for, alone and at the quantity asked: what Buy it now sends to checkout. */
    const asked: CartEntry[] = []
    for (const item of items) {
      const hit = index.get(item.id)
      if (!hit) return error("This product is not available.", 404)
      if (hit.card.settings.available === false) return error(`${String(hit.card.settings.title)} is sold out.`)
      const v = hit.variantId === hit.card.id ? null : hit.variantId
      const k = lineKey(hit.card.id, v, item.properties)
      const existing = cart.find((e) => e.k === k)
      const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(item.quantity)))
      asked.push({ k, p: hit.card.id, v, q: qty, ...(item.properties ? { props: item.properties } : {}) })
      if (existing) existing.q = Math.min(MAX_QTY, existing.q + qty)
      else {
        if (cart.length >= MAX_LINES) return error("The cart is full.")
        cart.push({ k, p: hit.card.id, v, q: qty, ...(item.properties ? { props: item.properties } : {}) })
      }
      added.push(cart.find((e) => e.k === k)!)
    }
    /* Buy it now: that item alone goes to checkout, and the cart stays as it was (Shopify's own rule). */
    if (!ajax && field(req.body, "checkout") !== undefined) return { ...checkoutHandoff(site, asked), cart: req.cart, note: req.note ?? "" }
    if (!ajax) return redirect("/cart", { cart, note })
    const lines = (cartJson(site, cart, note).items as O[])
    const out = added.map((a) => lines.find((l) => l.key === a.k)).filter(Boolean) as O[]
    const sections = sectionsFor(site, req, cart, note)
    const body: O = items.length > 1 || Array.isArray(field(req.body, "items")) ? { items: out } : { ...(out[0] ?? {}) }
    if (sections) body.sections = sections
    return json(body, 200, { cart, note })
  }

  if (action === "change") {
    const line = Number(field(req.body, "line") ?? 0)
    const id = String(field(req.body, "id") ?? "")
    const qty = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(field(req.body, "quantity") ?? 1))))
    const at = line > 0 ? line - 1 : cart.findIndex((e) => e.k === id || e.v === id || (e.v === null && e.p === id))
    if (at < 0 || at >= cart.length) return error("That line is not in the cart.", 400)
    if (qty === 0) cart.splice(at, 1)
    else cart[at] = { ...cart[at], q: qty }
  } else if (action === "update") {
    const updates = field(req.body, "updates")
    if (Array.isArray(updates)) {
      cart = cart.map((e, i) => ({ ...e, q: Math.max(0, Math.min(MAX_QTY, Math.floor(Number(updates[i] ?? e.q)))) })).filter((e) => e.q > 0)
    } else if (updates && typeof updates === "object") {
      for (const [k, v] of Object.entries(updates as O)) {
        const i = cart.findIndex((e) => e.k === k || e.v === k || (e.v === null && e.p === k))
        const q = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(v))))
        if (i >= 0) cart[i] = { ...cart[i], q }
        else if (q > 0 && index.get(k)) {
          const hit = index.get(k)!
          const v2 = hit.variantId === hit.card.id ? null : hit.variantId
          cart.push({ k: lineKey(hit.card.id, v2), p: hit.card.id, v: v2, q })
        }
      }
      cart = cart.filter((e) => e.q > 0)
    }
    for (const [k, v] of Object.entries(req.body ?? {})) {
      const m = k.match(/^updates\[(.+)\]$/)
      if (!m) continue
      const i = cart.findIndex((e) => e.k === m[1] || e.v === m[1])
      if (i >= 0) cart[i] = { ...cart[i], q: Math.max(0, Math.min(MAX_QTY, Math.floor(Number(v)))) }
    }
    cart = cart.filter((e) => e.q > 0)
    if (typeof field(req.body, "note") === "string") note = String(field(req.body, "note")).slice(0, 500)
    if (!ajax && field(req.body, "checkout") !== undefined) return { ...checkoutHandoff(site, cart), cart, note }
  } else if (action === "clear") {
    cart = []
  }
  if (!ajax) return redirect(safeReturn(field(req.body, "return_to")) ?? "/cart", { cart, note })
  const body = cartJson(site, cart, note)
  const sections = sectionsFor(site, req, cart, note)
  if (sections) body.sections = sections
  return json(body, 200, { cart, note })
}

/**
 * CHECKOUT IS STORELIB'S. The page posts the lines to the basket checkout
 * every Storelib website uses (/api/checkout/cart), which prices them from
 * the database and opens Stripe; the theme never sees a price it could set.
 */
function checkoutHandoff(site: SiteData, cart: CartEntry[]): SiteResponse {
  const items = cart.map((e) => ({ productId: e.p, variantId: e.v, quantity: e.q }))
  const data = JSON.stringify({ items }).replace(/</g, "\\u003c")
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Checkout · ${escapeHtml(site.shop.name)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,-apple-system,sans-serif;color:#1a1a2e;background:#f8f9fa}main{max-width:360px;padding:24px;text-align:center}a{color:inherit}</style></head>
<body><main><p id="m">Opening checkout…</p></main><script>(function(){var d=${data};var m=document.getElementById("m");if(!d.items.length){location.replace("/cart");return}
fetch("/api/checkout/cart",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:d.items,returnPath:"/cart"})}).then(function(r){return r.json().then(function(b){return{ok:r.ok,b:b}})}).then(function(x){if(x.ok&&x.b&&x.b.url){location.replace(x.b.url);return}
m.textContent=(x.b&&x.b.error)||"Checkout could not open. Try again.";var a=document.createElement("a");a.href="/cart";a.textContent="Back to the cart";m.after(a)}).catch(function(){m.textContent="Checkout could not open. Check your connection and try again."})})();</script></body></html>`)
}

/**
 * A contact form or a newsletter sign up, sent to the creator's inbox and
 * Subscribers through Storelib's own endpoints (which carry the spam checks),
 * then back to the page with `contact_posted=true`, so the theme shows its
 * own thank you.
 */
function formHandoff(site: SiteData, req: SiteRequest): SiteResponse {
  const b = req.body ?? {}
  const type = String(b.form_type ?? "contact")
  const back = safeReturn(b.return_to) ?? "/"
  const flat = (k: string) => {
    const v = b[k] ?? b[`contact[${k}]`] ?? b[`customer[${k}]`]
    return typeof v === "string" ? v.slice(0, 5000) : ""
  }
  const email = flat("email")
  const subscribe = type === "customer"
  const payload = subscribe
    ? { creator_id: site.creatorId, email, placement: "footer" }
    : { creator_id: site.creatorId, name: flat("name") || flat("first_name"), email, message: flat("body") || flat("message") || flat("comment"), consent: false, company: "", elapsed: 15000, page: "contact" }
  const done = `${back.split("#")[0]}${back.includes("?") ? "&" : "?"}${subscribe ? "customer" : "contact"}_posted=true${subscribe ? "#footer" : "#contact_form"}`
  const data = JSON.stringify({ payload, done, endpoint: subscribe ? "/api/website-builder/subscribe" : "/api/website-builder/contact", back }).replace(/</g, "\\u003c")
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(site.shop.name)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,-apple-system,sans-serif;color:#1a1a2e;background:#f8f9fa}main{max-width:360px;padding:24px;text-align:center}a{color:inherit}</style></head>
<body><main><p id="m">Sending…</p></main><script>(function(){var d=${data};var m=document.getElementById("m");
fetch(d.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d.payload)}).then(function(r){return r.json().catch(function(){return{}}).then(function(b){return{ok:r.ok,b:b}})}).then(function(x){if(x.ok){location.replace(d.done);return}
m.textContent=(x.b&&x.b.error)||"It did not send. Try again.";var a=document.createElement("a");a.href=d.back;a.textContent="Go back";m.after(a)}).catch(function(){m.textContent="Could not reach the server. Check your connection and try again."})})();</script></body></html>`)
}

// ── Cookies ─────────────────────────────────────────────────────────────────

export const CART_COOKIE = "sl_theme_cart"

/** The cart from its cookie. Anything that does not read as one is an empty cart. */
export function readCartCookie(raw: string | undefined): { cart: CartEntry[]; note: string } {
  if (!raw) return { cart: [], note: "" }
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as { l?: unknown; n?: unknown }
    const lines = Array.isArray(v.l) ? v.l : []
    const cart = lines
      .filter((e): e is O => !!e && typeof e === "object")
      .map((e) => ({ k: String(e.k ?? ""), p: String(e.p ?? ""), v: typeof e.v === "string" ? e.v : null, q: Math.max(1, Math.min(MAX_QTY, Math.floor(Number(e.q) || 1))), ...(e.props && typeof e.props === "object" ? { props: e.props as Record<string, string> } : {}) }))
      .filter((e) => e.k && e.p)
      .slice(0, MAX_LINES)
    return { cart, note: typeof v.n === "string" ? v.n.slice(0, 500) : "" }
  } catch {
    return { cart: [], note: "" }
  }
}

export function writeCartCookie(cart: CartEntry[], note: string): string {
  return encodeURIComponent(JSON.stringify({ l: cart, n: note || undefined }))
}

// ── Assets ──────────────────────────────────────────────────────────────────

/**
 * One of the theme's files from assets/: as it is, as bytes for a font, or
 * drawn first when it is a `.liquid` asset (`theme.css.liquid` is served as
 * `theme.css`, with the theme's settings in it).
 */
export function themeAsset(theme: CompatTheme, name: string, settingsCtx: () => import("./runtime").Ctx): { type: string; body: string | Uint8Array } | null {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.@-]*$/.test(name)) return null
  const type = assetType(name)
  if (!type) return null
  const text = theme.files[`assets/${name}`]
  if (text !== undefined) {
    const bytes = binaryOf(text)
    return { type, body: bytes ?? text }
  }
  const liquid = theme.files[`assets/${name}.liquid`]
  if (liquid !== undefined) {
    try {
      return { type, body: renderString(liquid, settingsCtx(), { lax: true }) }
    } catch {
      return { type, body: liquid.replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g, "") }
    }
  }
  return null
}

export { OUTPUT }
