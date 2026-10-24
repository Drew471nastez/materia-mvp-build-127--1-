/**
 * ===========================================================================
 *  WHAT A ONEPAGE PICTURE OR VIDEO MAY BE, AND HOW IT GOES UP
 * ===========================================================================
 * Every picture and video the OnePage editor takes (profile photo and
 * video, logo, wallpaper picture and video, link thumbnails, image blocks)
 * is checked here first, in plain words, and then sent by
 * lib/onepage/media-upload.ts straight from the browser to Supabase Storage.
 * Nothing here touches the DOM or the network, so it is tested on its own
 * (tests/onepage-media-r11.test.ts).
 *
 * THE BYTES NEVER GO THROUGH A NEXT.JS ROUTE. A Vercel function takes 4.5 MB
 * of body, so a video sent through one fails long before it is a video. Up
 * to SINGLE_REQUEST_MAX_BYTES a file is one request to storage; above it, it
 * goes by TUS, Supabase's resumable upload, in 6 MB parts, which is what
 * storage itself asks for anything larger than that, and which a dropped
 * phone connection continues instead of starting again.
 *
 * LIMITS. A video may be up to 2 GB (MAX_ONEPAGE_VIDEO_BYTES, 2 GiB so a
 * file a phone calls "2 GB" fits). The onepage-assets bucket's own limit says
 * the same (SQL part 282), and the project's upload limit in the Supabase
 * dashboard (Storage, Settings) has to be at least that too: it caps every
 * bucket, and it is 50 MB until somebody raises it.
 */

export const ONEPAGE_MEDIA_BUCKET = "onepage-assets"

const MB = 1024 * 1024
/** 2 GiB: the largest video a OnePage takes. Same number as the bucket's limit (SQL part 282). */
export const MAX_ONEPAGE_VIDEO_BYTES = 2 * 1024 * MB
/** The largest picture taken as it was chosen. A larger one is made smaller in the browser first. */
export const MAX_STORED_IMAGE_BYTES = 25 * MB
/** The largest picture file the browser will even open to make smaller. */
export const MAX_SOURCE_IMAGE_BYTES = 80 * MB
/** Up to this, one request; above it, resumable parts. Supabase's own advice. */
export const SINGLE_REQUEST_MAX_BYTES = 6 * MB
/** Supabase's TUS endpoint takes parts of exactly this size (the last may be smaller). */
export const TUS_PART_BYTES = 6 * MB

export const ONEPAGE_VIDEO_TYPES: Readonly<Record<string, string>> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
}
/** Pictures a browser draws and storage keeps as they are. */
export const ONEPAGE_IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}
/** iPhone photos: only Safari draws them, so they are turned into a JPEG before they go up. */
export const ONEPAGE_CONVERT_TYPES: Readonly<Record<string, string>> = {
  "image/heic": "heic",
  "image/heif": "heif",
  "image/heic-sequence": "heic",
  "image/heif-sequence": "heif",
}

/**
 * The file input's accept for a video. The extensions are there because some
 * Android pickers and Windows give a .mov or .m4v no type at all.
 */
export const ONEPAGE_VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm"
/**
 * For a picture. `image/*` on purpose: on an iPhone it makes Photos hand over
 * a JPEG instead of the HEIC, and a HEIC chosen anywhere else is still taken
 * and turned into a JPEG here.
 */
export const ONEPAGE_IMAGE_ACCEPT = "image/*,.heic,.heif"

const EXT_TYPES: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", qt: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v",
  jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif",
  heic: "image/heic", heif: "image/heif", hif: "image/heif",
}

export type MediaKind = "image" | "video"
export type MediaWant = MediaKind | "any"

export interface MediaInfo {
  kind: MediaKind
  /** The type it is stored under. */
  mime: string
  /** The extension it is stored under. */
  ext: string
  /** A HEIC that must become a JPEG first. */
  convert: boolean
}

export type MediaRefusal = "type" | "too_large" | "empty"

/** One flat shape (not a union), so it narrows the same with or without strict null checks. */
export interface MediaVerdict {
  ok: boolean
  /** Why not, when not ok. */
  code: MediaRefusal | null
  /** What was asked for or found; null when neither is known. */
  kind: MediaKind | null
  mime: string
  ext: string
  convert: boolean
}

function extOf(name: string | undefined | null): string {
  const m = /\.([a-z0-9]{1,6})$/i.exec(String(name || ""))
  return m ? m[1].toLowerCase() : ""
}

/**
 * What a chosen file is, from its declared type, or from its name when the
 * browser declared nothing useful (an empty type or octet-stream, which is
 * what storage then refused: "mime type application/octet-stream is not
 * supported").
 */
