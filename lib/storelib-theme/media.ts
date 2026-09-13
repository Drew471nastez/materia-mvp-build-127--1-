/**
 * ===========================================================================
 *  THE MEDIA THAT TRAVELS WITH A THEME
 * ===========================================================================
 * Exporting a website is supposed to carry the website — the pictures in it,
 * the video behind the hero, the PDF the download button points at — so that
 * importing it somewhere else produces the site, not its skeleton.
 *
 * It carried images. Only images: the collector matched an image extension
 * and nothing else, and the video behind a hero was left as the URL it
 * already was. That is worse than dropping it. The URL points at the
 * EXPORTING creator's bucket, so the imported site quietly serves its video
 * off a stranger's storage — they pay the bandwidth, and the day they tidy
 * up their own files somebody else's site breaks with no way to find out why.
 *
 * So this module is the one list both halves read. An extension that is not
 * in it does not travel and is not accepted, and the export and the import
 * cannot drift apart into disagreeing about what a theme may contain.
 */

/** What a piece of media IS, which decides how big it is allowed to be. */
export type MediaKind = "image" | "video" | "audio" | "file"

export interface MediaType {
  kind: MediaKind
  mime: string
}

/**
 * Extension to type. The extension is the only thing trusted about a file in
 * a package — never the mime type written in its manifest, which is supplied
 * by whoever built the package. What is uploaded is served as the type this
 * table gives, so a file claiming to be a PNG is served as a PNG whatever is
 * actually inside it.
 */
export const MEDIA_TYPES: Record<string, MediaType> = {
  // Pictures
  jpg:  { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  png:  { kind: "image", mime: "image/png" },
  gif:  { kind: "image", mime: "image/gif" },
  webp: { kind: "image", mime: "image/webp" },
  avif: { kind: "image", mime: "image/avif" },
  svg:  { kind: "image", mime: "image/svg+xml" },

  // Video. The bucket already accepts these; nothing was ever sent to it.
  mp4:  { kind: "video", mime: "video/mp4" },
  webm: { kind: "video", mime: "video/webm" },
  mov:  { kind: "video", mime: "video/quicktime" },

  // Sound
  mp3:  { kind: "audio", mime: "audio/mpeg" },
  m4a:  { kind: "audio", mime: "audio/mp4" },
  wav:  { kind: "audio", mime: "audio/wav" },
  ogg:  { kind: "audio", mime: "audio/ogg" },

  // What a download button points at
  pdf:  { kind: "file", mime: "application/pdf" },
  zip:  { kind: "file", mime: "application/zip" },
}

/**
 * How big one of each may be.
 *
 * A hero video is the reason the video number is not the image number. It is
 * also the reason there is a cap at all: a theme is a thing people send each
 * other, and one carrying a 400MB uncompressed screen recording is a theme
 * nobody can send.
 */
export const MAX_BYTES: Record<MediaKind, number> = {
  image: 15 * 1024 * 1024,
  video: 64 * 1024 * 1024,
  audio: 24 * 1024 * 1024,
  file: 24 * 1024 * 1024,
}

/**
 * And how much of it, altogether.
 *
 * LIMITS.packageBytes is the hard ceiling the package format enforces; this
 * is the budget the export spends before it gets there, so a theme with six
 * videos in it comes back with a sentence about what was left out rather
 * than a package that fails to build.
 */
export const MAX_TOTAL_MEDIA_BYTES = 200 * 1024 * 1024

/** The extension of a URL or filename, lower case, without its query. */
export function extensionOf(value: string): string {
  const withoutQuery = value.split("?")[0].split("#")[0]
  const lastSlash = withoutQuery.lastIndexOf("/")
  const name = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery
  const dot = name.lastIndexOf(".")
  if (dot < 0) return ""
  return name.slice(dot + 1).toLowerCase()
}

export function mediaTypeFor(value: string): MediaType | null {
  return MEDIA_TYPES[extensionOf(value)] ?? null
}

/** A string that is an http(s) URL pointing at something this theme may carry. */
export function isMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false
  if (!/^https?:\/\//i.test(value)) return false
  return mediaTypeFor(value) !== null
}

/**
 * Every distinct media URL anywhere in a settings or page structure.
 *
 * Walks the whole tree rather than looking at known field ids, because a
 * section's settings are whatever its schema declared and a creator's own
 * section can name its video field anything at all.
 */
export function collectMediaUrls(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (node === null || node === undefined) return out
  if (typeof node === "string") {
    if (isMediaUrl(node)) out.add(node)
    return out
  }
  if (Array.isArray(node)) {
    for (const value of node) collectMediaUrls(value, out)
    return out
  }
  if (typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) collectMediaUrls(value, out)
  }
  return out
}

/**
 * Rewrite every string in a tree through a map.
 *
 * A key mapped to the empty string is CLEARED rather than left alone, and
 * that distinction is the point of this function existing. A media URL that
 * could not be carried must not survive into the imported site: left as it
 * was, it points at the original creator's bucket. Emptied, the section takes
 * the branch it already has for a picture nobody has chosen yet.
 */
export function rewriteMediaUrls(node: unknown, map: Record<string, string>): unknown {
  if (typeof node === "string") {
    const replacement = map[node]
    return replacement === undefined ? node : replacement
  }
  if (Array.isArray(node)) return node.map((value) => rewriteMediaUrls(value, map))
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = rewriteMediaUrls(value, map)
    }
    return out
  }
  return node
}

/** "3 videos and 1 picture", for telling somebody what came with their theme. */
export function describeMedia(counts: Partial<Record<MediaKind, number>>): string {
  const words: Record<MediaKind, [string, string]> = {
    image: ["picture", "pictures"],
    video: ["video", "videos"],
    audio: ["audio file", "audio files"],
    file: ["file", "files"],
  }
  const parts: string[] = []
  for (const kind of ["image", "video", "audio", "file"] as MediaKind[]) {
    const n = counts[kind] ?? 0
    if (n > 0) parts.push(`${n} ${words[kind][n === 1 ? 0 : 1]}`)
  }
  if (parts.length === 0) return "nothing"
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}
