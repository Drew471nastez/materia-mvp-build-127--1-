/**
 * ===========================================================================
 *  WHAT A FILE IS, FROM ITS FIRST BYTES
 * ===========================================================================
 * The name and the Content-Type of an upload are both chosen by whoever sends
 * it. Neither says what the bytes are. This reads the bytes: the first few
 * hundred of every common format are fixed, so a PNG renamed .pdf is still a
 * PNG here, and an HTML page labelled image/jpeg is not a picture.
 *
 * Isomorphic and dependency free, so the same reading runs on the server
 * (every route that stores bytes) and in tests.
 *
 * Two questions are answered, and they are different:
 *
 *   isPublicImage   May this go in a PUBLIC bucket as a picture? Raster
 *                   formats only. SVG is refused everywhere public: it is a
 *                   document that can carry script, and a public bucket
 *                   serves it from a real origin to anybody holding the URL.
 *
 *   matchesDeclared Does a declared media type agree with the bytes? Used for
 *                   video and for the few other kinds a public bucket takes.
 */

export type FileFamily = "image" | "video" | "audio" | "pdf" | "archive" | "font" | "document" | "executable" | "markup" | "unknown"

export interface Sniffed {
  /** The media type the bytes say, or null when the format is not one we recognise. */
  mime: string | null
  family: FileFamily
  /** The extension the bytes deserve, for a server built storage key. */
  ext: string | null
}

const UNKNOWN: Sniffed = { mime: null, family: "unknown", ext: null }

function at(bytes: Uint8Array, offset: number, sig: readonly number[]): boolean {
  if (bytes.length < offset + sig.length) return false
  for (let i = 0; i < sig.length; i++) if (bytes[offset + i] !== sig[i]) return false
  return true
}

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false
  for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false
  return true
}

/** The ISO base media brand (MP4, MOV, HEIC, AVIF all share the `ftyp` box). */
function isoBrand(bytes: Uint8Array): string | null {
  if (!ascii(bytes, 4, "ftyp") || bytes.length < 12) return null
  return String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
}

/** Leading text, lower cased, for the formats that are text (HTML, SVG, XML, scripts). */
function leadingText(bytes: Uint8Array, max = 512): string {
  let start = 0
  if (at(bytes, 0, [0xef, 0xbb, 0xbf])) start = 3
  let out = ""
  const end = Math.min(bytes.length, start + max)
  for (let i = start; i < end; i++) {
    const c = bytes[i]
    if (c === 0) break
    out += String.fromCharCode(c)
  }
  return out.trimStart().toLowerCase()
}

