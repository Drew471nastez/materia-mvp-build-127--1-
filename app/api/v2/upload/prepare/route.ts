import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  STORAGE_BUCKET,
  PUBLIC_BUCKET,
  BUCKET_FILE_SIZE_LIMIT,
  validateFile,
  generateStoragePath,
  checkUploadAllowed,
  getPlanLimits,
} from "@/lib/storage"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Ensure the target storage bucket exists and has a file_size_limit large enough
 * for the requested upload.  Tries REST API first (no RPC dependency), then JS
 * client, then RPC function.  Verifies the result before returning.
 */
async function ensureBucket(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  isPublic: boolean,
  requiredSize: number,
): Promise<{ ok: boolean; currentLimit: number | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Helper to read current limit
  const getLimit = async (): Promise<number | null> => {
    if (!supabaseUrl || !serviceRoleKey) return null
    try {
      const r = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
      })
      if (!r.ok) return null
      const b = await r.json()
      return b?.file_size_limit ?? null
    } catch {
      return null
    }
  }

  // Already sufficient?
  const existing = await getLimit()
  if (existing !== null && existing >= requiredSize) {
    return { ok: true, currentLimit: existing }
  }

  // Method 1: REST API (no id/name in PUT body)
  if (supabaseUrl && serviceRoleKey) {
    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    }
    try {
      const r = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ public: isPublic, file_size_limit: BUCKET_FILE_SIZE_LIMIT, allowed_mime_types: null }),
      })
      if (!r.ok && (r.status === 404 || r.status === 400)) {
        await fetch(`${supabaseUrl}/storage/v1/bucket`, {
          method: "POST",
          headers,
          body: JSON.stringify({ id: bucket, name: bucket, public: isPublic, file_size_limit: BUCKET_FILE_SIZE_LIMIT, allowed_mime_types: null }),
        }).catch(() => {})
        await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ public: isPublic, file_size_limit: BUCKET_FILE_SIZE_LIMIT, allowed_mime_types: null }),
        }).catch(() => {})
      }
    } catch { /* continue */ }
    const afterRest = await getLimit()
    if (afterRest !== null && afterRest >= requiredSize) return { ok: true, currentLimit: afterRest }
  }

  // Method 2: JS admin client
  try {
    await admin.storage.updateBucket(bucket, { public: isPublic, fileSizeLimit: BUCKET_FILE_SIZE_LIMIT })
  } catch {
    try {
      await admin.storage.createBucket(bucket, { public: isPublic, fileSizeLimit: BUCKET_FILE_SIZE_LIMIT })
    } catch { /* bucket exists */ }
  }
  const afterJs = await getLimit()
  if (afterJs !== null && afterJs >= requiredSize) return { ok: true, currentLimit: afterJs }

  // Method 3: RPC function
  try {
    await admin.rpc("fix_storage_bucket_limit", { p_bucket_id: bucket, p_file_size_limit: BUCKET_FILE_SIZE_LIMIT })
  } catch { /* RPC may not exist */ }

  const final = await getLimit()
  return { ok: final !== null && final >= requiredSize, currentLimit: final }
}

