import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORAGE_BUCKET } from "@/lib/storage"
import {
  scanFileForViruses,
  updateAssetScanStatus,
  handleInfectedFile,
  getPendingScanAssets,
} from "@/lib/storage/antivirus"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * POST /api/v2/upload/scan
 *
 * Triggers antivirus scanning for uploaded digital assets.
 *
 * Modes:
 * 1. Scan a specific asset: { assetId: string }
 * 2. Scan all pending assets: { scanPending: true, limit?: number }
 *
 * Called:
 * - After upload completion (scan specific asset)
 * - By a cron job (scan all pending)
 * - Manually by the creator
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

    const body = await request.json()
    const { assetId, scanPending, limit } = body as {
      assetId?: string
      scanPending?: boolean
      limit?: number
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

    // Mode 1: Scan specific asset
    if (assetId) {
      const result = await scanSingleAsset(admin, assetId, creator.id)
      return NextResponse.json(result)
    }

    // Mode 2: Scan all pending assets
    if (scanPending) {
      const results = await scanPendingAssets(admin, creator.id, limit || 10)
      return NextResponse.json({ success: true, scanned: results })
    }

    return NextResponse.json({ error: "Provide assetId or scanPending:true" }, { status: 400 })
  } catch (error) {
    console.error("[scan] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Scan a single digital asset.
 */
async function scanSingleAsset(
  admin: ReturnType<typeof createAdminClient>,
  assetId: string,
  creatorId: string,
) {
  // Get asset and verify ownership
  const { data: asset } = await admin
    .from("digital_assets")
    .select("id, file_path, file_name, file_size, mime_type, storage_bucket, product:products!inner(creator_id)")
    .eq("id", assetId)
    .single()

  if (!asset || (asset as any).product?.creator_id !== creatorId) {
    return { error: "Asset not found or access denied" }
  }

  // Mark as scanning
  await updateAssetScanStatus(admin, assetId, {
    status: "scanning",
    engine: "pending",
    scannedAt: new Date().toISOString(),
  })

  // Download file from storage for scanning
  const bucket = asset.storage_bucket || STORAGE_BUCKET
  const { data: fileData, error: downloadError } = await admin.storage
    .from(bucket)
    .download(asset.file_path)

  if (downloadError || !fileData) {
    console.error("[scan] Failed to download file for scanning:", downloadError)
    await updateAssetScanStatus(admin, assetId, {
      status: "scan_error",
      engine: "download-failed",
      scannedAt: new Date().toISOString(),
    })
    return { error: "Failed to download file for scanning" }
  }

  // Convert Blob to ArrayBuffer
  const fileBuffer = await fileData.arrayBuffer()

  // Run antivirus scan
  const scanResult = await scanFileForViruses(
    fileBuffer,
    asset.file_name,
    asset.mime_type || "application/octet-stream",
  )

  // Update asset status
  await updateAssetScanStatus(admin, assetId, scanResult)

  // Handle infected files
  if (scanResult.status === "infected") {
    await handleInfectedFile(admin, assetId, scanResult)
    return {
      success: true,
      assetId,
      status: "infected",
      threatName: scanResult.threatName,
      action: "File has been quarantined and removed.",
    }
  }

  return {
    success: true,
    assetId,
    status: scanResult.status,
    engine: scanResult.engine,
    scanDurationMs: scanResult.scanDurationMs,
  }
}

/**
 * Scan all pending assets for a creator.
 */
async function scanPendingAssets(
  admin: ReturnType<typeof createAdminClient>,
  creatorId: string,
  limit: number,
) {
  const pendingAssets = await getPendingScanAssets(admin, limit)
  const results = []

  for (const asset of pendingAssets) {
    const result = await scanSingleAsset(admin, asset.id, creatorId)
    results.push(result)
  }

  return results
}
