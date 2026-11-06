import type { CSSProperties } from "react"
import type { OnePageBlock } from "./types"

/** Optional, versionless JSON additions. No value means the original renderer. */
export interface BlockPresentation {
  subtitle?: string
  variant?: "original" | "visual" | "image-first" | "featured" | "compact"
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
}
export const PRESENTABLE_BLOCKS = new Set(["link_button", "product", "image", "pdf_document", "food_menu", "calendly", "course", "music", "video", "embed", "map", "email_capture", "contact_form", "storelib_shelf", "lead_magnet", "social_posts", "followers", "promo_code", "faq", "countdown", "testimonials", "heading", "text"])
const color = (v: unknown) => typeof v === "string" && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(v) ? v : undefined
const number = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined
const choice = <T extends string>(v: unknown, values: readonly T[]): T | undefined => values.includes(v as T) ? v as T : undefined
export function safeCardMedia(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return undefined
  if (value.startsWith("/") && !value.startsWith("//") && !/[\\\s]/.test(value)) return value
  try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined } catch { return undefined }
}
export function presentationOf(block: Pick<OnePageBlock, "style"> | null | undefined): BlockPresentation {
  const raw = block?.style?.presentation
  if (!raw || typeof raw !== "object") return {}
  return {
    subtitle: typeof raw.subtitle === "string" ? raw.subtitle.slice(0, 600) : undefined,
    variant: choice(raw.variant, ["original", "visual", "image-first", "featured", "compact"]),
    size: choice(raw.size, ["auto", "full", "half", "tall"]),
    align: choice(raw.align, ["left", "center", "right"]), position: choice(raw.position, ["top", "center", "bottom"]),
    title_size: number(raw.title_size, 12, 40), title_weight: number(raw.title_weight, 400, 800), title_color: color(raw.title_color),
    subtitle_size: number(raw.subtitle_size, 11, 24), subtitle_color: color(raw.subtitle_color),
    icon_size: number(raw.icon_size, 16, 48), icon_color: color(raw.icon_color),
    gap: number(raw.gap, 0, 24), padding: number(raw.padding, 8, 40), image_url: safeCardMedia(raw.image_url),
    overlay: number(raw.overlay, 0, 90), gradient_from: color(raw.gradient_from), gradient_to: color(raw.gradient_to),
    media_mode: choice(raw.media_mode, ["card", "native"]),
  }
}
export function presentationVars(p: BlockPresentation): CSSProperties {
  return Object.fromEntries(Object.entries({
    "--op-block-title-size": p.title_size === undefined ? undefined : `${p.title_size}px`,
    "--op-block-title-weight": p.title_weight, "--op-block-title-color": p.title_color,
    "--op-block-subtitle-size": p.subtitle_size === undefined ? undefined : `${p.subtitle_size}px`, "--op-block-subtitle-color": p.subtitle_color,
    "--op-block-icon-size": p.icon_size === undefined ? undefined : `${p.icon_size}px`, "--op-block-icon-color": p.icon_color,
    "--op-block-gap": p.gap === undefined ? undefined : `${p.gap}px`, "--op-block-padding": p.padding === undefined ? undefined : `${p.padding}px`,
  }).filter(([, v]) => v !== undefined)) as CSSProperties
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
    if (host === "soundcloud.com" && parts.length >= 2) return {platform:"SoundCloud",embed:`https://w.soundcloud.com/player/?url=${encodeURIComponent(u.origin+u.pathname)}&auto_play=false`,aspect:"auto",height:166}
    return null
  } catch { return null }
}
