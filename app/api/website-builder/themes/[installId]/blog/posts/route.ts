/**
 * GET  ?q&status&category&tag&author&sort&page&perPage → { posts, total, counts }
 * POST { meta?, blocks? } → { post }: a new draft. Nothing public changes.
 */
import { createPost, listAdminPosts, type AdminPostQuery } from "@/lib/site-blog/admin"
import { POST_BODY_LIMIT, blogBody, blogCaller, blogFailure, blogJson } from "@/lib/site-blog/http"
import type { SitePostMeta } from "@/lib/site-blog/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

const STATUSES = new Set(["all", "draft", "scheduled", "published", "archived"])
const SORTS = new Set(["updated", "published", "title"])

export async function GET(req: Request, { params }: Params) {
  const { installId } = await params
  const got = await blogCaller(installId, "read")
  if (!got.ok) return got.response
  const sp = new URL(req.url).searchParams
  const status = sp.get("status") ?? "all"
  const sort = sp.get("sort") ?? "updated"
  const q: AdminPostQuery = {
    search: (sp.get("q") ?? "").slice(0, 200),
    status: (STATUSES.has(status) ? status : "all") as AdminPostQuery["status"],
    categoryId: sp.get("category") ?? undefined,
    tag: sp.get("tag") ?? undefined,
    authorId: sp.get("author") ?? undefined,
    sort: (SORTS.has(sort) ? sort : "updated") as AdminPostQuery["sort"],
    page: Number(sp.get("page")) || 1,
    perPage: Number(sp.get("perPage")) || 50,
  }
  try {
    return blogJson(await listAdminPosts(got.c.supabase, got.c.creatorId, q))
  } catch (e) {
    return blogFailure(e)
  }
}

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const got = await blogCaller(installId, "action")
  if (!got.ok) return got.response
  const read = await blogBody(req, POST_BODY_LIMIT)
  if (!read.ok) return read.response
  const meta = read.body.meta && typeof read.body.meta === "object" ? (read.body.meta as Partial<SitePostMeta>) : {}
  try {
    const post = await createPost(got.c.supabase, got.c.creatorId, got.c.userId, { meta, blocks: read.body.blocks ?? [] })
    return blogJson({ post })
  } catch (e) {
    return blogFailure(e)
  }
}
