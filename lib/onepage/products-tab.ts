/**
 * ===========================================================================
 *  THE EDITOR'S PRODUCTS TAB: WHAT IT SHOWS FIRST
 * ===========================================================================
 * The owner, with a screenshot of the tab: "I don't like that that list is
 * so long as default opened... Don't display as default as many products
 * because it messes up the entire page." Every product was listed in a box
 * 560px tall with its own scrollbar, so a creator with forty products had a
 * scroll inside the editor's scroll, and on a phone a finger on the list
 * moved the list and not the page.
 *
 * Now (components/onepage/tabs/products-tab.tsx):
 *   1. the products already on the page, all of them (a page holds a few);
 *   2. the others, the first PRODUCTS_PREVIEW of them, with "Show all";
 *   3. a search, once there are more than that, which looks through all of
 *      them in one list.
 * No box of its own scrolls: the tab scrolls as one page.
 */

export const PRODUCTS_PREVIEW = 5

type Block = { type?: unknown; data?: unknown }

/** Every product a product block on the page shows, blocks inside a group included. */
export function productIdsOnPage(blocks: readonly Block[] | null | undefined): Set<string> {
  const ids = new Set<string>()
  const walk = (list: readonly Block[] | null | undefined) => {
    for (const b of list || []) {
      const data = (b?.data || {}) as { product_id?: unknown; children?: Block[] }
      if (b?.type === "product" && typeof data.product_id === "string" && data.product_id) ids.add(data.product_id)
      if (b?.type === "group" && Array.isArray(data.children)) walk(data.children)
    }
  }
  walk(blocks)
  return ids
}

export type ProductsTabView<P> = {
  /** Searching: one list of every match, on the page or not. */
  searching: boolean
  matches: P[]
  /** Not searching: the ones on the page, then the first few others. */
  onPage: P[]
  others: P[]
  /** How many others "Show all" would add. */
  hidden: number
}

export function productsTabView<P extends { id: string; title: string }>(
  products: readonly P[],
  onPageIds: ReadonlySet<string>,
  query: string,
  showAll: boolean,
  limit: number = PRODUCTS_PREVIEW,
): ProductsTabView<P> {
  const q = query.trim().toLowerCase()
  if (q) {
    return { searching: true, matches: products.filter((p) => p.title.toLowerCase().includes(q)), onPage: [], others: [], hidden: 0 }
  }
  const onPage = products.filter((p) => onPageIds.has(p.id))
  const rest = products.filter((p) => !onPageIds.has(p.id))
  const others = showAll ? rest : rest.slice(0, limit)
  return { searching: false, matches: [], onPage, others, hidden: rest.length - others.length }
}
