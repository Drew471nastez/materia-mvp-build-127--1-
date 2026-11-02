/** PATCH { name?, slug?, description?, sortOrder?, seoTitle?, seoDescription? } → { category }. DELETE → { ok: true } (its posts keep going, uncategorised). */
import { deleteCategory, saveCategory } from "@/lib/site-blog/admin"
import { revalidateSiteBlog } from "@/lib/site-blog/cache"
import { blogBody, blogCaller, blogFailure, blogJson } from "@/lib/site-blog/http"
import { BODY_LIMITS } from "@/lib/website-builder/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string; categoryId: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const { installId, categoryId } = await params
  const got = await blogCaller(installId, "action", categoryId)
  if (!got.ok) return got.response
  const read = await blogBody(req, BODY_LIMITS.small)
  if (!read.ok) return read.response
  try {
    const category = await saveCategory(got.c.supabase, got.c.creatorId, { ...read.body, id: categoryId })
    await revalidateSiteBlog(got.c.creatorId).catch(() => undefined)
    return blogJson({ category })
  } catch (e) {
    return blogFailure(e)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { installId, categoryId } = await params
  const got = await blogCaller(installId, "action", categoryId)
  if (!got.ok) return got.response
  try {
    await deleteCategory(got.c.supabase, got.c.creatorId, categoryId)
    await revalidateSiteBlog(got.c.creatorId).catch(() => undefined)
    return blogJson({ ok: true })
  } catch (e) {
    return blogFailure(e)
  }
}
