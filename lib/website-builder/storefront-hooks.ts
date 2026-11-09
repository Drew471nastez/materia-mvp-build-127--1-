/**
 * ===========================================================================
 *  WHAT A HEADER OF THE CREATOR'S OWN CAN ASK THE PAGE FOR
 * ===========================================================================
 * A section written as a .storelib file draws markup, and its script runs in
 * a sandbox that cannot reach the visitor's cart or open anything over the
 * page. The built-in header can, so a header written to replace it had a bag
 * that opened nothing and a menu button that did nothing.
 *
 * These attributes are how it asks. The page handles them, the same way it
 * already fills in the hearts marked `data-storelib-wishlist`:
 *
 *   data-storelib-cart          on a button or link: opens the cart drawer
 *   data-storelib-cart-count    the cart's count is written in, and `data-count`
 *   data-storelib-search        opens the search window (the value, if any,
 *                               is its placeholder)
 *   data-storelib-menu          opens the menu drawer with the menu named by
 *                               its value, `main-menu` when empty
 *   data-storelib-menu-from     left, right or top: where that drawer comes from
 *
 * Each still works with no script: a link to `routes.cart_url` or
 * `routes.search_url` goes to the page. Pure, so the rules have a test.
 *
 * A CART OF THE SECTION'S OWN (round 22, the owner: "it should not be tied to
 * native drawers, native menus, cart, search: I might want to build my own").
 * The cart is still the site's one cart, priced again on the server at
 * checkout; what a section draws of it is its own:
 *
 *   data-storelib-add-to-cart   on a button: adds the product whose id is its
 *                               value, with data-variant-id, data-title,
 *                               data-price (as printed), data-image, data-url,
 *                               data-kind and data-quantity read off it
 *   data-storelib-cart-panel    an element of the section that IS its cart
 *                               drawer: the section's cart buttons open it
 *                               (data-open, aria-hidden) instead of the
 *                               built-in drawer, and so does an add
 *   data-storelib-cart-lines    inside it, where the lines go, holding one
 *                               element marked data-storelib-cart-line (kept
 *                               hidden; not a <template>, which is the file's
 *                               own delimiter) copied once per line:
 *                               data-line-title, -variant, -price,
 *                               -qty, -image (an img), -url (a link), and the
 *                               buttons data-line-inc, -dec and -remove
 *   data-storelib-cart-subtotal the subtotal, as text
 *   data-storelib-cart-empty    shown when the cart is empty, hidden when not
 *   data-storelib-cart-filled   the other way round
 *   data-storelib-checkout      a button: straight to checkout, as the
 *                               built-in drawer's Check out does
 *   data-storelib-cart-close    a button: closes the panel
 *
 * Every value written into the markup is text or a checked address, never
 * HTML. A price on a button is for the line's display only: the order is
 * priced from the database (lib/website-builder/cart.ts).
 *
 * A SEARCH, LANGUAGES AND CURRENCIES OF THE SECTION'S OWN (round N, the
 * owner: "fully free, not limited by the theme: cart drawer, footer, currency
 * and language selectors, search modals"). Same safety model as the cart:
 *
 *   data-storelib-search-panel     an element of the section that IS its
 *                                  search window. Every data-storelib-search
 *                                  button on the page opens it (data-open,
 *                                  aria-hidden, inert) instead of the
 *                                  built-in window. Focus moves to its input,
 *                                  stays inside while it is open, and goes
 *                                  back to the button that opened it; Escape
 *                                  and data-storelib-search-close shut it.
 *   data-storelib-search-input     inside it, the input. Results come as the
 *                                  visitor types (this creator's products,
 *                                  pages and blog posts, nobody else's:
 *                                  /api/website-builder/search). Enter opens
 *                                  the search page for the words.
 *   data-storelib-search-results   where results go, holding ONE hidden
 *                                  element marked data-storelib-search-result
 *                                  copied per result: data-result-title,
 *                                  -price, -kind (text), img data-result-image,
 *                                  a data-result-url
 *   data-storelib-search-empty     shown when the words found nothing
 *   data-storelib-search-loading   shown while results are on their way
 *   data-storelib-search-close     a button: shuts the panel
 *
 *   data-storelib-locale-list      the site's languages, holding ONE hidden
 *                                  element marked data-storelib-locale-option
 *                                  copied per language: data-option-label
 *                                  (its own name, "Français"),
 *                                  data-option-code ("fr"); the page's own
 *                                  carries aria-current="true". A press opens
 *                                  the same page in that language. The list
 *                                  is `hidden` on a site with one language.
 *   data-storelib-locale-current   the page's language, as text
 *   data-storelib-currency-list    the same for the currencies prices can be
 *   data-storelib-currency-option  shown in (Settings › Markets): a press
 *   data-storelib-currency-current keeps the visitor's market, as the
 *                                  built-in switch does. Hidden with one.
 *
 * A FREE SITE (lib/website-builder/free-site.ts) gets none of the built-in
 * windows, bars or switches unless its code asks with one of these. A plain
 * data-storelib-search with no panel anywhere on the page still opens the
 * built-in window, and a plain data-storelib-cart with no panel the built-in
 * drawer, so no button is ever dead.
 */
