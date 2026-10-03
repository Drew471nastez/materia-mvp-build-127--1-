/**
 * ===========================================================================
 *  A SITE'S PAGES, IN THE GROUPS A SHOP IS MADE OF
 * ===========================================================================
 * "In the Pages modal, make sure the pages are organized into categories.
 * There are too many pages and they are not organized into categories, like
 * Shopify has done it."
 *
 * Every website here has a home page, the shop and its search results, the
 * product page, an about page, a visitor's account with its sign in page and
 * wishlist, a contact page, three policies and the page a visitor gets at an
 * address the site does not have, and then every page its creator made. As
 * one list that is a list read to the end to find anything. So it is grouped
 * the way a shop is, and the way Shopify's own page menu is, under a heading
 * each:
 *
 *   Home               /
 *   Shop               /products, /search
 *   Products           the product page, as each of the store's products
 *   Pages              /about and the creator's own pages
 *   Customer accounts  /account, /account/login, /wishlist
 *   Contact            /contact
 *   Policies           /refund-policy, /privacy-policy, /terms-of-service
 *   Other              the 404 page
 *
 * These are the pages the code has: BUILT_IN_PAGE_KEYS and
 * NOT_FOUND_PAGE_KEY in site-pages.ts, the account pages in
 * account-pages.ts (ACCOUNT_PAGE_PATHS, contact aside), POLICY_PAGES in
 * policy-pages.ts. A key nobody here knows is a page somebody made, and goes
 * under Pages.
 *
 * Pure, so the grouping is tested by running it (tests/library-and-pages.test.ts).
 */
import { ACCOUNT_PAGE_PATHS } from "./account-pages"
import { POLICY_PAGE_KEYS, SHIPPING_POLICY } from "./policy-pages"
import { NOT_FOUND_PAGE_KEY } from "./site-pages"

export type PageGroupKey = "home" | "shop" | "products" | "pages" | "accounts" | "contact" | "policies" | "other"

export const PAGE_GROUP_ORDER: readonly PageGroupKey[] = ["home", "shop", "products", "pages", "accounts", "contact", "policies", "other"]

/** The visitor's own pages, in the order account-pages.ts lists them. Contact is every visitor's, and has a group of its own. */
const ACCOUNT_KEYS: readonly string[] = Object.keys(ACCOUNT_PAGE_PATHS).filter((k) => k !== "contact")

export const PAGE_GROUP_LABELS: Readonly<Record<PageGroupKey, string>> = {
  home: "Home",
  shop: "Shop",
  products: "Products",
  pages: "Pages",
  accounts: "Customer accounts",
  contact: "Contact",
  policies: "Policies",
  other: "Other",
}

/** Which group a page is listed under, by its key. */
export function pageGroupOf(key: string): PageGroupKey {
  if (key === "home") return "home"
  if (key === "products" || key === "search" || key === "collections") return "shop"
  if (key === "product") return "products"
  if (ACCOUNT_KEYS.includes(key)) return "accounts"
  if (key === "contact") return "contact"
  if (POLICY_PAGE_KEYS.includes(key) || key === SHIPPING_POLICY.key) return "policies"
  if (key === NOT_FOUND_PAGE_KEY) return "other"
  return "pages"
}

/**
 * The order inside a group, where it is the site's rather than the
 * creator's: the shop before its search, the account before signing in, the
 * policies in the order the footer lists them, and About ahead of the
 * creator's own pages, which keep the order they were given in.
 */
const WITHIN: Readonly<Record<string, number>> = {
  products: 0,
  collections: 1,
  search: 2,
  about: -1,
  ...Object.fromEntries(ACCOUNT_KEYS.map((k, i) => [k, i])),
  ...Object.fromEntries(POLICY_PAGE_KEYS.map((k, i) => [k, i])),
  [SHIPPING_POLICY.key]: POLICY_PAGE_KEYS.length,
}

export interface GroupablePage {
  key: string
  name: string
  path: string
}

export interface PageGroup<T extends GroupablePage> {
  key: PageGroupKey
  label: string
  pages: T[]
}

/** The pages, in their groups, in the groups' order. A group with nothing in it is not there. */
export function groupPages<T extends GroupablePage>(pages: readonly T[]): PageGroup<T>[] {
  const byGroup = new Map<PageGroupKey, T[]>()
  for (const page of pages) {
    const group = pageGroupOf(page.key)
    const list = byGroup.get(group)
    if (list) list.push(page)
    else byGroup.set(group, [page])
  }
  return PAGE_GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
    key: g,
    label: PAGE_GROUP_LABELS[g],
    /* A stable sort: pages with no place of their own keep the order they came in. */
    pages: [...(byGroup.get(g) ?? [])].sort((a, b) => (WITHIN[a.key] ?? 0) - (WITHIN[b.key] ?? 0)),
  }))
}

/**
 * Whether a page answers what was typed: every word somewhere in its name or
 * its address, in any case. Nothing typed matches everything.
 */
export function pageMatches(page: { name: string; path?: string }, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = `${page.name} ${page.path ?? ""}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

/**
 * How many pages a list holds before it is worth a search field: a short
 * list is read faster than it is searched.
 */
export const PAGE_SEARCH_FROM = 9

/**
 * How many of the store's products the Products group lists before the rest
 * wait behind a "Show all" row, so a store with forty products does not push
 * its accounts and policies off the bottom. A search always looks at all of
 * them.
 */
export const PRODUCTS_LISTED = 5
