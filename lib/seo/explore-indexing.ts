/**
 * ===========================================================================
 *  WHICH /explore ADDRESS IS A PAGE OF ITS OWN
 * ===========================================================================
 * /explore is one page for many addresses. Two of them are pages a search
 * engine should know:
 *
 *   /explore                        the products
 *   /explore?type=communities       the communities, while they are on
 *
 * The sitemap lists both (lib/seo/sitemaps.ts pagesSitemap), and each has to
 * name itself as canonical: the second used to say /explore, so the sitemap
 * listed an address whose own page said "not me, that one".
 *
 * Every other address (a sort, a category filter, a language) is a view of
 * one of those two, and names it. A search (?q=) is a results page, not
 * content: noindex, links followed. robots.txt already keeps crawlers off
 * /explore?q=, but only when q comes first in the query.
 */

export const EXPLORE_URL = "https://storelib.com/explore"
export const EXPLORE_COMMUNITIES_URL = `${EXPLORE_URL}?type=communities`

export function exploreIndexing(input: { q?: string | null; type?: string | null; communitiesOn: boolean }): {
  canonical: string
  communities: boolean
  index: boolean
} {
  const communities = input.communitiesOn && input.type === "communities"
  return {
    canonical: communities ? EXPLORE_COMMUNITIES_URL : EXPLORE_URL,
    communities,
    index: !(input.q ?? "").trim(),
  }
}
