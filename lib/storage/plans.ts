/**
 * Plan-based storage configuration.
 * Defines upload limits, quotas, and download rules per plan tier.
 */

export const STORAGE_BUCKET = "digital-products" // single private bucket for all digital files
export const PUBLIC_BUCKET = "lead-form-files-v2" // public bucket for thumbnails/images
export const BUCKET_FILE_SIZE_LIMIT = 0 // 0 = no bucket-level limit (disables the check in Supabase Storage; only project-level global limit applies)

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
    maxFileSizeBytes: 20 * 1024 * 1024 * 1024, // 20 GB
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

/** MIME types allowed for digital product uploads. */
export const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/flac", "audio/aac", "audio/x-m4a", "audio/mp4"],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/mpeg", "video/ogg"],
  image: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/tiff"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
  ],
  archive: ["application/zip", "application/x-rar-compressed", "application/gzip", "application/x-7z-compressed", "application/x-tar"],
  ebook: ["application/epub+zip", "application/x-mobipocket-ebook"],
  font: ["font/ttf", "font/otf", "font/woff", "font/woff2"],
  other: ["application/octet-stream"], // fallback for unknown types
}

const ALL_ALLOWED_MIMES = new Set(Object.values(ALLOWED_FILE_TYPES).flat())

/** Returns true if the MIME type is allowed for upload. Permissive: allows application/octet-stream. */
export function isAllowedFileType(mimeType: string): boolean {
  if (!mimeType) return true // no type = allow (will be stored as octet-stream)
  return ALL_ALLOWED_MIMES.has(mimeType) || mimeType.startsWith("audio/") || mimeType.startsWith("video/")
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
