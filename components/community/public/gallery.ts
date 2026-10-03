/**
 * ===========================================================================
 *  THE ABOUT PAGE'S PICTURES AND VIDEOS, AND WHAT A REVIEW CAN TRULY SAY
 * ===========================================================================
 * Pure and browser safe: the server reads the rows and hands these the
 * values, the page draws what comes back, and the tests call them directly.
 */

/** One thing in the gallery, as the page draws it. */
export type GalleryItemView = { type: "image"; url: string } | { type: "video"; videoId: string; posterUrl: string | null }

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
 * videoId }]`, at most 12) read defensively: anything that is not one of
 * those two shapes is dropped, never drawn. Videos keep their id; whether
 * one is ready, and its poster, is the server's to add.
 */
export function parseGallery(raw: unknown): ({ type: "image"; url: string } | { type: "video"; videoId: string })[] {
  if (!Array.isArray(raw)) return []
  const out: ({ type: "image"; url: string } | { type: "video"; videoId: string })[] = []
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
      out.push({ type: "video", videoId: it.videoId })
    }
  }
  return out
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
