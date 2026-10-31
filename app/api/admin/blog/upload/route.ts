import { NextRequest, NextResponse } from "next/server"
import { adminFailure } from "@/lib/admin/gate"
import { storeBlogPicture } from "@/lib/blog/image-store"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { preparePublicImage } from "@/lib/storage/public-image"
import { UPLOAD_HEADERS } from "@/lib/storage/upload-guard"

/**
 * A picture for a blog post. Admin only, and still checked like any other
 * public picture (lib/storage/public-image.ts): an admin session is exactly
 * what a stolen cookie gives somebody, and the old route stored any file at
 * all, with the type and extension the browser claimed, under a public URL.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const picture = preparePublicImage(await file.arrayBuffer())
  if (!picture.ok) return NextResponse.json({ error: picture.error }, { status: picture.status, headers: UPLOAD_HEADERS })

  const stored = await storeBlogPicture(picture)
  if (!stored.ok) return adminFailure("blog upload", stored.error)

  return NextResponse.json({ url: stored.url }, { headers: UPLOAD_HEADERS })
}
