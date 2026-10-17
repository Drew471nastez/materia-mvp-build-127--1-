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

/**
 * WHAT A COMMENT MAY CARRY (round 12). Pictures, one GIF and one video by
 * link (YouTube or Vimeo, played where it is), four things at most,
 * through the same checks as a post's (feed.ts checkMedia) and then one more
 * on the server: every picture must be the commenter's own upload for this
 * community, in their own folder, and there (comments.ts checkCommentMedia).
 * No files any more (round 11 took them; the owner asked for them gone): the
 * server refuses one, and a comment that already carries one still shows it.
 * No link cards: a link in a comment's words already opens the viewer.
 */
export const MAX_COMMENT_MEDIA = 4
export const MAX_COMMENT_GIFS = 1
export const MAX_COMMENT_EMBEDS = 1
export const COMMENT_MEDIA_TYPES: readonly PostMedia["type"][] = ["image", "gif", "embed"]

/**
 * A PICTURE IS MADE LIGHTER IN THE BROWSER BEFORE IT IS SENT (round 12):
 * its longest side at most 2560px, WebP at 0.85 (JPEG at the same quality
 * where the browser cannot write WebP, as Safari cannot), its EXIF gone
 * (where it was taken, the camera). A GIF goes as it is, frames and all.
 * components/community/member/media-compress.ts does it.
 */
export const POST_PICTURE_MAX_EDGE = 2560
export const POST_PICTURE_QUALITY = 0.85

/** The bucket a member's pictures go to (media-upload.ts uploadPicture). */
export const PICTURE_BUCKET = "product-images"

/** Where a member's pictures for a community land in the picture bucket: their own folder first, as storage only lets them write there. */
export function memberPictureFolder(userId: string, communityId: string): string {
  return `${userId}/community/${communityId}/`
}

/** The path inside the picture bucket a public picture address points at, or null for any other address. */
export function picturePathOf(value: unknown): string | null {
  const u = httpsUrl(value)
  if (!u || u.search || u.hash) return null
  const m = new RegExp(`^/storage/v1/object/public/${PICTURE_BUCKET}/(.+)$`).exec(u.pathname)
  if (!m) return null
  let path: string
  try {
    path = decodeURIComponent(m[1])
  } catch {
    return null
  }
  if (!path || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..") || /[\u0000-\u001f\\]/.test(path)) return null
  return path
}

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
  return h === "i.ytimg.com" || h === "img.youtube.com" || h === "i.vimeocdn.com" || h === "cdn.loom.com" ? u.toString() : null
}

export interface EmbedRef {
  provider: "youtube" | "vimeo"
  id: string
  url: string
  hash?: string
  thumb?: string
}

/** A video by address in a post or a comment: YouTube, Vimeo, or (round 12) Loom. */
export type EmbedProvider = "youtube" | "vimeo" | "loom"
export interface PostEmbedRef {
  provider: EmbedProvider
  id: string
  url: string
  hash?: string
  thumb?: string
}

/** The names people know the players by. */
export const EMBED_NAMES: Record<EmbedProvider, string> = { youtube: "YouTube", vimeo: "Vimeo", loom: "Loom" }

const LOOM_ID = /^[0-9a-f]{32}$/i

