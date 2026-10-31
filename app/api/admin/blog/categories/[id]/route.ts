import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { NEEDS_345, blogSchema } from "@/lib/blog/admin-store"
import { plainText } from "@/lib/blog/sanitize"
import { blogJson, revalidateBlogPages } from "@/lib/blog/admin-http"

/**
 * Rename a category or change its description: { name?, description? }.
 * The slug, and so the category's address, stays as it was. Its posts
 * carry the category by name, so they are renamed with it.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  if (!full) return blogJson({ error: NEEDS_345 }, 409)
  const { data: before } = await supabase.from("blog_categories").select("id, name").eq("id", id).maybeSingle()
  if (!before) return blogJson({ error: "That category is gone." }, 404)
  const update: Record<string, string> = {}
  if (typeof body?.name === "string") {
    const name = plainText(body.name, 80).trim()
    if (!name) return blogJson({ error: "A category needs a name." }, 400)
    update.name = name
  }
  if (typeof body?.description === "string") update.description = plainText(body.description, 500).trim()
  const { data, error } = await supabase.from("blog_categories").update({ ...update, updated_at: new Date().toISOString() }).eq("id", id).select("id, slug, name, description").single()
  if (error) return blogJson({ error: error.code === "23505" ? "Another category has that name." : "Couldn't save the category." }, error.code === "23505" ? 409 : 500)
  if (update.name && update.name !== before.name) {
    await supabase.from("blog_posts").update({ category: update.name }).eq("category", before.name)
    revalidateBlogPages()
  }
  return blogJson({ category: data })
}

/** Delete a category: { move_to } names the category its posts move to; with posts and no move_to it is refused. */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const { id } = await context.params
  const moveTo = req.nextUrl.searchParams.get("move_to")
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  if (!full) return blogJson({ error: NEEDS_345 }, 409)
  const { data: cat } = await supabase.from("blog_categories").select("id, name").eq("id", id).maybeSingle()
  if (!cat) return blogJson({ ok: true })
  const { count } = await supabase.from("blog_posts").select("id", { count: "exact", head: true }).eq("category", cat.name)
  if (count) {
    const { data: target } = moveTo ? await supabase.from("blog_categories").select("name").eq("id", moveTo).neq("id", id).maybeSingle() : { data: null }
    if (!target) return blogJson({ error: `${count === 1 ? "1 post uses" : `${count} posts use`} ${cat.name}. Pick a category to move ${count === 1 ? "it" : "them"} to.`, code: "in_use", count }, 409)
    await supabase.from("blog_posts").update({ category: target.name }).eq("category", cat.name)
  }
  const { error } = await supabase.from("blog_categories").delete().eq("id", id)
  if (error) return blogJson({ error: "Couldn't delete the category." }, 500)
  revalidateBlogPages()
  return blogJson({ ok: true })
}
