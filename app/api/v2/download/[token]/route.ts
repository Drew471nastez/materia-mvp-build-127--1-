import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  generateSignedDownloadUrl,
  logDownloadEvent,
  validateDownloadToken,
  checkDownloadRateLimit,
} from "@/lib/storage"
import { isAssetSafeToDownload } from "@/lib/storage/antivirus"
import { headers } from "next/headers"

export const runtime = "nodejs"

/**
 * GET /api/v2/download/[token]
 *
 * Secure download endpoint. Supports two modes:
 *
 * 1. Token-based (lead magnet / free product):
 *    Uses the subscriber_digital_products download token.
 *    Validates expiry, download count, and generates signed URLs.
 *
 * 2. Asset-based (purchased products):
 *    Query params: ?asset=<assetId>&receipt=<receiptToken>
 *    Verifies access via receipt token, order, entitlement, or creator status.
 *
 * Returns signed download URLs (5-minute expiry) for all product assets,
 * or redirects directly for single-file products.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    const admin = createAdminClient()
    const headersList = await headers()

    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    const userAgent = headersList.get("user-agent") || null

    if (!token) {
      return NextResponse.json({ error: "Download token required" }, { status: 400 })
    }

    // Check if this is an asset-based download (receipt mode)
    const { searchParams } = new URL(request.url)
    const assetId = searchParams.get("asset")
    const receiptToken = searchParams.get("receipt")

    if (assetId) {
      return handleAssetDownload(request, admin, assetId, receiptToken || token, ip, userAgent)
    }

    // Token-based download (lead magnet / subscriber_digital_products)
    const validation = await validateDownloadToken(admin, token)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.reason }, { status: validation.status })
    }

    const { record } = validation

    // Get product info (including creator for rate limiting)
    const { data: product } = await admin
      .from("products")
      .select("id, title, slug, creator_id")
      .eq("id", record.product_id)
      .single()

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Rate limit check (per creator's plan)
    if (product.creator_id) {
      const rateLimitOk = await checkDownloadRateLimit(admin, product.creator_id)
      if (!rateLimitOk) {
        return NextResponse.json({ error: "Download rate limit reached. Please try again later." }, { status: 429 })
      }
    }

    // Get digital assets for this product
    const { data: assets } = await admin
      .from("digital_assets")
      .select("id, file_path, file_name, file_size, storage_bucket, mime_type, scan_status")
      .eq("product_id", record.product_id)
      .eq("upload_status", "completed")

    if (!assets || assets.length === 0) {
      return NextResponse.json({ error: "No download files available" }, { status: 404 })
    }

    // Check scan safety for all assets before allowing download
    for (const asset of assets) {
      const safetyCheck = await isAssetSafeToDownload(admin, asset.id)
      if (!safetyCheck.safe) {
        return NextResponse.json(
          { error: safetyCheck.reason || "File is not available for download." },
          { status: 403 },
        )
      }
    }

    // Increment download count
    await admin
      .from("subscriber_digital_products")
      .update({
        download_count: record.download_count + 1,
        last_downloaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id)

    // Generate signed URLs for all assets
    const downloadLinks = await Promise.all(
      assets.map(async (asset) => {
        const signed = await generateSignedDownloadUrl(admin, asset.file_path)

        // Log download event
        await logDownloadEvent(admin, {
          assetId: asset.id,
          downloadToken: token,
          ip,
          userAgent,
        })

        return {
          id: asset.id,
          fileName: asset.file_name,
          fileSize: asset.file_size,
          mimeType: asset.mime_type,
          downloadUrl: signed?.url || asset.file_path,
        }
      }),
    )

    // Single file: redirect directly
    if (downloadLinks.length === 1) {
      return NextResponse.redirect(downloadLinks[0].downloadUrl)
    }

    // Multiple files: return JSON with all links
    return NextResponse.json({
      success: true,
      productTitle: product.title,
      files: downloadLinks,
      remainingDownloads: record.max_downloads - record.download_count - 1,
    })
  } catch (error) {
    console.error("[v2/download] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * Handle asset-based downloads (purchased products with receipt tokens).
 */
async function handleAssetDownload(
  request: NextRequest,
  admin: ReturnType<typeof createAdminClient>,
  assetId: string,
  receiptOrToken: string,
  ip: string | null,
  userAgent: string | null,
) {
  // Get the asset
  const { data: asset } = await admin
    .from("digital_assets")
    .select("*, product:products(id, creator_id, title)")
    .eq("id", assetId)
    .single()

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 })
  }

  let hasAccess = false
  let orderId: string | null = null
  let entitlementId: string | null = null

  // Check via receipt token
  const { data: order } = await admin
    .from("orders")
    .select("id, product_id, buyer_id, variant_id")
    .eq("receipt_token", receiptOrToken)
    .single()

  if (order && order.product_id === asset.product_id) {
    orderId = order.id
    hasAccess = true

    // Variant access check
    if (order.variant_id) {
      const { data: variantFile } = await admin
        .from("product_variant_files")
        .select("id")
        .eq("variant_id", order.variant_id)
        .eq("digital_asset_id", assetId)
        .maybeSingle()

      if (!variantFile) {
        hasAccess = false
      }
    }
  }

  // Check authenticated user access
  if (!hasAccess) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // Check entitlement
      const { data: entitlement } = await admin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("product_id", asset.product_id)
        .single()

      if (entitlement) {
        hasAccess = true
        entitlementId = entitlement.id
      }

      // Allow creator access
      if (!hasAccess && asset.product?.creator_id) {
        const { data: creator } = await admin
          .from("creators")
          .select("id")
          .eq("user_id", user.id)
          .eq("id", asset.product.creator_id)
          .single()

        if (creator) hasAccess = true
      }
    }
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  }

  // Check if file has been scanned and is safe to download
  const safetyCheck = await isAssetSafeToDownload(admin, assetId)
  if (!safetyCheck.safe) {
    return NextResponse.json(
      { error: safetyCheck.reason || "File is not available for download." },
      { status: 403 },
    )
  }

  // Generate signed URL
  const signed = await generateSignedDownloadUrl(admin, asset.file_path)
  if (!signed) {
    return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 })
  }

  // Log download
  await logDownloadEvent(admin, {
    assetId: asset.id,
    orderId: orderId || undefined,
    entitlementId: entitlementId || undefined,
    ip,
    userAgent,
  })

  return NextResponse.json({
    success: true,
    downloadUrl: signed.url,
    fileName: asset.file_name,
  })
}
