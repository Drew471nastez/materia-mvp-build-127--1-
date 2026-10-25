import "server-only"

/**
 * ===========================================================================
 *  THE STORE'S LOGO, ONE ANSWER
 * ===========================================================================
 * Receipts, invoices, order emails, the checkout's header and Settings ›
 * Store details' Logo card all show the store's logo. They used to work it
 * out on their own: the checkout read an imported Shopify theme's `logo`
 * setting, receipts and the Logo card only read a built theme's
 * `logo_url`, so a store on an imported theme had its logo at checkout and
 * the owner's photo on its receipts.
 *
 * The order, everywhere:
 *
 *   store     Settings › Store details' logo (SQL part 118)
 *   website   the published website's logo: a built theme's Branding ›
 *             Logo, or an imported theme's own `logo` setting, through the
 *             theme's pictures (shopify://shop_images/…)
 *   profile   the person's photo
 *
 * Only an https address or a path on storelib.com is ever handed out, so a
 * saved value cannot put another scheme into a page or an email.
 */
import { mediaUrl } from "@/lib/storage/media-url"
import { getMainDomain } from "@/lib/url-helpers"
import { ASSET_MAP_PATH, compatOf, compatValues } from "@/lib/storelib-theme/compat/install"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type LogoFrom = "store" | "website" | "profile"

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/** A picture's address as a page or an email can load it: https (storage through the media proxy), or a path on storelib.com. Nothing else. */
export function pictureUrl(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  if (/^https:\/\//i.test(s)) return mediaUrl(s)
  if (s.startsWith("/") && !s.startsWith("//")) return `https://${getMainDomain()}${s}`
  return null
}

/** The published install's theme settings, from a `store_theme_installs` row read with `store_theme_settings ( settings )`. */
export function themeSettingsOf(install: { store_theme_settings?: unknown } | null | undefined): Record<string, unknown> {
  const row = Array.isArray(install?.store_theme_settings) ? install?.store_theme_settings[0] : install?.store_theme_settings
  const settings = (row as { settings?: unknown } | null)?.settings
  return settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {}
}

/** An imported theme's picture setting as an address: as it is when it is one, or the theme's own picture of that name. */
export async function compatPicture(db: Db, installId: string, value: string): Promise<string | null> {
  if (/^https:\/\//i.test(value) || value.startsWith("/")) return pictureUrl(value)
  const name = value.match(/^shopify:\/\/shop_images\/([^?#]+)/)?.[1]
  if (!name) return null
  try {
    const { data, error } = await db.from("store_theme_custom_files").select("content").eq("install_id", installId).eq("path", ASSET_MAP_PATH).maybeSingle()
    if (error) return null
    const map = JSON.parse((data as { content?: string | null } | null)?.content ?? "{}") as Record<string, string>
    const hit = map[decodeURIComponent(name)]
    return typeof hit === "string" ? pictureUrl(hit) : null
  } catch {
    return null
  }
}

/** The published website's own logo, for a built theme or an imported one. */
export async function websiteLogo(db: Db, install: { id?: string | null; store_theme_settings?: unknown } | null | undefined): Promise<string | null> {
  if (!install) return null
  const theme = themeSettingsOf(install)
  if (compatOf(theme)) {
    const value = str(compatValues(theme).logo)
    return value && install.id ? compatPicture(db, install.id, value) : null
  }
  return pictureUrl(theme.logo_url)
}

/** The first of the store's own logo, the website's and the person's photo there is. */
export function chooseStoreLogo(c: { store?: unknown; website?: string | null; photo?: unknown }): { url: string | null; from: LogoFrom | null } {
  const candidates: [string | null, LogoFrom][] = [[pictureUrl(c.store), "store"], [c.website ?? null, "website"], [pictureUrl(c.photo), "profile"]]
  for (const [url, from] of candidates) if (url) return { url, from }
  return { url: null, from: null }
}

/**
 * The name that goes with it: Store details' store name, else the built
 * website's brand name (it goes with the website's logo), else the person's
 * display name as their profile has it, else their creator page's, else a
 * username.
 */
export function chooseStoreName(c: { store?: unknown; theme?: Record<string, unknown>; profile?: { display_name?: unknown; username?: unknown } | null; creator?: { display_name?: unknown; username?: unknown } | null }, fallback: string): string {
  const brand = c.theme && !compatOf(c.theme) ? str(c.theme.brand_name) : ""
  return str(c.store) || brand || str(c.profile?.display_name) || str(c.creator?.display_name) || str(c.profile?.username) || str(c.creator?.username) || fallback
}
