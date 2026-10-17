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

/** The same, as markup for a page drawn as text (an imported theme's). Empty when there is no icon. */
export function siteIconTags(icon: string | null | undefined): string {
  const url = fetchable(icon)
  if (!url) return ""
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
 */
export function withSiteIcon(html: string, icon: string | null | undefined): string {
  const tags = siteIconTags(icon)
  if (!tags) return html
  const head = html.search(/<\/head>/i)
  if (head < 0) return html
  if (/<link\b[^>]*\brel\s*=\s*["']?[^"'>]*\bicon\b/i.test(html.slice(0, head))) return html
  return `${html.slice(0, head)}${tags}${html.slice(head)}`
}
