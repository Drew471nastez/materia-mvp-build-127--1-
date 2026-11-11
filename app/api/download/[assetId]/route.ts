import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { SIGNED_URL_EXPIRY_SECONDS } from "@/lib/security"
import { callerAddress } from "@/lib/api/rate-limit"
import { downloadRateLimit, purchaseRateLimit } from "@/lib/storage/download-limits"
import { resolveDownloadAccess } from "@/lib/receipts/download-access"
import { DENY_MESSAGES, isPlausibleToken, isUuid } from "@/lib/receipts/rules"
import { guestAccessFromCookieHeader } from "@/lib/receipts/guest-access"
import { heldGrants } from "@/lib/receipts/guest-access-server"
import { gateDownload } from "@/lib/storage/scan-gate"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { runAfterResponse } from "@/lib/security/uploads/pipeline"
import { DOWNLOAD_TRY_AGAIN } from "@/lib/security/uploads/policy"
import { routeUser } from "@/lib/auth/route-user"

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

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params
  if (!isUuid(assetId)) {
    return NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })
  }

  try {
    const receiptToken = new URL(request.url).searchParams.get("receipt")
    const admin = createAdminClient()

    let userId: string | null = null
    try {
      const supabase = await createClient()
      const who = await routeUser()
      const user = who.kind === "user" ? who.user : null
      userId = user?.id ?? null
    } catch {
      /* No session is the normal case for a guest with a receipt. */
    }

    /* The address AND, when somebody is signed in, the account: an address
       on its own is shared by a household and changes with a phone's
       network (lib/storage/download-limits.ts). */
    const limited = await downloadRateLimit(request, { userId, assetId })
    if (limited) return limited

    /* No receipt link sent: the purchases this browser made as a guest, from its signed cookie (lib/receipts/guest-access.ts). */
    const guestOrders = isPlausibleToken(receiptToken) ? [] : (await heldGrants(admin, guestAccessFromCookieHeader(request.headers.get("cookie")))).open

    const { asset, decision, orderId, entitlementId } = await resolveDownloadAccess(admin, {
      assetId,
      receiptToken,
      userId,
      guestOrders,
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
    /* And what this download is being made against, now that it is known:
       one order or one entitlement, so a receipt link that was passed on is
       bounded however many people have it. */
    const byPurchase = await purchaseRateLimit(request, { orderId, entitlementId, token: receiptToken, userId, assetId: asset.id })
    if (byPurchase) return byPurchase

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
      {
        success: true,
        downloadUrl: signed.url,
        fileName: asset.file_name || "download",
        expiresIn: SIGNED_URL_EXPIRY_SECONDS,
        /* The phone app reads these to choose how to save it: a file too big
           to hold in the page is streamed to disk instead (lib/downloads). */
        fileSize: asset.file_size,
        mimeType: asset.mime_type,
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error("[download] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: DOWNLOAD_TRY_AGAIN }, { status: 500, headers: NO_STORE })
  }
}
