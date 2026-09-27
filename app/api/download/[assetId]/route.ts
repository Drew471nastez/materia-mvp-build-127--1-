import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { SIGNED_URL_EXPIRY_SECONDS } from "@/lib/security"
import { rateLimit, addressSubject, callerAddress } from "@/lib/api/rate-limit"
import { resolveDownloadAccess } from "@/lib/receipts/download-access"
import { DENY_MESSAGES, isUuid } from "@/lib/receipts/rules"
import { gateDownload } from "@/lib/storage/scan-gate"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { runAfterResponse } from "@/lib/security/uploads/pipeline"
import { DOWNLOAD_TRY_AGAIN } from "@/lib/security/uploads/policy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/download/<assetId>?receipt=<receipt token>
 *
 * Answers with a signed URL for ONE file, valid for SIGNED_URL_EXPIRY_SECONDS,
 * made for this request and never stored. Who may have it is decided in
 * lib/receipts (decideAccess): the receipt token of a paid order for that
 * product and variant, the signed-in buyer's own paid orders, or the creator.
 * A refunded, failed, disputed or unpaid order gets a plain reason instead.
 *
 * The response never carries the storage path or bucket, and nothing about
 * the order beyond the reason it was refused.
 */

/** Far above a person clicking through their files, far below a crawler. */
const DOWNLOAD_WINDOWS = [
  { limit: 30, seconds: 60 },
  { limit: 300, seconds: 3600 },
] as const

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params
  if (!isUuid(assetId)) {
    return NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })
  }

  const limited = await rateLimit({
    bucket: "download",
    subjects: [addressSubject(request)],
    windows: DOWNLOAD_WINDOWS,
    message: "That is a lot of downloads at once. Wait a minute and try again.",
  })
  if (limited) runAfterResponse(() => logSecurityEvent(createAdminClient(), { event: "rate_limit", outcome: "limited", code: "download", assetId, ip: callerAddress(request) }))
  if (limited) return limited

  try {
    const receiptToken = new URL(request.url).searchParams.get("receipt")
    const admin = createAdminClient()

    let userId: string | null = null
    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      userId = user?.id ?? null
    } catch {
      /* No session is the normal case for a guest with a receipt. */
    }

    const { asset, decision, orderId, entitlementId } = await resolveDownloadAccess(admin, {
      assetId,
      receiptToken,
      userId,
    })

    if (!asset) {
      return NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })
    }
    if (!decision.ok) runAfterResponse(() => logSecurityEvent(admin, { event: "download", outcome: "denied", code: decision.reason, assetId: asset.id, userId, ip: callerAddress(request) }))
    if (!decision.ok) {
      return NextResponse.json(
        { error: DENY_MESSAGES[decision.reason], reason: decision.reason },
        { status: 403, headers: NO_STORE },
      )
    }
    if (!asset.file_path) {
      return NextResponse.json({ error: DOWNLOAD_TRY_AGAIN }, { status: 404, headers: NO_STORE })
    }
    /* Flagged files never go out, and a file nobody has scanned yet is
       scanned now, before the first buyer gets it (lib/storage/scan-gate.ts).
       This used to refuse only files already marked infected. */
    const gate = await gateDownload(admin, asset, { isCreator: decision.via === "creator" })
    if (!gate.ok) {
      runAfterResponse(() => logSecurityEvent(admin, { event: "download", outcome: "denied", code: gate.code, assetId: asset.id, userId, bucket: asset.storage_bucket ?? null, path: asset.file_path, ip: callerAddress(request) }))
      return NextResponse.json({ error: gate.error }, { status: gate.status, headers: NO_STORE })
    }

    const { generateSignedDownloadUrl, logDownloadEvent } = await import("@/lib/storage")
    const signed = await generateSignedDownloadUrl(
      admin,
      asset.file_path,
      SIGNED_URL_EXPIRY_SECONDS,
      asset.storage_bucket || undefined,
      asset.file_name,
    )
    if (!signed) {
      console.error("[download] could not sign a URL for asset", asset.id)
      return NextResponse.json({ error: DOWNLOAD_TRY_AGAIN }, { status: 500, headers: NO_STORE })
    }

    /* Tracked, never blocking: one row per file handed out. */
    const ip = callerAddress(request)
    const userAgent = request.headers.get("user-agent")
    logDownloadEvent(admin, {
      assetId: asset.id,
      orderId: orderId || undefined,
      entitlementId: entitlementId || undefined,
      ip,
      userAgent,
    }).catch(() => {})
    if (orderId) {
      admin
        .from("security_events")
        .insert({ order_id: orderId, event_type: "download_issued", ip, user_agent: userAgent })
        .then(
          () => {},
          () => {},
        )
    }

    return NextResponse.json(
      { success: true, downloadUrl: signed.url, fileName: asset.file_name || "download", expiresIn: SIGNED_URL_EXPIRY_SECONDS },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error("[download] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: DOWNLOAD_TRY_AGAIN }, { status: 500, headers: NO_STORE })
  }
}
