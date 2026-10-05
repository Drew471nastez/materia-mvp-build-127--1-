/**
 * ===========================================================================
 *  THE TAB'S ICON IS THE STORE'S, EVEN WITHOUT A FAVICON
 * ===========================================================================
 * A site with no favicon set showed Storelib's own icon in its visitors' tabs
 * and bookmarks, beside the creator's name: somebody else's mark on their
 * shop. Most creators upload a logo and never think about a favicon, so the
 * logo stands in for it:
 *
 *   1. Theme settings › Branding › Favicon
 *   2. Theme settings › Branding › Logo image
 *   3. the header's own logo image (Header › Logo image)
 *
 * Nothing at all when none of them is set, so the route's default stays.
 * Only an address a browser can fetch for a tab: https, http, or a path.
 */
type Sectionish = { type?: string; settings?: Record<string, unknown>; hidden?: boolean }

const fetchable = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : ""
  return /^(https?:\/\/|\/(?!\/))/i.test(s) ? s : ""
}

export function siteIconUrl(settings: Record<string, unknown> | null | undefined, sections: Sectionish[] | null | undefined = []): string {
  const theme = settings ?? {}
  const own = fetchable(theme.favicon_url)
  if (own) return own
  const logo = fetchable(theme.logo_url)
  if (logo) return logo
  const header = (sections ?? []).find((s) => s?.type === "header" && !s.hidden)
  return fetchable(header?.settings?.logo_url)
}

/** As Next's metadata wants it, or nothing to leave the route's default. */
export function siteIcons(settings: Record<string, unknown> | null | undefined, sections?: Sectionish[] | null) {
  const icon = siteIconUrl(settings, sections)
  return icon ? { icon, shortcut: icon, apple: icon } : undefined
}
