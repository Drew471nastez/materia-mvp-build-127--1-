import "server-only"
import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import { STATIC_BLOG_SLUGS } from "./listing"

/** One published post from the database by its slug, or null. Deduped per request: the post's layout, metadata and page share it. */
export const fetchPost = cache(async (slug: string) => {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .single()
    return data
  } catch {
    return null
  }
})

/** A post Storelib can draw: a published one in the database, or one of the posts written in code. */
export async function blogPostExists(slug: string): Promise<boolean> {
  return STATIC_BLOG_SLUGS.includes(slug) || Boolean(await fetchPost(slug))
}
