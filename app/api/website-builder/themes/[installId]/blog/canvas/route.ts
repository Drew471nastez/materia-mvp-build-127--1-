/**
 * GET ?slug= → { settings, listing, post, sample }: what the builder's
 * canvases draw on the Blog and Post templates. Live and scheduled posts,
 * read fresh; the three sample posts (sample: true) when none is published.
 * Never on a live page.
 */
import { blogCaller, blogFailure, blogJson, sqlMissing } from "@/lib/site-blog/http"
import { readCanvasBlog } from "@/lib/site-blog/public-read"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

export async function GET(req: Request, { params }: Params) {
  const { installId } = await params
  const got = await blogCaller(installId, "read")
  if (!got.ok) return got.response
  const slug = new URL(req.url).searchParams.get("slug")
  try {
    const canvas = await readCanvasBlog(got.c.supabase, got.c.creatorId, slug ? slug.slice(0, 200) : null)
    return canvas ? blogJson(canvas) : sqlMissing()
  } catch (e) {
    return blogFailure(e)
  }
}
