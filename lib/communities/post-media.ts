/**
 * ===========================================================================
 *  WHAT A POST MAY CARRY, AND WHERE EACH THING MAY COME FROM
 * ===========================================================================
 * One table for the composer (which refuses early, so nobody waits on an
 * upload that will be turned down) and the server (which decides). Pure and
 * browser safe.
 *
 *   picture   Storelib's own picture storage only (feed.ts ownImageUrl)
 *   file      any kind the upload checks accept for a file a page hands out
 *             (no program, no script, no web page), 50 MB for a member and
 *             500 MB for staff, kept in the community's own folder and only
 *             ever handed out as a download to somebody who may see the post
 *   video     an upload through the community's video route, or a YouTube
 *             or Vimeo address played in their privacy player (YouTube's
 *             no cookie address, Vimeo with do not track)
 *   GIF       Giphy's own addresses only, the moving one and a still
 *   link      one card per post
 *
 * Counts are per post: ten things in all, and of those at most one link
 * card, four GIFs and four videos by address.
 */
import { externalVideo } from "@/lib/courses/external"
import type { PostMedia } from "./types"

export const MAX_MEDIA_TOTAL = 10
export const MAX_LINKS = 1
export const MAX_GIFS = 4
export const MAX_EMBEDS = 4

const MB = 1024 * 1024
/** The largest file a member attaches; staff may attach more. */
export const MEMBER_FILE_MAX_BYTES = 50 * MB
export const STAFF_FILE_MAX_BYTES = 500 * MB

/** The folder under the creator's storage that holds a community's post files. */
export const COMMUNITY_FILES_FOLDER = "community-files"

const GIPHY_HOST = /^(?:media\d*|i)\.giphy\.com$/

function httpsUrl(value: unknown, max = 1000): URL | null {
  if (typeof value !== "string" || !value || value.length > max) return null
  try {
    const u = new URL(value)
    if (u.protocol !== "https:" || u.username || u.password) return null
    return u
  } catch {
    return null
  }
}

/** A Giphy picture address (the GIF itself or its still), or null. */
export function giphyUrl(value: unknown): string | null {
  const u = httpsUrl(value)
  return u && GIPHY_HOST.test(u.hostname.toLowerCase()) ? u.toString() : null
}

/** A thumbnail for a video by address: YouTube's and Vimeo's own picture hosts only. */
export function embedThumbUrl(value: unknown): string | null {
  const u = httpsUrl(value)
  if (!u) return null
  const h = u.hostname.toLowerCase()
  return h === "i.ytimg.com" || h === "img.youtube.com" || h === "i.vimeocdn.com" ? u.toString() : null
}

export interface EmbedRef {
  provider: "youtube" | "vimeo"
  id: string
  url: string
  hash?: string
  thumb?: string
}

/** A YouTube or Vimeo address as a post keeps it, or null for anything else. */
export function embedFromUrl(raw: unknown): EmbedRef | null {
  const v = externalVideo(raw)
  if (!v) return null
  const hash = v.provider === "vimeo" ? new URL(v.embedUrl).searchParams.get("h") ?? undefined : undefined
  return {
    provider: v.provider,
    id: v.id,
    url: v.provider === "youtube" ? `https://www.youtube.com/watch?v=${v.id}` : `https://vimeo.com/${v.id}${hash ? `/${hash}` : ""}`,
    ...(hash ? { hash } : {}),
    ...(v.provider === "youtube" ? { thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` } : {}),
  }
}

/** The privacy player's address for a video by address, set to play when it opens. */
export function embedPlayerSrc(m: { provider: "youtube" | "vimeo"; id: string; hash?: string }, autoplay = true): string {
  if (m.provider === "youtube") {
    const q = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" })
    if (autoplay) q.set("autoplay", "1")
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(m.id)}?${q}`
  }
  const q = new URLSearchParams({ dnt: "1", playsinline: "1" })
  if (m.hash) q.set("h", m.hash)
  if (autoplay) q.set("autoplay", "1")
  return `https://player.vimeo.com/video/${encodeURIComponent(m.id)}?${q}`
}

/** The extension a stored file keeps: lower case letters and digits, or "bin". */
export function fileExtension(name: unknown): string {
  if (typeof name !== "string") return "bin"
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim())
  return m ? m[1].toLowerCase() : "bin"
}

/** A file's name as people see it, ending in the extension it was checked with. */
export function fileDisplayName(name: unknown, ext: string): string {
  const raw = typeof name === "string" ? name : ""
  const base = raw
    .replace(/[\u0000-\u001f\u007f/\\]/g, "")
    .replace(/\.[A-Za-z0-9]{1,10}$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)
  return `${base || "File"}.${ext}`
}

/** Where a community file lives in the private bucket. Every part is checked by its caller. */
export function communityFilePath(creatorId: string, communityId: string, uploaderId: string, fileId: string, ext: string): string {
  return `${creatorId}/${COMMUNITY_FILES_FOLDER}/${communityId}/${uploaderId}/${fileId}.${ext}`
}

/** "2.4 MB", "640 KB". */
export function fileSizeLabel(bytes?: number): string {
  if (!bytes || bytes <= 0) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(1).replace(/\.0$/, "")} MB`
  return `${(bytes / (1024 * MB)).toFixed(1).replace(/\.0$/, "")} GB`
}

/** The one picture a post's card shows on its right: a picture, a video's poster, a GIF's still, a video by address, a link's picture. */
export function cardThumb(media: PostMedia[]): { url: string; kind: "image" | "video" | "gif" | "link"; local: boolean } | null {
  for (const m of media) if (m.type === "image") return { url: m.url, kind: "image", local: true }
  for (const m of media) if (m.type === "video" && m.poster) return { url: m.poster, kind: "video", local: true }
  for (const m of media) if (m.type === "embed" && m.thumb) return { url: m.thumb, kind: "video", local: false }
  for (const m of media) if (m.type === "gif") return { url: m.still, kind: "gif", local: false }
  for (const m of media) if (m.type === "link" && m.image) return { url: m.image, kind: "link", local: false }
  return null
}

/** What the lightbox walks through, in the post's order: pictures, GIFs and videos. */
export type ViewerItem =
  | { kind: "image"; url: string; w?: number; h?: number }
  | { kind: "gif"; url: string; still: string; w?: number; h?: number }
  | { kind: "video"; videoId: string; poster?: string; w?: number; h?: number }
  | { kind: "embed"; provider: "youtube" | "vimeo"; id: string; hash?: string; thumb?: string; title?: string }

export function viewerItems(media: PostMedia[]): ViewerItem[] {
  const out: ViewerItem[] = []
  for (const m of media) {
    if (m.type === "image") out.push({ kind: "image", url: m.url, w: m.w, h: m.h })
    else if (m.type === "gif") out.push({ kind: "gif", url: m.url, still: m.still, w: m.w, h: m.h })
    else if (m.type === "video") out.push({ kind: "video", videoId: m.videoId, poster: m.poster, w: m.w, h: m.h })
    else if (m.type === "embed") out.push({ kind: "embed", provider: m.provider, id: m.id, hash: m.hash, thumb: m.thumb, title: m.title })
  }
  return out
}