/** A Loom address (a share or an embed page) as a post keeps it, or null. */
export function loomFromUrl(raw: unknown): PostEmbedRef | null {
  const u = typeof raw === "string" && raw.length <= 500 ? (() => {
    try {
      return new URL(raw.trim())
    } catch {
      return null
    }
  })() : null
  if (!u || (u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) return null
  if (u.hostname.replace(/^www\./, "").toLowerCase() !== "loom.com") return null
  const m = /^\/(?:share|embed)\/([0-9a-f]{32})(?:\/|$)/i.exec(u.pathname)
  if (!m || !LOOM_ID.test(m[1])) return null
  const id = m[1].toLowerCase()
  return { provider: "loom", id, url: `https://www.loom.com/share/${id}` }
}

/** A YouTube or Vimeo address, for a post or a comment; the gallery and covers keep to embedFromUrl. */
export function postEmbedFromUrl(raw: unknown): PostEmbedRef | null {
  return embedFromUrl(raw) ?? loomFromUrl(raw)
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
export function embedPlayerSrc(m: { provider: EmbedProvider; id: string; hash?: string }, autoplay = true): string {
  if (m.provider === "loom") {
    const q = new URLSearchParams({ hide_owner: "true", hide_share: "true", hide_title: "true", hideEmbedTopBar: "true" })
    if (autoplay) q.set("autoplay", "1")
    return `https://www.loom.com/embed/${encodeURIComponent(m.id)}?${q}`
  }
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
export function cardThumb(media: PostMedia[]): { url: string; kind: "image" | "video" | "gif" | "link"; local: boolean; motion?: string; blur?: string; videoId?: string } | null {
  for (const m of media) if (m.type === "image") return { url: m.url, kind: "image", local: true }
  for (const m of media) if (m.type === "video" && m.poster) return { url: m.poster, kind: "video", local: true, videoId: m.videoId, ...(m.blur ? { blur: m.blur } : {}) }
  for (const m of media) if (m.type === "embed" && m.thumb) return { url: m.thumb, kind: "video", local: false }
  for (const m of media) if (m.type === "gif") return { url: m.still, kind: "gif", local: false, motion: m.url }
  for (const m of media) if (m.type === "link" && m.image) return { url: m.image, kind: "link", local: false }
  return null
}

/**
 * ON A PHONE'S CARD (round 9, components/community/member/media.tsx
 * CardMedia) the pictures go under the words rather than one thumbnail on
 * the right. Each one the card can draw: its address, whether the image
 * optimizer may fetch it (Storelib's own), what it is, and its shape when
 * known, so its box is the right shape before it loads.
 */
export interface CardPicture {
  url: string
  local: boolean
  kind: "image" | "video" | "gif" | "link"
  w?: number
  h?: number
  /** A GIF's moving picture (round 12): it plays while the card is on screen, the still stands in otherwise. */
  motion?: string
  /** A video's poster at 16px (round 33), drawn blurred under the poster from the first frame. */
  blur?: string
  /** An uploaded video's id, for its still (round 33). */
  videoId?: string
}

/** Every picture a post carries, in its order (a GIF by its still, a video by its poster), else its link's picture. */
export function cardPictures(media: PostMedia[]): CardPicture[] {
  const out: CardPicture[] = []
  for (const m of media) {
    if (m.type === "image") out.push({ url: m.url, local: true, kind: "image", w: m.w, h: m.h })
    else if (m.type === "video" && m.poster) out.push({ url: m.poster, local: true, kind: "video", w: m.w, h: m.h, videoId: m.videoId, ...(m.blur ? { blur: m.blur } : {}) })
    else if (m.type === "embed" && m.thumb) out.push({ url: m.thumb, local: false, kind: "video" })
    else if (m.type === "gif") out.push({ url: m.still, local: false, kind: "gif", w: m.w, h: m.h, motion: m.url })
  }
  if (!out.length) {
    const link = media.find((m): m is Extract<PostMedia, { type: "link" }> => m.type === "link" && !!m.image)
    if (link?.image) out.push({ url: link.image, local: false, kind: "link" })
  }
  return out
}

/**
 * What the viewer (lightbox.tsx) walks through, in the post's order:
 * pictures, GIFs and videos. `raw` is an address the image optimizer must
 * not fetch (a member only file route, a signed address that ends soon);
 * `clip` is a video by its file address (a link in somebody's words, a
 * lesson's file), played by the browser's own player.
 */
export type ViewerItem =
  | { kind: "image"; url: string; w?: number; h?: number; raw?: boolean }
  | { kind: "gif"; url: string; still: string; w?: number; h?: number }
  | { kind: "video"; videoId: string; poster?: string; w?: number; h?: number; blur?: string }
  | { kind: "embed"; provider: EmbedProvider; id: string; hash?: string; thumb?: string; title?: string }
  | { kind: "clip"; url: string; poster?: string }

export function viewerItems(media: PostMedia[]): ViewerItem[] {
  const out: ViewerItem[] = []
  for (const m of media) {
    if (m.type === "image") out.push({ kind: "image", url: m.url, w: m.w, h: m.h })
    else if (m.type === "gif") out.push({ kind: "gif", url: m.url, still: m.still, w: m.w, h: m.h })
    else if (m.type === "video") out.push({ kind: "video", videoId: m.videoId, poster: m.poster, w: m.w, h: m.h, ...(m.blur ? { blur: m.blur } : {}) })
    else if (m.type === "embed") out.push({ kind: "embed", provider: m.provider, id: m.id, hash: m.hash, thumb: m.thumb, title: m.title })
  }
  return out
}

/*
  ===========================================================================
   A VIDEO'S STILL, FILLED IN LATER (round 33)
  ===========================================================================
  The owner: posts with a video "take very long to show their preview; it shows that grey thing, then the preview appears
  abruptly". A video whose browser could not cut a still when it was sent (an iPhone's HEVC file on a computer's Chrome, a
  timeout) had none for good, and Storelib's own storage has no service to make one, so every card of it loaded the file to
  find its first frame. Its still is filled in once now: the first time its author or a moderator sees it, their browser
  sends the frame it already drew, and the server keeps it with the post (lib/communities/server/video-posters.ts). The
  16px copy (`blur`) is the server's, made from the poster, never sent by a browser.
*/

/** A 16px still as a data address: WebP, JPEG or PNG, base64, short. Anything else is no blur at all. */
export const VIDEO_BLUR_MAX_CHARS = 2400
export function videoBlurOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length > VIDEO_BLUR_MAX_CHARS) return null
  return /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null
}

/** The uploaded videos of a post that have no still yet, by id. */
export function videosWithoutPoster(media: readonly PostMedia[]): string[] {
  return media.filter((m): m is Extract<PostMedia, { type: "video" }> => m.type === "video" && !m.poster).map((m) => m.videoId)
}

/** The uploaded videos of a post whose still has no 16px copy yet, by id. */
export function videosWithoutBlur(media: readonly PostMedia[]): string[] {
  return media.filter((m): m is Extract<PostMedia, { type: "video" }> => m.type === "video" && !!m.poster && !m.blur).map((m) => m.videoId)
}

/**
 * The post's media with this video's still filled in where it has none (a poster already there is never replaced), its
 * shape where it was not known, and its 16px copy where it has none and `blur` was made from that poster (`blurFor`, the
 * poster's address; the new poster's when it is not given). Null when nothing changes.
 */
export function withVideoStill(media: readonly PostMedia[], videoId: string, still: { poster?: string | null; w?: number | null; h?: number | null; blur?: string | null; blurFor?: string | null }): PostMedia[] | null {
  let changed = false
  const id = videoId.toLowerCase()
  const out = media.map((m) => {
    if (m.type !== "video" || m.videoId !== id) return m
    const next: Extract<PostMedia, { type: "video" }> = { ...m }
    if (!next.poster && still.poster) {
      next.poster = still.poster
      if (!next.w && still.w) next.w = Math.round(still.w)
      if (!next.h && still.h) next.h = Math.round(still.h)
    }
    const blur = videoBlurOf(still.blur)
    if (blur && !next.blur && next.poster && (still.blurFor ?? still.poster) === next.poster) next.blur = blur
    if (next.poster !== m.poster || next.w !== m.w || next.h !== m.h || next.blur !== m.blur) changed = true
    return next
  })
  return changed ? out : null
}

type EmbedMedia = Extract<PostMedia, { type: "embed" }>

const URL_IN_WORDS = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi

/**
 * A YouTube or Vimeo address somebody pasted into a post's words, as the
 * video it names, so it plays under the text like one attached. Leaves out
 * a video the post already carries and keeps within MAX_EMBEDS in all.
 */
export function bodyEmbeds(text: string | null | undefined, media: PostMedia[]): EmbedMedia[] {
  if (!text) return []
  const have = new Set(media.filter((m): m is EmbedMedia => m.type === "embed").map((m) => `${m.provider}:${m.id}`))
  let room = MAX_EMBEDS - have.size
  const out: EmbedMedia[] = []
  for (const m of text.matchAll(URL_IN_WORDS)) {
    if (room <= 0) break
    const ref = postEmbedFromUrl(m[0])
    if (!ref || have.has(`${ref.provider}:${ref.id}`)) continue
    have.add(`${ref.provider}:${ref.id}`)
    room--
    out.push({ type: "embed", provider: ref.provider, id: ref.id, url: ref.url, ...(ref.hash ? { hash: ref.hash } : {}), ...(ref.thumb ? { thumb: ref.thumb } : {}) })
  }
  return out
}

/** A post's media with the videos named in its words after it. */
export function withBodyEmbeds(media: PostMedia[], text: string | null | undefined): PostMedia[] {
  const extra = bodyEmbeds(text, media)
  return extra.length ? [...media, ...extra] : media
}

const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|avif|bmp)$/i
const VIDEO_EXT = /\.(?:mp4|m4v|webm|mov|ogv)$/i

