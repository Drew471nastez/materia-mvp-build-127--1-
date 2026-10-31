/**
 * ===========================================================================
 *  ONE SITEMAP FILE, READ AND CHECKED AS A CRAWLER WOULD
 * ===========================================================================
 * Pure: the caller fetches the file, this reads it. sitemaps.org and Google's
 * sitemap guidance are the rules checked:
 *
 *   a file is a <sitemapindex> of <sitemap><loc> or a <urlset> of <url><loc>;
 *   at most 50,000 addresses a file;
 *   every <loc> an absolute http(s) address, on the host the file is for
 *     (a sitemap may list only its own site's addresses), without spaces,
 *     and listed once;
 *   <lastmod>, when present, a W3C date (2026-10-31 or a full timestamp).
 */

export const MAX_URLS_PER_FILE = 50_000

export interface SitemapEntry {
  loc: string
  lastmod: string | null
}

export interface ParsedSitemap {
  kind: "index" | "urlset" | "unknown"
  entries: SitemapEntry[]
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

function unescapeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
      const k = e.toLowerCase()
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16))
      if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10))
      return XML_ENTITIES[k] ?? m
    })
    .trim()
}

function inner(block: string, tag: string): string | null {
  const m = new RegExp(`<(?:[a-z0-9]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`, "i").exec(block)
  return m ? unescapeXml(m[1]) : null
}

export function parseSitemapXml(xml: string): ParsedSitemap {
  const isIndex = /<(?:[a-z0-9]+:)?sitemapindex\b/i.test(xml)
  const isSet = /<(?:[a-z0-9]+:)?urlset\b/i.test(xml)
  const tag = isIndex ? "sitemap" : "url"
  const entries: SitemapEntry[] = []
  if (isIndex || isSet) {
    const re = new RegExp(`<(?:[a-z0-9]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`, "gi")
    for (const m of xml.matchAll(re)) entries.push({ loc: inner(m[1], "loc") ?? "", lastmod: inner(m[1], "lastmod") })
  }
  return { kind: isIndex ? "index" : isSet ? "urlset" : "unknown", entries }
}

const W3C_DATE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/

export interface InvalidEntry {
  loc: string
  reason: string
}

/** Whether an address belongs to the site a sitemap on `fileHost` may list: the same host, or (for storelib.com) one of its subdomains. */
function sameSite(host: string, fileHost: string, allowSubdomains: boolean): boolean {
  const h = host.toLowerCase().replace(/^www\./, "")
  const f = fileHost.toLowerCase().replace(/^www\./, "")
  return h === f || (allowSubdomains && h.endsWith(`.${f}`))
}

/**
 * Every entry that a crawler would not take, with why. `allowSubdomains` is
 * for Storelib's own index, which lists the websites at <name>.storelib.com
 * from storelib.com (a Domain property in Search Console covers them).
 */
export function invalidEntries(parsed: ParsedSitemap, fileHost: string, allowSubdomains = false): InvalidEntry[] {
  const out: InvalidEntry[] = []
  const seen = new Set<string>()
  for (const e of parsed.entries) {
    const loc = e.loc
    if (!loc) {
      out.push({ loc: "", reason: "No <loc>" })
      continue
    }
    if (/\s/.test(loc)) {
      out.push({ loc, reason: "Has a space" })
      continue
    }
    let url: URL
    try {
      url = new URL(loc)
    } catch {
      out.push({ loc, reason: "Not an absolute address" })
      continue
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") out.push({ loc, reason: "Not http or https" })
    else if (!sameSite(url.hostname, fileHost, allowSubdomains)) out.push({ loc, reason: `On ${url.hostname}, not ${fileHost}` })
    else if (seen.has(loc)) out.push({ loc, reason: "Listed twice" })
    else if (e.lastmod !== null && !W3C_DATE.test(e.lastmod)) out.push({ loc, reason: `lastmod "${e.lastmod.slice(0, 40)}" is not a W3C date` })
    seen.add(loc)
  }
  if (parsed.entries.length > MAX_URLS_PER_FILE) out.push({ loc: "", reason: `${parsed.entries.length} addresses, over the 50,000 a file allows` })
  return out
}
