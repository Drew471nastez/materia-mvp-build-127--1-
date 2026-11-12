import type { CSSProperties } from "react"
import type { OnePageBlock } from "./types"
import { embedSource, musicSource } from "./creator-blocks"

/** Optional, versionless JSON additions. No value means the original renderer. */
export interface BlockPresentation {
  subtitle?: string
  variant?: LinkVariant
  size?: "auto" | "full" | "half" | "tall"
  align?: "left" | "center" | "right"
  position?: "top" | "center" | "bottom"
  title_size?: number
  title_weight?: number
  title_color?: string
  subtitle_size?: number
  subtitle_color?: string
  icon_size?: number
  icon_color?: string
  gap?: number
  padding?: number
  image_url?: string
  overlay?: number
  gradient_from?: string
  gradient_to?: string
  media_mode?: "card" | "native"
  /** The shared Layout tab (components/onepage/block-settings): the block's own surface. */
  background?: string
  radius?: number
  shadow?: BlockShadow
  /** A soft fade from the bottom of an image card into the card's colour. */
  fade?: boolean
  /** The picture's shape on an image card. */
  aspect?: BlockAspect
}
export const LINK_VARIANTS = ["original", "visual", "image-first", "featured", "compact", "profile", "tile"] as const
export type LinkVariant = (typeof LINK_VARIANTS)[number]
export const BLOCK_SHADOWS = ["none", "soft", "lifted"] as const
export type BlockShadow = (typeof BLOCK_SHADOWS)[number]
export const BLOCK_ASPECTS = ["auto", "1/1", "4/5", "16/9", "9/16"] as const
export type BlockAspect = (typeof BLOCK_ASPECTS)[number]
export const SHADOW_CSS: Record<BlockShadow, string> = {
  none: "none",
  soft: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  lifted: "0 10px 30px -8px rgba(0,0,0,0.25)",
}
export const aspectCss = (a: BlockAspect | undefined): string | undefined => (a && a !== "auto" ? a.replace("/", " / ") : undefined)

export const PRESENTABLE_BLOCKS = new Set(["form_quiz", "link_button", "product", "image", "pdf_document", "food_menu", "calendly", "course", "music", "video", "embed", "map", "email_capture", "contact_form", "storelib_shelf", "lead_magnet", "social_posts", "followers", "promo_code", "app", "faq", "countdown", "testimonials", "heading", "text"])
const color = (v: unknown) => typeof v === "string" && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(v) ? v : undefined
const number = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined
const choice = <T extends string>(v: unknown, values: readonly T[]): T | undefined => values.includes(v as T) ? v as T : undefined
export function safeCardMedia(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return undefined
  if (value.startsWith("/") && !value.startsWith("//") && !/[\\\s]/.test(value)) return value
  try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined } catch { return undefined }
}
/**
 * Every saved field is read, checked and clamped; nothing is renamed or
 * dropped from storage. Writers spread the stored object, so a field this
 * version does not know survives the next save.
 */
