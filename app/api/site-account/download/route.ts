import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { SIGNED_URL_EXPIRY_SECONDS } from "@/lib/security"
import { callerAddress } from "@/lib/api/rate-limit"
import { downloadRateLimit, purchaseRateLimit } from "@/lib/storage/download-limits"
import { resolveDownloadAccess } from "@/lib/receipts/download-access"
import { isUuid } from "@/lib/receipts/rules"
import { gateDownload } from "@/lib/storage/scan-gate"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { runAfterResponse } from "@/lib/security/uploads/pipeline"
import { customerById } from "@/lib/site-accounts/customers"
import { siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { customerOrderAccess } from "@/lib/site-accounts/order-files"
import { hostOf, visitorOfRequest } from "@/lib/site-accounts/session"
import { originOf, privateResponse } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A FILE FROM A CUSTOMER'S ORDER, DOWNLOADED ON THE WEBSITE ITSELF
 * ===========================================================================
 * GET /api/site-account/download?order=<order id>&file=<file id>, on the
 * creator's website (every /api path is served there, see proxy.ts): what the
 * Download links on /account/orders/<id> point at.
 *
 * WHO is the website's own session (this host, this host's creator), and the
 * order must be one placed with the email that session proved, on this
 * website (lib/site-accounts/order-files.ts). The file must be one that
 * order's receipt lists, and then the same door every download goes through
 * decides it again (lib/receipts/download-access.ts) with the order's own
 * receipt token, which is read on the server and never shown. Same limits,
 * same scan gate, same download log as /api/download.
 *
 * The answer is a redirect to a signed address for that one file, made for
 * this request. Anything refused goes back to the order's page with a fixed
 * reason, never a storage path, an id or an error from the database.
 */
export async function GET(request: Request) {
  const host = hostOf(request)
  const origin = originOf(host)
  const url = new URL(request.url)
  const orderId = url.searchParams.get("order") ?? ""
  const fileId = url.searchParams.get("file") ?? ""
  const back = (why?: string) => {
    const to = new URL(isUuid(orderId) ? `/account/orders/${orderId}` : "/account", origin)
    if (why) to.searchParams.set("download", why)
    return privateResponse(NextResponse.redirect(to, 303))
  }
  if (!isUuid(orderId) || !isUuid(fileId)) return back()

  const db = createAdminClient()
  const owner = await siteOwnerOfHost(db, host).catch(() => null)
  const visitor = owner ? visitorOfRequest(request, { creatorId: owner.creatorId }) : null
  const customer = visitor ? await customerById(db, visitor).catch(() => null) : null
  if (!owner || !visitor || !customer) {
    const login = new URL("/account/login", origin)
    login.searchParams.set("return", `/account/orders/${orderId}`)
    return privateResponse(NextResponse.redirect(login, 303))
  }

  try {
    const limited = await downloadRateLimit(request, { assetId: fileId })
    if (limited) return back("limit")

    const access = await customerOrderAccess(db, { creatorId: owner.creatorId, email: customer.email }, orderId)
    if (!access) return back("denied")
    /* Only a file this order's receipt lists, and asked against the line it belongs to. */
    const line = access.detail.lines.find((l) => l.files.some((f) => f.id === fileId))
    const token = line ? access.tokens.get(line.orderId) ?? null : null
    if (!line || !token) return back("denied")

    const { asset, decision, orderId: decidedOrder, entitlementId } = await resolveDownloadAccess(db, { assetId: fileId, receiptToken: token, userId: null })
    if (!asset || !decision.ok) {
      if (asset) runAfterResponse(() => logSecurityEvent(db, { event: "download", outcome: "denied", code: decision.ok ? "denied" : decision.reason, assetId: asset.id, ip: callerAddress(request) }))
      return back(decision.ok ? "denied" : decision.reason)
    }
    if (!asset.file_path) return back("unavailable")

    const byPurchase = await purchaseRateLimit(request, { orderId: decidedOrder, entitlementId, token, assetId: asset.id })
    if (byPurchase) return back("limit")

    const gate = await gateDownload(db, asset, { isCreator: false })
    if (!gate.ok) {
      runAfterResponse(() => logSecurityEvent(db, { event: "download", outcome: "denied", code: gate.code, assetId: asset.id, ip: callerAddress(request) }))
      return back("unavailable")
    }

    const { generateSignedDownloadUrl, logDownloadEvent } = await import("@/lib/storage")
    const signed = await generateSignedDownloadUrl(db, asset.file_path, SIGNED_URL_EXPIRY_SECONDS, asset.storage_bucket || undefined, asset.file_name)
    if (!signed) return back("unavailable")

    logDownloadEvent(db, { assetId: asset.id, orderId: decidedOrder || undefined, entitlementId: entitlementId || undefined, ip: callerAddress(request), userAgent: request.headers.get("user-agent") }).catch(() => {})
    return privateResponse(NextResponse.redirect(signed.url, 303))
  } catch (error) {
    console.error("[site-download] failed:", error instanceof Error ? error.name : "unknown")
    return back("unavailable")
  }
}
