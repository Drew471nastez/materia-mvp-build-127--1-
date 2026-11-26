/**
 * ===========================================================================
 *  A LINK IN THE CANVAS TO THE WEBSITE'S OWN ADDRESS IS A PAGE OF THE CANVAS
 * ===========================================================================
 * Round 66. A theme writes some links in full, from the website's canonical
 * host (https://andrewrullz.storelib.com/products/black-sleeves), and the
 * builder took any address with a host for another website: "Opens
 * andrewrullz.storelib.com on your live site", or, from a script, the frame
 * itself sent to the live site, which refuses to be framed ("refused to
 * connect"). An address on the website's own host (its storelib.com
 * subdomain or its own domain, with or without www) is that page, opened in
 * the canvas like a relative link.
 *
 * Pure: safe on the client and the server.
 */

/** The path (with its query and hash) of an address on the website's own host, or null for any other address. */
export function ownSitePath(href: string, siteUrl: string | null | undefined): string | null {
  const raw = (href ?? "").trim()
  if (!siteUrl || !/^(?:https?:)?\/\//i.test(raw)) return null
  let site: URL
  let url: URL
  try {
    site = new URL(siteUrl)
    url = new URL(raw.startsWith("//") ? `${site.protocol}${raw}` : raw)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, "")
  if (bare(url.hostname) !== bare(site.hostname)) return null
  return `${url.pathname || "/"}${url.search}${url.hash}`
}

/** An address on another website, which a press in the canvas opens in a new tab. Null for anything else. */
export function externalHref(href: string, siteUrl: string | null | undefined): string | null {
  const raw = (href ?? "").trim()
  if (!/^https?:\/\//i.test(raw)) return null
  if (ownSitePath(raw, siteUrl) !== null) return null
  try {
    return new URL(raw).toString()
  } catch {
    return null
  }
}
