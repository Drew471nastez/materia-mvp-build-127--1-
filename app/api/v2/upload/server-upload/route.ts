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
} from "@/lib/storage"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * POST /api/v2/upload/server-upload
 *
 * Server-side file upload that bypasses Supabase Storage's client-side TUS
 * protocol and its associated file size limit checks. The file is received
 * as multipart/form-data and uploaded to Supabase Storage via the admin
 * client using a standard POST (not TUS).
 *
 * This endpoint exists because Supabase Storage enforces a global upload
 * size limit on TUS uploads that cannot be changed via SQL — it can only
 * be changed in the Supabase Dashboard.  By uploading through the server
 * with the service_role key, we bypass that restriction.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // Authenticate
    const {
      data: { user },
    } = await supabase.auth.getUser()
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

    // Parse multipart form
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const folder = (formData.get("folder") as string) || "digital"
    const productId = formData.get("productId") as string | null

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const fileName = file.name
    const contentType = file.type || "application/octet-stream"
    const fileSize = file.size

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
        console.error("[server-upload] Asset record error:", assetError)
        // Continue without asset record — upload is more important
      } else {
        assetId = asset.id
      }
    }

    // Convert File to Buffer (forces standard upload, not TUS)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload via admin client (service_role bypasses RLS)
    // Using Buffer ensures the SDK uses standard POST, not TUS resumable
    let uploadError: Error | null = null

    // Method 1: Admin client standard upload
    const { error: sdkError } = await admin.storage
      .from(targetBucket)
      .upload(filePath, buffer, {
        contentType,
        cacheControl: "31536000",
        upsert: true,
        duplex: "half",
      } as Parameters<typeof admin.storage.from<string>["upload"]>[2])

    if (sdkError) {
      console.warn("[server-upload] SDK upload failed:", sdkError.message)
      uploadError = new Error(sdkError.message)

      // Method 2: Direct REST API upload (bypasses SDK entirely)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (supabaseUrl && serviceRoleKey) {
        try {
          const restRes = await fetch(
            `${supabaseUrl}/storage/v1/object/${targetBucket}/${filePath}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${serviceRoleKey}`,
                apikey: serviceRoleKey,
                "Content-Type": contentType,
                "Cache-Control": "max-age=31536000",
                "x-upsert": "true",
              },
              body: buffer,
            },
          )

          if (restRes.ok) {
            uploadError = null
          } else {
            const restBody = await restRes.json().catch(() => ({}))
            const msg = restBody.error || restBody.message || restBody.statusCode || `HTTP ${restRes.status}`
            console.error("[server-upload] REST upload failed:", msg)
            uploadError = new Error(String(msg))
          }
        } catch (restErr) {
          console.error("[server-upload] REST upload error:", restErr)
          uploadError = restErr instanceof Error ? restErr : new Error(String(restErr))
        }
      }
    }

    if (uploadError) {
      // Clean up pending asset
      if (assetId) {
        await admin.from("digital_assets").delete().eq("id", assetId).catch(() => {})
      }

      // Provide actionable error message
      const isMaxSize = uploadError.message.includes("maximum allowed size") || uploadError.message.includes("Payload too large")
      if (isMaxSize) {
        return NextResponse.json(
          {
            error:
              "File exceeds the Supabase project upload limit. Go to Supabase Dashboard → Storage → Configuration and increase the 'Upload file size limit' (Pro plan required for files > 50MB).",
          },
          { status: 413 },
        )
      }

      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    // Mark asset as completed
    if (assetId) {
      await admin
        .from("digital_assets")
        .update({ upload_status: "completed", updated_at: new Date().toISOString() })
        .eq("id", assetId)
        .catch(() => {})
    }

    // Get public URL
    const { data: urlData } = admin.storage.from(targetBucket).getPublicUrl(filePath)
    const planLimits = getPlanLimits(creator.subscription_plan_id)

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: filePath,
      bucket: targetBucket,
      assetId,
      limits: {
        maxFileSize: planLimits.maxFileSizeBytes,
        maxFilesPerProduct: planLimits.maxFilesPerProduct,
        storageQuota: planLimits.storageQuotaBytes,
      },
    })
  } catch (error) {
    console.error("[server-upload] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
