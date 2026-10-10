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
import { mediaUrl } from "@/lib/storage/media-url"
import { getMainDomain } from "@/lib/url-helpers"
import { ASSET_MAP_PATH, compatOf, compatValues } from "@/lib/storelib-theme/compat/install"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface CheckoutBrand {
  name: string
  imageUrl: string | null
  /** A logo is drawn as it is; a photo is round, beside the name. */
  kind: "logo" | "photo" | null
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
  if (compatOf(theme)) {
    const value = str(compatValues(theme).logo)
    if (value && install?.id) websiteLogo = await compatLogo(db, install.id, value)
  } else {
    websiteLogo = absolute(str(theme.logo_url))
  }

  const name =
    str(settings?.store_name) || str(profile?.display_name) || str(creator?.display_name) || str(profile?.username) || str(creator?.username) || "Checkout"
  const logo = websiteLogo ?? absolute(str((settings as { logo_url?: string | null } | null)?.logo_url))
  if (logo) return { name, imageUrl: logo, kind: "logo" }
  const photo = absolute(str(profile?.avatar_url) || str(creator?.avatar_url))
  return { name, imageUrl: photo, kind: photo ? "photo" : null }
}
