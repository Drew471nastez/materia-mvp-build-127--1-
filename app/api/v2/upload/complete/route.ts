import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PUBLIC_BUCKET, STORAGE_BUCKET, checkUploadAllowed, updateCreatorStorageUsed } from "@/lib/storage"
import {
  UPLOAD_HEADERS,
  cleanStoredPublicImage,
  ownsStoragePath,
  readStoredHead,
  storedObjectSize,
} from "@/lib/storage/upload-guard"
import { MAX_DIGITAL_PRODUCT_FILE_SIZE, scanFile } from "@/lib/storage/security"
import { sniff } from "@/lib/storage/file-signature"
import { scanAsset } from "@/lib/storage/scan-gate"
import { isScannerConfigured, scanStoredObject } from "@/lib/security/file-scanner"
import { recordScan } from "@/lib/security/scan-log"

export const runtime = "nodejs"
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
 *   - the first bytes are read back from storage and scanned, so a renamed
 *     executable is refused even though it never passed through a function;
 *   - a picture for the public bucket is checked as a picture and loses its
 *     location metadata, at the same URL.
 *
 * With Storelib's malware scanner on (lib/security/file-scanner.ts), a
 * product file is NOT scanned here: the answer goes back as soon as the file
 * is in place, with scanStatus "pending_scan", and the editor asks
 * /api/v2/upload/scan for the verdict while the creator carries on (Scanning,
 * then Clean or Blocked on the file's row). Until then no buyer can download
 * it (lib/storage/scan-gate.ts). A link page file, which is public the moment
 * it lands, is scanned here before this answers, and removed if infected.
 *
 * Request body:
 *   { assetId?, path, bucket, fileSize?, checksum? }
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
      checksum?: unknown
    } | null
    const assetId = typeof body?.assetId === "string" && UUID.test(body.assetId) ? body.assetId : null
    const path = typeof body?.path === "string" ? body.path : ""
    const checksum = typeof body?.checksum === "string" && /^[a-f0-9]{64}$/i.test(body.checksum) ? body.checksum : null

    if (!assetId && !path) {
      return NextResponse.json({ error: "Missing required fields: path, bucket" }, { status: 400, headers: UPLOAD_HEADERS })
    }

    // Get creator
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403, headers: UPLOAD_HEADERS })
    }

    // A digital file: everything from the row.
    if (assetId) {
      const { data: pending } = await admin
        .from("digital_assets")
        .select("id, file_name, file_path, file_size, mime_type, storage_bucket, upload_status, scan_status, scan_result")
        .eq("id", assetId)
        .eq("uploaded_by", user.id)
        .maybeSingle()

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
      if (realSize > MAX_DIGITAL_PRODUCT_FILE_SIZE) {
        return discard("That file is over 10 GB, the most one file can be.", 413)
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

      const head = await readStoredHead(admin, bucket, pending.file_path)
      if (head) {
        const verdict = scanFile(pending.file_name || pending.file_path, pending.mime_type || "application/octet-stream", head)
        if (!verdict.safe) return discard(verdict.reason || "That file cannot be uploaded.", 400)
      }

      /* The server upload route scans the bytes it holds before storing them;
         its ClamAV verdict stands rather than being asked for again. */
      const verdictKept =
        pending.upload_status === "completed" &&
        pending.scan_status === "clean" &&
        (pending.scan_result as { engine?: unknown } | null)?.engine === "clamav"
      const updateData: Record<string, unknown> = {
        upload_status: "completed",
        scan_status: verdictKept ? "clean" : "pending_scan",
        file_size: realSize,
        updated_at: new Date().toISOString(),
      }
      if (checksum) updateData.checksum = checksum

      const { data: asset, error: updateError } = await admin
        .from("digital_assets")
        .update(updateData)
        .eq("id", pending.id)
        .eq("uploaded_by", user.id)
        .select("id, file_name, file_path, file_size, mime_type, file_category, checksum, scan_status, storage_bucket")
        .single()

      if (updateError || !asset) {
        console.error("[v2/upload/complete] Asset update error:", updateError)
        return NextResponse.json({ error: "Failed to complete upload" }, { status: 500, headers: UPLOAD_HEADERS })
      }

      /* Scanned now rather than whenever somebody remembers to: by header
         always, and by the configured engine when there is one. Storelib's
         own scanner reads the whole file, which can take a while for a big
         one, so that verdict is asked for by the editor after this answers
         (the header above has already refused a renamed program). */
      const scanStatus = verdictKept
        ? "clean"
        : isScannerConfigured()
          ? "pending_scan"
          : await scanAsset(admin, asset).catch(() => "pending_scan")

      await updateCreatorStorageUsed(admin, creator.id)

      try {
        await admin.from("upload_events").insert({
          creator_id: user.id,
          file_name: asset.file_name,
          file_size: asset.file_size || 0,
          mime_type: asset.mime_type,
          file_category: asset.file_category,
          storage_bucket: bucket,
          storage_path: asset.file_path,
          security_scan_result: scanStatus === "infected" ? "blocked" : "passed",
          security_threat_type: null,
        })
      } catch { /* non-fatal */ }

      if (scanStatus === "infected") {
        return NextResponse.json({ error: "That file was flagged by the virus scan and was removed." }, { status: 400, headers: UPLOAD_HEADERS })
      }

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
            checksum: asset.checksum,
            scanStatus,
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
      const head = await readStoredHead(admin, PUBLIC_BUCKET, path)
      const kind = head ? sniff(head) : null
      const verdict = head ? scanFile(path, "application/octet-stream", head) : { safe: true as const }
      if (!head || !verdict.safe || kind?.family === "markup" || kind?.family === "executable") {
        await admin.storage.from(PUBLIC_BUCKET).remove([path]).catch(() => undefined)
        return NextResponse.json({ error: "That file cannot be shared from a link page." }, { status: 400, headers: UPLOAD_HEADERS })
      }
      /* Public from the moment it lands, so scanned before this answers. With
         no verdict in time (scanner down or slow) it stays: its header passed
         above, and there is no pending state for a public link to wait in. */
      const size = await storedObjectSize(admin, PUBLIC_BUCKET, path)
      const scanned = await scanStoredObject(admin, PUBLIC_BUCKET, path, { size, ref: `link-page:${path}`, deadlineMs: 45_000 })
      const infected = scanned.status === "infected"
      if (infected) await admin.storage.from(PUBLIC_BUCKET).remove([path]).catch(() => undefined)
      await recordScan(admin, { source: "link_page_file", result: scanned, bucket: PUBLIC_BUCKET, path, action: infected ? "removed" : "kept" })
      if (infected) {
        return NextResponse.json({ error: "That file was flagged by the virus scan and was removed." }, { status: 400, headers: UPLOAD_HEADERS })
      }
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
    return NextResponse.json({ error: "Could not finish the upload. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
