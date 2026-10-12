/**
 * ===========================================================================
 *  A VIDEO FILE AMONG THE PICTURES
 * ===========================================================================
 * A product's photos and videos are one list, in the order the creator put
 * them (products.gallery_urls). A video in that list is its address, told
 * apart from a picture by its extension, the same way storage, the Files
 * library and the theme engine all tell. Everything that only draws pictures
 * (cards, emails, the sitemap, og:image) takes `imagesOnly`; everything that
 * draws a gallery takes `mediaOf` and plays the videos.
 *
 * NAMES CARRY WHAT A TILE NEEDS. A video uploaded here is stored as
 * `<stamp>-<random>-<seconds>s.<ext>`, with its first frame beside it as
 * `<same name>.poster.jpg` (lib/files/upload-video.ts makes both in the
 * browser at upload). So a grid, a gallery or a theme can show the frame and
 * the length without opening the video. A video uploaded before (or one whose
 * frame the browser could not draw) has neither, and the players fall back to
 * the video's own first frame.
 *
 * Client and server safe: no imports.
 */

/** What a video upload may be, by declared type, and the extension it is stored under. */
export const VIDEO_TYPES: Readonly<Record<string, string>> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
}

/** The input's `accept` for a video. */
export const VIDEO_ACCEPT = Object.keys(VIDEO_TYPES).join(",")

/**
 * The largest video taken for a page, a product's gallery or the Files
 * library: it plays in a browser from a public address, so it is a clip, not
 * a course lesson (those go through the 10 GB product file path). The
 * store-builder-images bucket's own limit is just under 2 GB (SQL part 70).
 */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024
export const MAX_VIDEO_TEXT = "500 MB"

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i

/** The path part of an address, without its query or fragment. */
function pathOf(url: string): string {
  return url.split(/[?#]/)[0]
}

/** Whether an address (or a file name) is a video file. */
export function isVideoUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && VIDEO_EXT.test(pathOf(url))
}

/** The MIME type a video address is served as, for a <source type> and a theme's media.sources. */
export function videoMime(url: string): string {
  const ext = VIDEO_EXT.exec(pathOf(url))?.[1]?.toLowerCase()
  if (ext === "webm") return "video/webm"
  if (ext === "mov") return "video/quicktime"
  return "video/mp4"
}

/** `<name>.poster.jpg` beside a video: where its first frame is stored. */
export function posterPathFor(path: string): string {
  return path.replace(VIDEO_EXT, ".poster.jpg")
}

/** Whether a stored name is a video's first frame rather than a picture of its own. */
export function isPosterName(name: string): boolean {
  return /\.poster\.jpg$/i.test(pathOf(name))
}

/**
 * The first frame of a video uploaded here, or null. Only for a name that
 * says it was uploaded with one (the `-<seconds>s` stamp is written in the
 * same step as the frame), so a player is never pointed at a frame that does
 * not exist.
 */
export function videoPosterUrl(url: string | null | undefined): string | null {
  if (!isVideoUrl(url) || videoDuration(url) === null) return null
  return posterPathFor(pathOf(url as string))
}

/** A video's length in seconds from its stored name, or null when the name does not say. */
export function videoDuration(url: string | null | undefined): number | null {
  if (typeof url !== "string") return null
  const m = /-(\d{1,6})s\.(?:mp4|webm|mov|m4v)$/i.exec(pathOf(url))
  return m ? Number(m[1]) : null
}

/** 0:07, 1:24, 1:02:03. */
export function durationText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return ""
  const s = Math.max(1, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`
}

/** The pictures in a mixed list: what a card, an email or og:image draws. */
export function imagesOnly<T extends string | null | undefined>(urls: readonly T[]): T[] {
  return urls.filter((u) => !isVideoUrl(u))
}

export type MediaEntry = { type: "image"; url: string } | { type: "video"; url: string; poster: string | null; duration: number | null; mime: string }

/** A mixed list as a gallery draws it, in its own order. */
export function mediaOf(urls: readonly (string | null | undefined)[]): MediaEntry[] {
  const out: MediaEntry[] = []
  for (const url of urls) {
    if (typeof url !== "string" || !url) continue
    out.push(isVideoUrl(url) ? { type: "video", url, poster: videoPosterUrl(url), duration: videoDuration(url), mime: videoMime(url) } : { type: "image", url })
  }
  return out
}
