import { type NextRequest, NextResponse } from "next/server"

import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateFile } from "@/lib/storage"
import { storageExtension } from "@/lib/storage/validation"
import { UPLOAD_HEADERS, uploadRateLimit } from "@/lib/storage/upload-guard"
import { fileFits } from "@/lib/storelib-theme/file-kinds"

/*
 * ===========================================================================
 *  A FILE FOR A WEBSITE: WHERE THE THEME EDITOR'S FILE SETTING UPLOADS TO
 * ===========================================================================
 * POST { fileName, contentType, fileSize, accept? } -> a signed upload URL.
 *
 * A `file_picker` setting is an attachment on the creator's own website: a
 * PDF sample, a press kit, a price list. It is public by nature, so it goes
 * where every other public file a creator hands out goes, the bucket a link
 * page's lead magnets live in, and it is held to the same rules: the size,
 * name and declared type checked here (lib/security/uploads, link_page_file),
 * and the bytes checked once they arrive (/api/storage/uploaded). Never a web
 * page, a script or an SVG, whatever the schema's `accept` says.
 *
 * The path is the creator's own folder, a fresh folder per upload, and the
 * file's own name made safe, so the address reads as the file it is
 * ("…/press-kit.pdf") and a download is saved under that name.
 *
 * The file itself never passes through here: the browser sends it straight
 * to storage with the signed URL, so a 40 MB PDF is not held by a function
 * with a 4.5 MB body limit.
 */

const BUCKET = "lead-form-files-v2"

export const runtime = "nodejs"
export const maxDuration = 30

/** The file's own name as a path segment: lowercase words joined by dashes, never empty. */
function safeStem(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  const stem = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return stem || "file"
}

export async function POST(request: NextRequest) {
  try {
    /* The owner, or a team member with Website working in the store (lib/team/website): the file goes in the store's folder. */
    const site = await websiteCaller()
    if (site.error !== null) {
      const message = site.status === 401 ? "Sign in to upload a file." : site.status === 404 ? "Only a seller account can add files to a website." : site.error
      return NextResponse.json({ error: message }, { status: site.status === 404 ? 403 : site.status, headers: UPLOAD_HEADERS })
    }
    const user = site.user
    const admin = createAdminClient()
    const { data: creator } = await admin.from("creators").select("id, subscription_plan_id").eq("id", site.creatorId).single()
    if (!creator) return NextResponse.json({ error: "Only a seller account can add files to a website." }, { status: 403, headers: UPLOAD_HEADERS })

    const limited = await uploadRateLimit(user.id, creator.subscription_plan_id)
    if (limited) return limited

    const body = (await request.json().catch(() => null)) as { fileName?: unknown; contentType?: unknown; fileSize?: unknown; accept?: unknown } | null
    const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, 255) : ""
    const contentType = typeof body?.contentType === "string" && body.contentType ? body.contentType : "application/octet-stream"
    const fileSize = Number(body?.fileSize)
    if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Choose a file to upload." }, { status: 400, headers: UPLOAD_HEADERS })
    }

    /* What the setting asked for, checked again here so a hand-made request cannot slip another kind past the picker. */
    if (!fileFits(fileName, body?.accept)) {
      return NextResponse.json({ error: "That kind of file does not fit this setting." }, { status: 415, headers: UPLOAD_HEADERS })
    }
    const checked = validateFile(fileName, contentType, fileSize, null, "link_page_file")
    if (!checked.valid) {
      const status = checked.code === "too_large" ? 413 : checked.code === "empty" ? 400 : 415
      return NextResponse.json({ error: checked.reason }, { status, headers: UPLOAD_HEADERS })
    }

    const folder = `${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
    const path = `${creator.id}/site-files/${folder}/${safeStem(fileName)}.${storageExtension(fileName)}`
    const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !signed) {
      console.error("[website-builder/files] signed upload url:", error?.message)
      return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ signedUrl: signed.signedUrl, token: signed.token, path, bucket: BUCKET, publicUrl: pub.publicUrl }, { headers: UPLOAD_HEADERS })
  } catch (err) {
    console.error("[website-builder/files]", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
