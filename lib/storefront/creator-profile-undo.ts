/**
 * ===========================================================================
 *  WHAT PUTS A CREATOR PAGE SAVE BACK (round 50)
 * ===========================================================================
 * The creator page editor saves each sheet as it closes, so its undo is a
 * save too: the same PATCH to /api/creator-profile, carrying what the page
 * held before. The route reads that before it writes (it reads the rows for
 * its own merge anyway) and hands back, with its answer, the body that puts
 * exactly the fields it was sent back as they were. The editor keeps the
 * pair (what was sent, what undoes it) as one step.
 *
 * Only the keys the request named: an undo of a name change does not touch
 * the links somebody changed in another sheet since.
 *
 * Pure, so tests/creator-editor-r50 runs it.
 */
import type { ShopHeaderSettings } from "@/lib/store-builder/types"
import { SOCIAL_PLATFORM_KEYS } from "@/lib/social/platforms"

/** What the page held before the save, as the route read it. */
export interface CreatorPageBefore {
  displayName: string | null
  profileAvatarUrl: string | null
  creatorBio: string | null
  creatorCoverUrl: string | null
  creatorShowsSales: boolean | null
  /** The published shop config, or null when there is none. */
  header: ShopHeaderSettings | null
  themePreset: string | null
  about: { headline?: unknown; aboutContent?: unknown; mediaItems?: unknown } | null
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v)

const BAR_COLORS = ["backgroundColor", "textColor", "buttonColor", "buttonTextColor"] as const
/** The two the bar keeps under `colors` as well as at the top level (see the route). */
const BAR_NESTED = new Set(["backgroundColor", "textColor"])

export function undoBodyFor(body: Json, before: CreatorPageBefore): Json | null {
  const header = (before.header ?? {}) as ShopHeaderSettings & Json
  const out: Json = {}

  if ("displayName" in body && before.displayName) out.displayName = before.displayName
  if ("bio" in body) out.bio = (typeof header.bio === "string" ? header.bio : before.creatorBio) ?? ""
  if ("avatarUrl" in body) out.avatarUrl = (header.avatarUrl !== undefined ? header.avatarUrl : before.profileAvatarUrl) || null
  if ("coverUrl" in body) out.coverUrl = (header.coverImageUrl !== undefined ? header.coverImageUrl : before.creatorCoverUrl) || null
  /* A cover's crop goes back with it whenever the cover was in the save: the route resets the crop of a cover it replaces. */
  if ("coverFocalPoint" in body || "coverUrl" in body) {
    const fp = header.coverFocalPoint as { x?: unknown; y?: unknown } | undefined
    out.coverFocalPoint = fp && typeof fp.x === "number" && typeof fp.y === "number" ? { x: fp.x, y: fp.y } : null
  }
  if ("coverZoom" in body || "coverUrl" in body) out.coverZoom = typeof header.coverZoom === "number" ? header.coverZoom : null

  if ("socialLinks" in body) {
    const links = (header.socialLinks ?? {}) as Record<string, { url?: string } | undefined>
    out.socialLinks = Object.fromEntries(SOCIAL_PLATFORM_KEYS.map((key) => [key, links[key]?.url || ""]))
  }

  if (isObject(body.display)) {
    const display: Record<string, boolean> = {}
    const asked = body.display
    /* What the page showed, read the way the page reads it (app/(storelib)/(marketing)/u/[username]/page.tsx). */
    if ("showReviews" in asked) display.showReviews = (header.showStats ?? true) !== false && (header.showReviews ?? true) !== false
    if ("showTotalSalesBadge" in asked) display.showTotalSalesBadge = (header.showTotalSalesBadge ?? true) !== false && before.creatorShowsSales !== false
    if ("showSocialMedia" in asked) display.showSocialMedia = header.hideSocialLinks !== true
    if ("showFollowers" in asked) display.showFollowers = (header as Json).showFollowers !== false
    if (Object.keys(display).length > 0) out.display = display
  }

  if ("themePreset" in body) out.themePreset = before.themePreset || "default"
  if ("productsOrder" in body) out.productsOrder = Array.isArray(header.productsOrder) ? [...header.productsOrder] : []
  if ("contactEmail" in body) out.contactEmail = typeof header.contactEmail === "string" ? header.contactEmail : ""

  if (isObject(body.subscribeBar)) {
    const asked = body.subscribeBar
    const bar = (isObject(header.subscribeBar) ? header.subscribeBar : {}) as Json
    const colors = (isObject(bar.colors) ? bar.colors : {}) as Json
    const chosen = new Set(Array.isArray(bar.colorChoices) ? (bar.colorChoices as string[]) : [])
    const sb: Json = {}
    if ("text" in asked) sb.text = typeof bar.text === "string" ? bar.text : typeof bar.customCtaText === "string" ? bar.customCtaText : ""
    if ("style" in asked) sb.style = typeof bar.style === "string" ? bar.style : "style1"
    if ("buttonStyle" in asked) sb.buttonStyle = typeof bar.buttonStyle === "string" ? bar.buttonStyle : "style1"
    if ("buttonText" in asked) sb.buttonText = bar.buttonTextPreset === "custom" && typeof bar.buttonText === "string" ? bar.buttonText : ""
    for (const key of BAR_COLORS) {
      if (!(key in asked)) continue
      /* A colour nobody had chosen goes back to following the scheme: null, which the route reads as "not chosen". */
      const stored = BAR_NESTED.has(key) ? (colors[key] ?? bar[key]) : bar[key]
      sb[key] = chosen.has(key) && typeof stored === "string" ? stored : null
    }
    if (Object.keys(sb).length > 0) out.subscribeBar = sb
  }

  if (isObject(body.about) && before.about) {
    const asked = body.about
    const about: Json = {}
    if ("headline" in asked) about.headline = typeof before.about.headline === "string" ? before.about.headline : ""
    if ("aboutContent" in asked) about.aboutContent = typeof before.about.aboutContent === "string" ? before.about.aboutContent : ""
    if ("mediaItems" in asked) about.mediaItems = Array.isArray(before.about.mediaItems) ? before.about.mediaItems : []
    if (Object.keys(about).length > 0) out.about = about
  }

  return Object.keys(out).length > 0 ? out : null
}
