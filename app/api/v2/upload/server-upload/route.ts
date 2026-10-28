import { type NextRequest, NextResponse } from "next/server"
import { productCreator } from "@/lib/team/uploads"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  STORAGE_BUCKET,
  PUBLIC_BUCKET,
  validateFile,
  generateStoragePath,
  checkUploadAllowed,
  getPlanLimits,
  updateCreatorStorageUsed,
} from "@/lib/storage"
import { preparePublicImage } from "@/lib/storage/public-image"
import { UPLOAD_HEADERS, productFileLimit, screenInBackground, uploadRateLimit } from "@/lib/storage/upload-guard"
import { inspectUpload } from "@/lib/security/uploads/inspect"
import { nodeInflateRaw } from "@/lib/security/uploads/zip-inflate"
import { logUploadVerdict } from "@/lib/security/uploads/audit"
import { afterProductUpload, builtinResult, runAfterResponse } from "@/lib/security/uploads/pipeline"
import { sha256Of } from "@/lib/security/uploads/stored"

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
 * The bytes this route already holds go through the central check
 * (lib/security/uploads) before anything is stored, ZIP contents included,
 * and are hashed while they are in memory. A malware engine, when one is
 * switched on, looks after the answer has gone back.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: UPLOAD_HEADERS })
    }

    /* Round 41: the store a team member with Products works in, or the owner's own (lib/team/uploads productCreator). */
    const creator = (await productCreator(admin, user.id, "id, subscription_plan_id")) as { id: string; subscription_plan_id: string | null } | null

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
      const { error } = await admin.storage.from(PUBLIC_BUCKET).upload(filePath, picture.bytes, {
        contentType: picture.mime,
        cacheControl: "31536000",
        upsert: false,
      })
      if (error) {
        console.error("[server-upload] picture upload failed:", error.message)
        return NextResponse.json({ error: "The upload failed. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
      }
      screenInBackground(admin, { bytes: picture.bytes, bucket: PUBLIC_BUCKET, path: filePath, context: "public_image", userId: user.id })
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

    /* The central check on the bytes in hand, before anything is stored. */
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    const verdict = await inspectUpload({
      fileName,
      declaredMime: contentType,
      size: bytes.byteLength,
      head: bytes.subarray(0, 8192),
      tail: { bytes: bytes.subarray(Math.max(0, bytes.byteLength - 70_000)), start: Math.max(0, bytes.byteLength - 70_000) },
      readRange: async (a, b) => bytes.subarray(a, b + 1),
      /* An archive's declared sizes tested, not believed (lib/security/uploads/zip.ts). */
      inflate: nodeInflateRaw,
      context: "product_file",
    })
    if (!verdict.ok) {
      runAfterResponse(() => logUploadVerdict(admin, verdict, { context: "product_file", userId: user.id, creatorId: creator.id, bucket: STORAGE_BUCKET, bytes: bytes.byteLength }))
      return NextResponse.json({ error: verdict.userMessage }, { status: verdict.code === "blocked_extension" ? 415 : 400, headers: UPLOAD_HEADERS })
    }
    const sha256 = sha256Of(bytes)

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

    /* Checked above, hashed above: final now. An engine, if one is on, looks after the answer. */
    const { data: completed } = await admin
      .from("digital_assets")
      .update({
        upload_status: "completed",
        file_size: file.size,
        checksum: sha256,
        scan_status: "clean",
        scan_result: builtinResult(verdict, { sha256 }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", assetId)
      .select("id, file_path, file_name, mime_type, file_size, storage_bucket, scan_status, uploaded_by")
      .single()

    runAfterResponse(async () => {
      await updateCreatorStorageUsed(admin, creator.id)
      await logUploadVerdict(admin, verdict, { context: "product_file", userId: user.id, creatorId: creator.id, assetId, bucket: STORAGE_BUCKET, path: filePath, bytes: file.size, sha256 })
      if (completed) await afterProductUpload(admin, completed, { userId: user.id, knownSha256: sha256, deadlineMs: 60_000 })
    })

    return NextResponse.json(
      { success: true, url: "", path: filePath, bucket: STORAGE_BUCKET, assetId, limits },
      { headers: UPLOAD_HEADERS },
    )
  } catch (error) {
    console.error("[server-upload] Error:", error)
    return NextResponse.json({ error: "The upload failed. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
