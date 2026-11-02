/**
 * POST → { url }: a link to the post's draft on the site's own address,
 * signed and good for 24 hours (lib/site-blog/preview-token.ts), noindex and
 * never cached where it is drawn.
 */
import { getAdminPost, getBlogSettings } from "@/lib/site-blog/admin"
import { blogCaller, blogError, blogFailure, blogJson } from "@/lib/site-blog/http"
import { siteLiveBase } from "@/lib/site-blog/install"
import { signSitePostPreview } from "@/lib/site-blog/preview-token"
import { postPreviewPath } from "@/lib/site-blog/urls"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string; postId: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { installId, postId } = await params
  const got = await blogCaller(installId, "action", postId)
  if (!got.ok) return got.response
  const { supabase: db, creatorId } = got.c
  try {
    const [post, settings, liveBase] = await Promise.all([getAdminPost(db, creatorId, postId), getBlogSettings(db, creatorId), siteLiveBase(db, creatorId)])
    if (!post) return blogError(404, "Post not found.")
    const token = signSitePostPreview(post.id)
    if (!token) return blogError(503, "Previews are not set up on this server.")
    return blogJson({ url: `${liveBase}${postPreviewPath(settings.handle, token)}` })
  } catch (e) {
    return blogFailure(e)
  }
}
