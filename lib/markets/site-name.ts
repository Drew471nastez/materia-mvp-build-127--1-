/**
 * ===========================================================================
 *  A WEBSITE'S NAME, WITH THE LANGUAGE IT IS ASKED IN
 * ===========================================================================
 * /fr/about on a website is drawn by the same routes as /about: the proxy
 * sends it to /w/<name>~fr/about, so the language rides in the name segment
 * and every page keeps its own cache entry per language (no query string,
 * no header, nothing that would make the page per visitor). A name never
 * holds "~" (usernames and slugs are letters, digits, "-" and "_"), so the
 * split is never ambiguous.
 */

export const LOCALE_MARK = "~"

/** The header the proxy names an imported theme's page language in (/fr/… → "fr"); stripped from every request that arrives with it. */
export const SITE_LOCALE_HEADER = "x-storelib-site-locale"

/** "andrew" in "fr" → "andrew~fr"; no language, the name as it is. */
export function siteNameIn(name: string, locale: string | null | undefined): string {
  return locale ? `${name}${LOCALE_MARK}${locale.toLowerCase()}` : name
}

/** "andrew~fr" → { name: "andrew", locale: "fr" }; "andrew" → { name: "andrew", locale: null }. */
export function splitSiteName(segment: string): { name: string; locale: string | null } {
  let s = segment
  try {
    s = decodeURIComponent(segment)
  } catch {
    /* kept as it came */
  }
  const at = s.indexOf(LOCALE_MARK)
  if (at <= 0) return { name: s, locale: null }
  const locale = s.slice(at + 1)
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(locale) ? { name: s.slice(0, at), locale: locale.toLowerCase() } : { name: s.slice(0, at), locale: null }
}

/** The pages drawn in a language: the website's own pages, products, collections and search. The rest (cart, account, checkout, files) are the same in every language. */
const PAGE_IN_LANGUAGE = /^\/(?:(?:products|collections)(?:\/[^/]+)?|search|(?!(?:cart|account|checkout|wishlist|password|receipt|review|preview|api|robots\.txt|sitemap\.xml)(?:\/|$))[^/.]+)?\/?$/i

/**
 * Where the proxy sends an address of a built website that starts with one
 * of its published languages (`published`, the languages other than the
 * website's own): a page, to the same route under "<name>~<lang>"; anything
 * else (/fr/cart), on to the address without the language. Null when the
 * address does not start with one of them.
 */
export function siteRouteInLanguage(name: string, pathname: string, published: readonly string[]): { kind: "page"; path: string } | { kind: "redirect"; to: string } | null {
  if (published.length === 0) return null
  const m = pathname.match(/^\/([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)(\/.*)?$/)
  if (!m) return null
  const hit = published.find((l) => l.toLowerCase() === m[1].toLowerCase())
  if (!hit) return null
  const rest = m[2] || "/"
  if (!PAGE_IN_LANGUAGE.test(rest)) return { kind: "redirect", to: rest }
  return { kind: "page", path: `/w/${siteNameIn(name, hit)}${rest === "/" ? "" : rest.replace(/\/$/, "")}` }
}
