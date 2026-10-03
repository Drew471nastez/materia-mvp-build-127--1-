/**
 * ===========================================================================
 *  WHERE A PAGE IS: HOME > SHOP > PRODUCT
 * ===========================================================================
 * One trail for every page of a creator's website, worked out from what the
 * page already knows: its template, its title and, on a product page, the
 * product. The Breadcrumbs section (themes/default/sections/
 * breadcrumbs.storelib) reads it as `page.breadcrumbs`, and the product
 * section's Breadcrumbs block builds the same trail from the product it is
 * drawing, so the two never disagree.
 *
 *   home                 nothing: a trail of one is not a trail
 *   product              Home > Shop > Product name
 *   the shop             Home > Shop
 *   search               Home > Search
 *   cart, wishlist       Home > Cart, Home > Wishlist
 *   account              Home > Account
 *   any other page       Home > Its title
 *
 * The last item has no address: it is the page being read, and a link to
 * where you already are is a link that does nothing.
 */

export interface Crumb {
  label: string
  /** "" for the page being read. */
  url: string
}

export interface TrailInput {
  /** "index", "product", "page.products", "page.search", "page.cart", "page", ... */
  template: string
  /** The page's own title, for a page of the creator's own. */
  title?: string | null
  /** The page's own address, for a page of the creator's own. */
  path?: string | null
  /** On a product page, the product's name. */
  product?: { title?: string | null } | null
  /** What the first and second steps are called. */
  homeLabel?: string
  shopLabel?: string
}

const NAMED: Record<string, string> = {
  "page.search": "Search",
  "page.cart": "Cart",
  "page.wishlist": "Wishlist",
  "page.account": "Account",
  "page.login": "Sign in",
  "page.contact": "Contact",
  "page.not_found": "Page not found",
  "404": "Page not found",
}

function clean(value: unknown, max = 80): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

export function breadcrumbTrail(input: TrailInput): Crumb[] {
  const home: Crumb = { label: clean(input.homeLabel) || "Home", url: "/" }
  const shopLabel = clean(input.shopLabel) || "Shop"
  const t = input.template || "index"
  if (t === "index" || t === "home") return []
  if (t === "product") {
    const name = clean(input.product?.title) || clean(input.title) || "Product"
    return [home, { label: shopLabel, url: "/products" }, { label: name, url: "" }]
  }
  if (t === "page.products" || t === "collection") return [home, { label: shopLabel, url: "" }]
  if (NAMED[t]) return [home, { label: NAMED[t], url: "" }]
  const title = clean(input.title)
  return title ? [home, { label: title, url: "" }] : []
}
