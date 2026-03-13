import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  const [
    { count: totalProducts },
    { count: publishedProducts },
    { count: totalBlogPosts },
    { count: publishedBlogPosts },
    { count: totalSellers },
    { data: creatorProfiles },
    { data: productCounts },
    { data: blogPosts },
  ] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("blog_posts").select("*", { count: "exact", head: true }),
    supabase.from("blog_posts").select("*", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("profiles").select("*", { count: "exact", head: true }).not("username", "is", null),
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .not("username", "is", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("products")
      .select("creator_id, status")
      .eq("status", "published"),
    supabase
      .from("blog_posts")
      .select("id, slug, title, seo_title, seo_description, is_published, published_at, views")
      .order("published_at", { ascending: false })
      .limit(50),
  ])

  const countByCreator: Record<string, number> = {}
  for (const product of productCounts ?? []) {
    if (product.creator_id) {
      countByCreator[product.creator_id] = (countByCreator[product.creator_id] ?? 0) + 1
    }
  }

  const creators = (creatorProfiles ?? []).map((profile) => ({
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    product_count: countByCreator[profile.id] ?? 0,
    has_published_products: (countByCreator[profile.id] ?? 0) > 0,
  }))

  const categories = 14
  const staticPages = 5
  const pagesInSitemap =
    (publishedProducts ?? 0) + (totalSellers ?? 0) + categories + staticPages + (publishedBlogPosts ?? 0)

  return NextResponse.json({
    totalProducts: totalProducts ?? 0,
    publishedProducts: publishedProducts ?? 0,
    totalBlogPosts: totalBlogPosts ?? 0,
    publishedBlogPosts: publishedBlogPosts ?? 0,
    totalSellers: totalSellers ?? 0,
    pagesInSitemap,
    indexablePages: (publishedProducts ?? 0) + (totalSellers ?? 0) + categories + staticPages,
    creators,
    recentPosts: blogPosts ?? [],
  })
}
