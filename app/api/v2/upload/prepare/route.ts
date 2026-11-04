import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { mayUploadProductFile, uploadCreator, uploadStore } from "@/lib/team/uploads"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  STORAGE_BUCKET,
  PUBLIC_BUCKET,
  validateFile,
  generateStoragePath,
  checkUploadAllowed,
  getPlanLimits,
} from "@/lib/storage"
import {
  UPLOAD_HEADERS,
  productFileLimit,
  tooManyPendingUploads,
  uploadRateLimit,
} from "@/lib/storage/upload-guard"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { sanitizeDisplayName } from "@/lib/security/uploads/filename"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/v2/upload/prepare
 *
 * Prepares an upload by:
 * 1. Authenticating the user and verifying creator status
 * 2. Rate limiting per user, and refusing a ninth upload still in flight
 * 3. Validating the file metadata (type, size, plan limits, files per product)
 * 4. Checking storage quota, counting uploads still pending
 * 5. Creating a pending digital_assets record
 * 6. Generating a signed upload URL for a path the server built
 *
 * Request body:
 *   { fileName, contentType, fileSize, productId?, folder?, assetId? }
 *
 *   `folder` only chooses between the private digital bucket ("digital") and
 *   the public picture bucket (anything else). It never becomes part of a
 *   path. `assetId` is the caller's own pending upload, asked for again after
 *   a signed URL expired: it gets a fresh URL for the same path instead of a
 *   second record and a second copy of the file.
 *
 * Buckets are not created or changed here. This used to create a missing
 * bucket, remove its size limit and call ensure_storage_rls on every upload,
 * six storage API calls per file, and that RPC granted every signed in user
 * read, write and delete on the whole bucket. Buckets and their policies are
 * set once, by supabase/migrations/20260929_upload_safety.sql.
 *
 * Response:
 *   { signedUrl, token, path, publicUrl, bucket, assetId, limits }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // Authenticate
    const who = await routeUser()
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: UPLOAD_HEADERS })
    }

    // Get creator: their own, or for a team member working in a store with an area that uploads pictures, the store's (lib/team/uploads)
    const store = await uploadStore(admin, user.id)
    if (store.kind === "refused") {
      return NextResponse.json({ error: "You don't have access to this. Ask the store's owner." }, { status: 403, headers: UPLOAD_HEADERS })
    }
    const creator = (await uploadCreator(admin, user.id, store, "id, subscription_plan_id")) as { id: string; subscription_plan_id: string | null } | null

    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403, headers: UPLOAD_HEADERS })
    }

    const limited = await uploadRateLimit(user.id, creator.subscription_plan_id)
    if (limited) return limited

    // Parse request
    const body = (await request.json().catch(() => null)) as {
      fileName?: unknown
      contentType?: unknown
      fileSize?: unknown
      productId?: unknown
      folder?: unknown
      assetId?: unknown
    } | null
    const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, 255) : ""
    const contentType = typeof body?.contentType === "string" ? body.contentType : "application/octet-stream"
    const fileSize = Number(body?.fileSize)
    const productId = typeof body?.productId === "string" && UUID.test(body.productId) ? body.productId : null
    const folder = typeof body?.folder === "string" ? body.folder : ""
    const reuseId = typeof body?.assetId === "string" && UUID.test(body.assetId) ? body.assetId : null

    if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Missing required fields: fileName, fileSize" }, { status: 400, headers: UPLOAD_HEADERS })
    }

    const isDigital = folder === "digital" || folder === "digital-products"

    /* A product's file is sold, not shown: the owner, or a member with Products (lib/team/uploads). */
    if (isDigital && !mayUploadProductFile(store)) {
      return NextResponse.json({ error: "Only the store's owner can upload product files." }, { status: 403, headers: UPLOAD_HEADERS })
    }

    /* A private file with no product has no row, so nothing can ever deliver
       it and nothing counts it: it only fills the bucket. The old page flow
       that sends one (a lead magnet on a link page) falls back to
       /api/onepage/signed-upload-url on a 400, which is where its file works. */
    if (isDigital && !productId) {
      return NextResponse.json({ error: "Choose the product this file belongs to." }, { status: 400, headers: UPLOAD_HEADERS })
    }

    /* The same upload again, after its signed URL expired or a PUT failed. */
    if (reuseId && isDigital) {
      const { data: pending } = await admin
        .from("digital_assets")
        .select("id, file_path, storage_bucket, upload_status")
        .eq("id", reuseId)
        .eq("uploaded_by", user.id)
        .maybeSingle()
      if (pending && pending.upload_status === "pending" && pending.file_path) {
        const bucket = pending.storage_bucket || STORAGE_BUCKET
        const { data: again, error: againErr } = await admin.storage
          .from(bucket)
          .createSignedUploadUrl(pending.file_path, { upsert: true })
        if (!againErr && again) {
          const planLimits = getPlanLimits(creator.subscription_plan_id)
          return NextResponse.json(
            {
              signedUrl: again.signedUrl,
              token: again.token,
              path: pending.file_path,
              publicUrl: "",
              bucket,
              tusReady: false,
              assetId: pending.id,
              limits: {
                maxFileSize: planLimits.maxFileSizeBytes,
                maxFilesPerProduct: planLimits.maxFilesPerProduct,
                storageQuota: planLimits.storageQuotaBytes,
              },
            },
            { headers: UPLOAD_HEADERS },
          )
        }
      }
    }

    /* The central check on what can be known before a byte is sent: size,
       name, declared type (lib/security/uploads). The public bucket takes
       pictures only. The bytes are checked again at /complete. */
    const validation = validateFile(fileName, contentType, fileSize, null, isDigital ? "product_file" : "public_image")
    if (!validation.valid) {
      if (validation.code !== "too_large" && validation.code !== "empty") {
        void logSecurityEvent(admin, { event: "upload", outcome: "refused", context: isDigital ? "product_file" : "public_image", code: validation.code, userId: user.id, creatorId: creator.id, fileName: sanitizeDisplayName(fileName), bytes: fileSize, detail: { at: "prepare", declared: contentType.slice(0, 100) } })
      }
      const status = validation.code === "too_large" ? 413 : validation.code === "empty" ? 400 : 415
      return NextResponse.json({ error: validation.reason }, { status, headers: UPLOAD_HEADERS })
    }

    // Check plan limits and quota
    if (isDigital) {
      const quotaCheck = await checkUploadAllowed(admin, creator.id, fileSize)
      if (!quotaCheck.allowed) {
        return NextResponse.json({ error: quotaCheck.reason }, { status: 403, headers: UPLOAD_HEADERS })
      }
      if (await tooManyPendingUploads(admin, user.id)) {
        return NextResponse.json(
          { error: "Several uploads are still running. Let them finish, then add more." },
          { status: 429, headers: UPLOAD_HEADERS },
        )
      }
    }

    // If productId is provided, verify ownership
    if (productId) {
      const { data: product } = await admin
        .from("products")
        .select("id, creator_id")
        .eq("id", productId)
        .single()

      if (!product || product.creator_id !== creator.id) {
        return NextResponse.json({ error: "Product not found or access denied" }, { status: 403, headers: UPLOAD_HEADERS })
      }

      if (isDigital) {
        const full = await productFileLimit(admin, productId, creator.subscription_plan_id)
        if (full) return NextResponse.json({ error: full }, { status: 403, headers: UPLOAD_HEADERS })
      }
    }

    // Determine bucket and path: both chosen here, never by the caller
    const targetBucket = isDigital ? STORAGE_BUCKET : PUBLIC_BUCKET
    const subfolder = isDigital ? "digital-products" : "product-images"
    const filePath = generateStoragePath(creator.id, fileName, subfolder as "digital-products" | "product-images")

    // Create pending asset record for digital products
    let assetId: string | null = null
    if (isDigital && productId) {
      const { data: asset, error: assetError } = await admin
        .from("digital_assets")
        .insert({
          product_id: productId,
          file_name: sanitizeDisplayName(fileName),
          file_path: filePath,
          file_size: fileSize,
          mime_type: validation.resolvedMimeType,
          file_category: validation.fileCategory,
          storage_bucket: targetBucket,
          upload_status: "pending",
          scan_status: "pending_scan",
          uploaded_by: user.id,
        })
        .select("id")
        .single()

      if (assetError) {
        console.error("[v2/upload/prepare] Asset record error:", assetError)
        return NextResponse.json({ error: "Failed to prepare upload record" }, { status: 500, headers: UPLOAD_HEADERS })
      }
      assetId = asset.id
    }

    // Generate signed upload URL
    const { data: signedData, error: signedError } = await admin.storage
      .from(targetBucket)
      .createSignedUploadUrl(filePath)

    if (signedError || !signedData) {
      console.error("[v2/upload/prepare] Signed URL error:", signedError)
      // Clean up pending asset
      if (assetId) {
        await admin.from("digital_assets").delete().eq("id", assetId)
      }
      return NextResponse.json(
        { error: "Could not start the upload. Try again." },
        { status: 500, headers: UPLOAD_HEADERS },
      )
    }

    /* A public URL only means something for the public bucket. A private
       file's is never handed out: it would not work, and it names the path. */
    const publicUrl = isDigital ? "" : admin.storage.from(targetBucket).getPublicUrl(filePath).data.publicUrl

    const planLimits = getPlanLimits(creator.subscription_plan_id)

    return NextResponse.json(
      {
        signedUrl: signedData.signedUrl,
        token: signedData.token,
        path: filePath,
        publicUrl,
        bucket: targetBucket,
        tusReady: false,
        assetId,
        limits: {
          maxFileSize: planLimits.maxFileSizeBytes,
          maxFilesPerProduct: planLimits.maxFilesPerProduct,
          storageQuota: planLimits.storageQuotaBytes,
        },
      },
      { headers: UPLOAD_HEADERS },
    )
  } catch (error) {
    console.error("[v2/upload/prepare] Error:", error)
    return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
