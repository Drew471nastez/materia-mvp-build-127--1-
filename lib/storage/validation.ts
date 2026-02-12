/**
 * File validation utilities for uploads.
 * Validates MIME types, file extensions, and basic integrity checks.
 */

import { isAllowedFileType, ALLOWED_FILE_TYPES } from "./plans"

/** Map common extensions to MIME types for validation when Content-Type is missing/wrong. */
const EXT_TO_MIME: Record<string, string> = {
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/x-m4a",
  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/avi",
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  tiff: "image/tiff",
  tif: "image/tiff",
  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  // Archives
  zip: "application/zip",
  rar: "application/x-rar-compressed",
  gz: "application/gzip",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  // Ebooks
  epub: "application/epub+zip",
  mobi: "application/x-mobipocket-ebook",
  // Fonts
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
}

/** File extensions that are always blocked (executable / dangerous). */
const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "scr", "pif", "msi", "msp", "mst",
  "cpl", "hta", "inf", "ins", "isp", "jse", "lnk", "reg", "rgs",
  "sct", "shb", "shs", "vbe", "vbs", "wsc", "wsf", "wsh", "ws",
  "ps1", "psm1", "psd1", "ps1xml", "ps2", "ps2xml",
])

export interface ValidationResult {
  valid: boolean
  reason?: string
  resolvedMimeType: string
  fileCategory: string
}

/**
 * Validate a file for upload.
 */
export function validateFile(
  fileName: string,
  contentType: string,
  fileSize: number,
): ValidationResult {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""

  // Block dangerous extensions
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      reason: `File type .${ext} is not allowed for security reasons.`,
      resolvedMimeType: contentType,
      fileCategory: "blocked",
    }
  }

  // Resolve MIME type from extension if missing or generic
  let resolvedMime = contentType
  if (!contentType || contentType === "application/octet-stream") {
    resolvedMime = EXT_TO_MIME[ext] || "application/octet-stream"
  }

  // Check allowed MIME types
  if (!isAllowedFileType(resolvedMime)) {
    return {
      valid: false,
      reason: `File type ${resolvedMime} is not supported.`,
      resolvedMimeType: resolvedMime,
      fileCategory: "unknown",
    }
  }

  // Determine category
  const fileCategory = getFileCategory(resolvedMime)

  // Basic file size sanity check (must be > 0)
  if (fileSize <= 0) {
    return {
      valid: false,
      reason: "File is empty.",
      resolvedMimeType: resolvedMime,
      fileCategory,
    }
  }

  return {
    valid: true,
    resolvedMimeType: resolvedMime,
    fileCategory,
  }
}

/**
 * Get the category of a file based on MIME type.
 */
export function getFileCategory(mimeType: string): string {
  for (const [category, mimes] of Object.entries(ALLOWED_FILE_TYPES)) {
    if (mimes.includes(mimeType)) return category
  }
  if (mimeType.startsWith("audio/")) return "audio"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("image/")) return "image"
  return "other"
}

/**
 * Sanitize a filename for storage (remove unsafe characters).
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 200)
}

/**
 * Generate a unique storage path for a file.
 */
export function generateStoragePath(
  creatorId: string,
  fileName: string,
  subfolder: "digital-products" | "product-images" = "digital-products",
): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "bin"
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 10)
  return `${creatorId}/${subfolder}/${timestamp}-${random}.${ext}`
}
