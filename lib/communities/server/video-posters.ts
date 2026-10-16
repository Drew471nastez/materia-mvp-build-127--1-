import "server-only"

/**
 * ===========================================================================
 *  A POST'S VIDEO ALWAYS HAS A STILL, AND A 16PX COPY OF IT (round 33)
 * ===========================================================================
 * The owner: "sometimes in the community feed, posts with video attachments
 * take very long to show their preview; it shows that grey thing, then the
 * preview appears abruptly". Two things made it:
 *
 *   NO STILL AT ALL   the still is cut in the sender's browser
 *                     (components/community/member/media-upload.ts
 *                     videoStill). Where that browser could not decode the
 *                     file (an iPhone's HEVC .mov on Chrome or Firefox, an
 *                     unattached <video> on iOS that never sought) the post
 *                     went up without one, and Storelib's own storage, the
 *                     default video store, has no service to make one
 *                     (lib/video/storage.ts answers poster: null). Every
 *                     card of such a post then asked the play route and
 *                     loaded the file to find its first frame, on a grey box
 *                     with a play mark, every time, for everybody.
 *   NOTHING EARLY     a still that was there came through the image
 *                     optimizer, lazily, over the same grey.
 *
 * What the server does about it, here:
 *
 *   saveVideoFrame   the first time the post's author or a moderator sees a
 *                    video with no still, their browser has drawn its first
 *                    frame anyway (media.tsx VideoFrame); it sends that
 *                    frame (POST /api/community/<id>/videos/<videoId>/poster).
 *                    The frame is decoded and written again by sharp (so it
 *                    is a picture and nothing else), at 1280px at most,
 *                    stored in the sender's own picture folder under a name
 *                    the daily sweep never takes (poster-<video>-<time>.jpg,
 *                    ./orphans.ts COMMUNITY_PICTURE_PATH), checked like any
 *                    picture an edit adds (./image-check.ts), and written
 *                    into each post of theirs (all of them, for a moderator)
 *                    that carries the video without a still. An existing
 *                    still is never replaced. The video's row keeps it too
 *                    (thumbnail_url), so the play route answers it.
 *   blurPostVideos   after a post is written or edited (the posts routes,
 *                    in after()), every video still it carries gets its
 *                    16px copy, made here from the stored still: a WebP of
 *                    a few hundred bytes kept in the post, drawn blurred
 *                    under the still from the card's first frame.
 *   saveVideoBlurs   the same for an older post, when its author or a
 *                    moderator sees it.
 *
 * A server side decoder (ffmpeg) would cut the still at upload without any
 * browser, but the site runs on Vercel functions, which do not ship one, and
 * a video service (Mux, Cloudflare, Bunny) answers its own still already.
 */
import { can } from "../permissions"
import { PICTURE_BUCKET, memberPictureFolder, picturePathOf, videoBlurOf, videosWithoutBlur, videosWithoutPoster, withVideoStill } from "../post-media"
import type { CommunityRow, MediaVideoRow, PostMedia } from "../types"
import type { Viewer } from "./context"
import { isNewMember, isTeam } from "./safety"
import { screenPictures } from "./image-check"
import { reasonOf, type Db } from "./db"
import { postVideoFilter } from "./videos"

export const VIDEO_POSTER = {
  /** The frame a browser sends: a 1280px JPEG is a few hundred KB. */
  maxBytes: 4 * 1024 * 1024,
  /** The stored still's longest side, and its JPEG quality. */
  edge: 1280,
  quality: 82,
  /** The 16px copy: WebP at a low quality is a couple of hundred bytes. */
  blurEdge: 16,
  blurQuality: 50,
  /** Posts one call looks at. */
  maxPosts: 20,
  /** A stored still larger than this is not read for its copy. */
  maxStillBytes: 12 * 1024 * 1024,
} as const

/** The sharp module, loaded when first needed (it is native and large). Tests replace it. */
export const posterDeps = {
  sharp: async () => (await import("sharp")).default,
  now: () => Date.now(),
}

/** JPEG, PNG or WebP by their first bytes; anything else is not a frame. */
export function looksLikeFrame(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const webp = String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  return jpeg || png || webp
}

/** The frame decoded and written again as the stored still: a JPEG at VIDEO_POSTER.edge at most, no metadata. Null for anything that is not a picture. */
export async function stillFromFrame(bytes: Uint8Array): Promise<{ data: Buffer; width: number; height: number } | null> {
  if (!looksLikeFrame(bytes) || bytes.length > VIDEO_POSTER.maxBytes) return null
  try {
    const sharp = await posterDeps.sharp()
    const out = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: VIDEO_POSTER.edge, height: VIDEO_POSTER.edge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: VIDEO_POSTER.quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
    if (out.info.width < 16 || out.info.height < 16) return null
    return { data: out.data, width: out.info.width, height: out.info.height }
  } catch {
    return null
  }
}

