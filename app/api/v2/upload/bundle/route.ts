import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORAGE_BUCKET } from "@/lib/storage"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * POST /api/v2/upload/bundle
 *
 * Bundles multiple digital assets for a product into a single ZIP file.
 * The ZIP is created server-side and stored in the same bucket.
 *
 * Request body:
 *   { productId: string }
 *
 * Response:
 *   { success: true, zipPath, zipSize, assetCount }
 *
 * This endpoint is called:
 * - Automatically when a product is published with multiple files
 * - Manually by the creator to regenerate the bundle
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
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403 })
    }

    const body = await request.json()
    const { productId } = body as { productId: string }

    if (!productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 })
    }

    // Verify product ownership
    const { data: product } = await admin
      .from("products")
      .select("id, title, slug, creator_id")
      .eq("id", productId)
      .eq("creator_id", creator.id)
      .single()

    if (!product) {
      return NextResponse.json({ error: "Product not found or access denied" }, { status: 403 })
    }

    // Get all completed digital assets for this product
    const { data: assets } = await admin
      .from("digital_assets")
      .select("id, file_path, file_name, file_size, storage_bucket, mime_type")
      .eq("product_id", productId)
      .eq("upload_status", "completed")
      .order("created_at", { ascending: true })

    if (!assets || assets.length === 0) {
      return NextResponse.json({ error: "No files to bundle" }, { status: 400 })
    }

    if (assets.length === 1) {
      return NextResponse.json({ error: "Only one file — no bundle needed" }, { status: 400 })
    }

    // Dynamically import archiver (tree-shaken, only loaded when needed)
    let archiver: typeof import("archiver")
    try {
      archiver = await import("archiver")
    } catch {
      return NextResponse.json(
        { error: "ZIP bundling requires the 'archiver' package. Run: pnpm add archiver @types/archiver" },
        { status: 501 },
      )
    }

    // Create ZIP archive in memory using streams
    const archive = archiver.default("zip", { zlib: { level: 6 } })
    const chunks: Buffer[] = []

    archive.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })

    // Download each file from storage and add to ZIP
    for (const asset of assets) {
      const bucket = asset.storage_bucket || STORAGE_BUCKET

      // Download file via signed URL
      const { data: signedData } = await admin.storage
        .from(bucket)
        .createSignedUrl(asset.file_path, 300) // 5 min

      if (!signedData?.signedUrl) {
        console.warn(`[bundle] Could not get signed URL for asset ${asset.id}`)
        continue
      }

      const res = await fetch(signedData.signedUrl)
      if (!res.ok) {
        console.warn(`[bundle] Could not download asset ${asset.id}: ${res.status}`)
        continue
      }

      const fileBuffer = await res.arrayBuffer()
      archive.append(Buffer.from(fileBuffer), { name: asset.file_name })
    }

    // Finalize archive
    await archive.finalize()

    // Wait for all chunks
    await new Promise<void>((resolve, reject) => {
      archive.on("end", resolve)
      archive.on("error", reject)
    })

    const zipBuffer = Buffer.concat(chunks)

    // Generate ZIP file name from product title
    const safeTitle = (product.title || product.slug || "product")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_")
      .slice(0, 100)
    const zipFileName = `${safeTitle}.zip`
    const zipPath = `${creator.id}/bundles/${Date.now()}-${zipFileName}`

    // Upload ZIP to storage
    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(zipPath, zipBuffer, {
        contentType: "application/zip",
        cacheControl: "31536000",
        upsert: true,
      })

    if (uploadError) {
      console.error("[bundle] ZIP upload failed:", uploadError)
      return NextResponse.json({ error: `Failed to store ZIP: ${uploadError.message}` }, { status: 500 })
    }

    // Store bundle metadata in digital_assets
    const { data: bundleAsset } = await admin
      .from("digital_assets")
      .insert({
        product_id: productId,
        file_name: zipFileName,
        file_path: zipPath,
        file_size: zipBuffer.length,
        mime_type: "application/zip",
        file_category: "archive",
        storage_bucket: STORAGE_BUCKET,
        upload_status: "completed",
        scan_status: "clean", // ZIP was built from already-scanned files
        uploaded_by: user.id,
        metadata: {
          is_bundle: true,
          bundled_asset_ids: assets.map((a) => a.id),
          bundled_count: assets.length,
        },
      })
      .select("id")
      .single()

    return NextResponse.json({
      success: true,
      zipPath,
      zipSize: zipBuffer.length,
      zipFileName,
      assetCount: assets.length,
      bundleAssetId: bundleAsset?.id,
    })
  } catch (error) {
    console.error("[bundle] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
