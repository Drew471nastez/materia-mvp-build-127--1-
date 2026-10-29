import "server-only"

/**
 * IndexNow for the pages whose address is their slug alone (round 44): a
 * community at storelib.com/community/<slug> and a blog post at
 * storelib.com/blog/<slug>. Neither needs a creator's handle, a website or
 * a domain worked out, so this module is only lib/seo/indexnow.ts and the
 * address: the routes that publish them load nothing of the sitemaps
 * (lib/seo/announce.ts reads lib/seo/sitemaps.ts, which a community route
 * has no other use for).
 *
 * Called in `after()`, and never throws: submitToIndexNow resolves whatever
 * happens, and does nothing while INDEXNOW_KEY is unset. An address is sent
 * whether the page appeared, changed or went: an engine told a page changed
 * fetches it again, and a 404 or a noindex is dropped sooner that way.
 */

import { indexNowKey, submitToIndexNow } from "./indexnow"

const STORELIB = "https://storelib.com"

const slugsOf = (slugs: Array<string | null | undefined>) => [...new Set(slugs.map((s) => (s ?? "").trim()).filter(Boolean))]

/** A community's page, under each slug given: a rename sends the old one too, which now redirects. */
export function communityAddresses(...slugs: Array<string | null | undefined>): string[] {
  return slugsOf(slugs).map((s) => `${STORELIB}/community/${encodeURIComponent(s)}`)
}

/** A blog post under each slug given, and the blog's front page, which lists it. */
export function blogPostAddresses(...slugs: Array<string | null | undefined>): string[] {
  const posts = slugsOf(slugs).map((s) => `${STORELIB}/blog/${encodeURIComponent(s)}`)
  return posts.length > 0 ? [...posts, `${STORELIB}/blog`] : []
}

/** For `after()`: send these addresses, never throwing. */
export async function announceAddresses(urls: string[]): Promise<void> {
  if (!indexNowKey() || urls.length === 0) return
  try {
    await submitToIndexNow(urls)
  } catch (e) {
    console.warn("[indexnow] not announced:", (e as Error).message)
  }
}