import type { Menu } from "@/lib/storelib-theme/values"

export const STOREFRONT_HOOKS = {
  cart: "data-storelib-cart",
  cartCount: "data-storelib-cart-count",
  search: "data-storelib-search",
  menu: "data-storelib-menu",
  menuFrom: "data-storelib-menu-from",
  addToCart: "data-storelib-add-to-cart",
  cartPanel: "data-storelib-cart-panel",
  cartLines: "data-storelib-cart-lines",
  cartLine: "data-storelib-cart-line",
  cartSubtotal: "data-storelib-cart-subtotal",
  cartEmpty: "data-storelib-cart-empty",
  cartFilled: "data-storelib-cart-filled",
  checkout: "data-storelib-checkout",
  cartClose: "data-storelib-cart-close",
  searchPanel: "data-storelib-search-panel",
  searchInput: "data-storelib-search-input",
  searchResults: "data-storelib-search-results",
  searchResult: "data-storelib-search-result",
  searchEmpty: "data-storelib-search-empty",
  searchLoading: "data-storelib-search-loading",
  searchClose: "data-storelib-search-close",
  localeList: "data-storelib-locale-list",
  localeOption: "data-storelib-locale-option",
  localeCurrent: "data-storelib-locale-current",
  currencyList: "data-storelib-currency-list",
  currencyOption: "data-storelib-currency-option",
  currencyCurrent: "data-storelib-currency-current",
} as const

/** An attribute named exactly, not as the start of a longer one: `data-storelib-cart` is not `data-storelib-cart-count`. */
const has = (html: string, name: string) => new RegExp(`\\s${name}(?=[\\s=>/])`).test(html)

export interface HooksIn {
  cart: boolean
  cartCount: boolean
  search: boolean
  menu: boolean
  /** A button that adds a product to the cart. */
  addToCart: boolean
  /** A cart drawer of the section's own. */
  cartPanel: boolean
  /** A search window of the section's own. */
  searchPanel: boolean
  /** A language list of the section's own, or a place for the current language. */
  locale: boolean
  /** A currency list of the section's own, or a place for the current currency. */
  currency: boolean
}

/** Which of the page's drawers a section's markup asks for, so it only mounts what it uses. */
export function hooksIn(html: string): HooksIn {
  return {
    cart: has(html, STOREFRONT_HOOKS.cart),
    cartCount: has(html, STOREFRONT_HOOKS.cartCount),
    search: has(html, STOREFRONT_HOOKS.search),
    menu: has(html, STOREFRONT_HOOKS.menu),
    addToCart: has(html, STOREFRONT_HOOKS.addToCart),
    cartPanel: has(html, STOREFRONT_HOOKS.cartPanel),
    searchPanel: has(html, STOREFRONT_HOOKS.searchPanel),
    locale: has(html, STOREFRONT_HOOKS.localeList) || has(html, STOREFRONT_HOOKS.localeCurrent),
    currency: has(html, STOREFRONT_HOOKS.currencyList) || has(html, STOREFRONT_HOOKS.currencyCurrent),
  }
}

/* ── search, languages and currencies of the section's own (round N) ─────── */

/** What a result is: the kinds the site search answers. */
export type SearchKind = "product" | "page" | "post"

/** One result as the site search answers it (/api/website-builder/search). */
export interface SearchResultHit {
  kind: SearchKind
  title: string
  /** As printed, in the store's currency; "" for a page or a post. */
  price: string
  image: string
  url: string
}

/** The words a visitor typed, as they are asked for: trimmed, one space, at most 80 characters. */
export function searchTerm(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
}

/** The search page for some words, on this site. */
export function searchPageHref(term: string): string {
  const q = searchTerm(term)
  return q ? `/search?q=${encodeURIComponent(q)}` : "/search"
}

const KINDS: readonly SearchKind[] = ["product", "page", "post"]

/**
 * A result from the network made safe to write into a section: every value a
 * string, the kind one of three, the picture and the link checked addresses
 * (safeHref) and the words cut to a length. Null for anything with no title
 * or nowhere to go: a result that cannot be opened is not shown.
 */
export function cleanSearchHit(raw: unknown): SearchResultHit | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
  const title = text(r.title, 200)
  const url = safeHref(typeof r.url === "string" ? r.url : "")
  if (!title || !url) return null
  const kind = KINDS.includes(r.kind as SearchKind) ? (r.kind as SearchKind) : "product"
  return { kind, title, price: kind === "product" ? text(r.price, 40) : "", image: safeHref(typeof r.image === "string" ? r.image : ""), url }
}

/** One choice of a language or currency list. */
export interface HookOption {
  /** What is written into data-option-code: a language code ("fr") or a currency choice's id. */
  code: string
  /** What is written into data-option-label: the language in its own words, or the currency's label. */
  label: string
  current: boolean
}

/** The shape of SiteLanguageChoice (components/website-builder/theme/language-switch.tsx) these helpers read. */
export interface HookLanguageChoice {
  code: string
  languages: { code: string; name: string }[]
  currency?: { options: { id: string; label: string }[]; current: string }
}

