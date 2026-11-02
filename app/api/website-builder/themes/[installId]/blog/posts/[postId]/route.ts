/**
 * GET    → { post }
 * PUT    { meta, blocks, version } → { post }, or 409 { error, current } when
 *        another tab saved first. An autosave: it never clears a cache, and a
 *        published post's save goes to its draft only.
 * DELETE → { ok: true }
 */
import { deletePost, getAdminPost, savePostDraft } from "@/lib/site-blog/admin"
import { revalidateSiteBlog } from "@/lib/site-blog/cache"
import { POST_BODY_LIMIT, blogBody, blogCaller, blogError, blogFailure, blogJson } from "@/lib/site-blog/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string; postId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { installId, postId } = await params
  const got = await blogCaller(installId, "read", postId)
  if (!got.ok) return got.response
  try {
    const post = await getAdminPost(got.c.supabase, got.c.creatorId, postId)
    return post ? blogJson({ post }) : blogError(404, "Post not found.")
  } catch (e) {
    return blogFailure(e)
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { installId, postId } = await params
  const got = await blogCaller(installId, "save", postId)
  if (!got.ok) return got.response
  const read = await blogBody(req, POST_BODY_LIMIT)
  if (!read.ok) return read.response
  try {
    const r = await savePostDraft(got.c.supabase, got.c.creatorId, got.c.userId, postId, { meta: read.body.meta, blocks: read.body.blocks, version: Number(read.body.version) })
    if (r.ok) return blogJson({ post: r.post })
    if (r.status === 409) return blogError(409, "This post was changed somewhere else.", { current: r.current })
    return blogError(r.status, r.error)
  } catch (e) {
    return blogFailure(e)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { installId, postId } = await params
  const got = await blogCaller(installId, "action", postId)
  if (!got.ok) return got.response
  try {
    const r = await deletePost(got.c.supabase, got.c.creatorId, got.c.userId, postId)
    if (r.liveChanged) await revalidateSiteBlog(got.c.creatorId).catch(() => undefined)
    return blogJson({ ok: true })
  } catch (e) {
    return blogFailure(e)
  }
}
