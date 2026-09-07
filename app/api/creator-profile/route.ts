/**
 * The creator's own edits to their public page, made FROM that page.
 *
 * A creator looking at their storefront while signed in gets an "Edit profile"
 * control on the cover; this is what it saves to. Everything here is also
 * editable in the store builder — this is a shortcut for the three things
 * people change most, not a second source of truth, so it writes to exactly
 * the same rows the builder does and nothing else.
 *
 * WHERE EACH FIELD ACTUALLY LIVES, because it is not one table:
 *
 *   display name  -> profiles.display_name
 *   bio           -> headerSettings.bio (what the storefront renders first)
 *                    and creators.bio (the fallback, kept in step so the two
 *                    cannot drift and show different text in different places)
 *   social links  -> headerSettings.socialLinks
 *
 * The header settings live inside a JSON column, so they need a
 * read-modify-write. Both the draft and the published config are updated:
 * writing only the published one would mean the builder opens showing the old
 * values and silently republishes them over these.
 *
 * Authorisation is the user's own session through RLS — the update is scoped
 * by `user_id`/`creator_id` and runs on the request-scoped client, so a
 * signed-in user can only ever reach their own row. No admin client here.
 */
import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import type { AboutMediaItem, ShopHeaderSettings, SocialLinksConfig } from "@/lib/store-builder/types"
import { SOCIAL_PLATFORM_KEYS, resolveSocialInput, type SocialPlatformKey } from "@/lib/social/platforms"
import { toPublicHttpUrl } from "@/lib/url/public-url"
import { canonicalVideoUrl } from "@/lib/social/video"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// The list lives in lib/social/platforms. It used to be a third copy — the
// dialog had one, the icons had one, and this had one, so a platform added in
// two of the three was a field a creator could fill in that never appeared.
const PLATFORMS = SOCIAL_PLATFORM_KEYS
type Platform = SocialPlatformKey

const MAX_NAME = 60
const MAX_BIO = 500
const MAX_URL = 300
const MAX_ABOUT_HEADLINE = 120
const MAX_ABOUT_STORY = 2000
const MAX_ABOUT_MEDIA = 8

function cleanUrl(raw: unknown): string | null {
  return toPublicHttpUrl(raw, MAX_URL)
}

