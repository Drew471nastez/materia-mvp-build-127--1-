/**
 * ===========================================================================
 *  AN EMBED BLOCK'S PLAYER, FROM SEVEN PROVIDERS AND NOTHING ELSE
 * ===========================================================================
 * The editor stores the page someone pasted (block.url) and which provider
 * it is from (block.provider). The article draws a frame only when the
 * address really is that provider's and has the shape of one of its pages;
 * the frame's address is built here from the id, never taken from the
 * block, so an embed cannot point a frame at any other site. Anything else
 * is drawn as a plain link to the page (components: app/(marketing)/blog/
 * _components/article-blocks.tsx).
 *
 * YouTube is returned as its video id: the article draws it as the same
 * click to load player as a youtube block, with no YouTube script until
 * somebody presses play.
 *
 * Every frame host here is in lib/security/csp.ts frame-src.
 */
import type { Block } from "./blocks"
import { YOUTUBE_ID } from "./article"

export type EmbedProvider = NonNullable<Block["provider"]>

export type BlogEmbed =
  | { kind: "youtube"; videoId: string }
  | { kind: "frame"; provider: Exclude<EmbedProvider, "youtube">; src: string; title: string; /** width / height, or a fixed height in px */ ratio?: number; height?: number }

const NAMES: Record<EmbedProvider, string> = { youtube: "YouTube", vimeo: "Vimeo", loom: "Loom", x: "X", spotify: "Spotify", figma: "Figma", codepen: "CodePen" }

export function embedProviderName(p: EmbedProvider): string {
  return NAMES[p]
}

function parse(raw: string | null | undefined): URL | null {
  try {
    const url = new URL((raw ?? "").trim())
    return url.protocol === "https:" || url.protocol === "http:" ? url : null
  } catch {
    return null
  }
}

const SAFE = /^[A-Za-z0-9_-]{1,64}$/

/** The id in a YouTube watch, short, shorts, live or embed address. */
export function youtubeIdFromUrl(raw: string | null | undefined): string | null {
  const url = parse(raw)
  if (!url) return null
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "")
  const parts = url.pathname.split("/").filter(Boolean)
  let id: string | null = null
  if (host === "youtu.be") id = parts[0] ?? null
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") id = url.searchParams.get("v")
    else if (["embed", "shorts", "live", "v"].includes(parts[0])) id = parts[1] ?? null
  }
  return id && YOUTUBE_ID.test(id) ? id : null
}

/** The player for an embed block, or null when its address is not a page of its provider. */
export function blogEmbed(block: Pick<Block, "url" | "provider">): BlogEmbed | null {
  const provider = block.provider
  const url = parse(block.url)
  if (!provider || !url || !(provider in NAMES)) return null
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const parts = url.pathname.split("/").filter(Boolean)

  switch (provider) {
    case "youtube": {
      const videoId = youtubeIdFromUrl(block.url)
      return videoId ? { kind: "youtube", videoId } : null
    }
    case "vimeo": {
      const id = host === "vimeo.com" ? parts.find((p) => /^\d{1,12}$/.test(p)) : host === "player.vimeo.com" && parts[0] === "video" ? parts[1] : undefined
      return id && /^\d{1,12}$/.test(id) ? { kind: "frame", provider, src: `https://player.vimeo.com/video/${id}?dnt=1`, title: "Vimeo video", ratio: 16 / 9 } : null
    }
    case "loom": {
      const id = host === "loom.com" && (parts[0] === "share" || parts[0] === "embed") ? parts[1] : undefined
      return id && SAFE.test(id) ? { kind: "frame", provider, src: `https://www.loom.com/embed/${id}`, title: "Loom video", ratio: 16 / 9 } : null
    }
    case "x": {
      if (!["x.com", "twitter.com", "mobile.twitter.com", "mobile.x.com"].includes(host)) return null
      const at = parts.indexOf("status")
      const id = at >= 0 ? parts[at + 1] : ""
      return /^\d{1,25}$/.test(id ?? "") ? { kind: "frame", provider, src: `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`, title: "Post on X", height: 560 } : null
    }
    case "spotify": {
      if (host !== "open.spotify.com") return null
      const i = parts[0] === "embed" ? 1 : parts[0]?.startsWith("intl-") ? 1 : 0
      const type = parts[i]
      const id = parts[i + 1]
      if (!["track", "album", "playlist", "episode", "show", "artist"].includes(type ?? "") || !id || !/^[A-Za-z0-9]{10,40}$/.test(id)) return null
      return { kind: "frame", provider, src: `https://open.spotify.com/embed/${type}/${id}`, title: "Spotify player", height: type === "track" || type === "episode" ? 152 : 352 }
    }
    case "figma": {
      if (host !== "figma.com" || !["file", "design", "proto", "board", "slides"].includes(parts[0] ?? "") || !SAFE.test(parts[1] ?? "")) return null
      const clean = `https://www.figma.com/${parts.join("/")}${url.search}`
      return { kind: "frame", provider, src: `https://www.figma.com/embed?embed_host=storelib&url=${encodeURIComponent(clean)}`, title: "Figma file", ratio: 16 / 10 }
    }
    case "codepen": {
      if (host !== "codepen.io") return null
      const [user, kind, id] = parts
      if (!user || !SAFE.test(user) || (kind !== "pen" && kind !== "embed") || !id || !SAFE.test(id)) return null
      return { kind: "frame", provider, src: `https://codepen.io/${user}/embed/${id}?default-tab=result`, title: "CodePen demo", height: 420 }
    }
  }
  return null
}
