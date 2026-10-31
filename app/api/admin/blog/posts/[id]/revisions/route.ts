import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { NEEDS_345, blogSchema } from "@/lib/blog/admin-store"
import { blogJson } from "@/lib/blog/admin-http"

/** The post's revisions, newest first, without their content: the History panel's list. */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const { id } = await context.params
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  if (!full) return blogJson({ revisions: [], note: NEEDS_345 })
  const { data, error } = await supabase.from("blog_post_revisions").select("id, kind, title, created_at, created_by").eq("post_id", id).order("created_at", { ascending: false }).range(0, 59)
  if (error) return blogJson({ error: "The history could not be read." }, 500)
  return blogJson({ revisions: data ?? [] })
}
