/**
 * ===========================================================================
 *  WHAT A STANDARD FOOTER HOLDS, AS RULES A TEST CAN RUN
 * ===========================================================================
 * The footer is drawn by sections/renderers/FooterSection.tsx. The decisions
 * behind its standard parts live here instead, pure, so each one is a
 * function a test can call:
 *
 *   menu, menu_2            link columns from Theme settings › Menus
 *   show_default_links      Shop and Help columns when the footer has none
 *   show_policies           the shop's policy pages, in a row of their own
 *   show_payment_icons      the cards and wallets checkout takes
 *   copyright               {{ date.year }} and {{ shop.name }}, kept current
 *
 * Every site gets one footer (lib/website-builder/universal-chrome.ts), so
 * whatever is decided here is decided for every page of every site.
 */
import { POLICY_PAGES } from "./policy-pages"
import { SHOP_PATH } from "./live-links"
import type { Menu } from "@/lib/storelib-theme/values"

export interface FooterLink {
  id: string
  label: string
  url: string
}

export interface FooterColumn {
  id: string
  heading: string
  links: FooterLink[]
}

const norm = (url: string) => url.trim().toLowerCase().replace(/\/+$/, "") || "/"

/**
 * One menu from Theme settings › Menus as a footer column. Null when the
 * footer names no menu, or one that does not exist or is empty. A footer
 * column is one level deep, so a menu's second level is listed after its
 * parent rather than hidden.
 */
export function footerMenuColumn(
  handle: string,
  heading: string,
  menus: Record<string, Menu>,
): FooterColumn | null {
  const menu = handle ? menus[handle] : undefined
  if (!menu || menu.links.length === 0) return null
  const links: FooterLink[] = []
  menu.links.forEach((link, i) => {
    links.push({ id: `fmenu-${handle}-${i}`, label: link.title, url: link.url })
    ;(link.links ?? []).forEach((child, j) => {
      links.push({ id: `fmenu-${handle}-${i}-${j}`, label: child.title, url: child.url })
    })
  })
  return { id: `fmenu-${handle}`, heading: heading.trim() || menu.title, links }
}

/**
 * The links every site can keep: the shop, search, the contact page and the
 * visitor's account all answer on every published site, so none of these is
 * a promise the site cannot keep.
 */
export const DEFAULT_FOOTER_COLUMNS: FooterColumn[] = [
  {
    id: "fdef-shop",
    heading: "Shop",
    links: [
      { id: "fdef-all", label: "All products", url: SHOP_PATH },
      { id: "fdef-search", label: "Search", url: "/search" },
    ],
  },
  {
    id: "fdef-help",
    heading: "Help",
    links: [
      { id: "fdef-contact", label: "Contact us", url: "/contact" },
      { id: "fdef-account", label: "My account", url: "/account" },
    ],
  },
]

/** Is this column only the policy links the site added by itself? */
function isPolicyColumn(column: FooterColumn): boolean {
  const policy = new Set(POLICY_PAGES.map((p) => `/${p.key}`))
  return column.links.length > 0 && column.links.every((l) => policy.has(norm(l.url)))
}

/**
 * Whether the standard Shop and Help columns belong in this footer: the
 * toggle is on, no menu is picked, and the footer's own columns are at most
 * the Legal column every site is given. A creator who built columns of their
 * own has said what the footer links to.
 */
export function wantsDefaultColumns(
  on: boolean,
  menuColumns: FooterColumn[],
  blockColumns: FooterColumn[],
  looseLinks: FooterLink[],
): boolean {
  if (!on || menuColumns.length > 0 || looseLinks.length > 0) return false
  return blockColumns.every(isPolicyColumn)
}

/** Shipping has no page of its own until a creator writes one, under either name. */
const SHIPPING_KEYS = ["shipping-policy", "shipping"]

/**
 * The policies row: refund, privacy, terms, shipping and contact.
 *
 * `pageKeys` is the site's page list when the surface knows it. Without it
 * the row lists what every site has: the three policies are created for
 * every site (ensure-policy-pages.ts) and the contact page is generated when
 * a creator has not made one. Shipping is listed only when a page for it is
 * known to exist.
 *
 * A link the footer already shows in a column is not repeated here, so a
 * site with a Legal column does not list its policies twice.
 */
export function footerPolicyLinks(opts: {
  pageKeys?: readonly string[] | null
  alreadyLinked?: Iterable<string>
  includeContact?: boolean
}): FooterLink[] {
  const keys = opts.pageKeys ? new Set(opts.pageKeys) : null
  const taken = new Set([...(opts.alreadyLinked ?? [])].map(norm))
  const out: FooterLink[] = []
  const add = (key: string, label: string) => {
    const url = `/${key}`
    if (!taken.has(norm(url))) out.push({ id: `fpol-${key}`, label, url })
  }
  const [refund, privacy, terms] = ["refund-policy", "privacy-policy", "terms-of-service"].map((k) =>
    POLICY_PAGES.find((p) => p.key === k),
  )
  if (refund && (!keys || keys.has(refund.key))) add(refund.key, "Refund policy")
  if (privacy && (!keys || keys.has(privacy.key))) add(privacy.key, "Privacy policy")
  if (terms && (!keys || keys.has(terms.key))) add(terms.key, "Terms of service")
  const shipping = keys ? SHIPPING_KEYS.find((k) => keys.has(k)) : undefined
  if (shipping) add(shipping, "Shipping policy")
  if (opts.includeContact !== false) add("contact", "Contact")
  return out
}

/** What the payment row shows, in order. */
export const PAYMENT_METHODS = [
  { id: "visa", label: "Visa" },
  { id: "mastercard", label: "Mastercard" },
  { id: "amex", label: "American Express" },
  { id: "apple_pay", label: "Apple Pay" },
  { id: "google_pay", label: "Google Pay" },
] as const

/**
 * `{{ date.year }}` and `{{ shop.name }}` in the footer's words.
 *
 * The published site fills every dynamic source before a section is drawn
 * (storefront-data.ts), so on the live site these are already gone. The
 * builder's canvas draws the stored words, and a copyright line reading
 * "{{ date.year }}" there looks broken when it is not. So the two the footer
 * is known for are filled here as well, and nothing else is touched.
 */
export function fillFooterTokens(text: string, ctx: { year: number; shopName: string }): string {
  const filled = text.includes("{{")
    ? text.replace(/\{\{\s*date\.year\s*\}\}/g, String(ctx.year)).replace(/\{\{\s*shop\.name\s*\}\}/g, ctx.shopName)
    : text
  /* A source that came back empty (a shop with no name yet, here or on the server) leaves "2026 . All": close the gap. */
  return filled.replace(/[ \t]+([.,;:])/g, "$1").replace(/[ \t]{2,}/g, " ")
}

/** The footer's layouts. Anything unknown is the one every footer had. */
export type FooterLayout = "columns" | "centered"

export function footerLayout(value: unknown): FooterLayout {
  return value === "centered" ? "centered" : "columns"
}
