import "server-only"

/**
 * ===========================================================================
 *  ONE DOOR FOR A DOWNLOAD LINK FROM AN EMAIL
 * ===========================================================================
 * A free product or lead magnet is delivered as a link with a token
 * (subscriber_digital_products.download_token). Three routes answered that
 * link, each written separately: /api/onepage/download?token=,
 * /api/onepage/download/<token> and /api/v2/download/<token>. Between them:
 *
 *   - none limited how often an address could ask, so a leaked link was a
 *     free CDN for as long as its count lasted, and a guesser was unlimited;
 *   - two sent files still uploading, and files the virus scan had flagged;
 *   - when a URL could not be signed they answered with the raw storage path
 *     in place of a link, and redirected to it;
 *   - the count was read and then written, so ten parallel requests with a
 *     count of 9 of 10 all passed.
 *
 * This is the one they all call now.
 */
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

import { addressSubject, callerAddress, rateLimit } from "@/lib/api/rate-limit"
import { DOWNLOAD_TOO_MANY, DOWNLOAD_USER_WINDOWS, logDownloadLimit } from "./download-limits"
import { isUuid } from "@/lib/receipts/rules"
import { BUNDLE_THRESHOLD, ensureProductBundle, getBundleSignedUrl } from "@/lib/bundles"
import {
  SIGNED_DOWNLOAD_SECONDS,
  checkDownloadRateLimit,
  generateSignedDownloadUrl,
  logDownloadEvent,
  validateDownloadToken,
} from "./download"
import { gateDownload } from "./scan-gate"

/** How long a buyer's download waits for a ZIP that was not built yet before handing over the files one by one. */
const BUYER_BUNDLE_WAIT_MS = 20_000

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } as const

/** Far above a person opening their email twice, far below a script. */
export const TOKEN_DOWNLOAD_WINDOWS = [
  { limit: 20, seconds: 60 },
  { limit: 120, seconds: 3600 },
] as const

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS })
}

export async function serveTokenDownload(
  request: Request,
  admin: SupabaseClient,
  token: string | null | undefined,
  options: { bundles?: boolean; userId?: string | null } = {},
): Promise<NextResponse> {
  const userId = options.userId ?? null
  /* The column is a uuid: anything else is not a link we sent. Refused
     before any query, and before it can count against the address. */
  if (!token || !isUuid(token)) return json({ error: "Invalid or expired download link" }, 404)

  /* The address, the link itself, and, when somebody is signed in, the
     account (lib/storage/download-limits.ts). A guest with a link from their
     email has no account, so the first two are their whole limit, as before. */
  const limited = await rateLimit({
    bucket: "download",
    subjects: [addressSubject(request), `token:${token}`, userId ? `user:${userId}` : null],
    windows: userId ? [...TOKEN_DOWNLOAD_WINDOWS, ...DOWNLOAD_USER_WINDOWS] : TOKEN_DOWNLOAD_WINDOWS,
    message: DOWNLOAD_TOO_MANY,
  })
  if (limited) {
    logDownloadLimit({ code: "download_link", userId, ip: callerAddress(request) })
    return limited
  }

  const validation = await validateDownloadToken(admin, token)
  if (!validation.valid) return json({ error: validation.reason }, validation.status)
  const { record } = validation

  const { data: product } = await admin
    .from("products")
    .select("id, title, creator_id")
    .eq("id", record.product_id)
    .maybeSingle()
  if (!product) return json({ error: "Product not found" }, 404)

  if (product.creator_id && !(await checkDownloadRateLimit(admin, product.creator_id))) {
    return json({ error: "Download rate limit reached. Please try again later." }, 429)
  }

  /* Only finished uploads. Rows from before upload_status existed have none. */
  const { data: assets } = await admin
    .from("digital_assets")
    .select("id, file_path, file_name, file_size, storage_bucket, mime_type, scan_status, upload_status")
    .eq("product_id", record.product_id)
    .or("upload_status.is.null,upload_status.eq.completed")
    .order("created_at", { ascending: true })

  const files = (assets ?? []).filter((a) => a.file_path)
  if (files.length === 0) return json({ error: "No download files available" }, 404)

  for (const asset of files) {
    const gate = await gateDownload(admin, asset, { isCreator: false })
    if (!gate.ok) return json({ error: gate.error }, gate.status)
  }

  /* Counted only if nobody counted it first: the update names the count it
     read, so two requests racing on the last download cannot both have it. */
  const { data: counted } = await admin
    .from("subscriber_digital_products")
    .update({
      download_count: record.download_count + 1,
      last_downloaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", record.id)
    .eq("download_count", record.download_count)
    .select("id")
  if (!counted || counted.length === 0) return json({ error: "That link was just used. Try again." }, 409)

  const ip = callerAddress(request)
  const userAgent = request.headers.get("user-agent")

  if (options.bundles && files.length >= BUNDLE_THRESHOLD && product.creator_id) {
    /* Built in this request only when it was not built at upload: bounded, and the files one by one past it (lib/bundles.ts). */
    const bundle = await ensureProductBundle(admin, product.id, product.title || "Download", product.creator_id, null, null, { deadlineAt: Date.now() + BUYER_BUNDLE_WAIT_MS })
    if (bundle) {
      const zipUrl = await getBundleSignedUrl(admin, bundle.zipPath, SIGNED_DOWNLOAD_SECONDS, bundle.zipFileName)
      if (zipUrl) {
        await logDownloadEvent(admin, { assetId: files[0].id, downloadToken: token, ip, userAgent }).catch(() => {})
        return NextResponse.redirect(zipUrl, { headers: HEADERS })
      }
    }
    /* No bundle: the files one by one, below. */
  }

  const links = (
    await Promise.all(
      files.map(async (asset) => {
        const signed = await generateSignedDownloadUrl(
          admin,
          asset.file_path as string,
          SIGNED_DOWNLOAD_SECONDS,
          asset.storage_bucket || undefined,
          asset.file_name,
        )
        if (!signed) return null
        await logDownloadEvent(admin, { assetId: asset.id, downloadToken: token, ip, userAgent }).catch(() => {})
        return {
          id: asset.id,
          fileName: asset.file_name,
          fileSize: asset.file_size,
          mimeType: asset.mime_type,
          downloadUrl: signed.url,
        }
      }),
    )
  ).filter((l): l is NonNullable<typeof l> => l !== null)

  if (links.length === 0) return json({ error: "The file could not be prepared. Try again." }, 500)

  if (links.length === 1) return NextResponse.redirect(links[0].downloadUrl, { headers: HEADERS })

  return json({
    success: true,
    productTitle: product.title,
    files: links,
    remainingDownloads: Math.max(0, record.max_downloads - record.download_count - 1),
  })
}
