/**
 * ===========================================================================
 *  A MAP FROM AN ADDRESS
 * ===========================================================================
 * The map section asked for a "Google Maps embed URL": open Google Maps,
 * find Share, find Embed a map, find the src="" inside the HTML it gives you,
 * and paste only that. Shopify's map asks for an address. So does this now:
 * the address the section already shows in its panel is the map, and a link
 * is only needed to point somewhere else.
 *
 * What a pasted link may be, in the order it is read:
 *   - an embed address (google.com/maps/embed?...): used as it is
 *   - an ordinary Google Maps link with a place or a search in it
 *     (/maps/place/<name>, ?q=, /maps/search/<words>): turned into an embed
 *   - anything else at google.com/maps: used as it is, as before
 * With no link, the address lines are the search.
 *
 * Only https Google Maps addresses ever come out of the derived cases; a
 * link that is not one of those is passed through only when it is https,
 * which keeps a `javascript:` or a data: address out of the frame.
 */

const MAPS_HOST = /^(?:www\.)?google\.[a-z.]+$|^maps\.google\.[a-z.]+$/i

/** A search Google Maps will draw as an embedded map, without a key. */
export function embedForQuery(query: string): string {
  const q = query.replace(/\s+/g, " ").trim()
  return q ? `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed` : ""
}

/** The place or search a Google Maps link is about, when it says. */
function queryOf(url: URL): string {
  const q = url.searchParams.get("q") ?? url.searchParams.get("query")
  if (q) return q
  const m = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/)
  if (m) {
    try {
      return decodeURIComponent(m[1].replace(/\+/g, " "))
    } catch {
      return m[1].replace(/\+/g, " ")
    }
  }
  return ""
}

/** The address a frame should load, or "" for none. */
export function mapEmbedSrc(link: unknown, addressLines: unknown[]): string {
  const raw = typeof link === "string" ? link.trim() : ""
  if (raw) {
    let url: URL | null = null
    try {
      url = new URL(raw)
    } catch {
      url = null
    }
    if (url && url.protocol === "https:") {
      if (MAPS_HOST.test(url.hostname) && url.pathname.startsWith("/maps")) {
        if (url.pathname.startsWith("/maps/embed")) return url.toString()
        const q = queryOf(url)
        if (q) return embedForQuery(q)
      }
      return url.toString()
    }
    /* Not an address at all: somebody typed the place itself. */
    if (!url) return embedForQuery(raw)
  }
  const address = addressLines.filter((l): l is string => typeof l === "string" && l.trim() !== "").join(", ")
  return embedForQuery(address)
}
