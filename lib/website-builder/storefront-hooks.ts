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
 */
import type { Menu } from "@/lib/storelib-theme/values"

export const STOREFRONT_HOOKS = {
  cart: "data-storelib-cart",
  cartCount: "data-storelib-cart-count",
  search: "data-storelib-search",
  menu: "data-storelib-menu",
  menuFrom: "data-storelib-menu-from",
} as const

/** An attribute named exactly, not as the start of a longer one: `data-storelib-cart` is not `data-storelib-cart-count`. */
const has = (html: string, name: string) => new RegExp(`\\s${name}(?=[\\s=>/])`).test(html)

export interface HooksIn {
  cart: boolean
  cartCount: boolean
  search: boolean
  menu: boolean
}

/** Which of the page's drawers a section's markup asks for, so it only mounts what it uses. */
export function hooksIn(html: string): HooksIn {
  return {
    cart: has(html, STOREFRONT_HOOKS.cart),
    cartCount: has(html, STOREFRONT_HOOKS.cartCount),
    search: has(html, STOREFRONT_HOOKS.search),
    menu: has(html, STOREFRONT_HOOKS.menu),
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
