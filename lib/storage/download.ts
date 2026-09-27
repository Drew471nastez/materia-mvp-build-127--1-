/**
 * Secure download utilities.
 * Handles token generation, signed URL creation, download logging,
 * and rate limiting for both uploads and downloads.
 */

import { type SupabaseClient } from "@supabase/supabase-js"
import { STORAGE_BUCKET, PUBLIC_BUCKET, DIGITAL_BUCKETS, getPlanLimits } from "./plans"

/** Default signed URL expiry: 5 minutes (short-lived for security). */
export const SIGNED_DOWNLOAD_SECONDS = 300
const SIGNED_URL_EXPIRY_SECONDS = SIGNED_DOWNLOAD_SECONDS

/** Buckets a download URL may be signed for: the private file buckets, and the public one old lead magnets used. */
const SIGNABLE_BUCKETS: readonly string[] = [...DIGITAL_BUCKETS, PUBLIC_BUCKET]

/**
 * Generate a signed download URL for a digital asset.
 * Tries the primary bucket first, then fallback buckets.
 * URLs are time-limited (5 min default, never more than an hour) so buyers
 * can't share permanent links.
 *
 * Only ever for a bucket in SIGNABLE_BUCKETS: `preferredBucket` comes from a
 * database row, and a row naming any other bucket (the private message or
 * chat attachment buckets, say) is ignored rather than trusted. The URL is
 * made with `download`, so storage answers with Content-Disposition:
 * attachment and the file is saved, never rendered, whatever it contains.
 */