/** The still at 16px on its longest side, as a WebP data address. Null when it cannot be read. */
export async function blurOf(bytes: Uint8Array): Promise<string | null> {
  try {
    const sharp = await posterDeps.sharp()
    const data = await sharp(bytes, { failOn: "none", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: VIDEO_POSTER.blurEdge, height: VIDEO_POSTER.blurEdge, fit: "inside" })
      .webp({ quality: VIDEO_POSTER.blurQuality })
      .toBuffer()
    return videoBlurOf(`data:image/webp;base64,${Buffer.from(data).toString("base64")}`)
  } catch {
    return null
  }
}

/** A still on Storelib's picture storage, read back, or null (somebody else's address, gone, too large). */
export async function readStill(db: Db, url: string): Promise<Uint8Array | null> {
  const path = picturePathOf(url)
  if (!path) return null
  try {
    const { data, error } = await db.storage.from(PICTURE_BUCKET).download(path)
    if (error || !data) return null
    const buf = new Uint8Array(await (data as Blob).arrayBuffer())
    return buf.length && buf.length <= VIDEO_POSTER.maxStillBytes ? buf : null
  } catch {
    return null
  }
}

/** Where a sent frame is kept: the sender's own folder for the community, under a name the daily sweep never matches. */
export function framePath(userId: string, communityId: string, videoId: string, now: number): string {
  return `${memberPictureFolder(userId, communityId)}poster-${videoId.toLowerCase()}-${now}.jpg`
}

interface PostMediaRow {
  id: string
  author_id: string | null
  media: PostMedia[] | null
}

/** Whether this viewer may fill in stills on other people's posts: a moderator of the community. */
export function mayFillAny(viewer: Pick<Viewer, "role" | "active" | "perms">): boolean {
  return viewer.active && can(viewer.role, "moderate_content", viewer.perms)
}

/** The posts of this community that carry the video and that this viewer may fill in: their own, or all for a moderator. */
async function postsCarrying(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer, videoId: string): Promise<PostMediaRow[] | null> {
  let q = db.from("community_feed_posts").select("id, author_id, media").eq("community_id", community.id).contains("media", postVideoFilter(videoId)).limit(VIDEO_POSTER.maxPosts)
  if (!mayFillAny(viewer)) q = q.eq("author_id", viewer.userId)
  const { data, error } = await q
  if (error) {
    console.error(`[communities] video ${videoId} posts for a still: ${reasonOf(error)}`)
    return null
  }
  return ((data as PostMediaRow[] | null) ?? []).filter((p) => Array.isArray(p.media))
}

async function writeMedia(db: Db, community: Pick<CommunityRow, "id">, postId: string, media: PostMedia[]): Promise<boolean> {
  /* The media only: not edited_at (nobody edited the post), not last_activity_at (nothing happened in it). */
  const { error } = await db.from("community_feed_posts").update({ media }).eq("id", postId).eq("community_id", community.id)
  if (error) console.error(`[communities] post ${postId} still: ${reasonOf(error)}`)
  return !error
}

export type FrameResult = { ok: true; poster: string; w: number; h: number; blur: string | null; posts: number } | { ok: false; status: number; error: string }

/**
 * A video's first frame, sent by its author's or a moderator's browser, kept as the still of every post of theirs (all,
 * for a moderator) that carries it without one. The caller has checked the viewer is an active member of the community
 * and found the video there.
 */
