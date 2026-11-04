import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { NEEDS_345, blogSchema, readAuthors } from "@/lib/blog/admin-store"
import { authorFields } from "@/lib/blog/author-fields"
import { blogJson } from "@/lib/blog/admin-http"

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  return blogJson({ authors: await readAuthors(supabase, full), full })
}

/** A new author profile: { name, role?, bio?, avatar_url?, links?, slug? }. */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const fields = authorFields(await req.json().catch(() => null), true)
  if ("error" in fields) return blogJson({ error: fields.error }, 400)
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  if (!full) return blogJson({ error: NEEDS_345 }, 409)
  const { data, error } = await supabase.from("blog_authors").insert(fields).select("id, slug, name, role, bio, avatar_url, links").single()
  if (error) return blogJson({ error: error.code === "23505" ? "An author with that address already exists." : "Couldn't add the author." }, error.code === "23505" ? 409 : 500)
  return blogJson({ author: data })
}
