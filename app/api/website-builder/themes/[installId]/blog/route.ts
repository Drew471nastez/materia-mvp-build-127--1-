/**
 * GET   the Blog screen's start: settings, categories, authors, tags, counts,
 *       which page keys the two templates have on this install, and the
 *       site's own address (for View and Preview links).
 * PATCH { settings: Partial<SiteBlogSettings> } → { settings }
 *
 * The owner, or a team member with Website (lib/team/website.ts); every read
 * and write is filtered by the store's creator id (lib/site-blog/admin.ts).
 */
import { allTags, getBlogSettings, listAuthors, listCategories, postCounts, saveBlogSettings } from "@/lib/site-blog/admin"
import { revalidateSiteBlog } from "@/lib/site-blog/cache"
import { blogBody, blogCaller, blogError, blogFailure, blogJson } from "@/lib/site-blog/http"
import { siteLiveBase, templatesFor } from "@/lib/site-blog/install"
import { BODY_LIMITS } from "@/lib/website-builder/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const got = await blogCaller(installId, "read")
  if (!got.ok) return got.response
  const { supabase: db, creatorId } = got.c
  const templates = await templatesFor(db, installId)
  try {
    const [settings, categories, authors, tags, counts, liveBase] = await Promise.all([getBlogSettings(db, creatorId), listCategories(db, creatorId), listAuthors(db, creatorId), allTags(db, creatorId), postCounts(db, creatorId), siteLiveBase(db, creatorId)])
    return blogJson({ settings, categories, authors, tags, counts, templates, liveBase })
  } catch (e) {
    const res = blogFailure(e)
    if (res.status !== 503) return res
    /* Before SQL 353: still say which templates this site has, so the screen can explain. */
    return blogError(503, (await res.clone().json()).error, { sql: 353, templates })
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { installId } = await params
  const got = await blogCaller(installId, "action")
  if (!got.ok) return got.response
  const read = await blogBody(req, BODY_LIMITS.small)
  if (!read.ok) return read.response
  const input = read.body.settings
  if (!input || typeof input !== "object") return blogError(400, "settings")
  try {
    const settings = await saveBlogSettings(got.c.supabase, got.c.creatorId, input as Record<string, unknown>)
    await revalidateSiteBlog(got.c.creatorId).catch(() => undefined)
    return blogJson({ settings })
  } catch (e) {
    return blogFailure(e)
  }
}