/**
 * POST /api/v2/upload/prepare
 *
 * Prepares an upload by:
 * 1. Authenticating the user and verifying creator status
 * 2. Validating the file metadata (type, size, plan limits)
 * 3. Checking storage quota
 * 4. Creating a pending digital_assets record
 * 5. Generating a signed upload URL
 *
 * Request body:
 *   { fileName, contentType, fileSize, productId?, folder? }
 *
 * Response:
 *   { signedUrl, token, path, publicUrl, bucket, assetId, limits }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // Authenticate
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator
    const { data: creator } = await admin
      .from("creators")
      .select("id, subscription_plan_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403 })
    }

    // Parse request
    const body = await request.json()
    const { fileName, contentType, fileSize, productId, folder } = body as {
      fileName: string
      contentType: string
      fileSize: number
      productId?: string
      folder?: string
    }

    if (!fileName || !contentType || !fileSize) {
      return NextResponse.json({ error: "Missing required fields: fileName, contentType, fileSize" }, { status: 400 })
    }

    // Validate file
    const validation = validateFile(fileName, contentType, fileSize)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.reason }, { status: 400 })
    }

    // Check plan limits and quota
    const quotaCheck = await checkUploadAllowed(admin, creator.id, fileSize)
    if (!quotaCheck.allowed) {
      return NextResponse.json({ error: quotaCheck.reason }, { status: 403 })
    }

    // If productId is provided, verify ownership
    if (productId) {
      const { data: product } = await admin
        .from("products")
        .select("id, creator_id")
        .eq("id", productId)
        .single()

      if (!product || product.creator_id !== creator.id) {
        return NextResponse.json({ error: "Product not found or access denied" }, { status: 403 })
      }
    }

    // Determine bucket and path
    const isDigital = folder === "digital" || folder === "digital-products"
    const targetBucket = isDigital ? STORAGE_BUCKET : PUBLIC_BUCKET
    const subfolder = isDigital ? "digital-products" : "product-images"
    const filePath = generateStoragePath(creator.id, fileName, subfolder as "digital-products" | "product-images")

    // Ensure bucket exists and limit is sufficient for this file
    const bucketCheck = await ensureBucket(admin, targetBucket, !isDigital, fileSize)

    // Auto-create RLS policies so browser TUS uploads work (idempotent)
    let tusReady = false
    try {
      await admin.rpc("ensure_storage_rls", { p_bucket_id: targetBucket })
      tusReady = true
    } catch (rlsErr) {
      console.warn("[v2/upload/prepare] ensure_storage_rls RPC not available:", rlsErr)
    }

    if (!bucketCheck.ok) {
      const sql = `UPDATE storage.buckets SET file_size_limit = ${BUCKET_FILE_SIZE_LIMIT}, public = true, allowed_mime_types = NULL WHERE id = '${targetBucket}';`
      console.error(`[v2/upload/prepare] Bucket limit too low: ${bucketCheck.currentLimit} < ${fileSize}. SQL: ${sql}`)
      return NextResponse.json(
        { error: `Storage bucket limit (${bucketCheck.currentLimit || "unknown"} bytes) is too small for this ${fileSize} byte file. Run this SQL in your Supabase SQL Editor: ${sql}` },
        { status: 507 },
      )
    }

    // Create pending asset record for digital products
    let assetId: string | null = null
    if (isDigital && productId) {
      const { data: asset, error: assetError } = await admin
        .from("digital_assets")
        .insert({
          product_id: productId,
          file_name: fileName,
          file_path: filePath,
          file_size: fileSize,
          mime_type: validation.resolvedMimeType,
          file_category: validation.fileCategory,
          storage_bucket: targetBucket,
          upload_status: "pending",
          uploaded_by: user.id,
        })
        .select("id")
        .single()

      if (assetError) {
        console.error("[v2/upload/prepare] Asset record error:", assetError)
        return NextResponse.json({ error: "Failed to prepare upload record" }, { status: 500 })
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
        { error: `Failed to create upload URL: ${signedError?.message || "Unknown error"}` },
        { status: 500 },
      )
    }

    // Get public URL (for public bucket items like thumbnails)
    const { data: urlData } = admin.storage.from(targetBucket).getPublicUrl(filePath)

    const planLimits = getPlanLimits(creator.subscription_plan_id)

    return NextResponse.json({
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: filePath,
      publicUrl: urlData.publicUrl,
      bucket: targetBucket,
      tusReady,
      assetId,
      limits: {
        maxFileSize: planLimits.maxFileSizeBytes,
        maxFilesPerProduct: planLimits.maxFilesPerProduct,
        storageQuota: planLimits.storageQuotaBytes,
      },
    })
  } catch (error) {
    console.error("[v2/upload/prepare] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
