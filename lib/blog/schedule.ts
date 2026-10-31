/**
 * ===========================================================================
 *  WHEN A POST IS LIVE
 * ===========================================================================
 * A post is live when it is published AND its date has come:
 *
 *     is_published = true  AND  published_at <= now()
 *
 * Scheduling is only that: Publish with a date in the future. Nothing has to
 * run at the hour for the post to appear, because every public read asks this
 * question at query time (lib/blog/post.ts, lib/blog/read.ts, the sitemap in
 * lib/seo/sitemaps.ts, and so /blog/rss.xml). The seo-index cron, which runs
 * every ten minutes, also revalidates and announces a post whose date has
 * just come (lib/blog/went-live.ts), so the cached pages catch up within a
 * few minutes rather than at their next revalidate.
 *
 * A published row with no date at all is from before dates were set on
 * publish; it counts as live, as it always did. SQL part 345 gives each one
 * its created_at.
 */

export type BlogPostStatus = "draft" | "scheduled" | "published"

type Dated = { is_published?: boolean | null; published_at?: string | null }

const at = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : null
}

export function isPostLive(post: Dated, now: number = Date.now()): boolean {
  if (post.is_published !== true) return false
  const t = at(post.published_at)
  return t === null || t <= now
}

export function postStatus(post: Dated, now: number = Date.now()): BlogPostStatus {
  if (post.is_published !== true) return "draft"
  return isPostLive(post, now) ? "published" : "scheduled"
}

/**
 * The same rule as a PostgREST filter, for `.or(...)` after
 * `.eq("is_published", true)`: no date, or a date not after `now`.
 */
export function liveDateFilter(now: number = Date.now()): string {
  return `published_at.is.null,published_at.lte.${new Date(now).toISOString()}`
}
