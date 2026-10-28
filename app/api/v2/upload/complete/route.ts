import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { uploadCreator, uploadStore } from "@/lib/team/uploads"
import { createAdminClient } from "@/lib/supabase/admin"
import { PUBLIC_BUCKET, STORAGE_BUCKET, checkUploadAllowed, updateCreatorStorageUsed } from "@/lib/storage"
import {
  UPLOAD_HEADERS,
  cleanStoredPublicImage,
  ownsStoragePath,
  screenInBackground,
  storedObjectSize,
} from "@/lib/storage/upload-guard"
import { MAX_UPLOAD_BYTES, userMessage } from "@/lib/security/uploads/policy"
import { inspectStoredObject } from "@/lib/security/uploads/stored"
import { afterProductUpload, builtinResult, runAfterResponse } from "@/lib/security/uploads/pipeline"
import { logUploadVerdict } from "@/lib/security/uploads/audit"

export const runtime = "nodejs"
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The HTTP status a refusal goes back with: the page shows the words either way. */
function statusFor(code: string): number {
  if (code === "too_large") return 413
  if (code === "blocked_extension" || code === "not_an_image" || code === "not_a_video" || code === "markup_not_allowed") return 415
  return 400
}

/**
 * POST /api/v2/upload/complete
 *
 * Called after the client has uploaded a file to the signed URL from
 * /prepare. Nothing the page says about the file is believed:
 *
 *   - the asset is found by id AND by the signed in uploader, and its path
 *     and bucket come from the row, not the request;
 *   - the size is storage's own record of the object, not `fileSize`. A
 *     signed upload URL cannot limit what is sent through it, so a page could
 *     declare 1 KB, send 10 GB and stay under quota. Now the real size is
 *     checked against the quota here and a file over it is removed;
 *   - the file is checked by the central check (lib/security/uploads), from
 *     its first bytes and, for a ZIP, its table of contents, each a small
 *     Range read: never the whole file. A refused file is removed and the
 *     creator reads one calm sentence; what was found goes to the security
 *     log;
 *   - a picture for the public bucket is checked as a picture and loses its
 *     location metadata, at the same URL.
 *
 * An accepted product file is final at once: scan_status "clean", engine
 * "builtin". Its SHA-256, and a malware engine's look when one is switched
 * on, happen after this has answered (lib/security/uploads/pipeline.ts), so
 * the creator never waits for either.
 *
 * Request body:
 *   { assetId?, path, bucket, fileSize? }
 *
 * Response:
 *   { success, asset } or, for a picture, { success, publicUrl, path, bucket }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // Authenticate
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: UPLOAD_HEADERS })
    }

    const body = (await request.json().catch(() => null)) as {
      assetId?: unknown
      path?: unknown
      bucket?: unknown
    } | null
    const assetId = typeof body?.assetId === "string" && UUID.test(body.assetId) ? body.assetId : null
    const path = typeof body?.path === "string" ? body.path : ""

    if (!assetId && !path) {
      return NextResponse.json({ error: "Missing required fields: path, bucket" }, { status: 400, headers: UPLOAD_HEADERS })
    }

    /* Whose folder (lib/team/uploads): their own, or the store's for a team member with an area that uploads pictures. Product files stay the owner's. */
    const store = await uploadStore(admin, user.id)
    if (store.kind === "refused" || (store.kind === "store" && assetId)) {
      return NextResponse.json({ error: "You don't have access to this. Ask the store's owner." }, { status: 403, headers: UPLOAD_HEADERS })
    }

    /* The creator and, for a product file, its pending row: read together. */
    const [creatorRow, pendingRead] = await Promise.all([
      uploadCreator(admin, user.id, store, "id"),
      assetId
        ? admin
            .from("digital_assets")
            .select("id, file_name, file_path, file_size, mime_type, storage_bucket, upload_status, scan_status, scan_result, uploaded_by")
            .eq("id", assetId)
            .eq("uploaded_by", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const creator = creatorRow as { id: string } | null
    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403, headers: UPLOAD_HEADERS })
    }

    // A digital file: everything from the row.
    if (assetId) {
      const pending = pendingRead.data

      if (!pending || !pending.file_path) {
        return NextResponse.json({ error: "Upload not found" }, { status: 404, headers: UPLOAD_HEADERS })
      }

      const bucket = pending.storage_bucket || STORAGE_BUCKET
      const realSize = await storedObjectSize(admin, bucket, pending.file_path)
      if (realSize === null) {
        return NextResponse.json({ error: "The upload did not arrive. Try again." }, { status: 400, headers: UPLOAD_HEADERS })
      }

      const discard = async (reason: string, status: number) => {
        await admin.storage.from(bucket).remove([pending.file_path]).catch(() => undefined)
        await admin.from("digital_assets").update({ upload_status: "failed", updated_at: new Date().toISOString() }).eq("id", pending.id)
        return NextResponse.json({ error: reason }, { status, headers: UPLOAD_HEADERS })
      }

      /* The 10 GB per file ceiling, on what arrived rather than what was declared. */
      if (realSize > MAX_UPLOAD_BYTES.product_file) {
        return discard(userMessage("too_large", "product_file"), 413)
      }

      /* Only the bytes beyond what was declared count as new here: the
         declared size is already part of the usage, as a pending upload. */
      if (pending.upload_status === "pending") {
        const extra = realSize - (Number(pending.file_size) || 0)
        if (extra > 0) {
          const quota = await checkUploadAllowed(admin, creator.id, extra)
          if (!quota.allowed) return discard(quota.reason, 403)
        }
      }

      /* The central check, on what storage holds. */
      const verdict = await inspectStoredObject(
        admin,
        { bucket, path: pending.file_path },
        { fileName: pending.file_name || pending.file_path, declaredMime: pending.mime_type, size: realSize, context: "product_file" },
      )
      if (!verdict.ok) {
        runAfterResponse(() =>
          logUploadVerdict(admin, verdict, { context: "product_file", userId: user.id, creatorId: creator.id, assetId: pending.id, bucket, path: pending.file_path, bytes: realSize }),
        )
        await admin.from("digital_assets").update({ scan_status: "blocked", scan_result: builtinResult(verdict) }).eq("id", pending.id)
        return discard(verdict.userMessage, statusFor(verdict.code))
      }

      /* A file the server upload route already stored and checked keeps its verdict. */
      const before = (pending.scan_result ?? null) as Record<string, unknown> | null
      const kept = pending.upload_status === "completed" && pending.scan_status === "clean" && before?.engine === "builtin"
      const { data: asset, error: updateError } = await admin
        .from("digital_assets")
        .update({
          upload_status: "completed",
          scan_status: "clean",
          scan_result: kept ? before : builtinResult(verdict),
          file_size: realSize,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pending.id)
        .eq("uploaded_by", user.id)
        .select("id, file_name, file_path, file_size, mime_type, file_category, scan_status, storage_bucket, uploaded_by")
        .single()

      if (updateError || !asset) {
        console.error("[v2/upload/complete] Asset update error:", updateError)
        return NextResponse.json({ error: "The upload didn't finish. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
      }

      /* Everything that can wait, after the answer: storage used, the log, the hash, an engine. */
      runAfterResponse(async () => {
        await updateCreatorStorageUsed(admin, creator.id)
        await logUploadVerdict(admin, verdict, { context: "product_file", userId: user.id, creatorId: creator.id, assetId: asset.id, bucket, path: asset.file_path, bytes: realSize })
        try {
          await admin.from("upload_events").insert({
            creator_id: user.id,
            file_name: asset.file_name,
            file_size: asset.file_size || 0,
            mime_type: asset.mime_type,
            file_category: asset.file_category,
            storage_bucket: bucket,
            storage_path: asset.file_path,
            security_scan_result: "passed",
            security_threat_type: null,
          })
        } catch { /* non-fatal */ }
        if (!kept) await afterProductUpload(admin, asset, { userId: user.id, deadlineMs: 45_000 })
      })

      return NextResponse.json(
        {
          success: true,
          asset: {
            id: asset.id,
            fileName: asset.file_name,
            filePath: asset.file_path,
            fileSize: asset.file_size,
            mimeType: asset.mime_type,
            category: asset.file_category,
            scanStatus: "clean",
          },
        },
        { headers: UPLOAD_HEADERS },
      )
    }

    /* No asset: a picture in the public bucket, at a path /prepare built
       under this creator's id. Any other bucket or path is refused, so this
       cannot be pointed at somebody else's file. */
    if (body?.bucket !== PUBLIC_BUCKET || !ownsStoragePath(path, [creator.id])) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404, headers: UPLOAD_HEADERS })
    }

    if (path.startsWith(`${creator.id}/digital-products/`)) {
      /* A link page's file (a lead magnet): any kind of file, but never a
         program or a page, since it is served from a public URL. */
      const size = await storedObjectSize(admin, PUBLIC_BUCKET, path)
      if (size === null) return NextResponse.json({ error: "The upload did not arrive. Try again." }, { status: 400, headers: UPLOAD_HEADERS })
      const verdict = await inspectStoredObject(admin, { bucket: PUBLIC_BUCKET, path }, { fileName: path, size, context: "link_page_file" })
      if (!verdict.ok) {
        await admin.storage.from(PUBLIC_BUCKET).remove([path]).catch(() => undefined)
        runAfterResponse(() => logUploadVerdict(admin, verdict, { context: "link_page_file", userId: user.id, creatorId: creator.id, bucket: PUBLIC_BUCKET, path, bytes: size }))
        return NextResponse.json({ error: verdict.userMessage }, { status: statusFor(verdict.code), headers: UPLOAD_HEADERS })
      }
      runAfterResponse(() => logUploadVerdict(admin, verdict, { context: "link_page_file", userId: user.id, creatorId: creator.id, bucket: PUBLIC_BUCKET, path, bytes: size }))
      screenInBackground(admin, { bucket: PUBLIC_BUCKET, path, context: "link_page_file", userId: user.id })
    } else {
      const cleaned = await cleanStoredPublicImage(admin, PUBLIC_BUCKET, path)
      if (!cleaned.ok) {
        return NextResponse.json({ error: cleaned.error }, { status: cleaned.status, headers: UPLOAD_HEADERS })
      }
    }

    const { data: urlData } = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(path)

    return NextResponse.json(
      {
        success: true,
        publicUrl: urlData.publicUrl,
        path,
        bucket: PUBLIC_BUCKET,
      },
      { headers: UPLOAD_HEADERS },
    )
  } catch (error) {
    console.error("[v2/upload/complete] Error:", error)
    return NextResponse.json({ error: "The upload didn't finish. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
