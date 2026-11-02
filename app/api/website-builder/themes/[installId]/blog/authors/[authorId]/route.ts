/** PATCH { name?, slug?, role?, bio?, avatarUrl?, links? } → { author }. DELETE → { ok: true } (their posts keep going, with no author). */
import { deleteAuthor, saveAuthor } from "@/lib/site-blog/admin"
import { revalidateSiteBlog } from "@/lib/site-blog/cache"
import { blogBody, blogCaller, blogFailure, blogJson } from "@/lib/site-blog/http"
import { BODY_LIMITS } from "@/lib/website-builder/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string; authorId: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const { installId, authorId } = await params
  const got = await blogCaller(installId, "action", authorId)
  if (!got.ok) return got.response
  const read = await blogBody(req, BODY_LIMITS.small)
  if (!read.ok) return read.response
  try {
    const author = await saveAuthor(got.c.supabase, got.c.creatorId, { ...read.body, id: authorId })
    await revalidateSiteBlog(got.c.creatorId).catch(() => undefined)
    return blogJson({ author })
  } catch (e) {
    return blogFailure(e)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { installId, authorId } = await params
  const got = await blogCaller(installId, "action", authorId)
  if (!got.ok) return got.response
  try {
    await deleteAuthor(got.c.supabase, got.c.creatorId, authorId)
    await revalidateSiteBlog(got.c.creatorId).catch(() => undefined)
    return blogJson({ ok: true })
  } catch (e) {
    return blogFailure(e)
  }
}
