/**
 * ===========================================================================
 *  WHERE A LINK CAN GO, SORTED THE WAY A SHOP IS
 * ===========================================================================
 * The link picker opens on a short list of kinds of place, the way Shopify's
 * does: the home page, the shop and the search are one row each and pick
 * straight away; products, pages, the visitor's account pages and the
 * policies are a row each that opens onto their own list. Typing looks
 * through all of them at once.
 *
 * Only what this product has: the pages in lib/website-builder/page-groups
 * (the account pages in account-pages.ts, the policies in policy-pages.ts)
 * and the store's products. No collections and no blogs, because a site here
 * has neither, and a heading nobody can fill is worse than no heading.
 *
 * A target is sorted by its address, which is what the field stores, so a
 * link saved before any of this sorts the same as one picked today.
 *
 * Pure, so tests/link-menu.test.ts runs it.
 */
import type { LinkTarget } from "@/components/website-builder/link-picker"
import { ACCOUNT_PAGE_PATHS } from "./account-pages"
import { POLICY_PAGE_KEYS } from "./policy-pages"

export type LinkCategoryKey = "home" | "shop" | "products" | "pages" | "accounts" | "policies" | "search"

export interface LinkCategory {
  key: LinkCategoryKey
  label: string
  /** One place, picked from the first list rather than opened. */
  single: boolean
}

export const LINK_CATEGORIES: readonly LinkCategory[] = [
  { key: "home", label: "Home", single: true },
  { key: "shop", label: "Shop", single: true },
  { key: "products", label: "Products", single: false },
  { key: "pages", label: "Pages", single: false },
  { key: "accounts", label: "Customer accounts", single: false },
  { key: "policies", label: "Policies", single: false },
  { key: "search", label: "Search", single: true },
]

/** The visitor's own pages, by address. Contact is everybody's, and is a page. */
const ACCOUNT_HREFS: readonly string[] = Object.entries(ACCOUNT_PAGE_PATHS)
  .filter(([key]) => key !== "contact")
  .map(([, path]) => path)
const POLICY_HREFS: readonly string[] = POLICY_PAGE_KEYS.map((k) => `/${k}`)

export function linkCategoryOf(t: Pick<LinkTarget, "href" | "kind">): LinkCategoryKey {
  if (t.kind === "product") return "products"
  if (t.href === "/") return "home"
  if (t.href === "/products") return "shop"
  if (t.href === "/search") return "search"
  if (ACCOUNT_HREFS.includes(t.href)) return "accounts"
  if (POLICY_HREFS.includes(t.href)) return "policies"
  return "pages"
}

/** Order inside a group where the site has one: accounts and policies as their own files list them. */
function within(t: LinkTarget): number {
  const a = ACCOUNT_HREFS.indexOf(t.href)
  if (a >= 0) return a
  const p = POLICY_HREFS.indexOf(t.href)
  if (p >= 0) return p
  return 0
}

export interface LinkMenuEntry {
  category: LinkCategory
  targets: LinkTarget[]
}

/**
 * The first list: every category with something in it, in order. A
 * `single` category with exactly one target is that target; with more than
 * one (a theme that somehow has two home pages) it opens like the others.
 */
export function linkMenu(targets: readonly LinkTarget[]): LinkMenuEntry[] {
  return LINK_CATEGORIES.map((category) => ({
    category,
    /* A stable sort: targets with no place of their own keep the order they were given in. */
    targets: targets.filter((t) => linkCategoryOf(t) === category.key).sort((a, b) => within(a) - within(b)),
  })).filter((e) => e.targets.length > 0)
}

/** Whether an entry picks straight away rather than opening a list. */
export function picksDirectly(e: LinkMenuEntry): boolean {
  return e.category.single && e.targets.length === 1
}

/**
 * What typing finds: every word somewhere in a target's name, its address or
 * the name of its kind, in any case, across every category, in the
 * categories' order. The kind counts so "polic" finds Terms of service too.
 */
export function searchLinkTargets(targets: readonly LinkTarget[], query: string): LinkTarget[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return linkMenu(targets).flatMap((e) =>
    e.targets.filter((t) => {
      const hay = `${t.label} ${t.href} ${e.category.label}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    }),
  )
}

/** "1 result", "12 results". */
export function resultCount(n: number): string {
  return `${n} ${n === 1 ? "result" : "results"}`
}
