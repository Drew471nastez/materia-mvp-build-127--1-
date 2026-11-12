/**
 * Storage quota tracking and enforcement.
 * Checks per-creator storage usage against plan limits.
 */

import { type SupabaseClient } from "@supabase/supabase-js"
import { getPlanLimits } from "./plans"
import { ServiceUnavailable } from "@/lib/net/service-error"

export interface QuotaInfo {
  usedBytes: number
  limitBytes: number
  remainingBytes: number
  usagePercent: number
  isOverQuota: boolean
}

/**
 * Storage a creator is using, in bytes: every digital file that is uploaded
 * OR still uploading. Pending uploads count because the bytes are in the
 * bucket from the moment the signed URL is used; counting only completed ones
 * let anybody who never called /complete store without limit.
 *
 * The RPC (supabase/migrations/20260929_upload_safety.sql) is one SUM in the
 * database. The fallback is the same sum here, for a database that has not
 * run it yet.
 */
export async function getCreatorStorageUsage(
  admin: SupabaseClient,
  creatorId: string,
): Promise<number> {
  const { data, error } = await admin.rpc("get_creator_storage_usage", {
    p_creator_id: creatorId,
  })

  if (!error && data !== null && data !== undefined && Number.isFinite(Number(data))) {
    return Number(data)
  }

  /* The embed is aliased `product`, so the filter is on `product.`, not
     `products.`: the old spelling matched nothing and every creator read 0. */
  const { data: assets } = await admin
    .from("digital_assets")
    .select("file_size, product:products!inner(creator_id)")
    .eq("product.creator_id", creatorId)
    .in("upload_status", ["pending", "completed"])

  if (assets && assets.length > 0) {
    return assets.reduce((sum: number, a: { file_size: number | null }) => sum + (Number(a.file_size) || 0), 0)
  }

  return 0
}

/**
 * Get full quota info for a creator based on their subscription plan.
 */
export async function getCreatorQuota(
  admin: SupabaseClient,
  creatorId: string,
): Promise<QuotaInfo> {
  // Get creator plan
  const { data: creator, error } = await admin
    .from("creators")
    .select("subscription_plan_id")
    .eq("id", creatorId)
    .single()
  /* A plan read that failed is not Free's quota (round rel2-auth): thrown, so nobody is shown a smaller plan than they pay for. */
  if (error && error.code !== "PGRST116") throw new ServiceUnavailable("creator plan", "upstream")

  const planLimits = getPlanLimits(creator?.subscription_plan_id)
  const usedBytes = await getCreatorStorageUsage(admin, creatorId)
  const remainingBytes = Math.max(0, planLimits.storageQuotaBytes - usedBytes)
  const usagePercent = planLimits.storageQuotaBytes > 0
    ? Math.round((usedBytes / planLimits.storageQuotaBytes) * 100)
    : 0

  return {
    usedBytes,
    limitBytes: planLimits.storageQuotaBytes,
    remainingBytes,
    usagePercent,
    isOverQuota: usedBytes >= planLimits.storageQuotaBytes,
  }
}

/**
 * Check if a file can be uploaded within quota and size limits.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export async function checkUploadAllowed(
  admin: SupabaseClient,
  creatorId: string,
  fileSize: number,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  /* A size is a number the page sends; NaN or a negative one would pass every
     comparison below. */
  if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0) {
    return { allowed: false, reason: "That file is empty." }
  }

  const { data: creator, error } = await admin
    .from("creators")
    .select("subscription_plan_id")
    .eq("id", creatorId)
    .single()
  /* A plan read that failed is refused with a true reason, never measured against Free's limits (round rel2-auth). */
  if (error && error.code !== "PGRST116") return { allowed: false, reason: "Storelib is not answering right now. Try again." }

  const planLimits = getPlanLimits(creator?.subscription_plan_id)

  // Check individual file size limit
  if (fileSize > planLimits.maxFileSizeBytes) {
    const limitMB = Math.round(planLimits.maxFileSizeBytes / (1024 * 1024))
    return {
      allowed: false,
      reason: `File size exceeds your plan limit of ${limitMB} MB. Upgrade your plan for larger uploads.`,
    }
  }

  // Check storage quota
  const usedBytes = await getCreatorStorageUsage(admin, creatorId)
  if (usedBytes + fileSize > planLimits.storageQuotaBytes) {
    const limitGB = Math.round(planLimits.storageQuotaBytes / (1024 * 1024 * 1024))
    return {
      allowed: false,
      reason: `Upload would exceed your storage quota of ${limitGB} GB. Free up space or upgrade your plan.`,
    }
  }

  return { allowed: true }
}

/**
 * Increment storage usage tracking on the creator record (denormalized counter).
 */
export async function updateCreatorStorageUsed(
  admin: SupabaseClient,
  creatorId: string,
): Promise<void> {
  const usedBytes = await getCreatorStorageUsage(admin, creatorId)
  await admin
    .from("creators")
    .update({ storage_used_bytes: usedBytes })
    .eq("id", creatorId)
}
