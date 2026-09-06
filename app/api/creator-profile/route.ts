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
import type { ShopHeaderSettings, SocialLinksConfig } from "@/lib/store-builder/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "spotify"] as const
type Platform = (typeof PLATFORMS)[number]

const MAX_NAME = 60
const MAX_BIO = 500
const MAX_URL = 300

/**
 * A social link is a public profile URL and nothing else. `javascript:` and
 * `data:` URLs are rendered into an href on a public page, so they are exactly
 * the thing to keep out — protocol is checked against an allowlist rather than
 * a blocklist, and anything unparseable is rejected rather than passed through.
 */
function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value) return null
  if (value.length > MAX_URL) return null
  /**
   * A scheme the creator typed is honoured only if it is http(s). Anything
   * else — javascript:, data:, vbscript: — is refused here rather than being
   * prefixed into something that happens not to parse. It did happen not to
   * parse, which is not the same as being rejected on purpose: `javascript:`
   * survived the prefixing only because "alert(1)" is an invalid port, and a
   * payload that parsed would have gone straight into an href on a public page.
   */
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase()
  if (scheme && scheme !== "http" && scheme !== "https") return null

  const withScheme = scheme ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname.includes(".")) return null
    return url.toString()
  } catch {
    return null
  }
}

function buildSocialLinks(input: unknown, existing?: SocialLinksConfig): SocialLinksConfig {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const out = {} as SocialLinksConfig
  for (const key of PLATFORMS) {
    const url = cleanUrl(source[key])
    out[key as Platform] = url
      ? { enabled: true, url }
      : // Cleared: keep the row but switch it off, which is what the builder's
        // own toggle does. SocialMediaIcons skips anything without both.
        { enabled: false, url: "" }
  }
  // Anything the caller did not mention at all keeps whatever was stored.
  if (existing) {
    for (const key of PLATFORMS) {
      if (!(key in source)) out[key] = existing[key] ?? out[key]
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

  if (displayName !== undefined && displayName.length === 0) {
    return NextResponse.json({ error: "A display name is required" }, { status: 400 })
  }

  if (displayName !== undefined) {
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id)
    if (error) {
      console.error("[creator-profile] display_name update failed", error)
      return NextResponse.json({ error: "Could not save your name" }, { status: 500 })
    }
  }

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()

  // A user who has not become a creator has no storefront to edit; the name is
  // still theirs to change, so that half is already saved and this is a
  // success, not an error.
  if (!creator) {
    return NextResponse.json({ ok: true, storefront: false })
  }

  if (bio !== undefined) {
    const { error } = await supabase.from("creators").update({ bio }).eq("id", creator.id)
    if (error) console.error("[creator-profile] creators.bio update failed", error)
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

  const merge = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return raw
    const cfg = raw as { headerSettings?: ShopHeaderSettings }
    const header = (cfg.headerSettings || {}) as ShopHeaderSettings
    const next: ShopHeaderSettings = { ...header }
    if (bio !== undefined) next.bio = bio
    if ("socialLinks" in body) {
      next.socialLinks = buildSocialLinks(body.socialLinks, header.socialLinks)
      // Adding a link and not seeing it because a separate toggle was off is
      // not a state anyone chooses on purpose.
      next.showSocialMedia = true
    }
    return { ...cfg, headerSettings: next }
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
