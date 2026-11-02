/**
 * ===========================================================================
 *  THE SEARCH'S GROUPS, LABELS AND QUERY RULES, FOR THE BROWSER TOO
 * ===========================================================================
 * The header's search box (components/app/app-search.tsx) is on every /app
 * page, and it needs only these: which groups there are, what each is
 * called, and when a query is worth sending. They lived in
 * lib/search/app-search.ts beside the server's readers, so importing them
 * brought those readers' imports into the dashboard's first load: the whole
 * Help Center (every article, about 290 KB of script), the integrations
 * catalog and the orders page's grouping (round 48, measured from the build's
 * client reference manifest). Nothing here imports more than the words.
 * lib/search/app-search.ts re-exports all of it, so the route and the tests
 * read the same names from either.
 */
import { tt } from "@/lib/i18n/text"

export type SearchGroupId = "orders" | "customers" | "products" | "collections" | "offers" | "coupons" | "size_charts" | "emails" | "automations" | "communities" | "integrations" | "help"

/*
  ROUND 42: upsells and bundles, size charts, the communities a person runs,
  the integrations and the Help Center's articles found too, beside what was
  found before. The last two are read from the code (lib/integrations/catalog,
  lib/help/articles), never a table: nothing of anybody's is in them.
*/
export const SEARCH_GROUPS: readonly SearchGroupId[] = ["orders", "customers", "products", "collections", "offers", "coupons", "size_charts", "emails", "automations", "communities", "integrations", "help"]

export const GROUP_LABELS: Record<SearchGroupId, string> = {
  get orders() { return tt("Orders") },
  get customers() { return tt("Customers") },
  get products() { return tt("Products") },
  get collections() { return tt("Collections") },
  get offers() { return tt("Upsells and bundles") },
  get coupons() { return tt("Coupons") },
  get size_charts() { return tt("Size charts") },
  get emails() { return tt("Emails") },
  get automations() { return tt("Automations") },
  get communities() { return tt("Communities") },
  get integrations() { return tt("Integrations") },
  get help() { return tt("Help") },
}

/** At most this many of each kind. A search is for finding one thing, not a list. */
export const GROUP_LIMIT = 5

/** Longer than any name, email or subject anybody types. */
export const MAX_QUERY_LENGTH = 100

export interface SearchHit {
  id: string
  title: string
  /** One line under the title: who, what, how much, or where it stands. */
  detail: string
  href: string
}

export interface SearchResult {
  groups: Record<SearchGroupId, SearchHit[]>
  /** Groups whose table could not be read (not migrated yet, or failing). */
  unavailable: SearchGroupId[]
}

export function emptyResult(): SearchResult {
  return { groups: { orders: [], customers: [], products: [], collections: [], offers: [], coupons: [], size_charts: [], emails: [], automations: [], communities: [], integrations: [], help: [] }, unavailable: [] }
}

/** Trimmed, one space between words, and no longer than MAX_QUERY_LENGTH. */
export function normalizeQuery(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH)
}

/**
 * Worth asking the server: two characters, or an order number of any length
 * ("#7", "7"). One letter matches half of everything and tells nobody anything.
 */
export function isSearchable(q: string): boolean {
  const t = q.trim()
  return t.length >= 2 || /^#?\d+$/.test(t)
}
