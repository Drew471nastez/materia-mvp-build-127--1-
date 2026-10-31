import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { normalizeBlocks, normalizeMeta } from "@/lib/blog/editor-model"
import { blogJson } from "@/lib/blog/admin-http"

/** One revision whole, for Restore: the editor loads it into the draft and saves it from there. */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string; rid: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const { id, rid } = await context.params
  const { data, error } = await createAdminClient().from("blog_post_revisions").select("id, kind, title, content, meta, created_at").eq("post_id", id).eq("id", rid).maybeSingle()
  if (error || !data) return blogJson({ error: "That revision is gone." }, 404)
  return blogJson({ revision: { id: data.id, kind: data.kind, created_at: data.created_at, meta: normalizeMeta(data.meta), blocks: normalizeBlocks(data.content) } })
}
