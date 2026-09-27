import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateSignedDownloadUrl, logDownloadEvent } from "@/lib/storage"
import { SIGNED_DOWNLOAD_SECONDS } from "@/lib/storage/download"
import { gateDownload } from "@/lib/storage/scan-gate"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { runAfterResponse } from "@/lib/security/uploads/pipeline"
import { DOWNLOAD_TRY_AGAIN } from "@/lib/security/uploads/policy"
import { serveTokenDownload } from "@/lib/storage/token-download"
import { rateLimit, addressSubject, callerAddress } from "@/lib/api/rate-limit"
import { resolveDownloadAccess } from "@/lib/receipts/download-access"
import { DENY_MESSAGES, isUuid } from "@/lib/receipts/rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }

/** The same windows as /api/download/[assetId]. */
const DOWNLOAD_WINDOWS = [
  { limit: 30, seconds: 60 },
  { limit: 300, seconds: 3600 },
] as const

/**
 * GET /api/v2/download/[token]
 *
 * Secure download endpoint. Supports two modes:
 *
 * 1. Token-based (lead magnet / free product):
 *    The subscriber_digital_products download token, answered by
 *    lib/storage/token-download.ts like the other two token routes.
 *
 * 2. Asset-based (purchased products):
 *    Query params: ?asset=<assetId>&receipt=<receiptToken>
 *    Verifies access via receipt token, order, entitlement, or creator status,
 *    through the same rule as /api/download/[assetId].
 *
 * Signed URLs live five minutes, are made as downloads (Content-Disposition:
 * attachment), and a path is never sent in place of one.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const assetId = searchParams.get("asset")
    const receiptToken = searchParams.get("receipt")

    if (assetId) {
      return handleAssetDownload(request, admin, assetId, receiptToken || token)
    }

    return serveTokenDownload(request, admin, token, { bundles: true })
  } catch (error) {
    console.error("[v2/download] Error:", error)
    return NextResponse.json({ error: DOWNLOAD_TRY_AGAIN }, { status: 500, headers: NO_STORE })
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
) {
  /* The same door as /api/download/[assetId]: one rule for every file,
     in lib/receipts. A refunded or unpaid order is refused here too. */
  if (!isUuid(assetId)) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404, headers: NO_STORE })
  }

  const limited = await rateLimit({
    bucket: "download",
    subjects: [addressSubject(request)],
    windows: DOWNLOAD_WINDOWS,
    message: "That is a lot of downloads at once. Wait a minute and try again.",
  })
  if (limited) runAfterResponse(() => logSecurityEvent(createAdminClient(), { event: "rate_limit", outcome: "limited", code: "download", assetId, ip: callerAddress(request) }))
  if (limited) return limited

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
    return NextResponse.json({ error: "Asset not found" }, { status: 404, headers: NO_STORE })
  }

  if (!decision.ok) runAfterResponse(() => logSecurityEvent(admin, { event: "download", outcome: "denied", code: decision.reason, assetId: asset.id, userId, ip: callerAddress(request) }))

  if (!decision.ok) {
    return NextResponse.json({ error: DENY_MESSAGES[decision.reason], reason: decision.reason }, { status: 403, headers: NO_STORE })
  }

  if (!asset.file_path) {
    return NextResponse.json({ error: DOWNLOAD_TRY_AGAIN }, { status: 404, headers: NO_STORE })
  }

  const gate = await gateDownload(admin, asset, { isCreator: decision.via === "creator" })
  if (!gate.ok) {
    runAfterResponse(() => logSecurityEvent(admin, { event: "download", outcome: "denied", code: gate.code, assetId: asset.id, userId, bucket: asset.storage_bucket ?? null, path: asset.file_path, ip: callerAddress(request) }))
    return NextResponse.json({ error: gate.error }, { status: gate.status, headers: NO_STORE })
  }

  const signed = await generateSignedDownloadUrl(
    admin,
    asset.file_path,
    SIGNED_DOWNLOAD_SECONDS,
    asset.storage_bucket || undefined,
    asset.file_name,
  )
  if (!signed) {
    return NextResponse.json({ error: DOWNLOAD_TRY_AGAIN }, { status: 500, headers: NO_STORE })
  }

  logDownloadEvent(admin, {
    assetId: asset.id,
    orderId: orderId || undefined,
    entitlementId: entitlementId || undefined,
    ip: callerAddress(request),
    userAgent: request.headers.get("user-agent"),
  }).catch(() => {})

  return NextResponse.json(
    {
      success: true,
      downloadUrl: signed.url,
      fileName: asset.file_name,
      expiresIn: SIGNED_DOWNLOAD_SECONDS,
    },
    { headers: NO_STORE },
  )
}
