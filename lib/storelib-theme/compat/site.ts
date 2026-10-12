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
 *   checkout          /cart with `checkout`, /checkout: straight on to
 *                     the website's own checkout on this same host, with
 *                     the lines (/checkout?items=, lib/checkout/site-checkout)
 *   products as data  /products/<handle>.js  .json  /products.json
 *                     /collections/<handle>/products.json
 *   search box        /search/suggest(.json)?q=  with section_id
 *   recommendations   /recommendations/products?product_id=&section_id=
 *   forms             /contact (contact and newsletter): Storelib's own
 *                     contact and subscribe endpoints, then back to the
 *                     page with the theme's own thank you or error
 *   the account       /account  /account/login  /account/register
 *                     /account/addresses: the theme's own customers/*
 *                     templates when it has them, Storelib's sign in and
 *                     account markup in its header and footer when not
 *                     (./account.ts); the forms post to Storelib's routes
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
import { groupSections } from "./theme"
import { templateOfPage } from "./install"
import { assetType, binaryOf } from "./install"
import { renderString } from "./runtime"
import { facet } from "./facets"
import { linkFactsOf, siteLink } from "./links"
import { CLEAR_CART_PARAM } from "@/lib/checkout/basket-link"
import { CART_ATTRIBUTES_MAX, cartAttributes, siteCheckoutHref } from "@/lib/checkout/site-checkout"
import { fixThemeCss } from "./css-fixes"
import { accountContent, addressesContent, downloadNotice, orderContent, signInContent, themeCustomer, themeSignInFields, type SiteAccount } from "./account"
import { signInNotice } from "@/lib/website-builder/account-pages"
import { ownedBanner } from "./owned-banner"
import { commerceMarkup, withBodyStart, type CompatCommerce } from "./site-commerce-markup"

type O = Record<string, unknown>

export interface SiteData {
  creatorId: string
  theme: CompatTheme
  /** The published page rows, by key. */
  pages: Record<string, StoredSection[]>
  /** Every page key the site has, where `pages` holds only some of them (the builder's canvas). */
  pageKeys?: string[]
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
  /** Put in every live page's head (lib/website-builder/live-navigation.ts: links fetched ahead, pages that cross-fade). */
  extraHead?: string
  /** What a page tells a search engine, by page key (lib/website-builder/page-seo.ts pageSeoForSite): the theme's page_title and page_description, a share picture, noindex. */
  seo?: (pageKey: string) => { title?: string; description?: string; image?: string; noindex?: boolean } | null
  /** Storelib Reviews for a page: the shop's, and the product's on its page (lib/reviews/storefront.ts). Absent: none. */
  reviews?: (product: { id: string; title: string } | null) => Promise<O | null>
  /**
   * How many of a product that ships one cart may hold (lib/website-builder/
   * compat-site.ts cartStock): each option's most, from its stock, and the
   * product's Limit sales across its options. Null: no limit beyond sold out.
   */
  stock?: (productId: string) => Promise<CartStock | null>
  /** Website settings › Commerce: the free shipping banner and the cart's returns line (./site-commerce-markup.ts). Absent: neither. */
  commerce?: CompatCommerce
}

/** What a cart may hold of one product: by variant id (a product with one option: also by its own id), and in all. */
export interface CartStock {
  variants: Record<string, number>
  perOrder: number | null
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
  /** The cart's attributes (Shopify's cart.attributes), kept beside the lines. */
  attributes?: Record<string, string>
  /** A script's request (JSON body, X-Requested-With, Accept: application/json): answered with JSON, as Shopify does, whatever the address ends in. */
  ajax?: boolean
  /** The page the request came from (path and query, this site's own): what `sections` are drawn about when the request names no `sections_url`. */
  referer?: string
  /** Who is visiting, from the website's own session cookie (the route reads it; lib/site-accounts/session.ts). */
  account?: SiteAccount
  /** What the signed in visitor already owns of a product (lib/site-accounts/owned-products): its page says so (owned-banner.ts). */
  owned?: (productId: string) => Promise<{ whole: boolean; options: string[] } | null>
  /**
   * Sends a contact message or a newsletter sign up through Storelib's own
   * endpoints, which carry the spam checks and the rate limits (the route
   * calls them with this request's own headers). Absent, nothing is sent.
   */
  submit?: (kind: "subscribe" | "contact", payload: O) => Promise<{ ok: boolean; status: number }>
}

export interface SiteResponse {
  status: number
  type: string
  body: string | Uint8Array
  headers?: Record<string, string>
  /** The cart after this request, when it changed. */
  cart?: CartEntry[]
  note?: string
  attributes?: Record<string, string>
}

const MAX_LINES = 50
const MAX_QTY = 99

// ── Answers ─────────────────────────────────────────────────────────────────

