/**
 * ===========================================================================
 *  WHERE A VIDEO UPLOAD MAY GO
 * ===========================================================================
 * /api/storage/upload-video used to take the bucket and folder from the
 * caller, and it creates a missing bucket as public with the service role,
 * so any signed in person could make public buckets or write into another
 * one. The only caller (components/app/image-upload.tsx) uses product-videos,
 * so that is the only bucket, and a folder is plain name segments under the
 * user's own id: no "..", no leading slash, nothing that leaves their prefix.
 */
export const VIDEO_BUCKET = "product-videos"

/** The bucket to use, or null when the caller asked for any other. */
export function videoBucketOf(asked: unknown): string | null {
  return asked === undefined || asked === null || asked === "" || asked === VIDEO_BUCKET ? VIDEO_BUCKET : null
}

/** Plain segments joined by "/", "" for none, or null when anything else was asked for. */
export function uploadFolderOf(asked: unknown): string | null {
  if (asked === undefined || asked === null || asked === "") return ""
  if (typeof asked !== "string" || asked.length > 120) return null
  const parts = asked.split("/").filter(Boolean)
  return parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)) ? parts.join("/") : null
}

/** A file's extension, reduced to what is safe in a storage key. */
export function safeExtension(name: string, fallback: string): string {
  return (name.split(".").pop()?.toLowerCase() || fallback).replace(/[^a-z0-9]/g, "").slice(0, 8) || fallback
}
