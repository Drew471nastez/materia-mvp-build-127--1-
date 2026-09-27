/**
 * File validation utilities for uploads: the declared type resolved, the
 * category, and a path built by the server. Whether a file may be uploaded at
 * all is the central check's (lib/security/uploads/inspect.ts
 * precheckUpload), so this answers with it and keeps no list of its own.
 *
 * Policy: allow any product file type except the ones that run when opened.
 */

import { precheckUpload, storageSafeName, type UploadContext } from "@/lib/security/uploads"

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
  rtf: "application/rtf",
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
  // 3D / Design
  psd: "image/vnd.adobe.photoshop",
  ai: "application/postscript",
  sketch: "application/octet-stream",
  fig: "application/octet-stream",
  blend: "application/octet-stream",
  stl: "model/stl",
  obj: "model/obj",
  fbx: "application/octet-stream",
  // Other digital products
  json: "application/json",
  xml: "application/xml",
  yaml: "application/x-yaml",
  yml: "application/x-yaml",
  sql: "application/sql",
  md: "text/markdown",
}

export interface ValidationResult {
  valid: boolean
  reason?: string
  /** The central check's code, for the security log. */
  code?: string
  resolvedMimeType: string
  fileCategory: string
}

/**
 * Validate a file for upload.
 * Checks security blocklist, resolves MIME type, and checks basic integrity.
 * Now allows ANY file type except blocked dangerous extensions.
 */
export function validateFile(
  fileName: string,
  contentType: string,
  fileSize: number,
  _fileHeader?: ArrayBuffer | Uint8Array | null,
  context: UploadContext = "product_file",
): ValidationResult {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""

  // Resolve MIME type from extension if missing or generic
  let resolvedMime = contentType
  if (!contentType || contentType === "application/octet-stream") {
    resolvedMime = EXT_TO_MIME[ext] || "application/octet-stream"
  }
  const fileCategory = getFileCategory(resolvedMime)

  /* Size, name and declared type, by the one rule every upload path uses. */
  const verdict = precheckUpload({ fileName, size: fileSize, declaredMime: contentType, context })
  if (!verdict.ok) {
    return { valid: false, reason: verdict.userMessage, resolvedMimeType: resolvedMime, fileCategory: verdict.code === "too_large" || verdict.code === "empty" ? fileCategory : "blocked", code: verdict.code }
  }
  return { valid: true, resolvedMimeType: resolvedMime, fileCategory }
}

/**
 * Get the category of a file based on MIME type.
 */
export function getFileCategory(mimeType: string): string {
  if (mimeType.startsWith("audio/")) return "audio"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("font/")) return "font"
  if (mimeType.startsWith("model/")) return "3d"
  if (mimeType === "application/pdf") return "document"
  if (mimeType.includes("wordprocessing") || mimeType.includes("msword")) return "document"
  if (mimeType.includes("spreadsheet") || mimeType.includes("ms-excel")) return "document"
  if (mimeType.includes("presentation") || mimeType.includes("ms-powerpoint")) return "document"
  if (mimeType === "text/plain" || mimeType === "text/csv" || mimeType === "text/markdown") return "document"
  if (mimeType === "application/rtf") return "document"
  if (mimeType === "application/zip" || mimeType === "application/x-rar-compressed" ||
      mimeType === "application/gzip" || mimeType === "application/x-7z-compressed" ||
      mimeType === "application/x-tar") return "archive"
  if (mimeType === "application/epub+zip" || mimeType === "application/x-mobipocket-ebook") return "ebook"
  return "other"
}

/**
 * Sanitize a filename for storage (lib/security/uploads/filename.ts).
 */
export function sanitizeFileName(fileName: string): string {
  return storageSafeName(fileName, 200)
}

/**
 * A random id for a storage key: 128 bits from the platform's CSPRNG, so a
 * path cannot be guessed from another one. Math.random gave 41 bits from a
 * generator that is not meant for secrets.
 */
function randomKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "")
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16))
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

/** The extension of a name, reduced to letters and digits (a name is the uploader's). */
export function storageExtension(fileName: string, fallback = "bin"): string {
  const dot = fileName.lastIndexOf(".")
  const raw = dot === -1 ? "" : fileName.slice(dot + 1)
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || fallback
}

/**
 * Generate a unique storage path for a file: the owner's id, a fixed folder,
 * a time and a random key. Nothing from the uploader but a cleaned extension.
 */
export function generateStoragePath(
  creatorId: string,
  fileName: string,
  subfolder: "digital-products" | "product-images" = "digital-products",
): string {
  const ext = storageExtension(fileName)
  const timestamp = Date.now()
  return `${creatorId}/${subfolder}/${timestamp}-${randomKey()}.${ext}`
}