const html = (body: string, status = 200): SiteResponse => ({ status, type: "text/html; charset=utf-8", body, headers: { "Cache-Control": "private, no-store" } })
/*
  A WHOLE PAGE A VISITOR NAVIGATES TO. "no-cache", not "no-store": still
  never kept by any shared cache and checked with the server before it is
  used again, but the browser may keep it in its back/forward cache, so Back
  and Forward between a store's pages are instant, as on Shopify (Chrome
  turns that cache off for a no-store page). The cart, checkout and account
  pages, which show what is only this visitor's, stay no-store. A page that
  comes back this way checks its cart count (./shims.ts BACK_FORWARD).
*/
const PRIVATE_PATH = /^\/(?:cart|checkout|account)(?:[/?#.]|$)/
const pageHtml = (body: string, path: string, status = 200): SiteResponse => ({
  status,
  type: "text/html; charset=utf-8",
  body,
  headers: { "Cache-Control": PRIVATE_PATH.test(path) || status !== 200 ? "private, no-store" : "private, no-cache" },
})
const json = (value: unknown, status = 200, extra: Partial<SiteResponse> = {}): SiteResponse => ({ status, type: "application/json; charset=utf-8", body: JSON.stringify(value), headers: { "Cache-Control": "private, no-store" }, ...extra })
/*
  A path on this site stays on it. A browser reads "//host" and "/\\host" in
  a Location as another site's address, and a decoded request path can begin
  that way (/%2F%2Fevil.example), so the slashes in front fold into one.
*/
export const onSitePath = (to: string): string => (/^[/\\]{2}/.test(to) ? `/${to.replace(/^[/\\]+/, "")}` : to)
const redirect = (to: string, extra: Partial<SiteResponse> = {}): SiteResponse => ({ status: 303, type: "text/plain", body: "", headers: { Location: onSitePath(to), "Cache-Control": "private, no-store" }, ...extra })

export async function answer(site: SiteData, req: SiteRequest): Promise<SiteResponse> {
  const path = decodePath(req.path)
  const method = req.method.toUpperCase()

  /* Back from paying for the whole cart: it empties, and the address loses the flag (lib/checkout/basket-link). */
  if (method === "GET" && req.query.get(CLEAR_CART_PARAM) === "clear") {
    const rest = new URLSearchParams(req.query)
    rest.delete(CLEAR_CART_PARAM)
    const search = rest.toString()
    return redirect(`${path}${search ? `?${search}` : ""}`, { cart: [], note: "", attributes: {} })
  }

  /* ── the cart ── */
  /* A link that adds, as Shopify's do: /cart/add?id=<variant>&quantity=2 adds and opens the cart. */
  if (method === "GET" && path === "/cart/add" && req.query.get("id")) {
    const body: Record<string, unknown> = { id: req.query.get("id"), quantity: req.query.get("quantity") ?? "1" }
    return await cartAction(site, { ...req, method: "POST", body }, "add", false)
  }
  /* A link that changes a line, as Shopify's do: /cart/change?id=<key>&quantity=0 (a line's url_to_remove) or ?line=1&quantity=2, then the cart. */
  if (method === "GET" && path === "/cart/change" && (req.query.get("id") || req.query.get("line"))) {
    const body: Record<string, unknown> = { quantity: req.query.get("quantity") ?? "1", ...(req.query.get("line") ? { line: req.query.get("line") } : { id: req.query.get("id") }) }
    return await cartAction(site, { ...req, method: "POST", body }, "change", false)
  }
  /* A cart permalink, /cart/<variant>:<quantity>,<variant>:<quantity>: those lines, straight to checkout. */
  const permalink = method === "GET" ? path.match(/^\/cart\/([^/]+:\d+(?:,[^/]+:\d+)*)$/) : null
  if (permalink) {
    const index = variantIndex(site)
    const lines: CartEntry[] = []
    for (const part of permalink[1].split(",").slice(0, MAX_LINES)) {
      const [id, n] = part.split(":")
      const hit = index.get(decodeURIComponent(id))
      if (!hit || hit.card.settings.available === false || (hit.variantId !== hit.card.id && variantSoldOut(hit.card, hit.variantId))) continue
      const v = hit.variantId === hit.card.id ? null : hit.variantId
      lines.push({ k: lineKey(hit.card.id, v), p: hit.card.id, v, q: Math.max(1, Math.min(MAX_QTY, Math.floor(Number(n)) || 1)) })
    }
    return lines.length ? { ...checkoutHandoff(site, lines, true, req.note ?? "", req.attributes), cart: lines, note: req.note ?? "", attributes: req.attributes ?? {} } : redirect("/cart")
  }
  const cartRoute = path.match(/^\/cart(?:\/(add|change|update|clear))?(\.js|\.json)?$/)
  if (cartRoute && (method === "POST" || cartRoute[2])) {
    const [, action, ext] = cartRoute
    if (method === "GET" && !action) return json(cartJson(site, req.cart, req.note ?? "", req.attributes))
    if (method !== "POST") return json({ status: 405, message: "Method not allowed" }, 405)
    return await cartAction(site, req, action ?? "update", !!ext || (req.ajax === true && !!action))
  }
  if (path === "/checkout" || path === "/cart/checkout") return checkoutHandoff(site, req.cart, true, req.note ?? "", req.attributes)

  /* ── forms ── */
  if (method === "POST" && (path === "/contact" || path === "/contact/" || (path === "/account" && String(req.body?.form_type ?? "") === "customer"))) return await formSubmit(site, req)
  /* A theme's sign in, sign up and address forms are posted to Storelib's account routes by the site route (accountFormPost); one that reaches here is sent to sign in. */
  if (method === "POST" && (path === "/account" || path.startsWith("/account/"))) return redirect("/account/login")
  /* Storelib's own menus link the shop as /products; Shopify sends that address to every product, as here. */
  if (path === "/products" && (method === "GET" || method === "HEAD")) {
    const q = req.query.toString()
    return redirect(`/collections/all${q ? `?${q}` : ""}`)
  }
  if (method === "POST" && path === "/localization") return redirect(safeReturn(req.body?.return_to) ?? "/")

  /* ── products as data ── */
  /*
    THE SHOP'S PRODUCTS AS A LIST, /products.json and
    /collections/<handle>/products.json, Shopify's public feed: a theme's
    script builds a row of cards from it (recently viewed, "you may also
    like"). `limit` (at most 250) and `page`, as Shopify reads them.
  */
  const feed = method === "GET" ? path.match(/^(?:\/collections\/([^/]+))?\/products\.json$/) : null
  if (feed) {
    const handle = feed[1]
    const list = !handle || handle === "all" ? site.products : site.collections.find((c) => c.handle === handle || c.id === handle)?.products ?? null
    if (!list) return json({ status: 404, message: "Not found" }, 404)
    const limit = Math.min(250, Math.max(1, Math.floor(Number(req.query.get("limit") ?? 30)) || 30))
    const pageNo = Math.max(1, Math.floor(Number(req.query.get("page") ?? 1)) || 1)
    return json({ products: list.slice((pageNo - 1) * limit, pageNo * limit).map((c) => productFeedJson(productObject(c))) })
  }
  const productData = path.match(/^\/products\/([^/]+)\.(js|json)$/)
  if (productData) {
    const card = await findProduct(site, productData[1])
    if (!card) return json({ status: 404, message: "Not found" }, 404)
    const obj = productObject(card, { descriptionHtml: card.descriptionHtml })
    /* /products/<handle>.js is the storefront's shape (cents); .json is the feed's ("40.00", body_html, image), as on Shopify. */
    return json(productData[2] === "json" ? { product: productFeedJson(obj) } : productJson(obj))
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
    return json({ resources: { results: { products: found.map((c) => suggestProductJson(productObject(c))), collections: collections.map((c) => ({ id: c.id, title: c.title, handle: c.handle, url: c.url ?? `/collections/${c.handle}` })), queries: terms ? [{ text: terms, styled_text: escapeHtml(terms), url: `/search?q=${encodeURIComponent(terms)}` }] : [] } } })
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
    return json({ intent, products: products.map((c) => productJson(productObject(c))) })
  }

  /* ── pages ── */
  const route = await pageFor(site, path, req)
  if (!route) {
    /*
      AN ADDRESS OF THE STORE THE THEME CAME FROM (a collection, a product, a
      blog it had, its own domain's path with a locale in front) is sent on,
      once, to the place on this site it meant (./links.ts). Any other address
      that is not a page stays this site's 404.
    */
    const meant = method === "GET" && !req.ajax && !req.query.get("section_id") && !req.query.get("sections") ? siteLink(path, linkFactsOf({ pageKeys: siteKeys(site), products: site.products, pickable: site.pickable, collections: site.collections, shop: site.shop }), { pageFallback: false }) : path
    if (meant !== path && meant.startsWith("/")) {
      const q = req.query.toString()
      return redirect(`${meant}${q ? `?${q}` : ""}`)
    }
    return notFound(site, req)
  }
  if (route.redirect) return redirect(route.redirect)
  const sectionId = req.query.get("section_id")
  const sections = req.query.get("sections")
  if (sectionId) return sectionsAnswer(site, route.page, route.sections, [sectionId], false)
  if (sections) return sectionsAnswer(site, route.page, route.sections, sections.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5), true)
  /* Website settings › Commerce, said with this visitor's cart (./site-commerce-markup.ts). */
  const shop = commerceMarkup(site.commerce, site.commerce ? Number(cartObject(cartLines(site, req.cart), site.shop.currency ?? "USD").total_price) || 0 : 0)
  const head = `${site.extraHead ?? ""}${shop.head}${route.head ?? ""}`
  const bodyEnd = `${site.extraBodyEnd ?? ""}${route.bodyEnd ?? ""}${shop.bodyEnd}`
  const drawn = drawPage(site.theme, route.page, route.sections, { scripts: true, extraHead: head || undefined, extraBodyEnd: bodyEnd || undefined, content: route.content })
  return pageHtml(withBodyStart(drawn.html, shop.bodyStart), path, route.status ?? 200)
}

/**
 * A POST one of the theme's account forms makes, and what it means on
 * Storelib, for the site route to carry out (it needs the request's own
 * cookies and headers, which this pure handler never sees):
 *
 *   code   sign in, Create account and Forgot password (/account/login,
 *          /account, /account/register, /account/recover): every one is
 *          "email me a code", Storelib's own code route with the email,
 *          where to land, and the name a Create account form asked for
 *   back   an address form (/account/addresses): addresses are saved by
 *          checkout, so there is nothing to keep; back to the list
 *
 * Null for anything else: signing out, and a newsletter form posted to
 * /account (form_type customer), which is answered here like /contact.
 */
export function accountFormPost(method: string, path: string, body: O | null): { kind: "code"; email: string; returnPath: string; name: string } | { kind: "back"; to: string } | null {
  if (method.toUpperCase() !== "POST") return null
  const p = decodePath(path)
  if ((p !== "/account" && !p.startsWith("/account/")) || p === "/account/logout") return null
  const type = String(body?.form_type ?? "")
  if (type === "customer") return null
  if (p.startsWith("/account/addresses") || type === "customer_address") return { kind: "back", to: "/account/addresses" }
  return { kind: "code", ...themeSignInFields(body) }
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
  return typeof v === "string" && v.startsWith("/") && !/^\/[/\\]/.test(v) ? v : null
}

// ── Pages ───────────────────────────────────────────────────────────────────

interface Route {
  page: CompatPage
  sections: StoredSection[]
  status?: number
  /** Drawn in the theme's layout in place of the page's own sections. */
  content?: string
  /** Not a page: the visitor belongs elsewhere (signed in at the sign in page, a guest at the account). */
  redirect?: string
  /** Put in this page's head only: its share picture and whether it may be listed (seoHead). */
  head?: string
  /** Put at the end of this page's body only: "You already own this" on a product the visitor owns (owned-banner.ts). */
  bodyEnd?: string
}

const attr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/** A page's share picture and its noindex, for a theme whose own head says neither. */
function seoHead(seo: { image?: string; noindex?: boolean } | null | undefined): string | undefined {
  if (!seo) return undefined
  let out = ""
  if (seo.noindex) out += `<meta name="robots" content="noindex, follow" data-storelib-seo>`
  if (seo.image) out += `<meta property="og:image" content="${attr(seo.image)}" data-storelib-seo><meta name="twitter:image" content="${attr(seo.image)}" data-storelib-seo>`
  return out || undefined
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
/**
 * THE VISITOR'S ACCOUNT, on the website's own host and in its own header and
 * footer. The theme's own template where it has one (customers/login,
 * customers/register, customers/account), drawn with the signed-in
 * `customer`; Storelib's sign in and account markup (./account.ts) where it
 * has none, and for the code step and the addresses, which no Shopify theme
 * draws for an emailed code or for addresses saved at checkout.
 *
 * A signed-in visitor at the sign in page goes on to their account (or where
 * they were going); a guest at the account goes to sign in, as on Shopify.
 */
function accountPage(site: SiteData, req: SiteRequest, path: string): Route {
  const customer = req.account?.customer ?? null
  const signIn = path.match(/^\/account\/(login|register|recover|reset|activate)(?:\/|$)/)
  if (signIn) {
    const back = safeReturn(req.query.get("return")) ?? safeReturn(req.query.get("return_to")) ?? "/account"
    if (customer) return { ...shell(site, req, path, "Account", ""), redirect: back }
    const pending = req.query.get("step") === "email" ? null : (req.account?.pending ?? null)
    const error = req.query.get("error")
    /* A code refused after this browser's note ran out lands on the email step, and says to start again there (as the native sign in page does). */
    const notice = signInNotice(!pending && (error === "code" || error === "expired" || error === "tries") ? "restart" : error) ?? (pending && req.query.get("sent") === "1" ? "A new code is on its way." : null)
    const register = signIn[1] === "register"
    const title = register ? "Create account" : "Sign in"
    if (pending) return shell(site, req, path, title, signInContent({ step: "code", email: pending.email, returnTo: back, notice }), "customers/login")
    const own = themeAccountTemplate(site, req, register ? "customers/register" : "customers/login", path, title, notice ? { customer_login: notice } : null)
    if (own) return own
    return shell(site, req, path, title, signInContent({ step: "email", returnTo: back, notice, register }), register ? "customers/register" : "customers/login")
  }
  if (!customer) {
    const q = path === "/account" ? "" : `?return=${encodeURIComponent(path)}`
    return { ...shell(site, req, path, "Sign in", ""), redirect: `/account/login${q}` }
  }
  if (path === "/account") {
    const notice = req.query.get("profile") === "saved" ? "Saved." : req.query.get("profile") === "error" ? "That name could not be saved. Try again." : req.query.get("deleted") === "no" ? "Your account could not be deleted. Try again." : null
    const edit = req.query.get("edit")
    if (!edit && !notice) {
      const own = themeAccountTemplate(site, req, "customers/account", path, "Account", null, accountExtras(customer))
      if (own) return own
    }
    return shell(site, req, path, "Account", accountContent(customer, { notice, edit }), "customers/account")
  }
  if (path === "/account/addresses") return shell(site, req, path, "Addresses", addressesContent(customer), "customers/addresses")
  /* An order that ships: its order page on this website, with the status and the tracking (app/checkout/physical/order). */
  const shipped = path.match(/^\/account\/orders\/([^/]+)\/?$/)
  if (shipped) {
    const own = (customer.orders ?? []).find((o) => o.id === shipped[1])
    if (own?.order_url && own.action_label === "Track order") return { ...shell(site, req, path, "Account", ""), redirect: own.order_url }
  }
  /* An order with files: its own page here, each file downloaded on this website (lib/site-accounts/order-files.ts). */
  if (/^\/account\/orders\/[^/]+\/?$/.test(path) && req.account?.order) {
    const o = req.account.order
    return shell(site, req, path, `Order #${o.number}`, orderContent(o, { notice: downloadNotice(req.query.get("download")) }), "customers/order")
  }
  /* An order's own page is its receipt, which each order on the account page links to. */
  return { ...shell(site, req, path, "Account", ""), redirect: "/account" }
}

/** The account pages the builder's canvas can open, as a visitor reaches them. */
export const CANVAS_ACCOUNT_PATHS = ["/account", "/account/login", "/account/register", "/account/addresses"] as const

/** A customer the builder shows the account page about: no orders, plainly a sample. */
const SAMPLE_CUSTOMER = { name: "Sample customer", first_name: "Sample", email: "customer@example.com", orders: [], orders_count: 0, addresses: [] }

/**
 * AN ACCOUNT PAGE IN THE BUILDER'S CANVAS, drawn by the theme exactly as the
 * website draws it (accountPage above): sign in and Create account as a
 * guest sees them, the account page about a sample customer. Nothing here
 * signs anybody in; the canvas says that works on the live site when a form
 * on it is sent (canvas-bridge.ts). Null for any other address.
 */
export function canvasAccountPage(site: SiteData, path: string, opts: { extraHead?: string; extraBodyEnd?: string } = {}): { path: string; html: string } | null {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/"
  if (!(CANVAS_ACCOUNT_PATHS as readonly string[]).includes(clean)) return null
  const signIn = /^\/account\/(login|register)$/.test(clean)
  const req: SiteRequest = { method: "GET", path: clean, query: new URLSearchParams(), body: null, cart: [], account: { customer: signIn ? null : SAMPLE_CUSTOMER } }
  const route = accountPage({ ...site, designMode: true }, req, clean)
  if (route.redirect) return null
  const drawn = drawPage(site.theme, route.page, route.sections, { scripts: true, extraHead: opts.extraHead, extraBodyEnd: opts.extraBodyEnd, content: route.content })
  return { path: clean, html: drawn.html }
}

/** Below a theme's own account page: the Storelib parts it has no place for, editing the name and deleting the account. */
function accountExtras(customer: SiteAccount["customer"]): string {
  /*
    A theme's order table says Paid and a total; what was bought to download
    is a step further in. Each order with files is listed here too, each
    opening its page on this website, where the files are.
  */
  const downloads = (customer?.orders ?? []).filter((o) => o.action_label === "Download" && o.action_url.startsWith("/account/orders/"))
  const list = downloads.length
    ? `<div style="box-sizing:border-box;max-width:var(--page-width,1200px);margin:0 auto;padding:24px 20px 0"><h2 style="margin:0 0 8px;font-size:1.15em">Downloads</h2><ul style="list-style:none;margin:0;padding:0">${downloads
        .map((o) => `<li style="display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:48px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)"><span style="min-width:0;overflow-wrap:anywhere">${escapeText(o.items.map((i) => i.title).join(", "))} <span style="opacity:.7;font-size:.9em">${escapeText(o.date)}</span></span><a href="${escapeText(o.action_url)}" style="color:inherit;text-decoration:underline;text-underline-offset:4px;flex:none">Download</a></li>`)
        .join("")}</ul></div>`
    : ""
  return `${list}<div style="box-sizing:border-box;max-width:var(--page-width,1200px);margin:0 auto;padding:8px 20px 56px;display:flex;flex-wrap:wrap;gap:8px 24px;align-items:center"><a href="/account?edit=name#profile" style="color:inherit;text-decoration:underline;text-underline-offset:4px">Edit name</a><a href="/account?edit=delete#delete" style="color:inherit;text-decoration:underline;text-underline-offset:4px;opacity:.75">Delete account</a></div>`
}

/**
 * The theme's own customers/<name> template, as a page in its header and
 * footer: a JSON template's sections, or a Liquid template drawn as written.
 * Null when the theme has neither (Dawn and Horizon, whose accounts moved to
 * Shopify's hosted pages). `after` is markup put below the template's own.
 */
function themeAccountTemplate(site: SiteData, req: SiteRequest, template: string, path: string, title: string, formErrors: Record<string, string> | null, after = ""): Route | null {
  const files = site.theme.files
  const chrome = (sectionsOf(site, "home") ?? []).filter((s) => s.group === "header" || s.group === "footer" || s.group === "overlay")
  const page = basePage(site, req, { template, path, title, ...(formErrors ? { formErrors: { ...(formErrorsOf(req) ?? {}), ...formErrors } } : {}) })
  const json = files[`templates/${template}.json`]
  if (json !== undefined) {
    let sections: StoredSection[] = []
    try {
      sections = groupSections(json).map((s) => ({ ...s, type: site.theme.typeOf(s.type) }) as unknown as StoredSection)
    } catch {
      return null
    }
    /* Only a template whose sections the theme has: one that names a missing section would draw an empty page. */
    if (!sections.length || sections.some((s) => files[`sections/${s.type}.storelib`] === undefined)) return null
    if (!after) return { page, sections: [...chrome.filter((s) => s.group === "header"), ...sections, ...chrome.filter((s) => s.group !== "header")] }
    const ctx = pageContextFor(site.theme, page, [...chrome, ...sections])
    const content = sections.filter((s) => !s.hidden).map((s, i) => drawSection(site.theme, ctx, s, i).html).join("") + after
    return { page, sections: chrome, content }
  }
  if (files[`templates/${template}.liquid`] !== undefined) return { page, sections: chrome }
  return null
}

/** The wishlist, which is Storelib's own page, shown in a frame of the same site between the theme's header and footer. */
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

/** The site's page keys: the builder's own list where it gives one (its canvas holds one page at a time), else the pages held. */
const siteKeys = (site: SiteData): string[] => site.pageKeys ?? Object.keys(site.pages)

function basePage(site: SiteData, req: SiteRequest, extra: Partial<CompatPage> & { template: string; path: string }): CompatPage {
  return {
    designMode: site.designMode === true,
    pageKeys: siteKeys(site),
    host: site.host,
    query: Object.fromEntries(req.query.entries()),
    products: site.products,
    pickable: site.pickable,
    collections: site.collections,
    menus: site.menus,
    /* The creator's id: the key the website's own wishlist is kept under, which a theme's hearts are copied into (shims.ts). */
    shop: { ...site.shop, id: site.creatorId },
    cart: cartLines(site, req.cart),
    cartNote: req.note ?? "",
    cartAttributes: req.attributes ?? {},
    customer: req.account?.customer ? themeCustomer(req.account.customer) : null,
    formErrors: formErrorsOf(req),
    ...extra,
  }
}

/**
 * WHY A FORM ON THIS PAGE DID NOT GO THROUGH, from the address it came back
 * to: `?form_error=<code>&form_type=customer` after a newsletter or contact
 * post, `?error=<why>` on the sign in pages (lib/website-builder/
 * account-pages signInNotice). Fixed sentences for fixed codes: nothing the
 * address says is printed.
 */
const FORM_ERRORS: Record<string, string> = {
  email: "Enter a valid email address.",
  check: "Check the form and try again.",
  limit: "That is a lot at once. Try again in a few minutes.",
  failed: "It did not send. Try again.",
}

function formErrorsOf(req: SiteRequest): Record<string, string> | null {
  const out: Record<string, string> = {}
  const type = req.query.get("form_type")
  const code = req.query.get("form_error")
  if ((type === "customer" || type === "contact") && code && FORM_ERRORS[code]) out[type] = FORM_ERRORS[code]
  return Object.keys(out).length ? out : null
}

/**
 * `?view=<name>`: the page drawn with its alternate template,
 * `templates/<type>.<name>.liquid` or `.json`, as Shopify does. An older
 * theme's cart drawer, quick view and live search fetch one of these
 * (`/cart?view=drawer`, `/products/x?view=quick`, `/search?view=json`),
 * usually written `{% layout none %}`. The page's header and footer stay;
 * the template part is the alternate's. A view the theme does not have is
 * the page as it is, as on Shopify.
 */
function viewOf(site: SiteData, req: SiteRequest, template: string, sections: StoredSection[]): { suffix: string; sections: StoredSection[] } | null {
  const view = (req.query.get("view") ?? "").trim()
  if (!view || !/^[a-z0-9_-]{1,40}$/i.test(view)) return null
  const files = site.theme.files
  const parts = pageParts(sections)
  const around = (middle: StoredSection[]) => [...parts.header, ...middle, ...parts.footer, ...parts.overlay]
  if (files[`templates/${template}.${view}.liquid`] !== undefined) return { suffix: view, sections: around([]) }
  const json = files[`templates/${template}.${view}.json`]
  if (json !== undefined) return { suffix: view, sections: around(groupSections(json).map((s) => ({ ...s, type: site.theme.typeOf(s.type) }) as unknown as StoredSection)) }
  return null
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
  /* The visitor's account, on this host in the theme (accountPage); the wishlist, Storelib's own page in the theme's header and footer (accountShell). */
  if ((path === "/account" || path.startsWith("/account/")) && path !== "/account/logout") return accountPage(site, req, path)
  if (path === "/wishlist") return accountShell(site, req, path)
  const at = (key: string, extra: Partial<CompatPage> = {}, status?: number): Route | null => {
    const sections = sectionsOf(site, key)
    if (!sections) return null
    const { template, suffix } = templateOfPage(key)
    /* The page's own title and description from Website settings, as the theme's page_title and page_description. */
    const seo = site.seo?.(key) ?? null
    const told: Partial<CompatPage> = { ...(seo?.title ? { title: seo.title } : {}), ...(seo?.description ? { description: seo.description } : {}) }
    const head = seoHead(seo)
    const alternate = viewOf(site, req, template, sections)
    if (alternate) return { page: basePage(site, req, { template, suffix: alternate.suffix, path, ...extra, ...told }), sections: alternate.sections, status, head }
    return { page: basePage(site, req, { template, suffix, path, ...extra, ...told }), sections, status, head }
  }
  /* Storelib Reviews, for the page's Storelib Reviews section and the app blocks a theme kept (./storelib-reviews.ts). Never stops a page. */
  const reviewsFor = async (p: { id: string; title: string } | null) => (site.reviews ? await site.reviews(p).catch(() => null) : null)
  if (path === "/" || path === "") return at("home", { title: site.shop.name, reviews: await reviewsFor(null) })

  const product = path.match(/^(?:\/collections\/[^/]+)?\/products\/([^/]+)$/)
  if (product) {
    const card = await findProduct(site, product[1])
    if (!card) return null
    const selectedVariantId = req.query.get("variant") ?? variantForOptionValues(card, req.query.get("option_values"))
    const route = at("product", { product: card, selectedVariantId, title: String(card.settings.title ?? ""), reviews: await reviewsFor({ id: card.id, title: String(card.settings.title ?? "") }) })
    /* Signed in and already theirs: said at the foot of the page, with the way to the downloads. */
    const owned = route && req.account?.customer && req.owned ? await req.owned(card.id).catch(() => null) : null
    if (route && owned) {
      const first = (productObject(card).selected_or_first_available_variant as O | null)?.id
      route.bodyEnd = ownedBanner(owned, selectedVariantId ?? (typeof first === "string" ? first : null))
    }
    return route
  }

  /* /reviews: every review of the shop in the theme's header and footer, until the creator makes a page of that name (Storelib Reviews). */
  if ((path === "/reviews" || path === "/pages/reviews") && !site.pages.reviews) {
    const reviews = await reviewsFor(null)
    if (!reviews || (reviews as { enabled?: unknown }).enabled !== true) return null
    const chrome = (sectionsOf(site, "home") ?? []).filter((x) => x.group === "header" || x.group === "footer" || x.group === "overlay")
    const head = chrome.filter((x) => x.group === "header")
    const rest = chrome.filter((x) => x.group !== "header")
    const main: StoredSection = { id: "storelib-reviews-page", type: "storelib-reviews", settings: { heading: "Reviews", per_page: 12 } }
    return { page: basePage(site, req, { template: "page", path, title: "Reviews", reviews }), sections: [...head, main, ...rest] }
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
    /* A list asked for by id (a wishlist page's `id:… OR id:…`) is longer than words typed into the box. */
    const asked = (req.query.get("q") ?? "").trim()
    const terms = asked.slice(0, /^\(?(id|handle):/i.test(asked) ? 4000 : 200)
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
    const reviews = site.pages[handle] ? await reviewsFor(null) : null
    return at(handle, { pageObject, title, reviews }) ?? (path.startsWith("/pages/") ? at("page", { pageObject, title }) : null)
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
  return html(drawPage(site.theme, page, sections, { scripts: true, extraHead: site.extraHead, extraBodyEnd: site.extraBodyEnd }).html, 404)
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
      /* Drawn alone, as the Section Rendering API draws: no section.index (-1). */
      return drawSection(site.theme, ctx, s, -1, group).html
    }
    const type = site.theme.typeOf(id)
    if (/^[A-Za-z0-9_-]+$/.test(type) && site.theme.files[`sections/${type}.storelib`] !== undefined) return drawSection(site.theme, ctx, { id, type, settings: {} }, -1).html
    /*
      A section of another page, by its own id: a recently viewed section on
      the product page asks the search page for itself (`/search?q=id:…
      &section_id={{ section.id }}`) and reads its products out of the
      answer. Drawn with its own settings, about this page's results.
    */
    const elsewhere = Object.values(site.pages).flat().find((s) => s.id === id && !s.group && !s.hidden)
    return elsewhere ? drawSection(site.theme, ctx, elsewhere, -1).html : null
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

/**
 * Shopify's search syntax for fields, `id:<id> OR id:<id>`, `handle:<h>`,
 * `title:<t>`: how a theme's wishlist page (Posturex's, and most written by
 * hand) asks for the products it keeps by id, through `/search?q=` with its
 * section. Null when the terms are plain words.
 */
export function fieldMatches(products: CardLike[], terms: string): CardLike[] | null {
  const clauses = terms.split(/\s+OR\s+/i).map((c) => c.trim().replace(/^\(|\)$/g, "")).filter(Boolean)
  const parsed = clauses.map((c) => c.match(/^(id|handle|title|product_type|vendor|tag):"?([^"]+?)"?\*?$/i))
  if (!parsed.length || parsed.some((m) => !m)) return null
  const handleOf = (p: CardLike) => String(p.settings.slug ?? "") || handleize(String(p.settings.title ?? ""))
  return products.filter((p) => parsed.some((m) => {
    const [, field, raw] = m as RegExpMatchArray
    const want = raw.trim().toLowerCase()
    switch (field.toLowerCase()) {
      case "id": return p.id.toLowerCase() === want.replace(/^gid:\/\/shopify\/product\//, "")
      case "handle": return handleOf(p) === want
      case "title": return String(p.settings.title ?? "").toLowerCase().includes(want)
      case "product_type": return String(p.settings.category ?? "").toLowerCase() === want
      default: return false
    }
  }))
}

function searchProducts(products: CardLike[], terms: string): CardLike[] {
  const fields = fieldMatches(products, terms)
  if (fields) return fields
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

/** A product as Shopify's /products.json lists it: prices as "40.00", pictures as objects. */
export function productFeedJson(p: O): O {
  const dollars = (c: unknown) => (typeof c === "number" ? (c / 100).toFixed(2) : null)
  const images = ((p.images as O[]) ?? []).map((i, n) => ({ id: i.id, position: n + 1, src: i.src, width: i.width, height: i.height, alt: i.alt ?? null, variant_ids: [] }))
  return {
    id: p.id, title: p.title, handle: p.handle, body_html: p.description, vendor: p.vendor, product_type: p.type, tags: p.tags, published_at: p.published_at,
    variants: ((p.variants as O[]) ?? []).map((v, n) => ({ id: v.id, title: v.title, option1: v.option1, option2: v.option2, option3: v.option3, sku: v.sku, requires_shipping: v.requires_shipping, taxable: true, featured_image: v.featured_image ? { src: (v.featured_image as O).src } : null, available: v.available, price: dollars(v.price), compare_at_price: dollars(v.compare_at_price), position: n + 1, product_id: p.id })),
    images,
    image: images[0] ?? null,
    options: ((p.options_with_values as O[]) ?? []).map((o) => ({ name: o.name, position: o.position, values: ((o.values as O[]) ?? []).map((x) => x.name) })),
  }
}

/*
  A product as Shopify's predictive search (/search/suggest.json) gives it:
  prices as "40.00", `image` an address, `body` the description. A theme's
  own search box script prints these as they come.
*/
export function suggestProductJson(p: O): O {
  const dollars = (c: unknown) => (typeof c === "number" ? (c / 100).toFixed(2) : "0.00")
  const variants = (p.variants as O[]) ?? []
  const compares = variants.map((v) => (typeof v.compare_at_price === "number" ? v.compare_at_price : 0))
  const first = ((p.images as O[]) ?? [])[0]
  return {
    id: p.id, title: p.title, handle: p.handle, url: p.url, body: p.description, vendor: p.vendor, type: p.type, tags: p.tags, available: p.available,
    price: dollars(p.price), price_min: dollars(p.price_min), price_max: dollars(p.price_max),
    compare_at_price_min: dollars(compares.length ? Math.min(...compares) : 0), compare_at_price_max: dollars(compares.length ? Math.max(...compares) : 0),
    image: first?.src ?? null,
    featured_image: first ? { url: first.src, alt: first.alt ?? p.title, aspect_ratio: first.aspect_ratio ?? 1, width: first.width ?? null, height: first.height ?? null } : null,
    variants: variants.map((v) => ({ id: v.id, title: v.title, price: dollars(v.price), compare_at_price: typeof v.compare_at_price === "number" ? dollars(v.compare_at_price) : null, available: v.available, url: v.url, image: (v.featured_image as O | null)?.src ?? null })),
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

/** The name of a product's option that is sold out, or null when it is in stock. */
function variantSoldOut(card: CardLike, variantId: string): string | null {
  const variants = Array.isArray(card.settings.variants) ? (card.settings.variants as O[]) : []
  const v = variants.find((x) => x.id === variantId)
  return v && v.available === false ? String(v.name ?? "This option") : null
}

export function cartLines(site: Pick<SiteData, "products">, entries: CartEntry[]): CartLineLike[] {
  const byId = new Map(site.products.map((p) => [p.id, p]))
  return entries.flatMap((e) => {
    const card = byId.get(e.p)
    if (!card) return []
    return [{ key: e.k, productId: e.p, variantId: e.v, quantity: e.q, product: productObject(card), properties: e.props }]
  })
}

function cartJson(site: SiteData, entries: CartEntry[], note: string, attributes: Record<string, string> = {}): O {
  const cart = cartObject(cartLines(site, entries), site.shop.currency ?? "USD", note, attributes)
  const items = ((cart.items as O[]) ?? []).map(lineJson)
  return {
    token: "storelib",
    note,
    attributes: { ...attributes },
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

/**
 * THE SECTIONS AN ADD OR A CHANGE ASKS TO SEE AGAIN, drawn as they are on
 * the page they are for, with the cart as it is now. Shopify draws them on
 * `sections_url` when the request names one, and otherwise on the page the
 * request came from. That matters: Horizon's cart drawer draws nothing on
 * the cart page (`template.name != 'cart'`), so drawn about /cart it came
 * back empty and the drawer said "Your cart is empty" after every add.
 */
async function sectionsFor(site: SiteData, req: SiteRequest, cart: CartEntry[], note: string, attributes: Record<string, string> = req.attributes ?? {}): Promise<Record<string, string | null> | undefined> {
  const raw = field(req.body, "sections")
  const ids = (Array.isArray(raw) ? raw.map(String).flatMap((x) => x.split(",")) : typeof raw === "string" ? raw.split(",") : []).map((s) => s.trim()).filter(Boolean).filter((x, i, all) => all.indexOf(x) === i).slice(0, 5)
  if (!ids.length) return undefined
  const from = safeReturn(field(req.body, "sections_url")) ?? safeReturn(req.referer) ?? "/cart"
  const [path, search] = [from.split("?")[0] || "/", from.split("?")[1] ?? ""]
  const after: SiteRequest = { ...req, method: "GET", body: null, cart, note, attributes, query: new URLSearchParams(search) }
  const route = await pageFor(site, decodePath(path), after).catch(() => null)
  if (route && route.content === undefined && !route.redirect) {
    const r = sectionsAnswer(site, route.page, route.sections, ids, true)
    return JSON.parse(String(r.body)) as Record<string, string | null>
  }
  const key = path === "/" ? "home" : "cart"
  const sections = sectionsOf(site, key) ?? sectionsOf(site, "home") ?? []
  const page = basePage(site, after, { template: key === "home" ? "index" : "cart", path })
  const r = sectionsAnswer(site, page, sections, ids, true)
  return JSON.parse(String(r.body)) as Record<string, string | null>
}

async function cartAction(site: SiteData, req: SiteRequest, action: string, ajax: boolean): Promise<SiteResponse> {
  const index = variantIndex(site)
  /* Copies: what was asked with is never changed under the caller. */
  let cart = req.cart.map((e) => ({ ...e }))
  let note = req.note ?? ""
  let attributes: Record<string, string> = { ...(req.attributes ?? {}) }
  const error = (message: string, status = 422) => (ajax ? json({ status, message, description: message }, status) : redirect("/cart"))

  if (action === "add") {
    const items = itemsOf(req.body)
    if (!items.length) return error("Choose an option to add.")
    const added: CartEntry[] = []
    /* What was asked for, alone and at the quantity asked: what Buy it now sends to checkout. */
    const asked: CartEntry[] = []
    const buyNow = !ajax && field(req.body, "checkout") !== undefined
    for (const item of items) {
      const hit = index.get(item.id)
      if (!hit) return error("This product is not available.", 404)
      if (hit.card.settings.available === false) return error(`${String(hit.card.settings.title)} is sold out.`)
      const v = hit.variantId === hit.card.id ? null : hit.variantId
      /* An option that is sold out is refused as Shopify refuses it (422), even when the product's other options are in stock: the picker's Sold out is never in the cart. */
      const soldOut = v ? variantSoldOut(hit.card, v) : null
      if (soldOut) return error(`${String(hit.card.settings.title)} - ${soldOut} is sold out.`)
      const k = lineKey(hit.card.id, v, item.properties)
      const existing = cart.find((e) => e.k === k)
      const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(item.quantity)))
      /* More than the stock, or than Limit sales lets one order take, is refused as Shopify refuses it (422), and nothing is added. */
      const room = await roomFor(site, hit.card.id, v, buyNow ? asked : cart)
      if (room !== null && qty > room) {
        const title = String(hit.card.settings.title ?? "this product")
        return error(room <= 0 ? `You can't add more ${title} to the cart.` : `You can only add ${room} more of ${title} to the cart.`)
      }
      asked.push({ k, p: hit.card.id, v, q: qty, ...(item.properties ? { props: item.properties } : {}) })
      if (existing) existing.q = Math.min(MAX_QTY, existing.q + qty)
      else {
        if (cart.length >= MAX_LINES) return error("The cart is full.")
        cart.push({ k, p: hit.card.id, v, q: qty, ...(item.properties ? { props: item.properties } : {}) })
      }
      added.push(cart.find((e) => e.k === k)!)
    }
    /* Buy it now: that item alone goes to checkout, and the cart stays as it was (Shopify's own rule). */
    if (buyNow) return { ...checkoutHandoff(site, asked, false, req.note ?? "", attributes), cart: req.cart, note: req.note ?? "", attributes }
    if (!ajax) return redirect("/cart", { cart, note, attributes })
    const lines = (cartJson(site, cart, note, attributes).items as O[])
    const out = added.map((a) => lines.find((l) => l.key === a.k)).filter(Boolean) as O[]
    const sections = await sectionsFor(site, req, cart, note, attributes)
    const body: O = items.length > 1 || Array.isArray(field(req.body, "items")) ? { items: out } : { ...(out[0] ?? {}) }
    if (sections) body.sections = sections
    return json(body, 200, { cart, note, attributes })
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
    attributes = attributesAfter(attributes, req.body)
    cart = await heldToStock(site, cart)
    if (!ajax && field(req.body, "checkout") !== undefined) return { ...checkoutHandoff(site, cart, true, note, attributes), cart, note, attributes }
  } else if (action === "clear") {
    /* Shopify's /cart/clear empties the lines and keeps the note and attributes. */
    cart = []
  }
  /* A quantity typed over what is left, or over Limit sales, comes down to it, as Shopify's cart does. */
  if (action === "change") cart = await heldToStock(site, cart)
  if (!ajax) return redirect(safeReturn(field(req.body, "return_to")) ?? "/cart", { cart, note, attributes })
  const body = cartJson(site, cart, note, attributes)
  const sections = await sectionsFor(site, req, cart, note, attributes)
  if (sections) body.sections = sections
  return json(body, 200, { cart, note, attributes })
}

/**
 * THE CART'S ATTRIBUTES AFTER A /cart/update, as Shopify keeps them: a form
 * posts `attributes[Gift message]=...`, a script `{ attributes: { ... } }`.
 * A name set to "" (or null) is taken off; any other is set; the rest stay.
 * Plain text, small, at most CART_ATTRIBUTES_MAX names (lib/checkout/
 * site-checkout cartAttributes, which the checkout and the order read too).
 */
export function attributesAfter(before: Record<string, string>, body: O | null): Record<string, string> {
  const asked: Record<string, unknown> = {}
  const obj = field(body, "attributes")
  if (obj && typeof obj === "object" && !Array.isArray(obj)) Object.assign(asked, obj as O)
  for (const [k, v] of Object.entries(body ?? {})) {
    const m = k.match(/^attributes\[([^\]]{1,100})\]$/)
    if (m) asked[m[1]] = v
  }
  if (!Object.keys(asked).length) return before
  const next: Record<string, unknown> = { ...before }
  for (const [k, v] of Object.entries(asked)) {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) delete next[k]
    else next[k] = v
  }
  return cartAttributes(next, CART_ATTRIBUTES_MAX) ?? {}
}

/**
 * CHECKOUT IS ON THIS SITE. The lines go straight on to the website's own
 * checkout at this same address (/checkout, app/checkout/site): the shop's
 * logo across the top, Back to this site's cart, Storelib's own card form.
 * One redirect, answered here without reading anything, so the press lands
 * on the checkout with nothing in between. It used to go to storelib.com,
 * where the buyer was a stranger and the address was the platform's. The
 * checkout prices every line again from the database and takes the shop
 * from this host; the theme never sees a price it could set. `whole`: the
 * whole cart (emptied once paid), not a Buy it now of one item.
 */
function checkoutHandoff(_site: SiteData, cart: CartEntry[], whole: boolean, note = "", attributes?: Record<string, string>): SiteResponse {
  /* Each line's properties (an engraving, a gift message on the line) go with it, and the order keeps them. */
  const items = cart.map((e) => ({ productId: e.p, variantId: e.v, quantity: e.q, ...(e.props && Object.keys(e.props).length ? { properties: e.props } : {}) }))
  if (!items.length) return redirect("/cart")
  /* The cart's note goes on with the lines: the checkout's "Add a note for the shop" opens with it, and the order keeps it. So do its attributes. */
  return redirect(siteCheckoutHref({ items, back: "/cart", wholeCart: whole, note, attributes }))
}

/**
 * How many more of an option the cart may take: what is left of it, less
 * what the cart already holds of it, and Limit sales less what the cart
 * holds of the product in all. Null when the shop says nothing (a download,
 * stock not counted, no limit).
 */
async function roomFor(site: SiteData, productId: string, variantId: string | null, cart: CartEntry[]): Promise<number | null> {
  const s = site.stock ? await site.stock(productId).catch(() => null) : null
  if (!s) return null
  const most = s.variants[variantId ?? productId]
  const ofOption = cart.filter((e) => e.p === productId && e.v === variantId).reduce((n, e) => n + e.q, 0)
  const ofProduct = cart.filter((e) => e.p === productId).reduce((n, e) => n + e.q, 0)
  const limits = [typeof most === "number" ? most - ofOption : null, s.perOrder !== null ? s.perOrder - ofProduct : null].filter((n): n is number => n !== null)
  return limits.length ? Math.max(0, Math.min(...limits)) : null
}

/** The cart with each line brought down to what is left of it and to Limit sales, lines that come to nothing removed. */
async function heldToStock(site: SiteData, cart: CartEntry[]): Promise<CartEntry[]> {
  if (!site.stock || cart.length === 0) return cart
  const ids = [...new Set(cart.map((e) => e.p))]
  const stock = new Map(await Promise.all(ids.map(async (id) => [id, await site.stock!(id).catch(() => null)] as const)))
  const out: CartEntry[] = []
  for (const e of cart) {
    const s = stock.get(e.p)
    if (!s) {
      out.push(e)
      continue
    }
    const most = s.variants[e.v ?? e.p]
    const before = out.filter((x) => x.p === e.p)
    const ofOption = before.filter((x) => x.v === e.v).reduce((n, x) => n + x.q, 0)
    const ofProduct = before.reduce((n, x) => n + x.q, 0)
    let q = e.q
    if (typeof most === "number") q = Math.min(q, Math.max(0, most - ofOption))
    if (s.perOrder !== null) q = Math.min(q, Math.max(0, s.perOrder - ofProduct))
    if (q > 0) out.push(q === e.q ? e : { ...e, q })
  }
  return out
}

/**
 * A CONTACT FORM OR A NEWSLETTER SIGN UP, sent to the creator's inbox and
 * Subscribers through Storelib's own endpoints (`req.submit`, which carry
 * the spam checks and the rate limits), then straight back, as Shopify does:
 *
 *   a script's post   (the page's own forms, caught by the site runtime in
 *                     ./shims.ts) JSON: `{ ok }`, or `{ ok: false, code }`.
 *                     The page then draws the form's section again with the
 *                     theme's own thank you or error.
 *   a plain post      (no script) a redirect to the page it came from with
 *                     `customer_posted=true` or `contact_posted=true`, so
 *                     the theme draws its own thank you; or with
 *                     `form_error=<code>`, so it draws its own error.
 *
 * Never a page of its own: the white "Sending" page this used to answer with was
 * a blank white page in the middle of the visitor's shop.
 */
async function formSubmit(site: SiteData, req: SiteRequest): Promise<SiteResponse> {
  const b = req.body ?? {}
  const type = String(b.form_type ?? "contact") === "customer" ? "customer" : "contact"
  const back = safeReturn(b.return_to) ?? safeReturn(req.referer) ?? "/"
  const flat = (k: string) => {
    const v = b[k] ?? b[`contact[${k}]`] ?? b[`customer[${k}]`]
    return typeof v === "string" ? v.slice(0, 5000) : ""
  }
  const email = flat("email")
  const subscribe = type === "customer"
  const payload = subscribe
    ? { creator_id: site.creatorId, email, placement: "footer" }
    : { creator_id: site.creatorId, name: flat("name") || [flat("first_name"), flat("last_name")].filter(Boolean).join(" "), email, message: flat("body") || flat("message") || flat("comment"), consent: false, company: "", elapsed: 15000, page: "contact" }
  const result = req.submit ? await req.submit(subscribe ? "subscribe" : "contact", payload).catch(() => ({ ok: false, status: 503 })) : { ok: false, status: 503 }
  const code = result.ok ? null : result.status === 400 ? (subscribe || !/@/.test(email) ? "email" : "check") : result.status === 429 ? "limit" : "failed"
  if (req.ajax) return json(result.ok ? { ok: true, form_type: type } : { ok: false, form_type: type, code, message: FORM_ERRORS[code ?? "failed"] }, result.ok ? 200 : result.status >= 400 ? result.status : 500)
  /*
    Back at the form that was sent. The form posts to /contact#<its id>
    (theme.ts formMarkup), and a redirect with no # of its own keeps the
    one the browser posted to, as Shopify's does, so the page opens at that
    form and its thank you. A post from elsewhere (no #) opens at the top.
  */
  const [path, hash] = [back.split("#")[0], ""]
  const q = new URLSearchParams(path.split("?")[1] ?? "")
  for (const k of ["customer_posted", "contact_posted", "form_error", "form_type"]) q.delete(k)
  if (result.ok) q.set(`${type}_posted`, "true")
  else {
    q.set("form_error", code ?? "failed")
    q.set("form_type", type)
  }
  return redirect(`${path.split("?")[0] || "/"}?${q.toString()}${hash}`)
}

// ── Cookies ─────────────────────────────────────────────────────────────────

export const CART_COOKIE = "sl_theme_cart"

/** The cart from its cookie. Anything that does not read as one is an empty cart. */
export function readCartCookie(raw: string | undefined): { cart: CartEntry[]; note: string; attributes: Record<string, string> } {
  if (!raw) return { cart: [], note: "", attributes: {} }
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as { l?: unknown; n?: unknown; a?: unknown }
    const lines = Array.isArray(v.l) ? v.l : []
    const cart = lines
      .filter((e): e is O => !!e && typeof e === "object")
      .map((e) => ({ k: String(e.k ?? ""), p: String(e.p ?? ""), v: typeof e.v === "string" ? e.v : null, q: Math.max(1, Math.min(MAX_QTY, Math.floor(Number(e.q) || 1))), ...(e.props && typeof e.props === "object" ? { props: e.props as Record<string, string> } : {}) }))
      .filter((e) => e.k && e.p)
      .slice(0, MAX_LINES)
    return { cart, note: typeof v.n === "string" ? v.n.slice(0, 500) : "", attributes: cartAttributes(v.a) ?? {} }
  } catch {
    return { cart: [], note: "", attributes: {} }
  }
}

/* A browser drops a cookie over 4 KB whole, cart and all: attributes are left out, last first, before that can happen. */
const COOKIE_ROOM = 3800

export function writeCartCookie(cart: CartEntry[], note: string, attributes?: Record<string, string>): string {
  const pairs = Object.entries(attributes ?? {})
  for (let n = pairs.length; n >= 0; n--) {
    const a = n > 0 ? Object.fromEntries(pairs.slice(0, n)) : undefined
    const out = encodeURIComponent(JSON.stringify({ l: cart, n: note || undefined, a }))
    if (out.length <= COOKIE_ROOM || n === 0) return out
  }
  return encodeURIComponent(JSON.stringify({ l: cart, n: note || undefined }))
}

// ── Assets ──────────────────────────────────────────────────────────────────

/**
 * One of the theme's files from assets/: as it is, as bytes for a font, or
 * drawn first when it is a `.liquid` asset (`theme.css.liquid` is served as
 * `theme.css`, with the theme's settings in it).
 */
export function themeAsset(theme: CompatTheme, name: string, settingsCtx: () => import("./runtime").Ctx, opts: { scss?: (source: string) => string } = {}): { type: string; body: string | Uint8Array } | null {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.@-]*$/.test(name)) return null
  const type = assetType(name)
  if (!type) return null
  /* `theme.scss.css`: an older theme's `theme.scss.liquid` (or `.scss`), its Liquid filled in and its SCSS compiled, as Shopify served it (./scss.ts). */
  const scssName = name.match(/^(.+\.scss)\.css$/)?.[1]
  if (scssName && opts.scss) {
    const source = theme.files[`assets/${scssName}.liquid`] ?? theme.files[`assets/${scssName}`]
    if (source !== undefined) {
      let filled: string
      try { filled = renderString(source, settingsCtx()) } catch { filled = source.replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g, "") }
      return { type: "text/css; charset=utf-8", body: opts.scss(filled) }
    }
  }
  /* A stylesheet, with a button's label never painting a box of its own (./css-fixes.ts). */
  const css = (body: string) => (/^text\/css/.test(type) ? fixThemeCss(body) : body)
  const text = theme.files[`assets/${name}`]
  if (text !== undefined) {
    const bytes = binaryOf(text)
    return { type, body: bytes ?? css(text) }
  }
  const liquid = theme.files[`assets/${name}.liquid`]
  if (liquid !== undefined) {
    try {
      return { type, body: css(renderString(liquid, settingsCtx(), { lax: true })) }
    } catch {
      return { type, body: css(liquid.replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g, "")) }
    }
  }
  return null
}

export { OUTPUT }
