/**
 * ===========================================================================
 *  THE TAB'S ICON IS THE STORE'S, EVEN WITHOUT A FAVICON
 * ===========================================================================
 * A site with no favicon set showed Storelib's own icon in its visitors' tabs
 * and bookmarks, beside the creator's name: somebody else's mark on their
 * shop. Most creators upload a logo and never think about a favicon, so the
 * logo stands in for it:
 *
 *   1. the favicon: Website settings › General, the builder's Theme settings
 *      › Branding and an imported theme's own Logos & Favicon are one value,
 *      read here through faviconOf (./favicon-sync.ts) and nowhere else
 *   2. Theme settings › Branding › Logo image
 *   3. the header's own logo image (Header › Logo image)
 *
 * Nothing at all when none of them is set, so the route's default stays.
 * Only an address a browser can fetch for a tab: https, http, or a path.
 *
 * Every live page writes it the same way: Storelib's own pages through
 * Next's metadata (siteIcons), an imported theme's pages as markup
 * (siteIconTags), each with an apple-touch-icon for a phone's home screen.
 */
import { faviconOf } from "./favicon-sync"
import { FAVICON_SIZE, SITE_TOUCH_ICON_PATH, TOUCH_ICON_SIZE } from "./site-favicon"

type Sectionish = { type?: string; settings?: Record<string, unknown>; hidden?: boolean }

const fetchable = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : ""
  return /^(https?:\/\/|\/(?!\/))/i.test(s) ? s : ""
}

export function siteIconUrl(settings: Record<string, unknown> | null | undefined, sections: Sectionish[] | null | undefined = []): string {
  const theme = settings ?? {}
  const own = faviconOf(theme)
  if (own) return own
  const logo = fetchable(theme.logo_url)
  if (logo) return logo
  const header = (sections ?? []).find((s) => s?.type === "header" && !s.hidden)
  return fetchable(header?.settings?.logo_url)
}

/** The file type a browser is told, from the address's extension; nothing when it cannot be told. */
export function iconType(url: string): string | undefined {
  const ext = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase()
  switch (ext) {
    case "png": return "image/png"
    case "svg": return "image/svg+xml"
    case "ico": return "image/x-icon"
    case "webp": return "image/webp"
    case "jpg":
    case "jpeg": return "image/jpeg"
    case "gif": return "image/gif"
    case "avif": return "image/avif"
    default: return undefined
  }
}

/** What a phone's home screen draws: 180 by 180, the size iOS asks for. */
export const APPLE_ICON_SIZES = "180x180"

