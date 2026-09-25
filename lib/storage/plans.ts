/**
 * Plan-based storage configuration.
 * Defines upload limits, quotas, and download rules per plan tier.
 */

export const STORAGE_BUCKET = "digital-products" // single private bucket for all digital files
export const PUBLIC_BUCKET = "lead-form-files-v2" // public bucket for thumbnails/images
export const BUCKET_FILE_SIZE_LIMIT = 0 // 0 = no bucket-level limit (disables the check in Supabase Storage; only project-level global limit applies)

/**
 * The private buckets a paid file can live in: digital-products today,
 * product-files and digital-assets for files uploaded before it. A signed
 * download URL is only ever made for one of these, whatever a row says.
 */
export const DIGITAL_BUCKETS = [STORAGE_BUCKET, "product-files", "digital-assets"] as const

/** Global hard ceiling — effectively unlimited; actual limits are plan-based. */
export const MAX_FILE_SIZE_BYTES = Number.MAX_SAFE_INTEGER

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
    maxFileSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    maxDownloadsPerLink: 10,
    linkExpiryDays: 30,
    maxFilesPerProduct: 20,
    rateLimit: { uploadsPerHour: 150, downloadsPerHour: 500 },
  },
  growth: {
    storageQuotaBytes: 25 * 1024 * 1024 * 1024, // 25 GB
    maxFileSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB: the per-file ceiling on every plan (lib/storage/security MAX_DIGITAL_PRODUCT_FILE_SIZE)
    maxDownloadsPerLink: 100,
    linkExpiryDays: 90,
    maxFilesPerProduct: 100,
    rateLimit: { uploadsPerHour: 500, downloadsPerHour: 5000 },
  },
  pro: {
    storageQuotaBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    maxFileSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB, the same ceiling
    maxDownloadsPerLink: 9999,
    linkExpiryDays: 365,
    maxFilesPerProduct: 100,
    rateLimit: { uploadsPerHour: 1000, downloadsPerHour: 10000 },
  },
}

/**
 * The limits for a stored plan id. Case and spacing are ignored, and
 * "professional", an id from before the plans were renamed, is Pro, the same
 * reading as planDisplayName in lib/billing/plans.ts. Anything unknown is Free.
 */
export function getPlanLimits(planId: string | null | undefined): PlanLimits {
  const key = (planId || "free").toLowerCase().trim()
  const id = (key === "professional" ? "pro" : key) as PlanId
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