export function presentationOf(block: Pick<OnePageBlock, "style"> | null | undefined): BlockPresentation {
  const raw = block?.style?.presentation
  if (!raw || typeof raw !== "object") return {}
  return {
    subtitle: typeof raw.subtitle === "string" ? raw.subtitle.slice(0, 600) : undefined,
    variant: choice(raw.variant, LINK_VARIANTS),
    size: choice(raw.size, ["auto", "full", "half", "tall"]),
    align: choice(raw.align, ["left", "center", "right"]), position: choice(raw.position, ["top", "center", "bottom"]),
    title_size: number(raw.title_size, 12, 40), title_weight: number(raw.title_weight, 400, 800), title_color: color(raw.title_color),
    subtitle_size: number(raw.subtitle_size, 11, 24), subtitle_color: color(raw.subtitle_color),
    icon_size: number(raw.icon_size, 16, 48), icon_color: color(raw.icon_color),
    gap: number(raw.gap, 0, 24), padding: number(raw.padding, 8, 40), image_url: safeCardMedia(raw.image_url),
    overlay: number(raw.overlay, 0, 90), gradient_from: color(raw.gradient_from), gradient_to: color(raw.gradient_to),
    media_mode: choice(raw.media_mode, ["card", "native"]),
    background: color(raw.background), radius: number(raw.radius, 0, 40), shadow: choice(raw.shadow, BLOCK_SHADOWS),
    fade: typeof raw.fade === "boolean" ? raw.fade : undefined, aspect: choice(raw.aspect, BLOCK_ASPECTS),
  }
}
export function presentationVars(p: BlockPresentation): CSSProperties {
  return Object.fromEntries(Object.entries({
    "--op-block-title-size": p.title_size === undefined ? undefined : `${p.title_size}px`,
    "--op-block-title-weight": p.title_weight, "--op-block-title-color": p.title_color,
    "--op-block-subtitle-size": p.subtitle_size === undefined ? undefined : `${p.subtitle_size}px`, "--op-block-subtitle-color": p.subtitle_color,
    "--op-block-icon-size": p.icon_size === undefined ? undefined : `${p.icon_size}px`, "--op-block-icon-color": p.icon_color,
    "--op-block-gap": p.gap === undefined ? undefined : `${p.gap}px`, "--op-block-padding": p.padding === undefined ? undefined : `${p.padding}px`,
    "--op-block-bg": p.background, "--op-block-radius": p.radius === undefined ? undefined : `${p.radius}px`,
    "--op-block-shadow": p.shadow ? SHADOW_CSS[p.shadow] : undefined,
  }).filter(([, v]) => v !== undefined)) as CSSProperties
}

/*
  THE LINK'S ONE LAYOUT PICKER. A link used to have two: Classic and Featured
  (data.layout_type) on the Layout tab, and Card, Photo and Compact
  (presentation.variant) in a separate Style panel under the settings. Saved
  blocks keep both fields; this reads them as one choice and writes back the
  pair that choice means.
*/
export const LINK_LAYOUTS = ["classic", "featured", "visual", "cover", "image-first", "compact", "profile", "tile"] as const
export type LinkLayout = (typeof LINK_LAYOUTS)[number]
export function linkLayoutOf(block: Pick<OnePageBlock, "style" | "data">): LinkLayout {
  const p = presentationOf(block)
  if (p.variant === "featured") return "cover"
  if (p.variant && p.variant !== "original") return p.variant
  /* A social link switched to "Open link" or "Display post" before any variant was picked is drawn as the card. */
  if (!p.variant && (p.media_mode === "card" || p.media_mode === "native")) return "visual"
  return (block.data as { layout_type?: string } | null)?.layout_type === "pro" ? "featured" : "classic"
}
/** The fields a picked link layout writes: layout_type for Classic and Featured, the variant for the rest. */
export function linkLayoutPatch(layout: LinkLayout): { layout_type: "default" | "pro"; variant: LinkVariant | undefined } {
  if (layout === "classic") return { layout_type: "default", variant: undefined }
  if (layout === "featured") return { layout_type: "pro", variant: undefined }
  return { layout_type: "default", variant: layout === "cover" ? "featured" : layout }
}
/** Layouts that draw the link's picture large, where a fade and a picture shape mean something. */
export function linkLayoutHasImage(layout: LinkLayout): boolean {
  return layout === "visual" || layout === "cover" || layout === "image-first" || layout === "tile"
}

