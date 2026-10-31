import { NextRequest, after } from "next/server"
import { announceAddresses, blogPostAddresses } from "@/lib/seo/announce-pages"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { blogSchema, readAdminPost, savePost } from "@/lib/blog/admin-store"
import { postVersion } from "@/lib/blog/save-rules"
import { isPostLive } from "@/lib/blog/schedule"
import { blogJson, revalidateBlogPages } from "@/lib/blog/admin-http"

/**
 * Publish or unpublish several posts from the list: { ids, action }. Each is
 * one ordinary save (lib/blog/admin-store.ts savePost) made from the version
 * read just before it, so a post open in an editor is published with what
 * that editor last saved. Publishing a live post that has a draft makes the
 * draft live, as Update would; a post already in the state asked for is left.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const body = await req.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200) : []
  const action = body?.action === "publish" || body?.action === "unpublish" ? (body.action as "publish" | "unpublish") : null
  if (!ids.length || !action) return blogJson({ error: "Pick posts and an action." }, 400)

  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  const done: string[] = []
  const failed: { id: string; error: string }[] = []
  const slugs: Array<string | null> = []
  for (const id of ids) {
    const row = await readAdminPost(supabase, id)
    if (!row) {
      failed.push({ id, error: "Not found" })
      continue
    }
    if ((action === "unpublish" && row.is_published !== true) || (action === "publish" && row.is_published === true && !row.draft_meta && !row.draft_content)) {
      done.push(id)
      continue
    }
    const saved = await savePost(supabase, id, { action: action === "publish" ? (row.is_published ? "update" : "publish") : "unpublish", version: postVersion(row as { draft_saved_at?: string; updated_at?: string }) }, full)
    if (!saved.ok) {
      failed.push({ id, error: saved.error })
      continue
    }
    done.push(id)
    const live = saved.row as { slug?: string; is_published?: boolean; published_at?: string }
    if (isPostLive(live) || isPostLive(row as typeof live)) slugs.push(row.slug as string, live.slug ?? null)
  }
  revalidateBlogPages(...slugs)
  if (slugs.length) after(() => announceAddresses(blogPostAddresses(...slugs)))
  return blogJson({ done, failed })
}
