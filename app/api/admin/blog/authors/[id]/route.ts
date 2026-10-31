import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { NEEDS_345, blogSchema, bylineOf } from "@/lib/blog/admin-store"
import { authorFields } from "@/lib/blog/author-fields"
import { blogJson, revalidateBlogPages } from "@/lib/blog/admin-http"

/** Change a profile. The byline text on its posts follows the name and role, so a reader of the old byline sees the same person. */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const { id } = await context.params
  const fields = authorFields(await req.json().catch(() => null), false)
  if ("error" in fields) return blogJson({ error: fields.error }, 400)
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  if (!full) return blogJson({ error: NEEDS_345 }, 409)
  const { data, error } = await supabase.from("blog_authors").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select("id, slug, name, role, bio, avatar_url, links").maybeSingle()
  if (error) return blogJson({ error: error.code === "23505" ? "Another author has that address." : "Couldn't save the author." }, error.code === "23505" ? 409 : 500)
  if (!data) return blogJson({ error: "That author is gone." }, 404)
  await supabase.from("blog_posts").update({ author_name: bylineOf(data as { name: string; role: string }) }).eq("author_id", id)
  revalidateBlogPages()
  return blogJson({ author: data })
}

/** Delete a profile. Its posts keep their byline text and lose the link to the profile. */
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const { id } = await context.params
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  if (!full) return blogJson({ error: NEEDS_345 }, 409)
  const { error } = await supabase.from("blog_authors").delete().eq("id", id)
  if (error) return blogJson({ error: "Couldn't delete the author." }, 500)
  revalidateBlogPages()
  return blogJson({ ok: true })
}