/*
  WHAT THE SHARED LAYOUT TAB OFFERS EACH BLOCK. "own" blocks draw their own
  button or card (.op-btn or .op-card), so a colour, corner or shadow lands on
  that surface; "panel" blocks get a surface only once a background is
  picked. Product blocks keep their own colour rows, so they get shape only.
*/
export type LayoutControl = "align" | "title" | "description" | "icon" | "background" | "radius" | "shadow" | "padding"
export type BlockSurface = "own" | "panel" | "card"
const OWN_SURFACE = new Set(["link_button", "product", "storelib_shelf"])
export function blockSurface(type: string): BlockSurface {
  return OWN_SURFACE.has(type) ? "own" : "panel"
}
/*
  A TIPS BLOCK DRAWS ITS OWN CARD (round 3). Its background, corners,
  shadow and padding were a "panel" laid round the tip card, so a
  background drew a card inside a card, and the corners, shadow and padding
  showed nothing until a background was picked. A Storelib tips block reads
  them itself (components/onepage/tip-block), so they land on the card and
  are offered from the start; nothing in app/globals.css draws a panel for it.
*/
export function blockSurfaceOf(block: Pick<OnePageBlock, "type" | "data">): BlockSurface {
  if (block.type === "app") {
    const d = (block.data ?? {}) as { provider?: unknown; tip_mode?: unknown; url?: unknown }
    if (d.provider === "tips" && (d.tip_mode === "storelib" || (d.tip_mode !== "link" && !String(d.url ?? "").trim()))) return "card"
  }
  return blockSurface(block.type)
}
export function layoutControlsFor(type: string): LayoutControl[] {
  if (!PRESENTABLE_BLOCKS.has(type)) return []
  if (type === "link_button") return ["align", "title", "description", "icon", "background", "radius", "shadow", "padding"]
  if (type === "product") return ["radius", "shadow"]
  if (type === "storelib_shelf") return ["align", "title", "background", "radius", "shadow"]
  if (type === "social_posts") return ["align", "title", "radius"]
  if (type === "heading" || type === "text") return ["align", "title", "background", "radius", "shadow", "padding"]
  return ["align", "title", "description", "background", "radius", "shadow", "padding"]
}
/** Blocks whose Settings tab offers the optional description line. A product, a heading and a text say their own. */
export function blockTakesDescription(type: string): boolean {
  return PRESENTABLE_BLOCKS.has(type) && type !== "product" && type !== "heading" && type !== "text"
}

