/**
 * ===========================================================================
 *  WHAT PUT /api/onepage ACCEPTS INTO A PAGE'S SETTINGS, AND ITS ADDRESS
 * ===========================================================================
 * The route merged whatever `settings` it was sent into the row: a title of
 * any length with markup in it, a share image at an http:// or internal
 * address, a switch that was the string "no", a button style nobody draws.
 * The public page then rendered it, and the share image fetched it.
 *
 * Every setting the editor writes is checked here, and the page address too.
 * A value that can be made right is (text trimmed to its limit and stripped
 * of markup, a style the templates still call "glassmorphism" stored as
 * "glass"); one that cannot is refused with a sentence the editor shows as
 * it is. Keys this file does not know are kept, so a setting another part of
 * the editor adds is not lost, within a size limit. Pure, for
 * tests/onepage-search-share.test.ts.
 */
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, cleanOverride, safeImageUrl } from "@/lib/onepage/seo"
import { isValidUsername } from "@/lib/reserved-words"

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

export const BUTTON_STYLES = ["glass", "white", "black"] as const
export type ButtonStyle = (typeof BUTTON_STYLES)[number]
export const BADGE_TYPES = ["verified_creator", "verified_brand", "verified_business", "official_page", "verified_artist"] as const

/** The style a setting names, read the way the page draws it: the templates' "glassmorphism" is glass. */
export function buttonStyleOf(value: unknown, fallback: ButtonStyle): ButtonStyle {
  if (value === "glassmorphism") return "glass"
  return (BUTTON_STYLES as readonly unknown[]).includes(value) ? (value as ButtonStyle) : fallback
}

const TEXT_LIMITS: Record<string, number> = {
  seo_title: SEO_TITLE_MAX,
  social_title: SEO_TITLE_MAX,
  seo_description: SEO_DESCRIPTION_MAX,
  social_description: SEO_DESCRIPTION_MAX,
}
const SWITCHES = ["show_branding", "analytics_enabled", "subscribe_enabled", "share_enabled", "verified_badge_enabled", "hide_branding_pro_enabled"]
const MAX_SETTINGS_BYTES = 16 * 1024

/**
 * `stored` is what the row holds now. A value sent back exactly as it is
 * stored is kept without a check: the editor sends every setting on each
 * save, and a page saved before these rules existed must still save.
 */
export function checkSettingsPatch(raw: unknown, stored: Record<string, unknown> | null = null): Checked<Record<string, unknown>> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Settings could not be read" }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (stored && key in stored && JSON.stringify(stored[key]) === JSON.stringify(value)) {
      out[key] = value
    } else if (key in TEXT_LIMITS) {
      if (value !== null && value !== undefined && typeof value !== "string") return { ok: false, error: "Titles and descriptions must be text" }
      out[key] = cleanOverride(value, TEXT_LIMITS[key])
    } else if (key === "social_image_url") {
      if (value === null || value === undefined || value === "") out[key] = null
      else {
        const url = safeImageUrl(value)
        if (!url) return { ok: false, error: "The share image must be an https address" }
        out[key] = url
      }
    } else if (key === "social_image_position_x" || key === "social_image_position_y") {
      if (value === null || value === undefined) out[key] = null
      else {
        const n = typeof value === "number" ? value : Number(value)
        if (!Number.isFinite(n)) return { ok: false, error: "The image crop could not be read" }
        out[key] = Math.max(0, Math.min(100, Math.round(n)))
      }
    } else if (SWITCHES.includes(key)) {
      if (typeof value !== "boolean") return { ok: false, error: "A switch was sent a value that is not on or off" }
      out[key] = value
    } else if (key === "subscribe_style" || key === "share_style") {
      if (value !== "glassmorphism" && !(BUTTON_STYLES as readonly unknown[]).includes(value)) return { ok: false, error: "That button style does not exist" }
      out[key] = buttonStyleOf(value, "white")
    } else if (key === "verified_badge_type") {
      if (!(BADGE_TYPES as readonly unknown[]).includes(value)) return { ok: false, error: "That badge does not exist" }
      out[key] = value
    } else {
      out[key] = value
    }
  }
  if (JSON.stringify(out).length > MAX_SETTINGS_BYTES) return { ok: false, error: "Settings are too large to save" }
  return { ok: true, value: out }
}

/**
 * A page address a person may take: the rules a username follows
 * (lib/reserved-words isValidUsername: 3 to 30 lowercase letters, numbers
 * and single hyphens, no reserved word, no link-farm handle), because the
 * page is served at storelib.com/<address>/links beside the creator pages.
 */
export function checkPageSlug(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return { ok: false, error: "Page address could not be read" }
  const slug = raw.trim().toLowerCase()
  const verdict = isValidUsername(slug)
  if (!verdict.valid) return { ok: false, error: (verdict.error || "That page address is not available").replace(/^Username/, "Page address").replace(/username/g, "page address") }
  return { ok: true, value: slug }
}

/** The page's name and bio: text, within the lengths the editor allows. */
export function checkProfileText(title: unknown, bio: unknown): Checked<{ title?: string; bio?: string }> {
  const out: { title?: string; bio?: string } = {}
  if (title !== undefined) {
    if (title !== null && typeof title !== "string") return { ok: false, error: "The page name must be text" }
    out.title = typeof title === "string" ? title.slice(0, 200) : ""
  }
  if (bio !== undefined) {
    if (bio !== null && typeof bio !== "string") return { ok: false, error: "The bio must be text" }
    out.bio = typeof bio === "string" ? bio.slice(0, 2000) : ""
  }
  return { ok: true, value: out }
}
