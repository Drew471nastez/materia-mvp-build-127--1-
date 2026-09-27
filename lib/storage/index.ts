/**
 * Storage module barrel export.
 * Import from "@/lib/storage" to access all storage utilities.
 */

export {
  STORAGE_BUCKET,
  PUBLIC_BUCKET,
  DIGITAL_BUCKETS,
  BUCKET_FILE_SIZE_LIMIT,
  MAX_FILE_SIZE_BYTES,
  type PlanId,
  type PlanLimits,
  PLAN_LIMITS,
  getPlanLimits,
  isAllowedFileType,
  formatBytes,
} from "./plans"

export {
  type QuotaInfo,
  getCreatorStorageUsage,
  getCreatorQuota,
  checkUploadAllowed,
  updateCreatorStorageUsed,
} from "./quota"

export {
  validateFile,
  getFileCategory,
  sanitizeFileName,
  generateStoragePath,
  storageExtension,
} from "./validation"

export {
  generateSignedDownloadUrl,
  logDownloadEvent,
  checkDownloadRateLimit,
  checkUploadRateLimit,
  validateDownloadToken,
} from "./download"

export {
  type SecurityScanResult,
  BLOCKED_EXTENSIONS,
  scanFile,
  readFileHeader,
  readBufferHeader,
  preUploadCheck,
  MAX_DIGITAL_PRODUCT_FILE_SIZE,
} from "./security"

export {
  type ScanStatus,
  type ScanResult,
  updateAssetScanStatus,
  isAssetSafeToDownload,
  getPendingScanAssets,
  handleInfectedFile,
} from "./antivirus"
