import { NextRequest } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { blogJson, revalidateBlogPages } from "@/lib/blog/admin-http"
import { copyExternalImage, copyPostImages, type PostCopyReport } from "@/lib/blog/copy-image"
import { readAdminPost } from "@/lib/blog/admin-store"
import { isPostLive } from "@/lib/blog/schedule"

/**
 * COPY TO STORELIB (lib/blog/copy-image.ts). Admin only, like every other
 * /api/admin/blog route.
 *
 *   { url }   one picture from another site, downloaded under every rule in
 *             lib/blog/copy-image-guard.ts and stored with the editor's
 *             uploads: { url } is its new address. The editor puts it in
 *             place and saves as it always does.
 *   { ids }   the list's bulk action: every picture of each post, the posts
 *             one after another, each post's addresses swapped in place:
 *             { results: [{ id, title, copied, failed, none?, error? }] }.
 *             The list sends one post a request, so each answers well inside
 *             the time a request has.
 */
export const maxDuration = 120

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const body = await req.json().catch(() => null)

  if (typeof body?.url === "string") {
    const r = await copyExternalImage(body.url)
    return r.ok ? blogJson({ url: r.url }) : blogJson({ error: r.error }, 422)
  }

  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 10) : []
  if (!ids.length) return blogJson({ error: "Pick a picture or posts." }, 400)
  const supabase = createAdminClient()
  const results: PostCopyReport[] = []
  const slugs: string[] = []
  for (const id of ids) {
    const report = await copyPostImages(supabase, id)
    results.push(report)
    if (report.copied) {
      const row = await readAdminPost(supabase, id)
      if (row && isPostLive(row as { is_published?: boolean; published_at?: string | null })) slugs.push(String(row.slug))
    }
  }
  /* The same page with its pictures from Storelib: drawn again, nothing to tell a search engine. */
  if (slugs.length) revalidateBlogPages(...slugs)
  return blogJson({ results })
}
