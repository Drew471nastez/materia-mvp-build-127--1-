/** POST → { post }: the revision back in the editor, as the draft. Visitors see it after Update, so no cache is cleared. */
import { restoreRevision } from "@/lib/site-blog/admin"
import { blogCaller, blogFailure, blogJson } from "@/lib/site-blog/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string; postId: string; revisionId: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { installId, postId, revisionId } = await params
  const got = await blogCaller(installId, "action", postId, revisionId)
  if (!got.ok) return got.response
  try {
    return blogJson({ post: await restoreRevision(got.c.supabase, got.c.creatorId, got.c.userId, postId, revisionId) })
  } catch (e) {
    return blogFailure(e)
  }
}
