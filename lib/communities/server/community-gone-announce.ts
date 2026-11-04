import "server-only"

/**
 * After the answer, once a community is deleted (./community-gone.ts):
 *
 *   ENGINES  every address it answered to, its About page and, when it was a
 *            public community, its public posts (the sitemap's own rule,
 *            lib/seo/community-posts-sitemap.ts), sent to IndexNow, which
 *            asks them again and finds 404.
 *   COPIES   its stored public pages asked again as a stranger
 *            (lib/edge/snapshot-capture.ts capturePages): each answers 404
 *            now and its copy is deleted, so an outage never serves it.
 *
 * Loaded only here, after the answer, so neither the SEO nor the edge code is
 * part of the routes that delete. Never throws.
 */
import { announceAddresses, communityAddresses } from "@/lib/seo/announce-pages"
import { indexNowKey } from "@/lib/seo/indexnow"
import { listablePost, openSpaceIds, type SitemapPostRow, type SitemapSpaceRow } from "@/lib/seo/community-posts-sitemap"
import { postPath } from "@/lib/communities/post-url"
import { reasonOf, type Db } from "./db"

const STORELIB = "https://storelib.com"
/** IndexNow takes 10,000 in one request; the newest public posts are the ones an engine is likeliest to have. */
export const GONE_POSTS_MAX = 2000

/** The addresses an engine may have of it. Exported for the tests. */
export async function goneAddresses(db: Db, a: { id: string; slugs: string[]; wasPublic: boolean }): Promise<string[]> {
  const out = new Set<string>(communityAddresses(...a.slugs))
  for (const s of a.slugs) out.add(`${STORELIB}/community/${encodeURIComponent(s)}/about`)
  if (!a.wasPublic || !a.slugs.length) return [...out]
  try {
    const spaces = await db.from("community_spaces").select("id, community_id, view_access, archived_at").eq("community_id", a.id)
    if (spaces.error) return [...out]
    const open = openSpaceIds((spaces.data ?? []) as SitemapSpaceRow[])
    const posts = await db
      .from("community_feed_posts")
      .select("id, community_id, space_id, title, body_text, status, deleted_at, created_at, edited_at")
      .eq("community_id", a.id)
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(GONE_POSTS_MAX)
    for (const p of ((posts.data ?? []) as SitemapPostRow[]).filter((p) => listablePost(p, open))) {
      out.add(`${STORELIB}${postPath(a.slugs[0], { id: p.id, title: p.title, bodyText: p.body_text })}`)
    }
  } catch (e) {
    console.error(`[communities] gone posts ${a.id}: ${reasonOf(e)}`)
  }
  return [...out]
}

export async function announceCommunityGone(db: Db, a: { id: string; slugs: string[]; wasPublic: boolean }): Promise<void> {
  if (indexNowKey()) await announceAddresses(await goneAddresses(db, a)).catch(() => undefined)
  try {
    const { storeConfig } = await import("@/lib/edge/snapshot-store")
    if (!storeConfig() || !a.slugs[0]) return
    const { capturePages } = await import("@/lib/edge/snapshot-capture")
    const host = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
    const slug = a.slugs[0]
    await capturePages(`community-${slug}`, [
      { host, path: `/community/${slug}`, kind: "community" },
      { host, path: `/community/${slug}/about`, kind: "community" },
    ])
  } catch (e) {
    console.error(`[communities] gone copies ${a.id}: ${reasonOf(e)}`)
  }
}
