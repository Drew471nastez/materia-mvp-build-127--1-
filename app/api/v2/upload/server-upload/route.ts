import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  STORAGE_BUCKET,
  PUBLIC_BUCKET,
  validateFile,
  generateStoragePath,
  checkUploadAllowed,
  getPlanLimits,
  readBufferHeader,
  scanFile,
  updateCreatorStorageUsed,
} from "@/lib/storage"
import { hasExternalScanner } from "@/lib/storage/antivirus"
import { scanAsset } from "@/lib/storage/scan-gate"
import { preparePublicImage } from "@/lib/storage/public-image"
import { FLAGGED_UPLOAD, UPLOAD_HEADERS, productFileLimit, screenPublicBytes, uploadRateLimit } from "@/lib/storage/upload-guard"
import { isScannerConfigured, scanBytes, type FileScanResult } from "@/lib/security/file-scanner"
import { recordScan } from "@/lib/security/scan-log"

export const runtime = "nodejs"
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A function takes 4.5 MB of body on Vercel; this route is the small file fallback. */
const SERVER_UPLOAD_MAX_BYTES = 25 * 1024 * 1024

/**
 * POST /api/v2/upload/server-upload
 *
 * The fallback when a direct upload to a signed URL fails: the file comes
 * through this function and is stored with the service role.
 *
 * form: file, folder ("digital" or anything else), productId?, assetId?
 *
 * A digital file needs a product the caller owns, is checked against the
 * blocklist and by its magic bytes, counts against quota and the product's
 * file limit, and is scanned before it is marked done. When the page sends
 * the `assetId` /prepare gave it, that record and its path are used, so a
 * failed direct upload followed by this one leaves one file, not two.
 *
 * Anything else goes in the public bucket and must be a picture
 * (lib/storage/public-image.ts): checked by its bytes, at most 50 megapixels,
 * its location metadata removed, stored under a type and extension read from
 * the bytes.
 *
 * With Storelib's malware scanner on (lib/security/file-scanner.ts) the bytes
 * this route already holds are scanned BEFORE anything is stored: an
 * infected file is refused and never lands in a bucket. A product file with
 * no verdict (scanner down or slow) is stored as "pending_scan" and waits
 * for its verdict like any other (lib/storage/scan-gate.ts); a picture with
 * no verdict is stored, as every public picture is (screenPublicBytes).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: UPLOAD_HEADERS })
    }

    const { data: creator } = await admin
      .from("creators")
      .select("id, subscription_plan_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403, headers: UPLOAD_HEADERS })
    }

    const limited = await uploadRateLimit(user.id, creator.subscription_plan_id)
    if (limited) return limited

    if (Number(request.headers.get("content-length") ?? 0) > SERVER_UPLOAD_MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "That file is too large for this upload. Try again." }, { status: 413, headers: UPLOAD_HEADERS })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    const folder = String(formData.get("folder") ?? "digital")
    const productIdRaw = formData.get("productId")
    const productId = typeof productIdRaw === "string" && UUID.test(productIdRaw) ? productIdRaw : null
    const assetIdRaw = formData.get("assetId")
    const reuseId = typeof assetIdRaw === "string" && UUID.test(assetIdRaw) ? assetIdRaw : null

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400, headers: UPLOAD_HEADERS })
    }
    if (file.size > SERVER_UPLOAD_MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large for this upload. Try again." }, { status: 413, headers: UPLOAD_HEADERS })
    }

    const fileName = file.name.slice(0, 255)
    const contentType = file.type || "application/octet-stream"
    const isDigital = folder === "digital" || folder === "digital-products"
    const planLimits = getPlanLimits(creator.subscription_plan_id)
    const limits = {
      maxFileSize: planLimits.maxFileSizeBytes,
      maxFilesPerProduct: planLimits.maxFilesPerProduct,
      storageQuota: planLimits.storageQuotaBytes,
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    /* ---------------------------------------------------------------- */
    /*  A picture for the public bucket                                  */
    /* ---------------------------------------------------------------- */
    if (!isDigital) {
      const picture = preparePublicImage(buffer)
      if (!picture.ok) {
        return NextResponse.json({ error: picture.error }, { status: picture.status, headers: UPLOAD_HEADERS })
      }
      const filePath = generateStoragePath(creator.id, `image.${picture.ext}`, "product-images")
      const screened = await screenPublicBytes(admin, picture.bytes, { source: "public_image", bucket: PUBLIC_BUCKET, path: filePath })
      if (screened.blocked) {
        return NextResponse.json({ error: FLAGGED_UPLOAD }, { status: 400, headers: UPLOAD_HEADERS })
      }
      const { error } = await admin.storage.from(PUBLIC_BUCKET).upload(filePath, picture.bytes, {
        contentType: picture.mime,
        cacheControl: "31536000",
        upsert: false,
      })
      if (error) {
        console.error("[server-upload] picture upload failed:", error.message)
        return NextResponse.json({ error: "The upload failed. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
      }
      const { data: urlData } = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(filePath)
      return NextResponse.json(
        { success: true, url: urlData.publicUrl, path: filePath, bucket: PUBLIC_BUCKET, assetId: null, limits },
        { headers: UPLOAD_HEADERS },
      )
    }

    /* ---------------------------------------------------------------- */
    /*  A digital file for a product                                     */
    /* ---------------------------------------------------------------- */
    if (!productId) {
      return NextResponse.json({ error: "Choose the product this file belongs to." }, { status: 400, headers: UPLOAD_HEADERS })
    }

    const validation = validateFile(fileName, contentType, file.size)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.reason }, { status: 400, headers: UPLOAD_HEADERS })
    }

    // Magic bytes, before anything is stored
    const deepScan = scanFile(fileName, contentType, readBufferHeader(buffer))
    if (!deepScan.safe) {
      return NextResponse.json({ error: deepScan.reason }, { status: 400, headers: UPLOAD_HEADERS })
    }

    /* The whole file, while it is still only in this function's memory. */
    const service = isScannerConfigured()
    const verdict: FileScanResult | null = service ? await scanBytes(buffer, { ref: `server-upload:${productId}`, deadlineMs: 30_000 }) : null
    if (verdict?.status === "infected") {
      await recordScan(admin, { source: "product_file", result: verdict, bucket: STORAGE_BUCKET, action: "refused" })
      return NextResponse.json({ error: FLAGGED_UPLOAD, threat: verdict.threat }, { status: 400, headers: UPLOAD_HEADERS })
    }

    const { data: product } = await admin
      .from("products")
      .select("id, creator_id")
      .eq("id", productId)
      .single()
    if (!product || product.creator_id !== creator.id) {
      return NextResponse.json({ error: "Product not found or access denied" }, { status: 403, headers: UPLOAD_HEADERS })
    }

    /* The record /prepare made for this file, when the page sends it. */
    let assetId: string | null = null
    let filePath: string | null = null
    let alreadyCounted = 0
    if (reuseId) {
      const { data: pending } = await admin
        .from("digital_assets")
        .select("id, file_path, file_size, product_id, upload_status, storage_bucket")
        .eq("id", reuseId)
        .eq("uploaded_by", user.id)
        .maybeSingle()
      if (
        pending &&
        pending.product_id === productId &&
        pending.upload_status === "pending" &&
        (pending.storage_bucket || STORAGE_BUCKET) === STORAGE_BUCKET &&
        pending.file_path
      ) {
        assetId = pending.id
        filePath = pending.file_path
        alreadyCounted = Number(pending.file_size) || 0
      }
    }

    const extra = file.size - alreadyCounted
    if (extra > 0) {
      const quotaCheck = await checkUploadAllowed(admin, creator.id, extra)
      if (!quotaCheck.allowed) {
        return NextResponse.json({ error: quotaCheck.reason }, { status: 403, headers: UPLOAD_HEADERS })
      }
    }

    if (!assetId) {
      const full = await productFileLimit(admin, productId, creator.subscription_plan_id)
      if (full) return NextResponse.json({ error: full }, { status: 403, headers: UPLOAD_HEADERS })

      filePath = generateStoragePath(creator.id, fileName, "digital-products")
      const { data: asset, error: assetError } = await admin
        .from("digital_assets")
        .insert({
          product_id: productId,
          file_name: fileName,
          file_path: filePath,
          file_size: file.size,
          mime_type: validation.resolvedMimeType,
          file_category: validation.fileCategory,
          storage_bucket: STORAGE_BUCKET,
          upload_status: "pending",
          scan_status: "pending_scan",
          uploaded_by: user.id,
        })
        .select("id")
        .single()
      if (assetError || !asset) {
        console.error("[server-upload] Asset record error:", assetError)
        return NextResponse.json({ error: "Failed to prepare upload record" }, { status: 500, headers: UPLOAD_HEADERS })
      }
      assetId = asset.id
    }

    const { error: uploadError } = await admin.storage.from(STORAGE_BUCKET).upload(filePath!, buffer, {
      contentType: validation.resolvedMimeType || "application/octet-stream",
      cacheControl: "31536000",
      /* Only over this upload's own earlier attempt, never over anything else. */
      upsert: Boolean(reuseId && assetId === reuseId),
    })

    if (uploadError) {
      console.warn("[server-upload] upload failed:", uploadError.message)
      if (!reuseId) await admin.from("digital_assets").delete().eq("id", assetId)
      const isMaxSize = /maximum allowed size|payload too large/i.test(uploadError.message)
      return NextResponse.json(
        { error: isMaxSize ? "That file is larger than storage accepts. Try a smaller file." : "The upload failed. Try again." },
        { status: isMaxSize ? 413 : 500, headers: UPLOAD_HEADERS },
      )
    }

    /* The header passed above. With no external engine that is the scan;
       with one, the engine looks at it now. Storelib's scanner already has:
       clean is final, anything else waits as "pending_scan" for a retry. */
    const external = hasExternalScanner()
    const scannedClean = verdict?.status === "clean"
    const { data: completed } = await admin
      .from("digital_assets")
      .update({
        upload_status: "completed",
        file_size: file.size,
        scan_status: scannedClean ? "clean" : external ? "pending_scan" : "clean",
        scan_result: scannedClean
          ? {
              engine: "clamav",
              scanDurationMs: verdict.durationMs,
              scannedAt: new Date().toISOString(),
              sha256: verdict.sha256,
              signatures: verdict.engine?.signatures ?? null,
              engineVersion: verdict.engine?.version ?? null,
            }
          : external
            ? null
            : { engine: "heuristic", scannedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", assetId)
      .select("id, file_path, file_name, mime_type, file_size, storage_bucket, scan_status")
      .single()

    if (verdict) {
      await recordScan(admin, {
        source: "product_file",
        result: verdict,
        bucket: STORAGE_BUCKET,
        path: filePath,
        assetId,
        action: scannedClean ? "kept" : "pending",
      })
    } else if (external && completed) {
      const status = await scanAsset(admin, completed).catch(() => "pending_scan")
      if (status === "infected") {
        return NextResponse.json({ error: "That file was flagged by the virus scan and was removed." }, { status: 400, headers: UPLOAD_HEADERS })
      }
    }

    await updateCreatorStorageUsed(admin, creator.id)

    return NextResponse.json(
      { success: true, url: "", path: filePath, bucket: STORAGE_BUCKET, assetId, limits },
      { headers: UPLOAD_HEADERS },
    )
  } catch (error) {
    console.error("[server-upload] Error:", error)
    return NextResponse.json({ error: "The upload failed. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