export function classifyMedia(file: { name?: string; type?: string }): MediaInfo | null {
  let type = String(file.type || "").split(";")[0].trim().toLowerCase()
  if (type === "image/jpg" || type === "image/pjpeg") type = "image/jpeg"
  if (type === "video/mov") type = "video/quicktime"
  if (!type || type === "application/octet-stream" || !(type in ONEPAGE_VIDEO_TYPES || type in ONEPAGE_IMAGE_TYPES || type in ONEPAGE_CONVERT_TYPES)) {
    const byName = EXT_TYPES[extOf(file.name)]
    if (byName && (!type || type === "application/octet-stream" || type.startsWith(byName.split("/")[0] + "/"))) type = byName
  }
  if (ONEPAGE_VIDEO_TYPES[type]) return { kind: "video", mime: type, ext: ONEPAGE_VIDEO_TYPES[type], convert: false }
  if (ONEPAGE_IMAGE_TYPES[type]) return { kind: "image", mime: type, ext: ONEPAGE_IMAGE_TYPES[type], convert: false }
  if (ONEPAGE_CONVERT_TYPES[type]) return { kind: "image", mime: "image/jpeg", ext: "jpg", convert: true }
  return null
}

/** Whether a chosen file may go up where `want` is asked for, and as what. */
export function checkMedia(file: { name?: string; type?: string; size: number }, want: MediaWant): MediaVerdict {
  const info = classifyMedia(file)
  const asked: MediaKind | null = want === "any" ? info?.kind ?? null : want
  const no = (code: MediaRefusal, kind: MediaKind | null): MediaVerdict => ({ ok: false, code, kind, mime: "", ext: "", convert: false })
  if (!info || (want !== "any" && info.kind !== want)) return no("type", asked)
  if (!(file.size > 0)) return no("empty", info.kind)
  const limit = info.kind === "video" ? MAX_ONEPAGE_VIDEO_BYTES : MAX_SOURCE_IMAGE_BYTES
  if (file.size > limit) return no("too_large", info.kind)
  return { ok: true, code: null, ...info }
}

/** One request, or resumable parts. */
export function uploadRoute(size: number): "single" | "resumable" {
  return size > SINGLE_REQUEST_MAX_BYTES ? "resumable" : "single"
}

/** Whether a picture is sent as chosen, or made into a smaller (or a JPEG) one first. */
export function imageNeedsReencode(info: MediaInfo, size: number): boolean {
  if (info.kind !== "image") return false
  if (info.convert) return true
  /* An animated GIF would lose its motion on a canvas; it goes as it is, up to the limit. */
  if (info.mime === "image/gif") return false
  return size > MAX_STORED_IMAGE_BYTES
}

/** Where a file goes: always under the signed in person's own folder, which is all storage lets them write. */
export function mediaPath(ownerId: string, prefix: string, ext: string, now = Date.now(), random = Math.random().toString(36).slice(2, 10)): string {
  const safePrefix = prefix.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "media"
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5) || "bin"
  return `${ownerId}/${safePrefix}-${now}-${random}.${safeExt}`
}

/** A storage path, each folder encoded, for a URL. */
export function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/")
}

/** The address a public bucket serves a file at (what supabase-js getPublicUrl returns). */
export function publicMediaUrl(base: string, bucket: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${encodePath(path)}`
}

export type UploadFailure = "too_large" | "type" | "auth" | "network" | "stalled" | "cancelled" | "server"

/**
 * What storage's answer means, in one of a few words the page has a sentence
 * for. 413, or a "maximum size exceeded", is the bucket's limit or, more
 * often, the project's upload limit in the Supabase dashboard.
 */
export function readStorageFailure(status: number, body: string): UploadFailure {
  const text = String(body || "").toLowerCase()
  if (status === 413 || /maximum (allowed )?size|exceeded the maximum|payload too large|too large|entity too large/.test(text)) return "too_large"
  if (status === 415 || /mime type|invalid_mime_type|not supported/.test(text)) return "type"
  if (status === 401 || status === 403 || /jwt|unauthor|row-level security|not allowed|policy/.test(text)) return "auth"
  if (status === 0) return "network"
  return "server"
}

/** Whether trying the same request again could help. */
export function retryable(f: UploadFailure, status: number): boolean {
  return f === "network" || f === "stalled" || (f === "server" && (status === 0 || status >= 500 || status === 409 || status === 423 || status === 429))
}

/** "312 MB", "1.4 GB": a size as a person reads it. */
export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return "0 MB"
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(bytes >= 10 * 1024 * MB ? 0 : 1)} GB`
  if (bytes >= MB) return `${Math.max(1, Math.round(bytes / MB))} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
