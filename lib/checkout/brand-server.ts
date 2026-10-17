import "server-only"

/**
 * ===========================================================================
 *  THE SHOP AT THE TOP OF ITS CHECKOUT
 * ===========================================================================
 * A buyer who pressed Check out on a creator's website should see that shop
 * across the top of the page they pay on: its logo, its name, Back to it.
 * The basket checkout and the physical checkout read it here, from the
 * database, never from the link (a logo in a query string would let anyone
 * dress storelib.com up as any shop).
 *
 *   logo   the published website's own logo (a website builder theme's
 *          Branding › Logo, or an imported Shopify theme's `logo` setting),
 *          else Settings › Store details' logo, else the person's photo
 *   name   Store details' store name, else their display name, else their
 *          username
 *
 * `kind` says which: a logo is drawn as it is (a wordmark is wide), a photo
 * as a round avatar beside the name. Every read fails soft to less: a
 * checkout never breaks over its header.
 */
import { cache } from "react"
import { mediaUrl } from "@/lib/storage/media-url"
import { getMainDomain } from "@/lib/url-helpers"
import { ASSET_MAP_PATH, compatOf, compatValues } from "@/lib/storelib-theme/compat/install"
import { faviconOf } from "@/lib/website-builder/favicon-sync"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface CheckoutBrand {
  name: string
  imageUrl: string | null
  /** A logo is drawn as it is; a photo is round, beside the name. */
  kind: "logo" | "photo" | null
  /** The browser tab's icon: the website's favicon, else its logo, else the person's photo (as the live site does, lib/website-builder/site-icon). */
  iconUrl?: string | null
  /** The picture a shared checkout link shows: the website's share image, else its logo (not an SVG, which share cards cannot draw), else the photo. */
  shareImageUrl?: string | null
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/** A picture's address as a page can load it: https (storage through the media proxy), or a path on storelib.com. Nothing else. */
function absolute(v: string): string | null {
  if (!v) return null
  if (/^https:\/\//i.test(v)) return mediaUrl(v)
  if (v.startsWith("/") && !v.startsWith("//")) return `https://${getMainDomain()}${v}`
  return null
}

async function soft<T>(read: () => PromiseLike<{ data: unknown; error?: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await read()
    return error ? null : ((data as T) ?? null)
  } catch {
    return null
  }
}

/** An imported theme's `logo` setting as an address: as it is when it is one, or the theme's own picture of that name. */
async function compatLogo(db: Db, installId: string, value: string): Promise<string | null> {
  if (/^https:\/\//i.test(value) || value.startsWith("/")) return absolute(value)
  const name = value.match(/^shopify:\/\/shop_images\/([^?#]+)/)?.[1]
  if (!name) return null
  const row = await soft<{ content?: string | null }>(() => db.from("store_theme_custom_files").select("content").eq("install_id", installId).eq("path", ASSET_MAP_PATH).maybeSingle())
  try {
    const map = JSON.parse(row?.content ?? "{}") as Record<string, string>
    const hit = map[decodeURIComponent(name)]
    return typeof hit === "string" ? absolute(hit) : null
  } catch {
    return null
  }
}

export async function checkoutBrand(db: Db, creatorId: string): Promise<CheckoutBrand> {
  const [settings, creator, install] = await Promise.all([
    soft<{ store_name?: string | null; logo_url?: string | null }>(() => db.from("store_settings").select("store_name, logo_url").eq("creator_id", creatorId).maybeSingle()).then(
      async (r) => r ?? (await soft<{ store_name?: string | null }>(() => db.from("store_settings").select("store_name").eq("creator_id", creatorId).maybeSingle())),
    ),
    soft<{ display_name?: string | null; username?: string | null; avatar_url?: string | null; user_id?: string | null }>(() =>
      db.from("creators").select("display_name, username, avatar_url, user_id").eq("id", creatorId).maybeSingle(),
    ),
    soft<{ id: string; store_theme_settings?: unknown }>(() =>
      db.from("store_theme_installs").select("id, store_theme_settings ( settings )").eq("creator_id", creatorId).eq("status", "published").limit(1).maybeSingle(),
    ),
  ])
  const profile = creator?.user_id
    ? await soft<{ display_name?: string | null; username?: string | null; avatar_url?: string | null }>(() => db.from("profiles").select("display_name, username, avatar_url").eq("id", creator.user_id).maybeSingle())
    : null

  const themeRow = Array.isArray(install?.store_theme_settings) ? install?.store_theme_settings[0] : install?.store_theme_settings
  const theme = ((themeRow as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>
  let websiteLogo: string | null = null
  let websiteIcon: string | null = null
  let websiteShare: string | null = null
  /* The website's one favicon (Website settings, Branding and an imported theme's own are one value: lib/website-builder/favicon-sync.ts). */
  const ownIcon = faviconOf(theme as Record<string, unknown>)
  if (compatOf(theme)) {
    const values = compatValues(theme)
    const value = str(values.logo)
    /* An imported theme's own picture by its theme address only when the site has no favicon a browser can fetch. */
    const favicon = ownIcon ? "" : str(values.favicon)
    ;[websiteLogo, websiteIcon] = await Promise.all([
      value && install?.id ? compatLogo(db, install.id, value) : Promise.resolve(null),
      ownIcon ? Promise.resolve(absolute(ownIcon)) : favicon && install?.id ? compatLogo(db, install.id, favicon) : Promise.resolve(null),
    ])
  } else {
    websiteLogo = absolute(str(theme.logo_url))
    websiteIcon = absolute(ownIcon)
    websiteShare = absolute(str(theme.seo_og_image))
  }

  const name =
    str(settings?.store_name) || str(profile?.display_name) || str(creator?.display_name) || str(profile?.username) || str(creator?.username) || "Checkout"
  const logo = websiteLogo ?? absolute(str((settings as { logo_url?: string | null } | null)?.logo_url))
  const photo = absolute(str(profile?.avatar_url) || str(creator?.avatar_url))
  const drawable = (v: string | null) => (v && !/\.svg(?:\?|$)/i.test(v) ? v : null)
  const iconUrl = websiteIcon ?? logo ?? photo
  const shareImageUrl = websiteShare ?? drawable(logo) ?? photo
  if (logo) return { name, imageUrl: logo, kind: "logo", iconUrl, shareImageUrl }
  return { name, imageUrl: photo, kind: photo ? "photo" : null, iconUrl, shareImageUrl }
}

/**
 * The same, once per request for a website's checkout: its page and its
 * metadata (the tab's title and icon, the share card) both ask, and the
 * second is answered from the first (app/checkout/site/layout.tsx).
 */
export const checkoutBrandOf = cache(async (creatorId: string): Promise<CheckoutBrand> => {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  return checkoutBrand(createAdminClient(), creatorId)
})