/** The languages a locale list draws, the page's own marked current. Empty on a site with one language or none set. */
export function localeOptions(choice: HookLanguageChoice | null | undefined): HookOption[] {
  const langs = choice?.languages ?? []
  if (langs.length < 2) return []
  return langs.map((l) => ({ code: l.code, label: l.name || l.code, current: l.code.toLowerCase() === choice!.code.toLowerCase() }))
}

/** The currencies a currency list draws, the one shown now marked current. Empty with fewer than two. */
export function currencyOptions(choice: HookLanguageChoice | null | undefined): HookOption[] {
  const c = choice?.currency
  if (!c || c.options.length < 2) return []
  return c.options.map((o) => ({ code: o.id, label: o.label || o.id, current: o.id === c.current }))
}

/** What data-storelib-locale-current and -currency-current read: the current option's label, else "". */
export function currentLabel(options: readonly HookOption[], fallback = ""): string {
  return options.find((o) => o.current)?.label ?? fallback
}

/** "$48.00", "48", "€1,234.50" as cents, for a line's display. 0 when it says no number. */
export function priceCentsFrom(text: string | null | undefined): number {
  const digits = String(text ?? "").replace(/[^0-9.,]/g, "")
  if (!digits) return 0
  /* "1,234.50" and "1.234,50": the last separator followed by one or two digits is the decimal point. */
  const m = /^(.*?)[.,](\d{1,2})$/.exec(digits)
  const whole = (m ? m[1] : digits).replace(/[.,]/g, "")
  const cents = m ? Number(m[2].padEnd(2, "0")) : 0
  const n = Number(whole || "0") * 100 + cents
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/** An address a section may put on a line's picture or link: the site's own, or http(s). Anything else is "". */
export function safeHref(value: string | null | undefined): string {
  const v = String(value ?? "").trim()
  if (!v) return ""
  if (/^\/(?![/\\])/.test(v)) return v
  return /^https?:\/\//i.test(v) ? v : ""
}

/** A product's id as a section prints it: a uuid or a short handle, nothing that could be markup. */
const PRODUCT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i

export interface AddToCartLine {
  productId: string
  variantId: string | null
  title: string
  variantName: string | null
  priceCents: number
  thumbnailUrl: string | null
  slug: string
  digital: boolean
  physical: boolean
  quantity: number
}

/**
 * The line a data-storelib-add-to-cart button asks for, read off its own
 * attributes, or null when it names no product. Kinds that ship are physical;
 * the rest are digital and stay at one, as the cart keeps them.
 */
export function addToCartLine(attr: (name: string) => string | null): AddToCartLine | null {
  const productId = (attr(STOREFRONT_HOOKS.addToCart) ?? "").trim()
  if (!PRODUCT_ID.test(productId)) return null
  const variant = (attr("data-variant-id") ?? "").trim()
  const kind = (attr("data-kind") ?? "").trim().toLowerCase()
  const physical = kind === "physical" || kind === "shipped"
  const url = safeHref(attr("data-url"))
  const slug = url.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/products\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "")
  const qty = Math.floor(Number(attr("data-quantity") ?? "1"))
  return {
    productId,
    variantId: PRODUCT_ID.test(variant) ? variant : null,
    title: (attr("data-title") ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || "Product",
    variantName: (attr("data-variant-name") ?? "").trim().slice(0, 120) || null,
    priceCents: priceCentsFrom(attr("data-price")),
    thumbnailUrl: safeHref(attr("data-image")) || null,
    slug,
    digital: !physical,
    physical,
    quantity: physical && Number.isFinite(qty) && qty > 0 ? Math.min(qty, 99) : 1,
  }
}

export type HookEdge = "left" | "right" | "top"

/** `data-storelib-menu-from`. Anything else is the left, where a menu has always come from. */
export function hookEdge(value: unknown): HookEdge {
  return value === "right" || value === "top" ? value : "left"
}

/** What the count reads: nothing until the cart is known, then the number, capped the way the header's badge caps it. */
export function cartCountText(count: number, ready: boolean): string {
  if (!ready) return ""
  return count > 99 ? "99+" : String(Math.max(0, Math.floor(count)))
}

export interface HookNavItem {
  id: string
  label: string
  href: string
  openInNew: boolean
  children?: HookNavItem[]
}

/** A menu's links as the menu drawer draws them: two levels, as the header's own drawer does. */
export function menuDrawerItems(menu: Menu | undefined, handle: string): HookNavItem[] {
  if (!menu) return []
  return menu.links.map((link, i) => {
    const id = `${handle}-${i}`
    const kids = (link.links ?? []).map((c, j) => ({ id: `${id}-${j}`, label: c.title, href: c.url || "#", openInNew: false }))
    return { id, label: link.title, href: link.url || "#", openInNew: false, children: kids.length ? kids : undefined }
  })
}

/** The menu a trigger names: its value, or the main menu when it names none. */
export function menuHandleOf(value: string | null | undefined): string {
  const v = (value ?? "").trim()
  return v || "main-menu"
}
