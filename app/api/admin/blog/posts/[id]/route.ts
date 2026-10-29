import { NextRequest, NextResponse, after } from "next/server"
import { announceAddresses, blogPostAddresses } from "@/lib/seo/announce-pages"
import { adminFailure } from "@/lib/admin/gate"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

function revalidateBlogPages(slug?: string) {
  revalidatePath("/blog")
  if (slug) revalidatePath(`/blog/${slug}`)
  revalidatePath("/blog/explore/categories", "layout")
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return adminFailure("blog post", error)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const body = await req.json()
  const supabase = createAdminClient()

  // If toggling to published for the first time, set published_at
  const updates: Record<string, unknown> = { ...body }
  if (updates.is_published && updates._set_published_at) {
    updates.published_at = new Date().toISOString()
  }
  delete updates._set_published_at
  // Map editor field "author" → DB column "author_name"
  if ("author" in updates) {
    updates.author_name = updates.author
    delete updates.author
  }
  // Strip read-only / non-DB fields that the editor sends
  delete updates.id
  delete updates.created_at
  delete updates.updated_at
  delete updates.views

  /* A new slug leaves the old address behind: it is announced too, so engines drop it. */
  const before = "slug" in updates ? (await supabase.from("blog_posts").select("slug, is_published").eq("id", id).maybeSingle()).data : null

  const { data, error } = await supabase
    .from("blog_posts")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return adminFailure("blog post", error)

  // Revalidate public blog pages so changes appear immediately
  revalidateBlogPages(data?.slug)

  /* A live post, or one just taken down: tell the engines after the answer (lib/seo/announce-pages.ts). A draft has no page. */
  if (data?.is_published || updates.is_published === false || before?.is_published) {
    const slugs = [before?.slug, data?.slug]
    after(() => announceAddresses(blogPostAddresses(...slugs)))
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const supabase = createAdminClient()

  // Fetch the post slug before deleting so we can revalidate its page
  const { data: post } = await supabase
    .from("blog_posts")
    .select("slug")
    .eq("id", id)
    .single()

  const { error } = await supabase
    .from("blog_posts")
    .delete()
    .eq("id", id)

  if (error) return adminFailure("blog post", error)

  // Revalidate public blog pages so deleted post is removed
  revalidateBlogPages(post?.slug)
  /* Its address answers 404 now; engines told look again and drop it. */
  const gone = post?.slug
  after(() => announceAddresses(blogPostAddresses(gone)))

  return NextResponse.json({ ok: true })
}