/** As Next's metadata wants it, or nothing to leave the route's default. */
export function siteIcons(settings: Record<string, unknown> | null | undefined, sections?: Sectionish[] | null) {
  const icon = siteIconUrl(settings, sections)
  if (!icon) return undefined
  const type = iconType(icon)
  return {
    /* An SVG draws at any size; a picture is drawn at whatever it is, the card asks for 64 by 64 or larger. */
    icon: [{ url: icon, ...(type ? { type } : {}), ...(type === "image/svg+xml" ? { sizes: "any" } : {}) }],
    shortcut: icon,
    apple: [{ url: icon, sizes: APPLE_ICON_SIZES }],
  }
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/** The site's own square icon on its host (./site-favicon.ts ownIconPath): "/favicon.ico?v=<version>". */
const OWN_HOST_ICON = /^\/favicon\.ico\?v=([a-z0-9]+)$/

/**
 * The tags for the site's own square icon, said as what it is: a 192 by 192
 * PNG (Google asks for a square of 48 or a multiple of it, and reads the
 * sizes), and the 180 by 180 home screen icon beside it.
 */
function ownHostIconTags(url: string, touch = true): string {
  const v = OWN_HOST_ICON.exec(url)?.[1] ?? ""
  return (
    `<link rel="icon" href="${escapeAttr(url)}" type="image/png" sizes="${FAVICON_SIZE}x${FAVICON_SIZE}">` +
    (touch ? `<link rel="apple-touch-icon" sizes="${TOUCH_ICON_SIZE}x${TOUCH_ICON_SIZE}" href="${SITE_TOUCH_ICON_PATH}?v=${v}">` : "")
  )
}

/** The same, as markup for a page drawn as text (an imported theme's). Empty when there is no icon. */
export function siteIconTags(icon: string | null | undefined): string {
  const url = fetchable(icon)
  if (!url) return ""
  if (OWN_HOST_ICON.test(url)) return ownHostIconTags(url)
  const type = iconType(url)
  const href = escapeAttr(url)
  return (
    `<link rel="icon" href="${href}"${type ? ` type="${type}"` : ""}${type === "image/svg+xml" ? ' sizes="any"' : ""}>` +
    `<link rel="apple-touch-icon" sizes="${APPLE_ICON_SIZES}" href="${href}">`
  )
}

/**
 * A page drawn as text gets the site's icon when its theme drew none: an
 * imported theme only writes one from its own favicon setting, and with
 * none the browser asked the host for /favicon.ico and showed Storelib's.
 * A theme that writes its own keeps it.
 *
 * `ownFavicon`: the creator set a favicon (not the logo standing in for one).
 */
export function withSiteIcon(html: string, icon: string | null | undefined, opts: { ownFavicon?: boolean } = {}): string {
  const head = html.search(/<\/head>/i)
  if (head < 0) return html
  const before = html.slice(0, head)
  /*
    THE THEME'S OWN ICON, WHEN IT IS THE SITE'S FAVICON, IS SAID THE WAY
    GOOGLE READS IT (round 53). A Shopify theme writes its favicon setting
    as `image_url: width: 32` (Dawn does, and the owner's Materia: measured
    on its live front page, `/_next/image?…&w=32`), a picture smaller than
    the 48 pixels Google asks for, so a search result showed no icon for the
    store. When the creator set a favicon (the value the theme's setting
    holds too, ./favicon-sync.ts), the theme's icon links are that picture,
    and are replaced by the site's own square, sized one on its host. A
    theme's icon on a site with no favicon set stays as the theme drew it.
  */
  const own = fetchable(icon)
  if (opts.ownFavicon && OWN_HOST_ICON.test(own)) {
    const themeIcon = /<link\b[^>]*\brel\s*=\s*["']?(?:shortcut\s+)?icon(?=["'\s>/])[^>]*>/gi
    if (themeIcon.test(before)) {
      themeIcon.lastIndex = 0
      const touch = !/\brel\s*=\s*["']?apple-touch-icon\b/i.test(before)
      let placed = false
      const swapped = before.replace(themeIcon, () => (placed ? "" : ((placed = true), ownHostIconTags(own, touch))))
      return `${swapped}${html.slice(head)}`
    }
  }
  if (/<link\b[^>]*\brel\s*=\s*["']?[^"'>]*\bicon\b/i.test(before)) {
    /*
      A theme that draws its tab icon and no home screen one (most do: Shopify
      fills that in itself) gets the site's for a phone's home screen, so
      "Add to Home Screen" shows the store's icon, not a picture of the page.
    */
    const url = fetchable(icon)
    if (!url || /\brel\s*=\s*["']?apple-touch-icon\b/i.test(before)) return html
    /* The site's own icon has a home screen one of its own, 180 by 180 on white. */
    const touch = OWN_HOST_ICON.test(url) ? `${SITE_TOUCH_ICON_PATH}?v=${OWN_HOST_ICON.exec(url)![1]}` : url
    return `${before}<link rel="apple-touch-icon" sizes="${APPLE_ICON_SIZES}" href="${escapeAttr(touch)}">${html.slice(head)}`
  }
  return `${html.slice(0, head)}${siteIconTags(icon) || NO_ICON}${html.slice(head)}`
}

/*
  NO ICON AT ALL, SAID SO. With no icon in the page the browser asks the host
  for /favicon.ico once the page has loaded, and that address is Storelib's
  "not found" page, sent with headers that tell the browser to fetch the
  app's own stylesheets and font: measured on an imported theme's front page,
  about 140 KB a first visit fetched for nothing. An empty icon shows the
  browser's own blank one, as the missing file did, and asks for nothing.
*/
export const NO_ICON = `<link rel="icon" href="data:,">`
