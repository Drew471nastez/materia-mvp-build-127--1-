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
import { ensureProductBundle, getBundleSignedUrl, BUNDLE_THRESHOLD } from "@/lib/bundles"
import { resolveDownloadAccess } from "@/lib/receipts/download-access"
import { DENY_MESSAGES, isUuid } from "@/lib/receipts/rules"

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

    // Increment download count (once, regardless of file count)
    await admin
      .from("subscriber_digital_products")
      .update({
        download_count: record.download_count + 1,
        last_downloaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id)

    // ── ≥6 files → serve as a single ZIP ───────────────────────────────────
    if (assets.length >= BUNDLE_THRESHOLD) {
      // Get creator ID for bundle path
      const { data: creator } = await admin
        .from("creators")
        .select("id")
        .eq("id", product.creator_id)
        .single()

      const creatorId = creator?.id ?? product.creator_id

      // Get or generate cached bundle (fast if already cached)
      const bundle = await ensureProductBundle(admin, product.id, product.title, creatorId)
      if (bundle) {
        const zipUrl = await getBundleSignedUrl(admin, bundle.zipPath)
        if (zipUrl) {
          // Log one download event for the bundle
          await logDownloadEvent(admin, {
            assetId: assets[0].id,
            downloadToken: token,
            ip,
            userAgent,
          }).catch(() => {})
          return NextResponse.redirect(zipUrl)
        }
      }
      // Bundle generation failed — fall through to per-file JSON (graceful degradation)
    }

    // ── < 6 files (or bundle fallback) ──────────────────────────────────────
    const downloadLinks = await Promise.all(
      assets.map(async (asset) => {
        const signed = await generateSignedDownloadUrl(
          admin,
          asset.file_path,
          undefined,
          asset.storage_bucket || undefined,
        )

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

    // 2–5 files: return JSON list for the frontend to handle
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
  _request: NextRequest,
  admin: ReturnType<typeof createAdminClient>,
  assetId: string,
  receiptOrToken: string,
  ip: string | null,
  userAgent: string | null,
) {
  /* The same door as /api/download/[assetId]: one rule for every file,
     in lib/receipts. A refunded or unpaid order is refused here too. */
  if (!isUuid(assetId)) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 })
  }

  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch {
    // A guest with a receipt has no session
  }

  const { asset, decision, orderId, entitlementId } = await resolveDownloadAccess(admin, {
    assetId,
    receiptToken: receiptOrToken,
    userId,
  })

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 })
  }

  if (!decision.ok) {
    return NextResponse.json({ error: DENY_MESSAGES[decision.reason], reason: decision.reason }, { status: 403 })
  }

  // Check if file has been scanned and is safe to download
  try {
    const safetyCheck = await isAssetSafeToDownload(admin, assetId)
    if (!safetyCheck.safe) {
      return NextResponse.json(
        { error: safetyCheck.reason || "File is not available for download." },
        { status: 403 },
      )
    }
  } catch {
    // If safety check fails, allow download (fail-open)
  }

  if (!asset.file_path) {
    return NextResponse.json({ error: "Asset file not available" }, { status: 404 })
  }

  // Generate signed URL
  const signed = await generateSignedDownloadUrl(admin, asset.file_path, undefined, asset.storage_bucket || undefined)
  if (!signed) {
    return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 })
  }

  // Log download (fire-and-forget)
  logDownloadEvent(admin, {
    assetId: asset.id,
    orderId: orderId || undefined,
    entitlementId: entitlementId || undefined,
    ip,
    userAgent,
  }).catch(() => {})

  return NextResponse.json({
    success: true,
    downloadUrl: signed.url,
    fileName: asset.file_name,
  })
}
