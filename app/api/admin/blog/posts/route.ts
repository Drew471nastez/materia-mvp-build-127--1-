import { NextRequest, after } from "next/server"
import { announceAddresses, blogPostAddresses } from "@/lib/seo/announce-pages"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { adminView, blogSchema, createPost, listAdminPosts } from "@/lib/blog/admin-store"
import { blogJson, revalidateBlogPages } from "@/lib/blog/admin-http"
import { isPostLive } from "@/lib/blog/schedule"

/** Every post, light columns: what the list page reads on the server, for a script or a refresh. */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  const { rows, error } = await listAdminPosts(supabase, full)
  if (error) return blogJson({ error }, 500)
  return blogJson(rows)
}

/**
 * A new post, from the editor's first save: { meta, blocks, action }. The
 * blocks and every field are cleaned on the server (lib/blog/editor-model.ts
 * normalizeMeta and normalizeBlocks), whatever the browser sent.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return blogJson({ error: "Invalid request body" }, 400)
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  const made = await createPost(supabase, body, full)
  if (!made.ok) return blogJson({ error: made.error }, made.status)
  const data = made.row

  /* Published at once: tell the engines after the answer (lib/seo/announce-pages.ts). A scheduled post waits for its hour (lib/blog/went-live.ts). */
  if (data?.is_published) revalidateBlogPages(data.slug as string)
  if (data?.is_published) {
    const slug = data.slug as string | null
    if (isPostLive(data)) after(() => announceAddresses(blogPostAddresses(slug)))
  }

  return blogJson({ post: adminView(data), full })
}
