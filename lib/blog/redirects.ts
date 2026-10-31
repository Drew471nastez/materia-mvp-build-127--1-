/**
 * Following an old blog slug to where the post lives now (blog_redirects,
 * SQL part 345). Pure: the lookup is passed in, so tests run it without a
 * database, and lib/blog/post.ts blogRedirectFor gives it the real one.
 *
 * Rows are written one hop deep (lib/blog/save-rules.ts slugChangePlan), but
 * a chain written by hand, or by an older version, is still followed, up to
 * five hops; a loop is no redirect at all.
 */

export type RedirectLookup = (fromSlug: string) => Promise<string | null>

export const MAX_REDIRECT_HOPS = 5

/** A slug as it may appear in /blog/<slug>: lower case letters, digits and hyphens. */
export function isBlogSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/.test(slug)
}

export async function followBlogRedirect(slug: string, lookup: RedirectLookup, maxHops = MAX_REDIRECT_HOPS): Promise<string | null> {
  if (!isBlogSlug(slug)) return null
  const seen = new Set([slug])
  let current = slug
  for (let hop = 0; hop < maxHops; hop++) {
    const next = await lookup(current)
    if (!next || !isBlogSlug(next)) break
    if (seen.has(next)) return null
    seen.add(next)
    current = next
  }
  return current === slug ? null : current
}
