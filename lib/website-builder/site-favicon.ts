/**
 * ===========================================================================
 *  A WEBSITE'S ICON, SERVED FROM THE WEBSITE'S OWN HOST (round 41)
 * ===========================================================================
 * Google shows a favicon beside each search result, and reads it from the
 * site's home page: the <link rel="icon"> it finds there, else /favicon.ico
 * on the same host. Its guidelines ask for a square picture of at least
 * 48 by 48, at an address that does not keep changing, that Googlebot may
 * crawl. A website built on Storelib linked the upload's storage address
 * (any shape, any size), and /favicon.ico on its host was Storelib's 404.
 *
 * Now every website host answers three addresses itself, from the site's
 * own favicon (or its logo, as the tab already used: ./site-icon.ts):
 *
 *   /favicon.ico        192 by 192 PNG, the picture fitted inside a square
 *                       with a clear background (192 is four times 48, the
 *                       size Google asks multiples of)
 *   /apple-touch-icon   180 by 180 PNG on white, what a phone's home screen
 *                       draws (iOS draws a clear background black)
 *   /site.webmanifest   the web app manifest naming both
 *
 * The page links them at the site's canonical origin, with `?v=` naming
 * which picture they are, so a new upload is a new address a browser fetches
 * and an unchanged one never moves. proxy.ts sends these paths on a
 * subdomain and on a connected website domain to app/(site)/w/[username].
 *
 * Pure: no database, no network. The routes do the reading.
 */

export const SITE_ICON_PATH = "/favicon.ico"
export const SITE_TOUCH_ICON_PATH = "/apple-touch-icon"
export const SITE_MANIFEST_PATH = "/site.webmanifest"

/** The three paths a website host answers with its own icon. */
export const SITE_ICON_PATHS = [SITE_ICON_PATH, SITE_TOUCH_ICON_PATH, SITE_MANIFEST_PATH] as const

export function isSiteIconPath(pathname: string): boolean {
  return (SITE_ICON_PATHS as readonly string[]).includes(pathname)
}

/** Edge of the square each path draws. */
export const FAVICON_SIZE = 192
export const TOUCH_ICON_SIZE = 180

/** A short, stable fingerprint of the picture's address (FNV-1a), so the link changes when the picture does and only then. */
export function iconVersion(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

const trimOrigin = (origin: string) => origin.replace(/\/+$/, "")

/** The icon's address on the site's own host. */
export function ownIconUrl(origin: string, source: string, path: string = SITE_ICON_PATH): string {
  return `${trimOrigin(origin)}${path}?v=${iconVersion(source)}`
}

/** The same, as a path on whatever host the page is drawn at: for a page drawn as text (an imported theme's), where a relative address is the site's own host. Empty when there is no picture. */
export function ownIconPath(source: string | null | undefined): string {
  return source ? `${SITE_ICON_PATH}?v=${iconVersion(source)}` : ""
}

/**
 * As Next's metadata wants it: the icon, the home screen icon and the
 * manifest, all on `origin`. Nothing when the site has no picture, so the
 * route's default stays.
 */
export function ownHostIcons(origin: string, source: string | null | undefined) {
  if (!source) return undefined
  const icon = ownIconUrl(origin, source)
  return {
    icons: {
      icon: [{ url: icon, type: "image/png", sizes: `${FAVICON_SIZE}x${FAVICON_SIZE}` }],
      shortcut: icon,
      apple: [{ url: ownIconUrl(origin, source, SITE_TOUCH_ICON_PATH), sizes: `${TOUCH_ICON_SIZE}x${TOUCH_ICON_SIZE}` }],
    },
    manifest: ownIconUrl(origin, source, SITE_MANIFEST_PATH),
  }
}

/** The manifest a site's host serves: its name and its two icons, at relative addresses on the same host. */
export function siteManifest(input: { name: string; source: string; themeColor?: string | null }): Record<string, unknown> {
  const v = iconVersion(input.source)
  const name = input.name.trim().slice(0, 60) || "Store"
  return {
    name,
    short_name: name.slice(0, 30),
    start_url: "/",
    display: "browser",
    ...(input.themeColor && /^#[0-9a-f]{3,8}$/i.test(input.themeColor) ? { theme_color: input.themeColor } : {}),
    icons: [
      { src: `${SITE_ICON_PATH}?v=${v}`, sizes: `${FAVICON_SIZE}x${FAVICON_SIZE}`, type: "image/png", purpose: "any" },
      { src: `${SITE_TOUCH_ICON_PATH}?v=${v}`, sizes: `${TOUCH_ICON_SIZE}x${TOUCH_ICON_SIZE}`, type: "image/png", purpose: "any" },
    ],
  }
}

const SUPABASE_PUBLIC = /^https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\/storage\/v1\/object\/public\//i

/**
 * Where the server may fetch the picture from: Storelib's own storage only,
 * whether saved as its storage address or as Storelib's /media/ address.
 * Anything else (a picture on another site) is null, and the route sends the
 * browser there instead of fetching an address a creator typed from inside
 * Storelib's network.
 */
export function fetchableIconSource(raw: string | null | undefined, env: { mainDomain: string; supabaseUrl: string }): string | null {
  const url = (raw ?? "").trim()
  if (!url) return null
  const storage = env.supabaseUrl.replace(/\/+$/, "")
  const media = /^(?:https:\/\/(?:www\.)?([a-z0-9.-]+))?\/media\/(.+)$/i.exec(url)
  if (media && (!media[1] || media[1].toLowerCase() === env.mainDomain.toLowerCase())) {
    return storage ? `${storage}/storage/v1/object/public/${media[2]}` : null
  }
  if (storage && url.startsWith(`${storage}/storage/v1/object/public/`)) return url
  if (SUPABASE_PUBLIC.test(url)) return url
  return null
}
