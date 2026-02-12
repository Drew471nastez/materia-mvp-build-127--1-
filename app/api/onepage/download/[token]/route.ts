import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateSignedDownloadUrl, logDownloadEvent } from "@/lib/storage"
import { headers } from "next/headers"

// GET - Download digital product files via secure token
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const adminSupabase = createAdminClient()
    const headersList = await headers()

    if (!token) {
      return NextResponse.json({ error: "Download token required" }, { status: 400 })
    }

    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    const userAgent = headersList.get("user-agent") || null

    // Find the download record
    const { data: downloadRecord, error: recordError } = await adminSupabase
      .from("subscriber_digital_products")
      .select("*")
      .eq("download_token", token)
      .single()

    if (recordError || !downloadRecord) {
      return NextResponse.json({ error: "Invalid or expired download link" }, { status: 404 })
    }

    // Check expiration
    if (new Date(downloadRecord.expires_at) < new Date()) {
      return NextResponse.json({ error: "Download link has expired" }, { status: 410 })
    }

    // Check download limit
    if (downloadRecord.download_count >= downloadRecord.max_downloads) {
      return NextResponse.json({ error: "Download limit reached" }, { status: 403 })
    }

    // Get product and digital assets
    const { data: product, error: productError } = await adminSupabase
      .from("products")
      .select("id, title, slug")
      .eq("id", downloadRecord.product_id)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Get digital assets
    const { data: assets, error: assetsError } = await adminSupabase
      .from("digital_assets")
      .select("id, file_path, file_name, storage_bucket")
      .eq("product_id", downloadRecord.product_id)

    if (assetsError || !assets || assets.length === 0) {
      return NextResponse.json({ error: "No download files available" }, { status: 404 })
    }

    // Update download count
    await adminSupabase
      .from("subscriber_digital_products")
      .update({
        download_count: downloadRecord.download_count + 1,
        last_downloaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", downloadRecord.id)

    // Generate signed URLs for all assets (tries multiple buckets)
    const downloadLinks = await Promise.all(
      assets.map(async (asset) => {
        const signed = await generateSignedDownloadUrl(adminSupabase, asset.file_path)

        // Log download event
        await logDownloadEvent(adminSupabase, {
          assetId: asset.id,
          downloadToken: token,
          ip,
          userAgent,
        })

        return {
          id: asset.id,
          fileName: asset.file_name,
          downloadUrl: signed?.url || asset.file_path,
        }
      })
    )

    // If single file, redirect directly
    if (downloadLinks.length === 1) {
      return NextResponse.redirect(downloadLinks[0].downloadUrl)
    }

    // Multiple files, return JSON with all links
    return NextResponse.json({
      success: true,
      productTitle: product.title,
      files: downloadLinks,
      remainingDownloads: downloadRecord.max_downloads - downloadRecord.download_count - 1,
    })
  } catch (error) {
    console.error("Download error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
