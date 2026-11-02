/** GET → { revisions: { id, kind, createdAt, title }[] }, newest first, at most 50. */
import { listRevisions } from "@/lib/site-blog/admin"
import { blogCaller, blogFailure, blogJson } from "@/lib/site-blog/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string; postId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { installId, postId } = await params
  const got = await blogCaller(installId, "read", postId)
  if (!got.ok) return got.response
  try {
    return blogJson({ revisions: await listRevisions(got.c.supabase, got.c.creatorId, postId) })
  } catch (e) {
    return blogFailure(e)
  }
}
