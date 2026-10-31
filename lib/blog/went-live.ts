import "server-only"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { announceAddresses, blogPostAddresses } from "@/lib/seo/announce-pages"

/**
 * A scheduled post whose hour has come. The post is already live without
 * this (lib/blog/schedule.ts: every public read asks at query time); this
 * makes the cached pages and the search engines catch up within one run of
 * the seo-index cron (every ten minutes, vercel.json) rather than at the
 * page's next revalidate. The window is a little longer than the cron's
 * interval, so a late run misses nothing; an address sent twice is harmless.
 */
export const WENT_LIVE_WINDOW_MS = 15 * 60 * 1000

export async function announceScheduledBlogPosts(now = Date.now()): Promise<number> {
  try {
    const { data, error } = await createAdminClient()
      .from("blog_posts")
      .select("slug")
      .eq("is_published", true)
      .gt("published_at", new Date(now - WENT_LIVE_WINDOW_MS).toISOString())
      .lte("published_at", new Date(now).toISOString())
      .range(0, 99)
    if (error || !data?.length) return 0
    const slugs = data.map((r) => r.slug as string)
    revalidatePath("/blog")
    revalidatePath("/blog/rss.xml")
    revalidatePath("/blog/category", "layout")
    for (const s of slugs) revalidatePath(`/blog/${s}`)
    await announceAddresses(blogPostAddresses(...slugs))
    return slugs.length
  } catch (e) {
    console.warn("[blog] scheduled posts not announced:", (e as Error).message)
    return 0
  }
}
