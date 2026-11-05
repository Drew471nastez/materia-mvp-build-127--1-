/**
 * POST { action, publishAt?, version? } → { post }
 *
 *   publish     live now (a date ahead is brought to now)
 *   schedule    live at publishAt (or the draft's date), which must be ahead
 *   update      the draft over the live copy, the date kept
 *   unpublish, archive, unarchive, duplicate
 *
 * Every one that changes what visitors see clears the blog's cache and the
 * site's pages (revalidateSiteBlog). A scheduled post needs nothing more: it
 * goes live by itself (lib/site-blog/public-read.ts).
 */
import { archivePost, duplicatePost, publishPost, unarchivePost, unpublishPost, type Mutated } from "@/lib/site-blog/admin"
import { revalidateSiteBlog } from "@/lib/site-blog/cache"
import { blogBody, blogCaller, blogError, blogFailure, blogJson } from "@/lib/site-blog/http"
import { BODY_LIMITS } from "@/lib/website-builder/request-body"
import { after } from "next/server"
import { announce, blogPostAddresses } from "@/lib/seo/announce"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string; postId: string }> }

const ACTIONS = new Set(["publish", "schedule", "update", "unpublish", "archive", "unarchive", "duplicate"])

export async function POST(req: Request, { params }: Params) {
  const { installId, postId } = await params
  const got = await blogCaller(installId, "action", postId)
  if (!got.ok) return got.response
  const read = await blogBody(req, BODY_LIMITS.small)
  if (!read.ok) return read.response
  const action = read.body.action
  if (typeof action !== "string" || !ACTIONS.has(action)) return blogError(400, "action")
  const publishAt = typeof read.body.publishAt === "string" ? read.body.publishAt : null
  const version = read.body.version === undefined || read.body.version === null ? undefined : Number(read.body.version)
  const { supabase: db, creatorId, userId } = got.c
  try {
    let m: Mutated
    if (action === "publish" || action === "schedule" || action === "update") m = await publishPost(db, creatorId, userId, postId, { publishAt, version, mode: action })
    else if (action === "unpublish") m = await unpublishPost(db, creatorId, userId, postId)
    else if (action === "archive") m = await archivePost(db, creatorId, userId, postId)
    else if (action === "unarchive") m = await unarchivePost(db, creatorId, userId, postId)
    else m = await duplicatePost(db, creatorId, userId, postId)
    const { liveChanged, ...post } = m
    if (liveChanged) await revalidateSiteBlog(creatorId).catch(() => undefined)
    /*
      SEARCH ENGINES TOLD AT ONCE (round 53, IndexNow): a post that went
      live, was updated, or was taken down, and the blog that lists it
      (lib/seo/announce.ts blogPostAddresses). After the answer, never
      failing the action. A post set for later is announced by the sitemap.
    */
    if (liveChanged && action !== "schedule" && action !== "duplicate") after(() => announce(() => blogPostAddresses(creatorId, post.slug)))
    return blogJson({ post })
  } catch (e) {
    return blogFailure(e)
  }
}