export type SocialPresentation = { platform: string; embed: string; aspect: string; thumbnail?: string; height?: number }
/** Providers are parsed, never interpolated from arbitrary embed HTML or hosts. */
export function socialPresentation(url: string): SocialPresentation | null {
  try {
    const u = new URL(url); if (!["https:", "http:"].includes(u.protocol)) return null; const host = u.hostname.toLowerCase().replace(/^www\./, ""); const parts = u.pathname.split("/").filter(Boolean)
    if (["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
      const id = host === "youtu.be" ? parts[0] : u.searchParams.get("v") || (["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : "")
      if (id && /^[\w-]{11}$/.test(id)) return {platform:"YouTube",embed:`https://www.youtube-nocookie.com/embed/${id}`,aspect:"16 / 9",thumbnail:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
    }
    if (host === "instagram.com" && ["p", "reel", "tv"].includes(parts[0]) && /^[\w-]+$/.test(parts[1] || "")) return {platform:"Instagram",embed:`https://www.instagram.com/${parts[0]}/${parts[1]}/embed/`,aspect:"4 / 5"}
    if (["tiktok.com", "m.tiktok.com"].includes(host) && /^\d{10,25}$/.test(parts[2] || "") && parts[1] === "video") return {platform:"TikTok",embed:`https://www.tiktok.com/player/v1/${parts[2]}`,aspect:"9 / 16"}
    if (host === "open.spotify.com") {
      const index = parts[0]?.startsWith("intl-") ? 1 : 0
      const kind=parts[index], id=parts[index+1]
      if (["track","album","artist","playlist","episode","show"].includes(kind) && /^[a-zA-Z0-9]+$/.test(id || "")) return {platform:"Spotify",embed:`https://open.spotify.com/embed/${kind}/${id}`,aspect:"auto",height:kind === "track" || kind === "episode" ? 152 : 352}
    }
    if(host==="vimeo.com"&&/^\d+$/.test(parts[0]||""))return {platform:"Vimeo",embed:`https://player.vimeo.com/video/${parts[0]}`,aspect:"16 / 9"}
    if(["x.com","twitter.com"].includes(host)&&parts[1]==="status"&&/^\d{5,25}$/.test(parts[2]||""))return {platform:"X",embed:`https://platform.twitter.com/embed/Tweet.html?id=${parts[2]}`,aspect:"auto",height:380}
    if (host === "soundcloud.com" && parts.length >= 2) return {platform:"SoundCloud",embed:`https://w.soundcloud.com/player/?url=${encodeURIComponent(u.origin+u.pathname)}&auto_play=false`,aspect:"auto",height:166}
    return moreEmbeds(u, host, parts)
  } catch { return null }
}

/*
  ROUND AR3: MORE ADDRESSES A LINK CAN SHOW IN PLACE. The owner: "the embeds of
  the links I add don't work, for example if I add an Amazon product ... a
  book, Calendly, pages, embeds in the sheet". A link to one of these is drawn
  as its card from the address's public preview (app/api/onepage/link-preview,
  Open Graph with oEmbed for the services that have it), and "Show it here"
  draws the service's own embed instead, from the same parsers the embed and
  music blocks use, so a frame is only ever one of the hosts in frame-src.
  An address with no embed (Amazon, a book's page, a shop) stays a rich card.
*/
const EMBED_PLATFORM: Partial<Record<string, string>> = { typeform: "Typeform", podcasts: "Apple Podcasts", canva: "Canva", loom: "Loom", googleforms: "Google Forms", tally: "Tally", gcal: "Google Calendar", substack: "Substack", mixcloud: "Mixcloud", deezer: "Deezer" }
function moreEmbeds(u: URL, host: string, parts: string[]): SocialPresentation | null {
  if (host === "music.apple.com") {
    const m = musicSource(u.toString())
    if (m) return { platform: "Apple Music", embed: m.embedUrl, aspect: "auto", height: m.height }
  }
  if (host === "calendly.com" && parts.length >= 1 && parts.every((p) => /^[A-Za-z0-9_-]{1,80}$/.test(p))) {
    return { platform: "Calendly", embed: `https://calendly.com/${parts.join("/")}?embed_type=Inline&hide_gdpr_banner=1`, aspect: "auto", height: 660 }
  }
  if ((host === "google.com" || /^google\.[a-z.]{2,6}$/.test(host) || host === "maps.google.com") && (parts[0] === "maps" || host === "maps.google.com")) {
    const place = parts[0] === "maps" && parts[1] === "place" ? decodeURIComponent(parts[2] || "").replace(/\+/g, " ") : u.searchParams.get("q") || ""
    if (place.trim() && place.length <= 200) return { platform: "Google Maps", embed: `https://maps.google.com/maps?q=${encodeURIComponent(place.trim())}&z=15&output=embed`, aspect: "auto", height: 300 }
  }
  const e = embedSource(u.toString())
  if (e && EMBED_PLATFORM[e.kind]) return { platform: EMBED_PLATFORM[e.kind]!, embed: e.embedUrl, aspect: e.height ? "auto" : "16 / 9", ...(e.height ? { height: e.height } : {}) }
  return null
}

/** A link shown in place that is a form, a booking page or a map: it is used, not watched, so it is not cut short. */
export function embedIsTool(platform: string): boolean {
  return ["Typeform", "Calendly", "Google Forms", "Tally", "Google Calendar", "Google Maps"].includes(platform)
}

/*
  A PROFILE ADDRESS, read from the address alone. Networks do not offer an
  embeddable profile to arbitrary pages, so a profile is shown as the Profile
  card: the creator's own picture (or the public preview image), the name and
  the handle. Nothing is scraped and no private page is asked for.
*/
export type SocialProfile = { platform: string; handle: string }
const PROFILE_HOSTS: Record<string, string> = { "instagram.com": "Instagram", "tiktok.com": "TikTok", "youtube.com": "YouTube", "x.com": "X", "twitter.com": "X", "threads.net": "Threads", "threads.com": "Threads", "facebook.com": "Facebook", "pinterest.com": "Pinterest", "twitch.tv": "Twitch", "linkedin.com": "LinkedIn", "bsky.app": "Bluesky" }
export function socialProfile(url: string): SocialProfile | null {
  try {
    const u = new URL(url)
    if (!["https:", "http:"].includes(u.protocol)) return null
    const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "")
    const platform = PROFILE_HOSTS[host]
    if (!platform || socialPresentation(url)) return null
    const parts = u.pathname.split("/").filter(Boolean)
    let handle = ""
    if (host === "linkedin.com") handle = parts[0] === "in" ? parts[1] || "" : ""
    else if (host === "bsky.app") handle = parts[0] === "profile" ? parts[1] || "" : ""
    else if (parts.length === 1) handle = parts[0]
    handle = handle.replace(/^@/, "")
    if (!/^[\w.-]{1,60}$/.test(handle)) return null
    return { platform, handle }
  } catch { return null }
}
