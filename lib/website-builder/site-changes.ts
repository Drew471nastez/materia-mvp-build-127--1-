/**
 * ===========================================================================
 *  WHICH OF A WEBSITE'S ADDRESSES A CHANGE TOUCHED, FOR INDEXNOW
 * ===========================================================================
 * lib/seo/announce.ts websiteAddresses answers with the website's addresses
 * as they are. A publish that drops a page (or swaps the theme), or a page
 * deleted from a live site, leaves an address that is a 404 now and is in no
 * list read after the change, so it was never announced and an engine kept
 * it until its next crawl. The routes read the addresses before the change
 * as well, and this says which of them to send.
 *
 * Pure, so the routes stay the only place that reads anything.
 */

/** The path a page of the website answers at: `/` for home, `/<key>` for the rest (lib/website-builder/site-seo.ts pageUrl). */
export function pagePath(pageKey: string): string {
  return pageKey === "home" ? "/" : `/${pageKey}`
}

/** The addresses that were live before a change and are not after it: the ones that went. */
export function goneAddresses(before: readonly string[], after: readonly string[]): string[] {
  const still = new Set(after)
  return [...new Set(before)].filter((url) => !still.has(url))
}

/** Just the addresses at these paths, on whichever host the list names, once each. */
export function addressesAt(urls: readonly string[], paths: readonly string[]): string[] {
  const wanted = new Set(paths)
  return [...new Set(urls)].filter((url) => {
    try {
      return wanted.has(new URL(url).pathname)
    } catch {
      return false
    }
  })
}
