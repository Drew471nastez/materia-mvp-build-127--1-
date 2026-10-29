import { NextRequest, NextResponse, after } from "next/server"
import { announceAddresses, blogPostAddresses } from "@/lib/seo/announce-pages"
import { adminFailure } from "@/lib/admin/gate"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, category, is_published, published_at, views, created_at, updated_at, cover_image_url, excerpt")
    .order("created_at", { ascending: false })

  if (error) return adminFailure("blog posts", error)
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("blog_posts")
    .insert([{
      slug: body.slug,
      title: body.title,
      excerpt: body.excerpt || "",
      content: body.content || [],
      cover_image_url: body.cover_image_url || null,
      category: body.category || "General",
      read_time: body.read_time || "5 min read",
      author_name: body.author || "Storelib Team",
      seo_title: body.seo_title || null,
      seo_description: body.seo_description || null,
      seo_keywords: body.seo_keywords || null,
      is_published: body.is_published || false,
      published_at: body.is_published ? new Date().toISOString() : null,
    }])
    .select()
    .single()

  if (error) return adminFailure("blog posts", error)

  // Revalidate public blog pages so new posts appear immediately
  revalidatePath("/blog")
  if (data?.slug) revalidatePath(`/blog/${data.slug}`)
  revalidatePath("/blog/explore/categories", "layout")
  /* Published at once: tell the engines after the answer (lib/seo/announce-pages.ts). */
  if (data?.is_published) {
    const slug = data.slug as string | null
    after(() => announceAddresses(blogPostAddresses(slug)))
  }

  return NextResponse.json(data)
}