/** Whether a file name or an address is a picture or a video the browser can show, by its extension. */
export function mediaKindOf(nameOrUrl: unknown): "image" | "video" | null {
  if (typeof nameOrUrl !== "string" || !nameOrUrl) return null
  let path = nameOrUrl.trim()
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname
    } catch {
      return null
    }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null
  path = path.split(/[?#]/)[0]
  try {
    path = decodeURIComponent(path)
  } catch {
    /* kept as it was */
  }
  return IMAGE_EXT.test(path) ? "image" : VIDEO_EXT.test(path) ? "video" : null
}

/** A link to a picture or a video as the viewer shows it, or null for any other address. */
export function viewerItemForUrl(url: string, raw = false): ViewerItem | null {
  const kind = mediaKindOf(url)
  if (kind === "image") return /\.gif$/i.test(url.split(/[?#]/)[0]) ? { kind: "gif", url, still: url } : { kind: "image", url, ...(raw ? { raw } : {}) }
  if (kind === "video") return { kind: "clip", url }
  return null
}

/**
 * HOW THE OPENED POST LAYS OUT ITS PICTURES AND VIDEOS (round 8). One is
 * drawn large, at the post's full width in its own shape (a picture no
 * taller than the screen allows); two sit side by side, each half the width
 * and the same height; three or more are a grid with the first one large
 * across the top and up to three under it, the last of those saying how
 * many more there are.
 */
export type MediaLayout = { kind: "none" } | { kind: "single" } | { kind: "pair" } | { kind: "grid"; below: number; more: number }

export function mediaLayout(count: number): MediaLayout {
  if (count <= 0) return { kind: "none" }
  if (count === 1) return { kind: "single" }
  if (count === 2) return { kind: "pair" }
  const below = Math.min(3, count - 1)
  return { kind: "grid", below, more: count - 1 - below }
}

/** Round AF: the welcome's intro video, a YouTube, Vimeo or Loom address, as the player to draw (not playing until pressed), or null. */
export function welcomeVideoSrc(raw: unknown): string | null {
  const ref = postEmbedFromUrl(raw)
  return ref ? embedPlayerSrc(ref, false) : null
}
