/**
 * ===========================================================================
 *  THE ABOUT PAGE'S PICTURES AND VIDEOS, AND WHAT A REVIEW CAN TRULY SAY
 * ===========================================================================
 * Pure and browser safe: the server reads the rows and hands these the
 * values, the page draws what comes back, and the tests call them directly.
 */

import { galleryEmbed } from "@/components/community/creator/logic"

/**
 * One thing in the gallery, as the page draws it. A YouTube or Vimeo video
 * (round 11) is its service, id, Vimeo's private hash and its still; the
 * page shows the still with a play button and starts the service's privacy
 * player in place on a press (lib/communities/post-media embedPlayerSrc).
 */
export type GalleryEmbedView = { type: "embed"; provider: "youtube" | "vimeo"; id: string; hash?: string; thumb: string | null }
/** An uploaded video; `cover` (round 13) when it is the community's cover video, the page's hero. */
export type GalleryItemView = { type: "image"; url: string } | { type: "video"; videoId: string; posterUrl: string | null; cover?: true } | GalleryEmbedView

type StoredItem = { type: "image"; url: string } | { type: "video"; videoId: string; cover?: true } | GalleryEmbedView

export const GALLERY_MAX = 12

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An address an <img> may load: https, or a path on this site. Nothing else (no javascript:, no data: blobs from a row). */
export function safeImageUrl(v: unknown): string | null {
  if (typeof v !== "string") return null
  const url = v.trim()
  if (!url || url.length > 2048) return null
  if (url.startsWith("/") && !url.startsWith("//")) return url
  try {
    return new URL(url).protocol === "https:" ? url : null
  } catch {
    return null
  }
}

/**
 * communities.gallery (part 85: `[{ type: "image", url } | { type: "video",
 * videoId } | { type: "embed", provider, id, hash?, thumb? }]`, at most 12)
 * read defensively: anything that is not one of those shapes is dropped,
 * never drawn. Videos keep their id; whether one is ready, and its poster,
 * is the server's to add. A linked video is only one embedFromUrl accepts
 * again here, with a still only from YouTube's or Vimeo's picture hosts.
 */
export function parseGallery(raw: unknown): StoredItem[] {
  if (!Array.isArray(raw)) return []
  const out: StoredItem[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (out.length >= GALLERY_MAX) break
    if (!item || typeof item !== "object") continue
    const it = item as Record<string, unknown>
    if (it.type === "image") {
      const url = safeImageUrl(it.url)
      if (url && !seen.has(url)) {
        seen.add(url)
        out.push({ type: "image", url })
      }
    } else if (it.type === "video" && typeof it.videoId === "string" && UUID.test(it.videoId) && !seen.has(it.videoId)) {
      seen.add(it.videoId)
      out.push({ type: "video", videoId: it.videoId, ...(it.cover === true && out.length === 0 ? { cover: true as const } : {}) })
    } else if (it.type === "embed") {
      const e = galleryEmbed(it)
      const key = e ? `${e.provider}:${e.id}` : ""
      if (e && !seen.has(key)) {
        seen.add(key)
        out.push({ type: "embed", provider: e.provider, id: e.id, ...(e.hash ? { hash: e.hash } : {}), thumb: e.thumb ?? null })
      }
    }
  }
  return out
}

/** The still a gallery item shows before it plays: the picture, the upload's poster, the linked video's still. */
export function galleryStill(g: GalleryItemView): string | null {
  return g.type === "image" ? g.url : g.type === "video" ? g.posterUrl : g.thumb
}

/**
 * "Still a paying member after 3 months": only for a reviewer who is an
 * ACTIVE member of this community through a paid source, counted from when
 * they joined. Anybody else (left, expired, free, invited) gets null and the
 * page says nothing about them. Days under a month, then whole months.
 */
export function payingTenure(member: { status: string | null; source: string | null; joinedAt: string | null } | null | undefined, now: number = Date.now()): string | null {
  if (!member || member.status !== "active") return null
  if (member.source !== "subscription" && member.source !== "purchase" && member.source !== "product") return null
  const joined = member.joinedAt ? Date.parse(member.joinedAt) : NaN
  if (!Number.isFinite(joined) || joined > now) return null
  const days = Math.max(1, Math.floor((now - joined) / 86_400_000))
  if (days < 30) return days === 1 ? "1 day" : `${days} days`
  const months = Math.max(1, Math.floor(days / 30.44))
  if (months < 12) return months === 1 ? "1 month" : `${months} months`
  const years = Math.floor(months / 12)
  return years === 1 ? "1 year" : `${years} years`
}
