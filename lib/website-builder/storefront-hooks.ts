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
  }
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
