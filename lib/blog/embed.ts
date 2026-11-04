/**
 * ===========================================================================
 *  WHICH EMBEDS A POST MAY DRAW, AND WHERE EACH ONE'S FRAME POINTS
 * ===========================================================================
 * An embed block (lib/blog/blocks.ts) names its provider. Only an address
 * from one of these hosts gets a provider, and only a provider gets a frame;
 * anything else is drawn as a plain link. The frame's address is built here
 * from the id read out of the page's address, never copied from it, so a
 * pasted address cannot choose what the frame loads.
 *
 * Pure: the editor shows the result while typing, the server sets the
 * provider on save (lib/blog/sanitize.ts), and the public article can call
 * embedFrameSrc on read.
 */

import type { Block } from "./blocks"

export type EmbedProvider = NonNullable<Block["provider"]>

export const EMBED_PROVIDERS: Record<EmbedProvider, { label: string; hosts: string[]; example: string }> = {
  youtube: { label: "YouTube", hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com"], example: "https://www.youtube.com/watch?v=…" },
  vimeo: { label: "Vimeo", hosts: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"], example: "https://vimeo.com/76979871" },
  loom: { label: "Loom", hosts: ["loom.com", "www.loom.com"], example: "https://www.loom.com/share/…" },
  x: { label: "X", hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"], example: "https://x.com/user/status/…" },
  spotify: { label: "Spotify", hosts: ["open.spotify.com"], example: "https://open.spotify.com/episode/…" },
  figma: { label: "Figma", hosts: ["figma.com", "www.figma.com"], example: "https://www.figma.com/design/…" },
  codepen: { label: "CodePen", hosts: ["codepen.io"], example: "https://codepen.io/user/pen/…" },
}

function parse(url: string): URL | null {
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:" ? u : null
  } catch {
    return null
  }
}

/** The 11 character YouTube id in an address (watch, youtu.be, embed, shorts, live) or on its own. Null when there is none. */
export function youtubeIdFrom(input: string | null | undefined): string | null {
  const s = (input ?? "").trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  const u = parse(s)
  if (!u) return null
  const host = u.hostname.toLowerCase()
  if (!EMBED_PROVIDERS.youtube.hosts.includes(host)) return null
  const v = u.searchParams.get("v")
  if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v
  const m = (host === "youtu.be" ? u.pathname.match(/^\/([A-Za-z0-9_-]{11})/) : u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/))
  return m ? m[1] : null
}

/** Which provider an address is from, or null when it is not on the list (or not a page that provider embeds). */
export function detectEmbedProvider(url: string | null | undefined): EmbedProvider | null {
  return url ? (embedTarget(url)?.provider ?? null) : null
}

/** The provider and the frame's address, built from the id in the page's address. */
export function embedTarget(url: string): { provider: EmbedProvider; src: string } | null {
  const u = parse(url)
  if (!u) return null
  const host = u.hostname.toLowerCase()
  const path = u.pathname
  const is = (p: EmbedProvider) => EMBED_PROVIDERS[p].hosts.includes(host)
  let m: RegExpMatchArray | null
  if (is("youtube")) {
    const id = youtubeIdFrom(url)
    return id ? { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` } : null
  }
  if (is("vimeo") && (m = path.match(/^\/(?:video\/)?(\d{5,12})(?:\/|$)/))) return { provider: "vimeo", src: `https://player.vimeo.com/video/${m[1]}` }
  if (is("loom") && (m = path.match(/^\/(?:share|embed)\/([0-9a-f]{16,40})(?:\/|$)/i))) return { provider: "loom", src: `https://www.loom.com/embed/${m[1]}` }
  if (is("x") && (m = path.match(/^\/[A-Za-z0-9_]{1,15}\/status(?:es)?\/(\d{5,25})(?:\/|$)/))) return { provider: "x", src: `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}` }
  if (is("spotify") && (m = path.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,30})(?:\/|$)/))) return { provider: "spotify", src: `https://open.spotify.com/embed/${m[1]}/${m[2]}` }
  if (is("figma") && /^\/(?:file|design|proto|board|slides)\/[A-Za-z0-9]{10,40}(?:\/|$)/.test(path)) return { provider: "figma", src: `https://www.figma.com/embed?embed_host=storelib&url=${encodeURIComponent(`https://www.figma.com${path}`)}` }
  if (is("codepen") && (m = path.match(/^\/([A-Za-z0-9_-]{1,40})\/(?:pen|full|details|embed)\/([A-Za-z0-9]{3,12})(?:\/|$)/))) return { provider: "codepen", src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result` }
  return null
}

/** The frame's address for a stored embed block, or null (draw it as a link). */
export function embedFrameSrc(block: Pick<Block, "url" | "provider">): string | null {
  if (!block.url || !block.provider) return null
  const t = embedTarget(block.url)
  return t && t.provider === block.provider ? t.src : null
}

/** A chapter line, "m:ss Title" or "h:mm:ss Title", as seconds and title. Null when it is not one. */
export function parseChapter(line: string): { seconds: number; title: string } | null {
  const m = line.trim().match(/^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)\s+[-–]?\s*(.+)$/)
  if (!m) return null
  const seconds = (m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3])
  return { seconds, title: m[4].trim() }
}

/* ─── The public article's view of an embed (round 45, blogpublic) ───── */

/**
 * How the public article draws an embed block: YouTube as its click to play
 * player (no YouTube script until a press), anything else as a lazy frame at
 * embedFrameSrc's address with the shape that provider's player needs. Null:
 * draw the block as a plain link.
 */
export type BlogEmbed =
  | { kind: "youtube"; videoId: string }
  | { kind: "frame"; provider: Exclude<EmbedProvider, "youtube">; src: string; title: string; /** width / height */ ratio?: number; /** px */ height?: number }

export function embedProviderName(p: EmbedProvider): string {
  return EMBED_PROVIDERS[p].label
}

/** The YouTube id in an address; kept under the name the article used first. */
export const youtubeIdFromUrl = (raw: string | null | undefined): string | null => (raw && /^https?:/i.test(raw.trim()) ? youtubeIdFrom(raw) : null)

const SHAPES: Record<Exclude<EmbedProvider, "youtube">, { title: string; ratio?: number; height?: number }> = {
  vimeo: { title: "Vimeo video", ratio: 16 / 9 },
  loom: { title: "Loom video", ratio: 16 / 9 },
  x: { title: "Post on X", height: 560 },
  spotify: { title: "Spotify player", height: 352 },
  figma: { title: "Figma file", ratio: 16 / 10 },
  codepen: { title: "CodePen demo", height: 420 },
}

export function blogEmbed(block: Pick<Block, "url" | "provider">): BlogEmbed | null {
  const src = embedFrameSrc(block)
  if (!src || !block.provider) return null
  if (block.provider === "youtube") {
    const videoId = youtubeIdFrom(block.url)
    return videoId ? { kind: "youtube", videoId } : null
  }
  const shape = SHAPES[block.provider]
  const height = block.provider === "spotify" && /\/embed\/(track|episode)\//.test(src) ? 152 : shape.height
  return { kind: "frame", provider: block.provider, src, title: shape.title, ...(shape.ratio ? { ratio: shape.ratio } : {}), ...(height ? { height } : {}) }
}
