/**
 * ===========================================================================
 *  SECTIONS THAT ARE PART OF THE PAGE: HIDDEN, NEVER DELETED (round BC)
 * ===========================================================================
 * The owner: a product page's main product section, a collection's product
 * grid, the cart, search, a page's own words, the account and login pages,
 * the 404, and the header and footer "are not in the Add section modal, so
 * deleting them loses them for good". These are hidden instead. Every way of
 * deleting a section asks this first: the row's bin and menu in the sidebar,
 * the section's own panel and menu, and the toolbar over the canvas.
 *
 * WORKED OUT FROM WHAT THE THEME SAYS, not from a list of names alone:
 *
 *   the header or the footer   the one section of its kind in its group (a
 *                              second, hidden by a replace, can still go)
 *   an imported Shopify theme  the template's own "main" (Shopify's key for
 *                              it), a main-* section, and any section whose
 *                              file has no presets: Shopify offers only a
 *                              section with a preset in Add section, so one
 *                              without is placed by the template and nothing
 *                              else
 *   a Storelib theme           a main_* section, a section with no preset,
 *                              and the section each built-in page is drawn
 *                              around (TEMPLATE_MAINS: the product on a
 *                              product page, the grid on the shop)
 *
 * A second section of the same type on the page is not the page's own one,
 * so it can be deleted: the rule protects the last of each.
 *
 * Tested in tests/round-bc-sidebar.test.ts.
 */
import { groupOf, isKind, type KindOfType } from "@/lib/storelib-theme/section-groups"
import { msg } from "@/lib/i18n/text"

/** What the editor says when Delete is not offered, and in place of Delete when it is pressed anyway. Shown through tt(). */
export const PINNED_NOTE = msg("This section is part of the page. You can hide it.")

/**
 * The section a built-in page is drawn around, by page key (lib/website-
 * builder/shop-page.ts, account-pages.ts, and the product page the editor
 * puts back when it is missing).
 */
export const TEMPLATE_MAINS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  product: ["product"],
  products: ["product_grid"],
  collection: ["product_grid"],
  collections: ["collections_grid"],
  search: ["search"],
  "404": ["not_found"],
  account: ["main_account"],
  login: ["main_login"],
  wishlist: ["main_wishlist"],
  password: ["main_password"],
})

export interface PinContext {
  /** The page key the sections are on: home, product, collection, 404 ... */
  page: string
  /** An imported Shopify theme. */
  compat: boolean
  kindOfType?: KindOfType
  /** The section type's schema, for its presets. Unknown types are never pinned by this rule. */
  schemaOf?: (type: string) => { presets?: readonly unknown[] } | undefined | null
}

interface PinnedLike {
  id: string
  type: string
  group?: string | null
}

/** Whether this section is the page's own: hide only, never delete. */
export function isPinnedSection(section: PinnedLike, sections: readonly PinnedLike[], ctx: PinContext): boolean {
  const group = groupOf(section as never)
  for (const kind of ["header", "footer"] as const) {
    if (group !== kind || !isKind(section, kind, ctx.kindOfType)) continue
    return !sections.some((s) => s.id !== section.id && groupOf(s as never) === kind && isKind(s, kind, ctx.kindOfType))
  }
  if (group === "overlay") return false
  if (sections.some((s) => s.id !== section.id && s.type === section.type)) return false
  if (ctx.compat && (section.id === "main" || /^main-/.test(section.type))) return true
  if (!ctx.compat && (/^main_/.test(section.type) || (TEMPLATE_MAINS[ctx.page] ?? []).includes(section.type))) return true
  const schema = ctx.schemaOf?.(section.type)
  return !!schema && (schema.presets?.length ?? 0) === 0
}

/** The words of a page key, and of a main section's type, compared to find the main sections a page is drawn around. */
const PAGE_WORDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  collections: ["list", "collections"],
  contact: ["page"],
  index: [],
  home: [],
})
const wordsOf = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/**
 * THE PAGE'S OWN SECTIONS THAT ARE NOT ON IT, so Add section can offer them
 * again on an install where one was deleted before it was hide only. A
 * Storelib page's are TEMPLATE_MAINS; an imported theme's are its main-*
 * section files whose name starts with the page's (main-product on the
 * product page, main-cart-items and main-cart-footer on the cart, main-404 on
 * the 404, main-list-collections on the collections list).
 */
export function missingPageSections(page: string, sections: readonly PinnedLike[], ctx: { compat: boolean; types: readonly string[] }): string[] {
  const present = new Set(sections.map((s) => s.type))
  if (!ctx.compat) return (TEMPLATE_MAINS[page] ?? []).filter((t) => !present.has(t) && ctx.types.includes(t))
  const want = PAGE_WORDS[page] ?? wordsOf(page)
  if (want.length === 0) return []
  return ctx.types
    .filter((t) => /^main-/.test(t) && !present.has(t))
    /* By its first word: main-collection-product-grid is the collection's, not the product page's. */
    .filter((t) => want.includes(wordsOf(t.slice(5))[0] ?? ""))
    .sort()
}
