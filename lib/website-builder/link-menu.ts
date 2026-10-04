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
 * the store's products and its collections (lib/products/collections.ts). No
 * blogs, because a site here has none, and a heading nobody can fill is worse
 * than no heading: a store with no collections gets no Collections row.
 *
 * A target is sorted by its address, which is what the field stores, so a
 * link saved before any of this sorts the same as one picked today.
 *
 * Pure, so tests/link-menu.test.ts runs it.
 */
import type { LinkTarget } from "@/components/website-builder/link-picker"
import { ACCOUNT_PAGE_PATHS } from "./account-pages"
import { POLICY_PAGE_KEYS } from "./policy-pages"
import {
  linkableSections,
  normalizePath,
  ownAnchor,
  resolveSectionHash,
  sectionHeading,
  sectionHref,
  splitSectionHref,
  type SectionLike,
} from "./section-anchors"

export type LinkCategoryKey = "sections" | "home" | "shop" | "products" | "collections" | "pages" | "accounts" | "policies" | "search"

export interface LinkCategory {
  key: LinkCategoryKey
  label: string
  /** One place, picked from the first list rather than opened. */
  single: boolean
}

export const LINK_CATEGORIES: readonly LinkCategory[] = [
  /* First, because a button on a landing page most often goes further down the same page. */
  { key: "sections", label: "Sections on this page", single: false },
  { key: "home", label: "Home", single: true },
  { key: "shop", label: "Shop", single: true },
  { key: "products", label: "Products", single: false },
  { key: "collections", label: "Collections", single: false },
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
  if (t.kind === "section") return "sections"
  if (t.kind === "product") return "products"
  if (t.kind === "collection" || t.href === "/collections" || t.href.startsWith("/collections/")) return "collections"
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

/**
 * ===========================================================================
 *  A LINK TO A SECTION IS SHOWN BY THE SECTION'S NAME
 * ===========================================================================
 * The field used to show `#ghostwriting`, which is how a browser spells it
 * and nobody else. A section target carries its page's address and what the
 * section reads as (its heading, name and type), so a stored link, whether
 * picked here (`/#section-<id>`) or typed long ago (`#pricing`, `/#pricing`),
 * is matched to its section by the same rules the page scrolls by
 * (section-anchors.ts) and shown as "Pricing".
 *
 * `currentPath` is the page open in the builder: a bare `#hash` means that
 * page. Null for a template page, where a section link is the hash alone.
 */
export function sectionTargetFor(
  value: string,
  targets: readonly LinkTarget[],
  currentPath: string | null,
): LinkTarget | null {
  const split = splitSectionHref(value)
  if (!split) return null
  const here = currentPath === null ? null : normalizePath(currentPath)
  const page = split.path ?? here
  const pool = targets.filter((t) => {
    const s = t.kind === "section" ? t.section : undefined
    if (!s) return false
    return s.page === null ? page === here : s.page === page
  })
  if (!pool.length) return null
  const id = resolveSectionHash(split.hash, pool.map((t) => t.section as NonNullable<LinkTarget["section"]>))
  return id ? (pool.find((t) => t.section?.id === id) ?? null) : null
}

/**
 * A page's sections as link targets, in page order, the header and footer
 * left out. Each is stored as `<page>#section-<id>` (section-anchors.ts,
 * sectionHref) and named by its heading or its name. `context` is the
 * page's name, for a section of a page other than the open one.
 */
export function sectionLinkTargets(
  sections: readonly SectionLike[],
  pagePath: string | null,
  nameOf?: (section: SectionLike) => string,
  context?: string,
): LinkTarget[] {
  const page = pagePath === null ? null : normalizePath(pagePath)
  const byId = new Map(sections.map((s) => [s.id, s]))
  return linkableSections(sections, nameOf).map((l) => {
    const s = byId.get(l.id) as SectionLike
    return {
      href: sectionHref(l.id, page),
      label: l.label,
      kind: "section" as const,
      ...(context ? { context } : {}),
      section: { id: s.id, type: s.type, name: s.name ?? null, heading: sectionHeading(s), anchor: ownAnchor(s), page },
    }
  })
}

/** A page whose own sections the picker can open: home and the creator's pages. */
export function drillsIntoSections(t: LinkTarget): boolean {
  if (t.kind !== "page") return false
  const c = linkCategoryOf(t)
  return c === "home" || c === "pages"
}