export async function generateSignedDownloadUrl(
  admin: SupabaseClient,
  filePath: string,
  expirySeconds: number = SIGNED_URL_EXPIRY_SECONDS,
  preferredBucket?: string,
  downloadName?: string | null,
): Promise<{ url: string; bucket: string } | null> {
  if (!filePath) {
    console.error("[download] generateSignedDownloadUrl called with empty filePath")
    return null
  }

  // Normalize path: strip bucket prefix if present
  let normalizedPath = filePath
  const bucketPrefixes = ["digital-products/", "product-files/", "digital-assets/", "lead-form-files-v2/"]
  for (const prefix of bucketPrefixes) {
    if (normalizedPath.startsWith(prefix)) {
      normalizedPath = normalizedPath.slice(prefix.length)
      break
    }
  }

  // Also handle full Supabase URLs
  if (normalizedPath.includes("/storage/v1/object/")) {
    const match = normalizedPath.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/)
    if (match) {
      normalizedPath = decodeURIComponent(match[1])
    }
  }

  /* No path that climbs out of where it says it is. */
  if (normalizedPath.split("/").some((p) => p === "..")) return null

  const expiry = Math.max(30, Math.min(expirySeconds, 3600))
  const name = typeof downloadName === "string" ? downloadName.replace(/[\r\n"\\/]/g, "_").trim().slice(0, 180) : ""
  /*
    THE NAME GOES ON THE URL HERE, ENCODED, NOT THROUGH storage-js. Its
    `download` option is pasted into the query as it is and the whole URL
    then goes through encodeURI, which leaves & # + ; alone: "Drums & Bass.zip"
    reached storage as "Drums " and a stray parameter, and "Kit #2.zip" as
    "Kit " with the rest cut off as a fragment. The parameter is not part of
    the signature (storage-js adds it after signing too), and storage answers
    it with Content-Disposition: attachment and the name, as filename and as
    the RFC 5987 filename*. Empty asks for an attachment under the stored name.
  */
  const withName = (signedUrl: string) => `${signedUrl}${signedUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`

  // Build bucket order: preferred first (if provided and allowed), then standard fallbacks
  const standardBuckets = [STORAGE_BUCKET, "product-files", "digital-assets"]
  const preferred = preferredBucket && SIGNABLE_BUCKETS.includes(preferredBucket) ? preferredBucket : undefined
  const bucketsToTry = preferred
    ? [preferred, ...standardBuckets.filter((b) => b !== preferred)]
    : standardBuckets

  for (const bucket of bucketsToTry) {
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(normalizedPath, expiry)

    if (!error && data?.signedUrl) {
      return { url: withName(data.signedUrl), bucket }
    }
  }

  // Try the original path as-is (might include subfolder structure)
  if (filePath !== normalizedPath && !filePath.includes("://") && !filePath.split("/").some((p) => p === "..")) {
    for (const bucket of bucketsToTry) {
      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUrl(filePath, expiry)

      if (!error && data?.signedUrl) {
        return { url: withName(data.signedUrl), bucket }
      }
    }
  }

  return null
}

/**
 * Log a download event with full context for analytics, disputes, and refund support.
 */
export async function logDownloadEvent(
  admin: SupabaseClient,
  params: {
    assetId?: string
    orderId?: string
    entitlementId?: string
    downloadToken?: string
    ip?: string | null
    userAgent?: string | null
    creatorId?: string
    subscriberEmail?: string
    productId?: string
    fileName?: string
    fileSize?: number
    bucket?: string
  },
): Promise<void> {
  try {
    await admin.from("download_events").insert({
      digital_asset_id: params.assetId || null,
      order_id: params.orderId || null,
      entitlement_id: params.entitlementId || null,
      download_token: params.downloadToken || null,
      ip: params.ip || null,
      user_agent: params.userAgent || null,
    })
  } catch (err) {
    console.error("[download] Failed to log download event:", err)
  }
}

/**
 * Check rate limiting for downloads based on creator's plan.
 * Returns true if the download is allowed.
 *
 * Counts the downloads of THIS creator's files. It used to count every row in
 * download_events, so once the whole platform passed a free plan's hourly
 * number, every free creator's downloads were refused for the rest of the hour.
 */
export async function checkDownloadRateLimit(
  admin: SupabaseClient,
  creatorId: string,
): Promise<boolean> {
  const { data: creator } = await admin
    .from("creators")
    .select("subscription_plan_id")
    .eq("id", creatorId)
    .single()

  const limits = getPlanLimits(creator?.subscription_plan_id)

  // Count downloads in the last hour for this creator's products
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { count, error } = await admin
    .from("download_events")
    .select("id, digital_assets!inner(product_id, products!inner(creator_id))", { count: "exact", head: true })
    .eq("digital_assets.products.creator_id", creatorId)
    .gte("created_at", oneHourAgo)

  // If we can't check, allow (fail open for downloads)
  if (error || count === null) return true

  return count < limits.rateLimit.downloadsPerHour
}

/**
 * Check rate limiting for uploads based on creator's plan.
 * Returns { allowed: true } or { allowed: false, reason }.
 *
 * digital_assets.uploaded_by holds the auth USER id, so that is what is
 * counted; filtering it by the creator id (as this did) matched nothing and
 * never refused anything. Routes use uploadRateLimit
 * (lib/storage/upload-guard.ts), which counts every upload, pictures too.
 */
export async function checkUploadRateLimit(
  admin: SupabaseClient,
  creatorId: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const { data: creator } = await admin
    .from("creators")
    .select("subscription_plan_id, user_id")
    .eq("id", creatorId)
    .single()

  if (!creator?.user_id) return { allowed: true }

  const limits = getPlanLimits(creator.subscription_plan_id)

  // Count completed uploads in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { count, error } = await admin
    .from("digital_assets")
    .select("id", { count: "exact", head: true })
    .eq("uploaded_by", creator.user_id)
    .gte("created_at", oneHourAgo)

  // If we can't check, allow (fail open)
  if (error || count === null) return { allowed: true }

  if (count >= limits.rateLimit.uploadsPerHour) {
    return {
      allowed: false,
      reason: `Upload rate limit reached (${limits.rateLimit.uploadsPerHour} uploads/hour). Please wait and try again.`,
    }
  }

  return { allowed: true }
}

/**
 * Validate a subscriber download token and return the download record.
 */
export async function validateDownloadToken(
  admin: SupabaseClient,
  token: string,
): Promise<{
  valid: true
  record: {
    id: string
    subscriber_email: string
    product_id: string
    onepage_id: string
    download_count: number
    max_downloads: number
    expires_at: string
  }
} | { valid: false; reason: string; status: number }> {
  const { data: record, error } = await admin
    .from("subscriber_digital_products")
    .select("*")
    .eq("download_token", token)
    .single()

  if (error || !record) {
    return { valid: false, reason: "Invalid or expired download link", status: 404 }
  }

  if (new Date(record.expires_at) < new Date()) {
    return { valid: false, reason: "Download link has expired", status: 410 }
  }

  if (record.download_count >= record.max_downloads) {
    return { valid: false, reason: "Download limit reached", status: 403 }
  }

  return { valid: true, record }
}