export async function saveVideoFrame(db: Db, input: { community: CommunityRow; viewer: Viewer; video: MediaVideoRow; bytes: Uint8Array; w?: number | null; h?: number | null }): Promise<FrameResult> {
  const { community, viewer, video } = input
  if (!viewer.userId) return { ok: false, status: 401, error: "sign_in" }
  if (video.status !== "ready") return { ok: false, status: 409, error: "not_ready" }
  const posts = await postsCarrying(db, community, viewer, video.id)
  if (posts === null) return { ok: false, status: 500, error: "failed" }
  if (!posts.length) return { ok: false, status: 404, error: "not_found" }
  const need = posts.filter((p) => videosWithoutPoster(p.media ?? []).includes(video.id))
  /* Already filled in (another tab, a moderator first): the still that is there stands. */
  if (!need.length) {
    const had = posts.flatMap((p) => p.media ?? []).find((m): m is Extract<PostMedia, { type: "video" }> => m.type === "video" && m.videoId === video.id && !!m.poster)
    return had?.poster ? { ok: true, poster: had.poster, w: had.w ?? 0, h: had.h ?? 0, blur: had.blur ?? null, posts: 0 } : { ok: false, status: 404, error: "not_found" }
  }
  const still = await stillFromFrame(input.bytes)
  if (!still) return { ok: false, status: 415, error: "not_a_picture" }
  const path = framePath(viewer.userId, community.id, video.id, posterDeps.now())
  const store = db.storage.from(PICTURE_BUCKET)
  const { error: upError } = await store.upload(path, still.data, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false })
  if (upError) {
    console.error(`[communities] video ${video.id} still upload: ${reasonOf(upError)}`)
    return { ok: false, status: 500, error: "failed" }
  }
  const url = String(store.getPublicUrl(path)?.data?.publicUrl || "")
  const drop = () => store.remove([path]).then(() => undefined, () => undefined)
  if (!url) {
    await drop()
    return { ok: false, status: 500, error: "failed" }
  }
  /* Checked like a picture an edit adds: a frame is the video's, but the bytes are the browser's. */
  const screen = await screenPictures(db, { communityId: community.id, userId: viewer.userId, fresh: isNewMember(viewer), team: isTeam(viewer.role) }, [{ path, url }])
  if (screen.refuse || screen.hold.length) {
    await drop()
    return { ok: false, status: 422, error: "refused" }
  }
  const blur = await blurOf(still.data)
  /* The video's own shape when the browser knew it (the frame is that shape, made smaller), else the frame's. */
  const w = Number(input.w) > 0 && Number(input.w) <= 16384 ? Math.round(Number(input.w)) : still.width
  const h = Number(input.h) > 0 && Number(input.h) <= 16384 ? Math.round(Number(input.h)) : still.height
  let written = 0
  for (const p of need) {
    const next = withVideoStill(p.media ?? [], video.id, { poster: url, w, h, blur })
    if (next && (await writeMedia(db, community, p.id, next))) written++
  }
  if (!written) {
    await drop()
    return { ok: false, status: 500, error: "failed" }
  }
  if (!video.thumbnail_url) await db.from("media_videos").update({ thumbnail_url: url }).eq("id", video.id).is("thumbnail_url", null).then(() => undefined, () => undefined)
  return { ok: true, poster: url, w, h, blur, posts: written }
}

/** Every still in these posts without its 16px copy gets one; each distinct still is read once. Answers how many posts changed. */
async function blurPosts(db: Db, community: Pick<CommunityRow, "id">, posts: PostMediaRow[], only?: string): Promise<number> {
  const copies = new Map<string, string | null>()
  let changed = 0
  for (const p of posts) {
    let media = p.media ?? []
    let touched = false
    for (const videoId of videosWithoutBlur(media)) {
      if (only && videoId !== only) continue
      const item = media.find((m): m is Extract<PostMedia, { type: "video" }> => m.type === "video" && m.videoId === videoId)
      const poster = item?.poster
      if (!poster) continue
      if (!copies.has(poster)) {
        const bytes = await readStill(db, poster)
        copies.set(poster, bytes ? await blurOf(bytes) : null)
      }
      const next = withVideoStill(media, videoId, { blur: copies.get(poster), blurFor: poster })
      if (next) {
        media = next
        touched = true
      }
    }
    if (touched && (await writeMedia(db, community, p.id, media))) changed++
  }
  return changed
}

/** The 16px copies for one video's posts that this viewer may fill in (an older post, seen by its author or a moderator). */
export async function saveVideoBlurs(db: Db, input: { community: CommunityRow; viewer: Viewer; video: MediaVideoRow }): Promise<{ ok: true; posts: number } | { ok: false; status: number; error: string }> {
  const posts = await postsCarrying(db, input.community, input.viewer, input.video.id)
  if (posts === null) return { ok: false, status: 500, error: "failed" }
  if (!posts.length) return { ok: false, status: 404, error: "not_found" }
  return { ok: true, posts: await blurPosts(db, input.community, posts, input.video.id) }
}

/**
 * After a post is written or edited: each of its video stills gets its 16px copy, and a video with no still takes the one
 * its row already has (filled in on another post). Quiet on any failure: the post is up either way.
 */
export async function blurPostVideos(db: Db, communityId: string, postId: string): Promise<void> {
  try {
    const { data, error } = await db.from("community_feed_posts").select("id, author_id, media").eq("id", postId).eq("community_id", communityId).maybeSingle()
    if (error || !data) return
    const row = data as PostMediaRow
    let media = Array.isArray(row.media) ? row.media : []
    const bare = videosWithoutPoster(media)
    let filled = false
    if (bare.length) {
      const { data: videos } = await db.from("media_videos").select("id, thumbnail_url").eq("community_id", communityId).in("id", bare)
      for (const v of (videos as { id: string; thumbnail_url: string | null }[] | null) ?? []) {
        /* Only a still on Storelib's own picture storage: a video service's address is signed and ends. */
        if (!v.thumbnail_url || !picturePathOf(v.thumbnail_url)) continue
        const next = withVideoStill(media, v.id, { poster: v.thumbnail_url })
        if (next) {
          media = next
          filled = true
        }
      }
    }
    const changed = await blurPosts(db, { id: communityId }, [{ ...row, media }])
    if (!changed && filled) await writeMedia(db, { id: communityId }, postId, media)
  } catch (e) {
    console.error(`[communities] post ${postId} video stills: ${reasonOf(e)}`)
  }
}
