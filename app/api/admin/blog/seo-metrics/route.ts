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
  ] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("blog_posts").select("*", { count: "exact", head: true }),
    supabase.from("blog_posts").select("*", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("profiles").select("*", { count: "exact", head: true }).not("username", "is", null),
  ])

  const categories = 14
  const staticPages = 5 // home, explore, blog, about, pricing
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
  })
}
