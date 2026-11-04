/**
 * ===========================================================================
 *  THE COMPARISON PAGES, IN ONE LIST
 * ===========================================================================
 * /alternatives lists these, /alternatives/<slug> draws each one, the
 * sitemap names each one (lib/seo/sitemaps.ts pagesSitemap), and the tests
 * check each one. Adding a competitor is a file in ./competitors and a line
 * here; nothing else needs to know.
 *
 * The order is the hub's order: the platforms people most often leave for
 * Storelib first.
 */
import type { CategoryId, Competitor } from "./types"
import { gumroad } from "./competitors/gumroad"
import { stanStore } from "./competitors/stan-store"
import { whop } from "./competitors/whop"
import { shopify } from "./competitors/shopify"
import { linktree } from "./competitors/linktree"

export const ALTERNATIVES: readonly Competitor[] = [gumroad, stanStore, whop, linktree, shopify]

export const CATEGORIES: readonly { id: CategoryId; label: string }[] = [
  { id: "digital-products", label: "Digital products" },
  { id: "link-in-bio", label: "Link in bio" },
  { id: "communities", label: "Communities" },
  { id: "online-store", label: "Online store" },
]

export const HUB_PATH = "/alternatives"

export function alternativePath(slug: string): string {
  return `${HUB_PATH}/${slug}`
}

export function getAlternative(slug: string): Competitor | undefined {
  return ALTERNATIVES.find((c) => c.slug === slug)
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id
}

/** Other comparisons to link at the foot of a page: the ones sharing a category first. */
export function relatedAlternatives(slug: string, count = 3): Competitor[] {
  const self = getAlternative(slug)
  const others = ALTERNATIVES.filter((c) => c.slug !== slug)
  if (!self) return others.slice(0, count)
  const shares = (c: Competitor) => c.categories.some((k) => self.categories.includes(k))
  return [...others.filter(shares), ...others.filter((c) => !shares(c))].slice(0, count)
}

/** Every source a page cites, in the order the page first uses them. */
export function sourceById(c: Competitor, id: string) {
  return c.sources.find((s) => s.id === id)
}

/** The text a hub card or a search matches against. */
export function searchText(c: Competitor): string {
  return [c.name, c.summary, c.pricingShort, ...c.categories.map(categoryLabel)].join(" ").toLowerCase()
}

/** The newest day any of a page's facts were checked. */
export function lastChecked(c: Competitor): string {
  return c.sources.map((s) => s.checkedOn).sort().at(-1) ?? c.updated
}