export function sniff(input: Uint8Array | ArrayBuffer | null | undefined): Sniffed {
  if (!input) return UNKNOWN
  const b = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (b.length < 4) return UNKNOWN

  // Pictures.
  if (at(b, 0, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", family: "image", ext: "jpg" }
  if (at(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", family: "image", ext: "png" }
  if (ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a")) return { mime: "image/gif", family: "image", ext: "gif" }
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return { mime: "image/webp", family: "image", ext: "webp" }
  if (at(b, 0, [0x42, 0x4d]) && b.length > 26) return { mime: "image/bmp", family: "image", ext: "bmp" }
  if (at(b, 0, [0x49, 0x49, 0x2a, 0x00]) || at(b, 0, [0x4d, 0x4d, 0x00, 0x2a])) return { mime: "image/tiff", family: "image", ext: "tif" }

  const brand = isoBrand(b)
  if (brand) {
    if (brand === "avif" || brand === "avis") return { mime: "image/avif", family: "image", ext: "avif" }
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) {
      return { mime: "image/heic", family: "image", ext: "heic" }
    }
    if (brand === "qt  ") return { mime: "video/quicktime", family: "video", ext: "mov" }
    if (brand === "M4A " || brand === "M4B ") return { mime: "audio/mp4", family: "audio", ext: "m4a" }
    if (brand === "3gp4" || brand === "3gp5" || brand === "3g2a") return { mime: "video/3gpp", family: "video", ext: "3gp" }
    return { mime: "video/mp4", family: "video", ext: "mp4" }
  }

  // Video and audio.
  if (at(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "video/webm", family: "video", ext: "webm" }
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "AVI ")) return { mime: "video/x-msvideo", family: "video", ext: "avi" }
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE")) return { mime: "audio/wav", family: "audio", ext: "wav" }
  if (ascii(b, 0, "FORM") && (ascii(b, 8, "AIFF") || ascii(b, 8, "AIFC"))) return { mime: "audio/aiff", family: "audio", ext: "aif" }
  if (ascii(b, 0, "MThd")) return { mime: "audio/midi", family: "audio", ext: "mid" }
  if (ascii(b, 0, "OggS")) return { mime: "audio/ogg", family: "audio", ext: "ogg" }
  if (ascii(b, 0, "fLaC")) return { mime: "audio/flac", family: "audio", ext: "flac" }
  if (ascii(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { mime: "audio/mpeg", family: "audio", ext: "mp3" }
  if (at(b, 0, [0x00, 0x00, 0x01, 0xba]) || at(b, 0, [0x00, 0x00, 0x01, 0xb3])) return { mime: "video/mpeg", family: "video", ext: "mpg" }

  // Documents and containers.
  if (ascii(b, 0, "%PDF-")) return { mime: "application/pdf", family: "pdf", ext: "pdf" }
  if (at(b, 0, [0x50, 0x4b, 0x03, 0x04]) || at(b, 0, [0x50, 0x4b, 0x05, 0x06])) {
    return { mime: "application/zip", family: "archive", ext: "zip" }
  }
  if (ascii(b, 0, "Rar!")) return { mime: "application/vnd.rar", family: "archive", ext: "rar" }
  if (at(b, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return { mime: "application/x-7z-compressed", family: "archive", ext: "7z" }
  if (at(b, 0, [0x1f, 0x8b])) return { mime: "application/gzip", family: "archive", ext: "gz" }
  if (ascii(b, 0, "BZh")) return { mime: "application/x-bzip2", family: "archive", ext: "bz2" }
  if (at(b, 0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return { mime: "application/x-xz", family: "archive", ext: "xz" }
  if (ascii(b, 257, "ustar")) return { mime: "application/x-tar", family: "archive", ext: "tar" }
  if (ascii(b, 0, "8BPS")) return { mime: "image/vnd.adobe.photoshop", family: "document", ext: "psd" }
  if (at(b, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { mime: "application/x-ole-storage", family: "document", ext: null }
  if (ascii(b, 0, "{\\rtf")) return { mime: "application/rtf", family: "document", ext: "rtf" }
  if (ascii(b, 0, "SQLite format 3")) return { mime: "application/vnd.sqlite3", family: "document", ext: null }
  if (ascii(b, 0, "BLENDER")) return { mime: "application/x-blender", family: "document", ext: "blend" }
  if (ascii(b, 0, "Kaydara FBX Binary")) return { mime: "application/octet-stream", family: "document", ext: "fbx" }
  if (ascii(b, 0, "wOF2")) return { mime: "font/woff2", family: "font", ext: "woff2" }
  if (ascii(b, 0, "wOFF")) return { mime: "font/woff", family: "font", ext: "woff" }
  if (at(b, 0, [0x00, 0x01, 0x00, 0x00]) || ascii(b, 0, "OTTO")) return { mime: "font/ttf", family: "font", ext: "ttf" }

  // Things that run.
  if (at(b, 0, [0x4d, 0x5a])) return { mime: "application/x-msdownload", family: "executable", ext: null }
  if (at(b, 0, [0x7f, 0x45, 0x4c, 0x46])) return { mime: "application/x-executable", family: "executable", ext: null }
  if (
    at(b, 0, [0xfe, 0xed, 0xfa, 0xce]) ||
    at(b, 0, [0xfe, 0xed, 0xfa, 0xcf]) ||
    at(b, 0, [0xce, 0xfa, 0xed, 0xfe]) ||
    at(b, 0, [0xcf, 0xfa, 0xed, 0xfe]) ||
    at(b, 0, [0xca, 0xfe, 0xba, 0xbe])
  ) {
    return { mime: "application/x-mach-binary", family: "executable", ext: null }
  }
  if (ascii(b, 0, "#!")) return { mime: "text/x-shellscript", family: "executable", ext: null }

  // Markup a browser would render, and so run.
  const text = leadingText(b)
  if (/^<\?xml[\s\S]*<svg[\s>]/.test(text) || /^<svg[\s>]/.test(text) || /^<!--[\s\S]*<svg[\s>]/.test(text)) {
    return { mime: "image/svg+xml", family: "markup", ext: null }
  }
  if (/^<!doctype html|^<html[\s>]|^<head[\s>]|^<body[\s>]|^<script[\s>]|^<iframe[\s>]/.test(text)) {
    return { mime: "text/html", family: "markup", ext: null }
  }
  if (/^<\?xml/.test(text)) return { mime: "application/xml", family: "markup", ext: null }

  return UNKNOWN
}

/**
 * Raster formats a public bucket may hold as a picture, and a browser can
 * show. HEIC is not one of them: only Safari draws it, and it carries its
 * EXIF in a form lib/images/metadata.ts does not rewrite. iOS converts to
 * JPEG when a web page asks for a picture. SVG never is.
 */
export const PUBLIC_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const

/** A declared type that promises one of PUBLIC_IMAGE_TYPES, allowing for the old spellings browsers still send. */
export function declaresPublicImage(contentType: string | null | undefined): boolean {
  const d = (contentType || "").split(";")[0].trim().toLowerCase()
  const normal = d === "image/jpg" || d === "image/pjpeg" ? "image/jpeg" : d === "image/x-png" ? "image/png" : d
  return (PUBLIC_IMAGE_TYPES as readonly string[]).includes(normal)
}

export function isPublicImage(bytes: Uint8Array | ArrayBuffer | null | undefined): Sniffed | null {
  const s = sniff(bytes)
  return s.mime && (PUBLIC_IMAGE_TYPES as readonly string[]).includes(s.mime) ? s : null
}

/** Video containers a public bucket may hold. */
export const PUBLIC_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/mpeg", "video/x-msvideo"] as const

export function isPublicVideo(bytes: Uint8Array | ArrayBuffer | null | undefined): Sniffed | null {
  const s = sniff(bytes)
  return s.mime && (PUBLIC_VIDEO_TYPES as readonly string[]).includes(s.mime) ? s : null
}

/**
 * Whether the bytes agree with the kind of file that was declared. Only the
 * family is compared (a video/x-m4v that is really an MP4 is fine), and a
 * format we do not recognise agrees with nothing, so callers decide what an
 * unknown format means for them.
 */
export function matchesDeclared(bytes: Uint8Array | ArrayBuffer | null | undefined, declared: string): boolean {
  const s = sniff(bytes)
  const d = (declared || "").toLowerCase().split(";")[0].trim()
  if (!s.mime) return false
  if (s.mime === d) return true
  if (s.family === "image") return d.startsWith("image/") && d !== "image/svg+xml"
  if (s.family === "video") return d.startsWith("video/")
  if (s.family === "audio") return d.startsWith("audio/") || (s.mime === "audio/mp4" && d === "video/mp4")
  if (s.family === "font") return d.startsWith("font/") || d.startsWith("application/font") || d === "application/x-font-ttf"
  if (s.family === "pdf") return d === "application/pdf"
  if (s.family === "archive") return /zip|rar|7z|gzip|tar|compressed|epub|officedocument|octet-stream/.test(d)
  return false
}

/**
 * Content types that must never be stored under a public URL, whatever the
 * bytes: each one is a document a browser renders and so a page somebody can
 * host with our name on it.
 */
const RENDERED = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript|application\/ecmascript|text\/ecmascript)/i

export function isRenderedDocumentType(contentType: string | null | undefined): boolean {
  return RENDERED.test((contentType || "").trim())
}

/**
 * The Content-Type to store a file under in a bucket anybody can read. A
 * recognised media type is kept; anything a browser would render becomes a
 * download (application/octet-stream), so a public URL can serve a file but
 * never a page.
 */
export function safeStoredContentType(declared: string | null | undefined, bytes?: Uint8Array | null): string {
  const s = bytes ? sniff(bytes) : UNKNOWN
  if (s.family === "markup" || s.family === "executable") return "application/octet-stream"
  if (s.mime && s.family !== "unknown") return s.mime
  const d = (declared || "").split(";")[0].trim().toLowerCase()
  if (!d || isRenderedDocumentType(d) || !/^[a-z]+\/[a-z0-9.+-]+$/.test(d)) return "application/octet-stream"
  return d
}
