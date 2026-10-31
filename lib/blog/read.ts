import "server-only"

import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import { BLOG_LIST_COLUMNS, mergeBlogPosts, type BlogPost } from "./listing"
import { liveDateFilter } from "./schedule"

/**
 * Every published post, newest first, merged with the four written in code
 * (lib/blog/listing). Read by the blog's index pages, its category pages and
 * /blog/rss.xml. The blog is written by hand in /admin, so a thousand rows is
 * more than it will hold; an unpublished, scheduled or deleted post is not
 * here (lib/blog/schedule.ts: published, and its date reached). The
 * admin client reads no cookie, so the pages that call this stay cacheable.
 * A failed read is the four posts, as the pages drew before. One read per
 * render: a page's metadata and its body share it through cache().
 */
export const readBlogPosts = cache(async (category?: string): Promise<BlogPost[]> => {
  try {
    const supabase = createAdminClient()
    let query = supabase.from("blog_posts").select(BLOG_LIST_COLUMNS).eq("is_published", true).or(liveDateFilter())
    if (category) query = query.eq("category", category)
    const { data } = await query.order("published_at", { ascending: false }).range(0, 999)
    return mergeBlogPosts((data || []) as unknown as BlogPost[], category)
  } catch {
    return mergeBlogPosts([], category)
  }
})

/**
 * Live posts that must not be in the sitemap: noindex, or canonical at
 * another address (SQL part 345). Read on its own so that the sitemap's own
 * query names no column part 345 adds: before it runs this is an empty set
 * and the sitemap is as it was.
 */
export async function blogSlugsNotInSitemap(): Promise<Set<string>> {
  try {
    const { data, error } = await createAdminClient().from("blog_posts").select("slug").eq("is_published", true).or("noindex.eq.true,canonical_url.not.is.null").range(0, 4999)
    return error ? new Set() : new Set((data ?? []).map((r) => r.slug as string))
  } catch {
    return new Set()
  }
}
