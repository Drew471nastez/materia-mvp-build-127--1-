import "server-only"

/**
 * ===========================================================================
 *  GIFS, FROM GIPHY, THROUGH STORELIB
 * ===========================================================================
 * The composer's GIF button searches Giphy through this, never from the
 * browser, so the key (GIPHY_API_KEY) stays on the server and a member's
 * search is not sent to Giphy with their cookies. Without the key the
 * button says it is not connected and nothing else happens.
 *
 * Only what a post keeps comes back: an id, the moving picture (a 200px
 * wide one, light enough for a feed), a still of it for the card, its size
 * and its title. Every address is checked to be Giphy's own picture host
 * (lib/communities/post-media.ts giphyUrl), the same check the post makes.
 */
import { giphyUrl } from "../post-media"

export interface GifResult {
  id: string
  url: string
  still: string
  w: number
  h: number
  title: string
}

export const GIF_PAGE = 24
const TIMEOUT_MS = 4000

export function giphyKey(env: Record<string, string | undefined> = process.env): string | null {
  const k = (env.GIPHY_API_KEY || "").trim()
  return k ? k : null
}

/** A search term as Giphy is asked it: plain words, at most 50 characters. */
export function cleanGifQuery(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50)
}

/** Giphy's answer as a list of GIFs a post may keep; anything off Giphy's host is left out. */
export function parseGiphy(json: unknown): GifResult[] {
  const data = (json as { data?: unknown })?.data
  if (!Array.isArray(data)) return []
  const out: GifResult[] = []
  for (const item of data) {
    const g = (item ?? {}) as { id?: unknown; title?: unknown; images?: Record<string, { url?: unknown; width?: unknown; height?: unknown }> }
    const moving = g.images?.fixed_width
    const still = g.images?.fixed_width_still
    const url = giphyUrl(moving?.url)
    const stillUrl = giphyUrl(still?.url)
    const w = Number(moving?.width)
    const h = Number(moving?.height)
    if (!url || !stillUrl || typeof g.id !== "string" || !(w > 0) || !(h > 0)) continue
    out.push({ id: g.id.slice(0, 60), url, still: stillUrl, w: Math.round(w), h: Math.round(h), title: typeof g.title === "string" ? g.title.slice(0, 120) : "" })
  }
  return out
}

export async function searchGifs(q: string, offset: number, key: string): Promise<{ ok: true; gifs: GifResult[]; next: number | null } | { ok: false }> {
  const params = new URLSearchParams({ api_key: key, limit: String(GIF_PAGE), offset: String(Math.max(0, Math.min(4999, Math.floor(offset) || 0))), rating: "pg-13", bundle: "messaging_non_clips" })
  if (q) params.set("q", q)
  const url = `https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}?${params}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store", headers: { Accept: "application/json" } })
    if (!res.ok) return { ok: false }
    const json = (await res.json()) as { pagination?: { total_count?: number; count?: number; offset?: number } }
    const gifs = parseGiphy(json)
    const p = json.pagination ?? {}
    const nextOffset = (Number(p.offset) || 0) + (Number(p.count) || 0)
    return { ok: true, gifs, next: gifs.length && nextOffset < (Number(p.total_count) || 0) ? nextOffset : null }
  } catch {
    return { ok: false }
  }
}
