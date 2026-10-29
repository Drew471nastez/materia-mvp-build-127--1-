import "server-only"

import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import { BLOG_LIST_COLUMNS, mergeBlogPosts, type BlogPost } from "./listing"

/**
 * Every published post, newest first, merged with the four written in code
 * (lib/blog/listing). Read by the blog's index pages, its category pages and
 * /blog/rss.xml. The blog is written by hand in /admin, so a thousand rows is
 * more than it will hold; an unpublished or deleted post is not here. The
 * admin client reads no cookie, so the pages that call this stay cacheable.
 * A failed read is the four posts, as the pages drew before. One read per
 * render: a page's metadata and its body share it through cache().
 */
export const readBlogPosts = cache(async (category?: string): Promise<BlogPost[]> => {
  try {
    const supabase = createAdminClient()
    let query = supabase.from("blog_posts").select(BLOG_LIST_COLUMNS).eq("is_published", true)
    if (category) query = query.eq("category", category)
    const { data } = await query.order("published_at", { ascending: false }).range(0, 999)
    return mergeBlogPosts((data || []) as unknown as BlogPost[], category)
  } catch {
    return mergeBlogPosts([], category)
  }
})
