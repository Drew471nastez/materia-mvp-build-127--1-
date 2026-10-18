/**
 * ===========================================================================
 *  THE SHOP AND A COLLECTION, HELD FOR A STRANGER UNLESS THE ADDRESS ASKS
 * ===========================================================================
 * A Storelib theme's `/products` and `/collections/<handle>` were drawn per
 * request for every visitor (`force-dynamic`, sent `private, no-store`),
 * because they read the filters, the sort and the page number from the
 * address. Without any of those, the page is the same for everybody, so it
 * is now held a minute like the front page (`revalidate = 60`). An address
 * that does ask (CATALOG_KEYS) is sent by the proxy to the same page's
 * `~list` twin, drawn per request; the visitor's address does not change.
 *
 * Any other query (a campaign tag, a click id) does not change the page, so
 * it does not cost the held copy either.
 */

/** What the catalogue reads from an address (lib/products/catalog-filters.ts parseCatalogQuery and paginate). */
export const CATALOG_KEYS = ["q", "price_min", "price_max", "available", "type", "sort", "page"] as const

/** The twin route's last segment: a name no product, collection or page can have. */
export const LIST_SEGMENT = "~list"

/** Whether the address asks the catalogue for something: a filter, the sort or a page. */
export function asksCatalogue(params: URLSearchParams): boolean {
  for (const key of params.keys()) if ((CATALOG_KEYS as readonly string[]).includes(key) || key.startsWith("opt.")) return true
  return false
}

/**
 * Where the proxy sends a built website's page: `/w/<name>/products` and
 * `/w/<name>/collections/<handle>` to their `~list` twin when the address
 * asks the catalogue for something; every other path as it is.
 */
export function heldListPath(path: string, params: URLSearchParams): string {
  if (!asksCatalogue(params)) return path
  const m = /^(\/w\/[^/]+\/(?:products|collections\/[^/]+))\/?$/.exec(path)
  return m ? `${m[1]}/${LIST_SEGMENT}` : path
}
