import "server-only"

import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import { STATIC_BLOG_CATEGORIES, type BlogCategory } from "./article"

/**
 * The blog's categories from blog_categories (SQL part 345: slug, name,
 * description, sort_order), edited in /admin/blog. A renamed category keeps
 * its slug, so its address does not move. While the table is missing, empty
 * or unreadable, the eight written in code (lib/blog-categories), as the
 * pages had before. One read per render.
 */
export const readBlogCategories = cache(async (): Promise<BlogCategory[]> => {
  try {
    const { data, error } = await createAdminClient().from("blog_categories").select("slug, name, description").order("sort_order", { ascending: true }).order("name", { ascending: true })
    if (error || !data?.length) return STATIC_BLOG_CATEGORIES
    return data.map((c) => ({ slug: String(c.slug), name: String(c.name), description: String(c.description ?? "") }))
  } catch {
    return STATIC_BLOG_CATEGORIES
  }
})
