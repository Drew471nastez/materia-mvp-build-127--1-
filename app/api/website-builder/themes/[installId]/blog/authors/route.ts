/** GET → { authors }. POST { name, slug?, role?, bio?, avatarUrl?, links? } → { author } */
import { listAuthors, saveAuthor } from "@/lib/site-blog/admin"
import { revalidateSiteBlog } from "@/lib/site-blog/cache"
import { blogBody, blogCaller, blogFailure, blogJson } from "@/lib/site-blog/http"
import { BODY_LIMITS } from "@/lib/website-builder/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const got = await blogCaller(installId, "read")
  if (!got.ok) return got.response
  try {
    return blogJson({ authors: await listAuthors(got.c.supabase, got.c.creatorId) })
  } catch (e) {
    return blogFailure(e)
  }
}

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const got = await blogCaller(installId, "action")
  if (!got.ok) return got.response
  const read = await blogBody(req, BODY_LIMITS.small)
  if (!read.ok) return read.response
  try {
    const { id: _ignored, ...input } = read.body
    const author = await saveAuthor(got.c.supabase, got.c.creatorId, input)
    await revalidateSiteBlog(got.c.creatorId).catch(() => undefined)
    return blogJson({ author })
  } catch (e) {
    return blogFailure(e)
  }
}
