/**
 * Plan-based storage configuration.
 * Defines upload limits, quotas, and download rules per plan tier.
 */

export const STORAGE_BUCKET = "digital-products" // single private bucket for all digital files
export const PUBLIC_BUCKET = "lead-form-files-v2" // public bucket for thumbnails/images
export const BUCKET_FILE_SIZE_LIMIT = 0 // 0 = no bucket-level limit (disables the check in Supabase Storage; only project-level global limit applies)

/** Hard ceiling: 5 GB per-file for digital product uploads (enforced everywhere). */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB

export type PlanId = "free" | "growth" | "pro"

export interface PlanLimits {
  storageQuotaBytes: number
  maxFileSizeBytes: number
  maxDownloadsPerLink: number
  linkExpiryDays: number
  maxFilesPerProduct: number
  rateLimit: { uploadsPerHour: number; downloadsPerHour: number }
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    storageQuotaBytes: 1 * 1024 * 1024 * 1024, // 1 GB
    maxFileSizeBytes: 250 * 1024 * 1024, // 250 MB
    maxDownloadsPerLink: 10,
    linkExpiryDays: 30,
    maxFilesPerProduct: 3,
    rateLimit: { uploadsPerHour: 10, downloadsPerHour: 50 },
  },
  growth: {
    storageQuotaBytes: 25 * 1024 * 1024 * 1024, // 25 GB
    maxFileSizeBytes: 2 * 1024 * 1024 * 1024, // 2 GB
    maxDownloadsPerLink: 100,
    linkExpiryDays: 90,
    maxFilesPerProduct: 10,
    rateLimit: { uploadsPerHour: 50, downloadsPerHour: 500 },
  },
  pro: {
    storageQuotaBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    maxFileSizeBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    maxDownloadsPerLink: 9999,
    linkExpiryDays: 365,
    maxFilesPerProduct: 50,
    rateLimit: { uploadsPerHour: 200, downloadsPerHour: 5000 },
  },
}

export function getPlanLimits(planId: string | null | undefined): PlanLimits {
  const id = (planId || "free") as PlanId
  return PLAN_LIMITS[id] ?? PLAN_LIMITS.free
}

/**
 * Check if a file type is allowed for upload.
 * Policy: allow ANY file type — dangerous types are blocked by the security scanner
 * in validation.ts / security.ts (extension blocklist + magic byte analysis).
 */
export function isAllowedFileType(_mimeType: string): boolean {
  return true
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
