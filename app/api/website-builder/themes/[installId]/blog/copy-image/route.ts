/**
 * POST { url } → { url }: a picture from another site, stored as the
 * store's own in the website builder's bucket
 * (store-builder-images/<owner>/blog/<time>.<ext>), so a pasted post does not
 * hot-link someone else's pictures. The download takes every rule of
 * storelib.com's Copy to Storelib (lib/blog/copy-image.ts: https only, public
 * addresses only, at most three redirects, 10 MB, 10 seconds, a picture by
 * its bytes, location and camera details removed).
 */
import { downloadExternalImage } from "@/lib/blog/copy-image"
import { createAdminClient } from "@/lib/supabase/admin"
import { blogBody, blogCaller, blogError, blogJson } from "@/lib/site-blog/http"
import { BODY_LIMITS } from "@/lib/website-builder/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

const BUCKET = "store-builder-images"

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const got = await blogCaller(installId, "action")
  if (!got.ok) return got.response
  const read = await blogBody(req, BODY_LIMITS.small)
  if (!read.ok) return read.response
  const url = read.body.url
  if (typeof url !== "string" || !url.trim() || url.length > 2048) return blogError(400, "url")
  const picture = await downloadExternalImage(url)
  if ("error" in picture) return blogError(400, picture.error)
  const path = `${got.c.ownerUserId}/blog/${Date.now()}${Math.random().toString(36).slice(2, 6)}.${picture.ext}`
  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET).upload(path, picture.bytes, { contentType: picture.mime, cacheControl: "31536000", upsert: false })
  if (error) {
    console.error("[site-blog] copy image: storage:", String(error.message ?? "").slice(0, 200))
    return blogError(502, "The picture could not be stored. Try again.")
  }
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
  return blogJson({ url: data.publicUrl })
}
