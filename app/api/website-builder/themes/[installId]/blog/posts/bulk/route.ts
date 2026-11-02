/**
 * POST { ids, action, arg? } → { done, failed }. At most 200 posts. The
 * site's blog cache is cleared once, when anything visitors see changed.
 */
import { BULK_ACTIONS, MAX_BULK, bulkPosts, type BulkAction } from "@/lib/site-blog/admin"
import { revalidateSiteBlog } from "@/lib/site-blog/cache"
import { blogBody, blogCaller, blogError, blogFailure, blogJson } from "@/lib/site-blog/http"
import { BODY_LIMITS } from "@/lib/website-builder/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const got = await blogCaller(installId, "action")
  if (!got.ok) return got.response
  const read = await blogBody(req, BODY_LIMITS.small)
  if (!read.ok) return read.response
  const { ids, action, arg } = read.body
  if (!Array.isArray(ids) || !ids.length) return blogError(400, "ids")
  if (ids.length > MAX_BULK) return blogError(400, `At most ${MAX_BULK} posts at once.`)
  if (typeof action !== "string" || !BULK_ACTIONS.includes(action as BulkAction)) return blogError(400, "action")
  try {
    const r = await bulkPosts(got.c.supabase, got.c.creatorId, got.c.userId, ids.map(String), action as BulkAction, typeof arg === "string" ? arg : null)
    if (r.liveChanged) await revalidateSiteBlog(got.c.creatorId).catch(() => undefined)
    return blogJson({ done: r.done, failed: r.failed })
  } catch (e) {
    return blogFailure(e)
  }
}
