/**
 * ===========================================================================
 *  WHAT A SITE'S OWN SEARCH WINDOW FINDS (round N)
 * ===========================================================================
 * The built-in search window lists products. A search window a site draws
 * itself (data-storelib-search-panel, lib/website-builder/storefront-hooks.ts)
 * lists what a visitor would look for on a whole website: its products, its
 * pages and its blog posts, each marked with its kind so the panel can group
 * or label them.
 *
 * ONE CREATOR'S SITE ONLY. Everything here is handed this creator's own rows
 * by app/api/website-builder/search/route.ts, which reads them by the
 * creator's id: products that are published and on the Online store, pages
 * that are live and not hidden from search, posts that are live.
 *
 * PURE, so the matching and the order have a test.
 */
import { pageTitleFromKey } from "./site-pages"
import { pageSeoOf, hiddenPages } from "./page-seo"
import { listedPageKeys } from "./site-seo"
import type { SearchResultHit } from "./storefront-hooks"

/** At most this many of each kind, and of all kinds together. */
export const SITE_SEARCH_PER_KIND = 6
export const SITE_SEARCH_MAX = 12

export interface SearchablePage {
  key: string
  title: string
  url: string
}

export interface SearchablePost {
  title: string
  path: string
  excerpt?: string
  coverImageUrl?: string
  category?: string | null
  tags?: string[]
}

/**
 * The pages a visitor can find: live, listed in the sitemap (no templates, no
 * account or cart), not hidden from search in Pages & Navigation, named as the
 * creator named them (their search title) or as the menu names them.
 */
export function searchablePages(pageKeys: readonly string[], settings: Record<string, unknown> | null | undefined): SearchablePage[] {
  const hidden = hiddenPages(settings)
  return listedPageKeys([...pageKeys])
    .filter((k) => !hidden.has(k))
    .map((key) => {
      const own = pageSeoOf(settings, key).title
      return { key, title: (typeof own === "string" && own.trim()) || (key === "home" ? "Home" : pageTitleFromKey(key)), url: key === "home" ? "/" : `/${key}` }
    })
}

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)

/** How well some text answers the words: 0 for not at all; a title that starts with them scores highest. */
export function matchScore(title: string, extra: readonly (string | null | undefined)[], q: string): number {
  const ws = words(q)
  if (!ws.length) return 0
  const t = title.toLowerCase()
  const rest = extra.filter((x): x is string => typeof x === "string").join(" ").toLowerCase()
  let score = 0
  for (const w of ws) {
    if (t.startsWith(w)) score += 4
    else if (t.includes(w)) score += 3
    else if (rest.includes(w)) score += 1
    else return 0
  }
  return score
}

/** Pages and posts that match, best first, as results. Products are matched by the caller with productMatchesQuery. */
export function matchPagesAndPosts(q: string, pages: readonly SearchablePage[], posts: readonly SearchablePost[]): SearchResultHit[] {
  const pageHits = pages
    .map((p) => ({ p, s: matchScore(p.title, [p.key.replace(/-/g, " ")], q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, SITE_SEARCH_PER_KIND)
    .map(({ p }): SearchResultHit => ({ kind: "page", title: p.title, price: "", image: "", url: p.url }))
  const postHits = posts
    .map((p) => ({ p, s: matchScore(p.title, [p.excerpt, p.category, ...(p.tags ?? [])], q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, SITE_SEARCH_PER_KIND)
    .map(({ p }): SearchResultHit => ({ kind: "post", title: p.title, price: "", image: p.coverImageUrl ?? "", url: p.path }))
  return [...pageHits, ...postHits]
}

/** Products first (what a shop is searched for), then pages, then posts, at most SITE_SEARCH_MAX. */
export function mergeResults(products: readonly SearchResultHit[], rest: readonly SearchResultHit[]): SearchResultHit[] {
  return [...products.slice(0, SITE_SEARCH_PER_KIND), ...rest].slice(0, SITE_SEARCH_MAX)
}