function buildSocialLinks(input: unknown, existing?: SocialLinksConfig): SocialLinksConfig {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const out = {} as SocialLinksConfig
  for (const key of PLATFORMS) {
    const url = resolveSocialInput(key, source[key])
    // `enabled` is kept only because the stored shape has the field; nothing
    // reads it any more. A URL is what shows an icon, and clearing the field
    // is what removes it — see the note in social-media-icons.tsx.
    out[key as Platform] = url ? { enabled: true, url } : { enabled: false, url: "" }
  }
  // Anything the caller did not mention at all keeps whatever was stored.
  if (existing) {
    for (const key of PLATFORMS) {
      // `existing[key]` is optional for the platforms added after the shape
      // was first written, so a stored config from before them has nothing
      // there — which is what `?? out[key]` is for.
      if (!(key in source)) out[key] = existing[key] ?? out[key]!
    }
  }
  return out
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, MAX_NAME) : undefined
  const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, MAX_BIO) : undefined

  /**
   * Images go through the same cleaner as the social links, for the same
   * reason: they end up in a `src` on a public page, and `javascript:` in an
   * attribute does not care that we called it an avatar. `null` clears; a
   * value that will not parse is refused rather than stored.
   */
  const avatarUrl =
    body.avatarUrl === null ? null : "avatarUrl" in body ? cleanUrl(body.avatarUrl) : undefined
  const coverUrl = body.coverUrl === null ? null : "coverUrl" in body ? cleanUrl(body.coverUrl) : undefined

  /**
   * The About story. Bounded like every other free-text field, and media is an
   * allowlist of two shapes — an uploaded image URL or a YouTube link — each
   * put through the same URL cleaner as everything else that reaches a src or
   * an href on a public page.
   */
  const about = (() => {
    const raw = body.about
    if (!raw || typeof raw !== "object") return undefined
    const value = raw as Record<string, unknown>
    const out: { headline?: string; aboutContent?: string; mediaItems?: AboutMediaItem[] } = {}
    if (typeof value.headline === "string") out.headline = value.headline.trim().slice(0, MAX_ABOUT_HEADLINE)
    if (typeof value.aboutContent === "string") out.aboutContent = value.aboutContent.trim().slice(0, MAX_ABOUT_STORY)
    if (Array.isArray(value.mediaItems)) {
      out.mediaItems = value.mediaItems
        .slice(0, MAX_ABOUT_MEDIA)
        .map((item) => {
          const m = item as Record<string, unknown>
          const type = m.type === "image" ? "image" : "video"
          const url = type === "video" ? canonicalVideoUrl(m.url) : cleanUrl(m.url)
          if (!url) return null
          return {
            id: typeof m.id === "string" && m.id ? m.id.slice(0, 64) : `m-${Math.random().toString(36).slice(2, 10)}`,
            type,
            url,
            caption: typeof m.caption === "string" ? m.caption.trim().slice(0, 160) : undefined,
          } as AboutMediaItem
        })
        .filter((m): m is AboutMediaItem => m !== null)
    }
    return Object.keys(out).length > 0 ? out : undefined
  })()

  /**
   * What the meta row shows. Booleans only — a missing key means "leave it as
   * it was", so the dialog can send one switch without resetting the others.
   */
  const display = (() => {
    const raw = body.display
    if (!raw || typeof raw !== "object") return undefined
    const value = raw as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const key of ["showReviews", "showFollowers", "showTotalSalesBadge", "showSocialMedia"]) {
      if (typeof value[key] === "boolean") out[key] = value[key] as boolean
    }
    return Object.keys(out).length > 0 ? out : undefined
  })()

  if (displayName !== undefined && displayName.length === 0) {
    return NextResponse.json({ error: "A display name is required" }, { status: 400 })
  }

  const profileUpdate: Record<string, unknown> = {}
  if (displayName !== undefined) profileUpdate.display_name = displayName
  if (avatarUrl !== undefined) profileUpdate.avatar_url = avatarUrl

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", user.id)
    if (error) {
      console.error("[creator-profile] profile update failed", error)
      return NextResponse.json({ error: "Could not save your profile" }, { status: 500 })
    }
  }

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()

  // A user who has not become a creator has no storefront to edit; the name is
  // still theirs to change, so that half is already saved and this is a
  // success, not an error.
  if (!creator) {
    return NextResponse.json({ ok: true, storefront: false })
  }

  const creatorUpdate: Record<string, unknown> = {}
  if (bio !== undefined) creatorUpdate.bio = bio
  if (coverUrl !== undefined) creatorUpdate.cover_url = coverUrl
  /**
   * THE SALES BADGE HAS TWO FLAGS and the renderer requires both:
   * `creators.show_total_sales_badge` AND `headerSettings.showTotalSalesBadge`.
   * A control that writes one of them is a control that appears not to work,
   * which is the same bug as the per-platform social `enabled` switch and the
   * sticky bar. One switch, both flags, written together.
   */
  if (display?.showTotalSalesBadge !== undefined) {
    creatorUpdate.show_total_sales_badge = display.showTotalSalesBadge
  }

  if (Object.keys(creatorUpdate).length > 0) {
    const { error } = await supabase.from("creators").update(creatorUpdate).eq("id", creator.id)
    if (error) console.error("[creator-profile] creators update failed", error)
  }

  const { data: config } = await supabase
    .from("store_builder_configs")
    .select("id, draft_config, published_config")
    .eq("creator_id", creator.id)
    .eq("page_type", "shop")
    .maybeSingle()

  if (!config) {
    return NextResponse.json({ ok: true, storefront: false })
  }

  /**
   * The About section's story, edited from the storefront rather than only
   * from the builder.
   *
   * It lives in a SECTION's settings, not in headerSettings, so it is merged
   * by walking `sections` for the one of type "about". A config with no About
   * section is left alone: adding one from here would put a block on the page
   * the creator never asked for.
   */
  const mergeAbout = (sections: unknown) => {
    if (!Array.isArray(sections) || !about) return sections
    return sections.map((section) => {
      const s = section as { type?: string; settings?: Record<string, unknown> }
      if (s?.type !== "about") return section
      const settings = { ...(s.settings || {}) }
      if (about.headline !== undefined) settings.headline = about.headline
      if (about.aboutContent !== undefined) settings.aboutContent = about.aboutContent
      if (about.mediaItems !== undefined) settings.mediaItems = about.mediaItems
      return { ...s, settings }
    })
  }

  const merge = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return raw
    const cfg = raw as { headerSettings?: ShopHeaderSettings; sections?: unknown }
    const header = (cfg.headerSettings || {}) as ShopHeaderSettings
    const next: ShopHeaderSettings = { ...header }
    if (bio !== undefined) next.bio = bio
    /**
     * The storefront reads `headerSettings.avatarUrl` and `coverImageUrl`
     * FIRST and only falls back to the profile and creator rows. Writing only
     * those rows would look like the save silently did nothing — an empty
     * string in `avatarUrl` even means "show initials" rather than "inherit",
     * so a cleared image has to be written as `undefined`, not "".
     */
    if (avatarUrl !== undefined) next.avatarUrl = avatarUrl ?? undefined
    if (coverUrl !== undefined) next.coverImageUrl = coverUrl ?? undefined
    if ("socialLinks" in body) {
      next.socialLinks = buildSocialLinks(body.socialLinks, header.socialLinks)
    }
    if (display) Object.assign(next, display)
    return { ...cfg, headerSettings: next, sections: mergeAbout(cfg.sections) }
  }

  const { error } = await supabase
    .from("store_builder_configs")
    .update({
      draft_config: merge(config.draft_config),
      published_config: merge(config.published_config),
    })
    .eq("id", config.id)

  if (error) {
    console.error("[creator-profile] config update failed", error)
    return NextResponse.json({ error: "Could not save your profile" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, storefront: true })
}
