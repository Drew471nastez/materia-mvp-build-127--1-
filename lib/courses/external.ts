/**
 * A LESSON THAT IS A LINK TO YOUTUBE OR VIMEO. Some creators already host
 * their videos there, so a lesson can point at one instead of an upload. It
 * plays in the site's own embedded player (the privacy-enhanced YouTube
 * address, which sets no cookie until play). Anything else is not a video
 * this page can play, and is refused when the lesson is saved.
 *
 * Pure and browser safe.
 */

export interface ExternalVideo {
  provider: "youtube" | "vimeo"
  id: string
  embedUrl: string
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

export function externalVideo(raw: unknown): ExternalVideo | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 500) return null
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  const host = u.hostname.replace(/^www\.|^m\./, "").toLowerCase()

  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    let id: string | null = null
    if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null
    else if (u.pathname === "/watch") id = u.searchParams.get("v")
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)
      id = m ? m[1] : null
    }
    if (!id || !YOUTUBE_ID.test(id)) return null
    const start = Number.parseInt(u.searchParams.get("t") ?? u.searchParams.get("start") ?? "", 10)
    const q = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" })
    if (Number.isFinite(start) && start > 0) q.set("start", String(start))
    return { provider: "youtube", id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${q.toString()}` }
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = u.pathname.split("/").filter(Boolean)
    const at = parts.findIndex((p) => /^\d{5,12}$/.test(p))
    if (at === -1) return null
    const id = parts[at]
    /* An unlisted video's key: the path segment after the id, or ?h= on a player address. */
    const hash = u.searchParams.get("h") ?? (parts[at + 1] && /^[0-9a-f]{6,20}$/i.test(parts[at + 1]) ? parts[at + 1] : null)
    const q = new URLSearchParams({ dnt: "1", playsinline: "1" })
    if (hash && /^[0-9a-f]{6,20}$/i.test(hash)) q.set("h", hash)
    return { provider: "vimeo", id, embedUrl: `https://player.vimeo.com/video/${id}?${q.toString()}` }
  }

  return null
}
