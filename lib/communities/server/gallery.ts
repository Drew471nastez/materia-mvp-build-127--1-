import "server-only"

/**
 * ===========================================================================
 *  THE COMMUNITY PAGE'S GALLERY, ON THE SERVER
 * ===========================================================================
 * The pictures and videos at the top of a community's page, kept in
 * communities.gallery (a jsonb list of { type: "image", url } and
 * { type: "video", videoId }), edited on the Page tab of the creator's
 * Settings (components/community/creator/gallery-editor.tsx) and saved by
 * PATCH /api/app/community/<id> through updateSettings (./creator.ts).
 *
 *   PICTURES only from our own storage or storelib.com, the rule the logo
 *   and the cover follow (ownPicture), so a gallery can never point a
 *   member's browser somewhere else.
 *   VIDEOS only ones uploaded to this community (media_videos, through
 *   /api/app/community/<id>/videos) that did not fail.
 *   YOUTUBE AND VIMEO by a link the post composer would accept
 *   (embedFromUrl), kept as the service and the id (round 11). Its still is
 *   YouTube's own picture for the id, or the one Vimeo's oEmbed answers on
 *   the save (vimeoStill), never an address from the request.
 *   AT MOST TWELVE (GALLERY_MAX in the creator's logic).
 *
 * The column arrives with supabase/sql/run-now/85 (profiles, follows and
 * notifications). Until that has run, a read answers `ready: false` (the
 * editor says so) and a save answers GALLERY_NOT_READY: what to do, not
 * "try again".
 */
import { ownImageUrl } from "@/lib/memberships/plan"
import { checkGallery, coverVideo, type GalleryEmbed, type GalleryItem } from "@/components/community/creator/logic"
import { embedThumbUrl } from "@/lib/communities/post-media"
import type { GalleryVideoView } from "@/components/community/creator/view-types"
import { missing, reasonOf, type Db } from "./db"

/** What a save answers while communities.gallery is not there yet. */
export const GALLERY_NOT_READY = "Saving a gallery needs the latest Storelib database update (part 85, profiles, follows and notifications). Run the update, then save again."

function storageHost(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname
  } catch {
    return null
  }
}

/** A picture URL the creator uploaded (our storage or storelib.com), or null. */
export function ownPicture(value: unknown): string | null {
  return ownImageUrl(value, storageHost())
}

/** The gallery as stored, with what the editor shows for each video. `ready` is false until the column exists. */
export async function loadGallery(db: Db, communityId: string): Promise<{ ready: boolean; items: GalleryItem[]; videos: Record<string, GalleryVideoView> }> {
  const { data, error } = await db.from("communities").select("gallery").eq("id", communityId).maybeSingle()
  if (error) {
    if (!missing(error)) console.error(`[communities] gallery read: ${reasonOf(error)}`)
    return { ready: !missing(error), items: [], videos: {} }
  }
  /* Shown as stored; what is saved was checked on the way in. */
  const checked = checkGallery(Array.isArray(data?.gallery) ? data.gallery : [], (u) => (typeof u === "string" && /^https:\/\//.test(u) ? u : null))
  const items = checked.ok === true ? checked.value : []
  const ids = items.flatMap((i) => (i.type === "video" ? [i.videoId] : []))
  const videos: Record<string, GalleryVideoView> = {}
  if (ids.length) {
    const { data: rows } = await db.from("media_videos").select("id, status, thumbnail_url, duration_seconds").eq("community_id", communityId).in("id", ids)
    for (const v of (rows as { id: string; status: GalleryVideoView["status"]; thumbnail_url: string | null; duration_seconds: number | null }[] | null) ?? []) videos[v.id] = { status: v.status, thumbnailUrl: v.thumbnail_url, durationSeconds: v.duration_seconds }
  }
  return { ready: true, items, videos }
}

/**
 * VIMEO'S STILL, asked of Vimeo's own oEmbed (a fixed address, the video's
 * canonical link as the only thing passed, three seconds at most). The
 * answer is kept only when it is a picture on Vimeo's picture host
 * (embedThumbUrl); anything else, a timeout or a private video Vimeo will
 * not describe, is no still, and the page draws the video on ink with its
 * play button instead.
 */
export async function vimeoStill(e: Pick<GalleryEmbed, "id" | "hash">, fetcher: typeof fetch = fetch): Promise<string | null> {
  const link = `https://vimeo.com/${e.id}${e.hash ? `/${e.hash}` : ""}`
  try {
    const res = await fetcher(`https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(3000), headers: { accept: "application/json" } })
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as { thumbnail_url?: unknown } | null
    return embedThumbUrl(data?.thumbnail_url)
  } catch {
    return null
  }
}

/** A gallery a creator sends: the shape and the cap, our own pictures, this community's videos, YouTube and Vimeo by link with their stills. */
export async function checkGalleryForCommunity(db: Db, communityId: string, raw: unknown, fetcher: typeof fetch = fetch): Promise<{ ok: true; value: GalleryItem[] } | { ok: false; error: string; field: string }> {
  const checked = checkGallery(raw, ownPicture)
  if (checked.ok === false) return checked
  const ids = checked.value.flatMap((i) => (i.type === "video" ? [i.videoId] : []))
  if (ids.length) {
    const { data, error } = await db.from("media_videos").select("id, status").eq("community_id", communityId).in("id", ids)
    if (error) return { ok: false, field: "gallery", error: missing(error) ? "Videos are not set up on Storelib yet." : "The videos could not be checked. Try again." }
    const known = new Set(((data as { id: string; status: string }[] | null) ?? []).filter((v) => v.status !== "failed").map((v) => v.id))
    if (ids.some((id) => !known.has(id))) return { ok: false, field: "gallery", error: "A video in the gallery is not in this community. Upload it again." }
  }
  /* A Vimeo video's still is asked of Vimeo on every save that carries it, side by side; a still the request carried is never trusted. */
  await Promise.all(
    checked.value.map(async (item) => {
      if (item.type !== "embed" || item.provider !== "vimeo") return
      const still = await vimeoStill(item, fetcher)
      if (still) item.thumb = still
      else delete item.thumb
    }),
  )
  return checked
}

/**
 * THE COVER PICTURE AFTER A GALLERY SAVE. A cover video's still is the
 * cover picture (communities.cover_url), so Explore, the cards, the join card
 * and a shared link (cover.jpg) all keep drawing a still, unchanged. When the
 * cover video goes, a still it left behind goes with it, unless the same save
 * sets a picture. Answers the new cover_url, or undefined for no change.
 */
export function coverAfterGallery(current: string | null, coverInSave: boolean, gallery: GalleryItem[]): string | null | undefined {
  const video = coverVideo(gallery)
  if (video) return video.thumb ?? undefined
  if (!coverInSave && current && embedThumbUrl(current)) return null
  return undefined
}

/** Writes a checked gallery. Before part 85 has run: 409 with GALLERY_NOT_READY. */
export async function saveGallery(db: Db, communityId: string, items: GalleryItem[]): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { error } = await db.from("communities").update({ gallery: items }).eq("id", communityId)
  if (!error) return { ok: true }
  if (missing(error)) return { ok: false, status: 409, error: GALLERY_NOT_READY }
  console.error(`[communities] gallery ${communityId}: ${reasonOf(error)}`)
  return { ok: false, status: 500, error: "The gallery could not be saved. Try again." }
}
