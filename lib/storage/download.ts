/**
 * Secure download utilities.
 * Handles token generation, signed URL creation, and download logging.
 */

import { type SupabaseClient } from "@supabase/supabase-js"
import { STORAGE_BUCKET, PUBLIC_BUCKET, getPlanLimits } from "./plans"

/** Default signed URL expiry: 5 minutes */
const SIGNED_URL_EXPIRY_SECONDS = 300

/**
 * Generate a signed download URL for a digital asset.
 * Tries the primary bucket first, then fallback buckets.
 */
export async function generateSignedDownloadUrl(
  admin: SupabaseClient,
  filePath: string,
  expirySeconds: number = SIGNED_URL_EXPIRY_SECONDS,
): Promise<{ url: string; bucket: string } | null> {
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

  // Try buckets in order: digital-products (new), product-files (legacy), digital-assets (legacy)
  const bucketsToTry = [STORAGE_BUCKET, "product-files", "digital-assets"]

  for (const bucket of bucketsToTry) {
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(normalizedPath, expirySeconds, { download: true })

    if (!error && data?.signedUrl) {
      return { url: data.signedUrl, bucket }
    }
  }

  // Try the original path as-is (might include subfolder structure)
  for (const bucket of bucketsToTry) {
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(filePath, expirySeconds, { download: true })

    if (!error && data?.signedUrl) {
      return { url: data.signedUrl, bucket }
    }
  }

  return null
}

/**
 * Log a download event.
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
    .select("id", { count: "exact", head: true })
    .gte("created_at", oneHourAgo)

  // If we can't check, allow (fail open for downloads)
  if (error || count === null) return true

  return count < limits.rateLimit.downloadsPerHour
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
