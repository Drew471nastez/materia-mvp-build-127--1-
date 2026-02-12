/**
 * Storage quota tracking and enforcement.
 * Checks per-creator storage usage against plan limits.
 */

import { type SupabaseClient } from "@supabase/supabase-js"
import { getPlanLimits, STORAGE_BUCKET, PUBLIC_BUCKET } from "./plans"

export interface QuotaInfo {
  usedBytes: number
  limitBytes: number
  remainingBytes: number
  usagePercent: number
  isOverQuota: boolean
}

/**
 * Get storage usage for a creator by summing digital_assets.file_size.
 * Falls back to listing storage objects if file_size is not populated.
 */
export async function getCreatorStorageUsage(
  admin: SupabaseClient,
  creatorId: string,
): Promise<number> {
  // Primary: sum from digital_assets via product ownership
  const { data, error } = await admin.rpc("get_creator_storage_usage", {
    p_creator_id: creatorId,
  })

  if (!error && typeof data === "number") {
    return data
  }

  // Fallback: query digital_assets directly
  const { data: assets } = await admin
    .from("digital_assets")
    .select("file_size, product:products!inner(creator_id)")
    .eq("products.creator_id", creatorId)

  if (assets && assets.length > 0) {
    return assets.reduce((sum: number, a: { file_size: number | null }) => sum + (a.file_size || 0), 0)
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
  const { data: creator } = await admin
    .from("creators")
    .select("subscription_plan_id")
    .eq("id", creatorId)
    .single()

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
  const { data: creator } = await admin
    .from("creators")
    .select("subscription_plan_id")
    .eq("id", creatorId)
    .single()

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
