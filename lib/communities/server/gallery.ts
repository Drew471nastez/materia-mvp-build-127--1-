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
 *   AT MOST TWELVE (GALLERY_MAX in the creator's logic).
 *
 * The column arrives with supabase/sql/run-now/85 (profiles, follows and
 * notifications). Until that has run, a read answers `ready: false` (the
 * editor says so) and a save answers GALLERY_NOT_READY: what to do, not
 * "try again".
 */
import { ownImageUrl } from "@/lib/memberships/plan"
import { checkGallery, type GalleryItem } from "@/components/community/creator/logic"
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

/** A gallery a creator sends: the shape and the cap, our own pictures, this community's videos. */
export async function checkGalleryForCommunity(db: Db, communityId: string, raw: unknown): Promise<{ ok: true; value: GalleryItem[] } | { ok: false; error: string; field: string }> {
  const checked = checkGallery(raw, ownPicture)
  if (checked.ok === false) return checked
  const ids = checked.value.flatMap((i) => (i.type === "video" ? [i.videoId] : []))
  if (ids.length) {
    const { data, error } = await db.from("media_videos").select("id, status").eq("community_id", communityId).in("id", ids)
    if (error) return { ok: false, field: "gallery", error: missing(error) ? "Videos are not set up on Storelib yet." : "The videos could not be checked. Try again." }
    const known = new Set(((data as { id: string; status: string }[] | null) ?? []).filter((v) => v.status !== "failed").map((v) => v.id))
    if (ids.some((id) => !known.has(id))) return { ok: false, field: "gallery", error: "A video in the gallery is not in this community. Upload it again." }
  }
  return checked
}

/** Writes a checked gallery. Before part 85 has run: 409 with GALLERY_NOT_READY. */
export async function saveGallery(db: Db, communityId: string, items: GalleryItem[]): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { error } = await db.from("communities").update({ gallery: items }).eq("id", communityId)
  if (!error) return { ok: true }
  if (missing(error)) return { ok: false, status: 409, error: GALLERY_NOT_READY }
  console.error(`[communities] gallery ${communityId}: ${reasonOf(error)}`)
  return { ok: false, status: 500, error: "The gallery could not be saved. Try again." }
}
