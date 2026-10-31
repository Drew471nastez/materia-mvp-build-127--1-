/**
 * ===========================================================================
 *  STORELIB'S YOUTUBE VIDEOS, AND THE PAGES EACH ONE BELONGS ON
 * ===========================================================================
 * One entry per video. A page whose path is in an entry's `pages` shows the
 * video (components/marketing/related-video.tsx): a thumbnail that loads the
 * player only when pressed, the title and description, the chapters as
 * timestamp links, the transcript folded away, and VideoObject structured
 * data built from the same entry (videoJsonLd below).
 *
 * ONLY REAL VIDEOS. Every field is copied from the video on YouTube: the id
 * from its address, the title and description as published, the upload date
 * from YouTube Studio, the chapters from its description. Nothing is
 * guessed; a field that is not known is left out, and the structured data
 * leaves it out too. docs/youtube-videos.md says how to add one.
 *
 * The list is empty today: no Storelib comparison video was found in this
 * repository or on the live blog (October 2026). An entry looks like this
 * (the id below is not a real video):
 *
 *   {
 *     youtubeId: "AbCdEfGhIjK",
 *     title: "Storelib vs Gumroad: fees, features and moving over",
 *     description: "I sell the same sample pack on both and compare what I keep.",
 *     uploadDate: "2026-11-04",
 *     duration: "PT9M12S",
 *     chapters: [
 *       { t: 0, label: "What we compare" },
 *       { t: 95, label: "Fees on a $25 sale" },
 *       { t: 310, label: "Moving your products" },
 *     ],
 *     transcript: "Paste the transcript from YouTube Studio here.",
 *     pages: ["/alternatives/gumroad", "/sell/digital-products"],
 *   }
 *
 * Pure: the page, the structured data and tests/content-r45.test.ts read it.
 */

export interface VideoChapter {
  /** Seconds from the start. */
  t: number
  label: string
}

export interface Video {
  /** The 11 characters after watch?v= in the video's address. */
  youtubeId: string
  title: string
  description: string
  /** The day it was published on YouTube, ISO (2026-11-04). */
  uploadDate: string
  /** ISO 8601 length, PT9M12S. Optional: left out of the markup when unknown. */
  duration?: string
  /** In order, the first at 0 seconds, as the video's description lists them. */
  chapters: VideoChapter[]
  /** The transcript from YouTube Studio, as plain text. */
  transcript?: string
  /** The paths on storelib.com this video appears on, such as /alternatives/gumroad. */
  pages: string[]
}

export const VIDEOS: readonly Video[] = []

/* ── Reading the list ─────────────────────────────────────────────────── */

const ID = /^[A-Za-z0-9_-]{11}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DURATION = /^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/

/** The first video registered for a page, or null. */
export function videoForPath(path: string, list: readonly Video[] = VIDEOS): Video | null {
  return list.find((v) => v.pages.includes(path)) ?? null
}

/** Seconds in an ISO 8601 duration (PT1H2M3S), or null when it is not one. */
export function durationSeconds(iso: string | undefined): number | null {
  if (!iso || !DURATION.test(iso) || iso === "PT") return null
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** "1:35", "1:02:05": how YouTube writes a chapter's time. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`
}

export const watchUrl = (id: string, t?: number) => `https://www.youtube.com/watch?v=${id}${t ? `&t=${Math.floor(t)}s` : ""}`
export const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`
export const thumbnailUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

/**
 * What is wrong with an entry, one sentence each; empty when it is fine.
 * `routeExists` says whether a path is a page of storelib.com (the test
 * passes one that reads app/).
 */
export function videoProblems(v: Video, routeExists: (path: string) => boolean = () => true): string[] {
  const out: string[] = []
  if (!ID.test(v.youtubeId)) out.push(`${v.youtubeId}: an id is 11 letters, digits, - or _`)
  if (!v.title.trim()) out.push(`${v.youtubeId}: no title`)
  if (!v.description.trim()) out.push(`${v.youtubeId}: no description`)
  if (!DATE.test(v.uploadDate) || Number.isNaN(Date.parse(`${v.uploadDate}T00:00:00Z`)) || new Date(`${v.uploadDate}T00:00:00Z`).toISOString().slice(0, 10) !== v.uploadDate) out.push(`${v.youtubeId}: uploadDate is not a real ISO day`)
  if (v.duration !== undefined && durationSeconds(v.duration) === null) out.push(`${v.youtubeId}: duration is not ISO 8601 (PT9M12S)`)
  const total = durationSeconds(v.duration)
  v.chapters.forEach((c, i) => {
    if (!Number.isInteger(c.t) || c.t < 0) out.push(`${v.youtubeId}: chapter ${i + 1} has no whole number of seconds`)
    if (i === 0 && c.t !== 0) out.push(`${v.youtubeId}: the first chapter starts at 0`)
    if (i > 0 && c.t <= v.chapters[i - 1].t) out.push(`${v.youtubeId}: chapters are not in order`)
    if (total !== null && c.t >= total) out.push(`${v.youtubeId}: chapter ${i + 1} starts after the video ends`)
    if (!c.label.trim()) out.push(`${v.youtubeId}: chapter ${i + 1} has no label`)
  })
  if (v.pages.length === 0) out.push(`${v.youtubeId}: on no page`)
  for (const p of v.pages) if (!p.startsWith("/") || !routeExists(p)) out.push(`${v.youtubeId}: ${p} is not a page`)
  return out
}

/* ── Structured data ──────────────────────────────────────────────────── */

/**
 * VideoObject for a video, from the fields Google documents for it: name,
 * description, thumbnailUrl and uploadDate are required, so with any of them
 * missing there is no markup at all (null). duration only when known. Each
 * chapter is a Clip (hasPart) with its start, its end (the next chapter's
 * start, or the video's end when the length is known) and its address with
 * &t=, and only when there are at least two chapters.
 */
export function videoJsonLd(v: Video, pageUrl: string): Record<string, unknown> | null {
  if (!ID.test(v.youtubeId) || !v.title.trim() || !v.description.trim() || !DATE.test(v.uploadDate)) return null
  const total = durationSeconds(v.duration)
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${pageUrl}#video`,
    name: v.title,
    description: v.description,
    thumbnailUrl: [thumbnailUrl(v.youtubeId)],
    uploadDate: v.uploadDate,
    embedUrl: embedUrl(v.youtubeId),
    contentUrl: watchUrl(v.youtubeId),
  }
  if (total !== null) node.duration = v.duration
  const chapters = v.chapters.filter((c) => Number.isInteger(c.t) && c.t >= 0 && c.label.trim())
  if (chapters.length >= 2) {
    node.hasPart = chapters.map((c, i) => {
      const end = chapters[i + 1]?.t ?? total
      return {
        "@type": "Clip",
        name: c.label,
        startOffset: c.t,
        ...(typeof end === "number" ? { endOffset: end } : {}),
        url: watchUrl(v.youtubeId, c.t || undefined) + (c.t === 0 ? "&t=0s" : ""),
      }
    })
  }
  return node
}
