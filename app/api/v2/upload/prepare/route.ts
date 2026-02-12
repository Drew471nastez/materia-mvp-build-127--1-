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
 * Ensure the target storage bucket exists with NO bucket-level file size limit.
 * Setting file_size_limit to 0/null disables the bucket check in Supabase Storage,
 * letting only the project-level global limit apply (which is much higher).
 *
 * Tries REST API first, then JS client, then RPC, then direct SQL RPC.
 */
async function ensureBucket(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  isPublic: boolean,
  _requiredSize: number,
): Promise<{ ok: boolean; currentLimit: number | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Helper to read current bucket config
  const getBucketInfo = async (): Promise<{ exists: boolean; limit: number | null }> => {
    if (!supabaseUrl || !serviceRoleKey) return { exists: false, limit: null }
    try {
      const r = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
      })
      if (!r.ok) return { exists: false, limit: null }
      const b = await r.json()
      return { exists: true, limit: b?.file_size_limit ?? null }
    } catch {
      return { exists: false, limit: null }
    }
  }

  const info = await getBucketInfo()

  // null/0 = no bucket-level limit = OK (only global limit applies)
  if (info.exists && (info.limit === null || info.limit === 0)) {
    return { ok: true, currentLimit: null }
  }

  // Bucket exists but has a restrictive limit — remove it (set to 0)
  // Or bucket doesn't exist — create it with no limit
  if (supabaseUrl && serviceRoleKey) {
    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    }

    // Method 1: REST API — set file_size_limit to 0 (disables bucket-level check)
    try {
      if (info.exists) {
        await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ public: isPublic, file_size_limit: 0, allowed_mime_types: null }),
        })
      } else {
        await fetch(`${supabaseUrl}/storage/v1/bucket`, {
          method: "POST",
          headers,
          body: JSON.stringify({ id: bucket, name: bucket, public: isPublic, file_size_limit: 0, allowed_mime_types: null }),
        })
      }
    } catch { /* continue */ }

    const after1 = await getBucketInfo()
    if (after1.exists && (after1.limit === null || after1.limit === 0)) {
      return { ok: true, currentLimit: null }
    }
  }

  // Method 2: JS admin client — set fileSizeLimit to 0
  try {
    if (info.exists) {
      await admin.storage.updateBucket(bucket, { public: isPublic, fileSizeLimit: 0 as unknown as string })
    } else {
      await admin.storage.createBucket(bucket, { public: isPublic, fileSizeLimit: 0 as unknown as string })
    }
  } catch { /* continue */ }
  const after2 = await getBucketInfo()
  if (after2.exists && (after2.limit === null || after2.limit === 0)) {
    return { ok: true, currentLimit: null }
  }

  // Method 3: RPC — direct SQL to NULL out the limit
  try {
    await admin.rpc("fix_storage_bucket_limit", { p_bucket_id: bucket, p_file_size_limit: 0 })
  } catch { /* RPC may not exist */ }

  const after3 = await getBucketInfo()
  if (after3.exists && (after3.limit === null || after3.limit === 0)) {
    return { ok: true, currentLimit: null }
  }

  // If we still have a limit, report the current value
  return { ok: false, currentLimit: after3.limit }
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
      const sql = `UPDATE storage.buckets SET file_size_limit = NULL WHERE id = '${targetBucket}';`
      console.error(`[v2/upload/prepare] Bucket limit still set: ${bucketCheck.currentLimit}. Run SQL: ${sql}`)
      return NextResponse.json(
        { error: `Storage bucket file_size_limit is ${bucketCheck.currentLimit} bytes — run this SQL in Supabase SQL Editor to remove it: ${sql}` },
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
