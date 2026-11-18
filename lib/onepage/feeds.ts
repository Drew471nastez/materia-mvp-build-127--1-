// OnePage: what the server reads from somewhere else for a block (round AR)
// Location: lib/onepage/feeds.ts
//
//   rss          a feed's latest posts (RSS 2.0 or Atom), read on the server
//                with the SSRF guard (lib/api/public-fetch) and drawn under
//                the feed's card
//   bandsintown  an artist's upcoming shows, from Bandsintown's own API
//                (needs BANDSINTOWN_APP_ID on the server), merged with the
//                dates the creator typed
//
// Pure parsing, so the tests read recorded answers and nothing is ever
// asked of the real services from a test.

export interface FeedItem {
  title: string
  url: string
  /** YYYY-MM-DD, or null when the feed gives none that reads. */
  date: string | null
}

export const FEED_ITEMS_MAX = 5

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

/** Text from inside an XML element: CDATA opened, tags and entities turned to plain characters. */
export function xmlText(raw: string): string {
  const cdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  return cdata
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim()
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return " "
  try {
    return String.fromCodePoint(code)
  } catch {
    return " "
  }
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))
  return m ? m[1] : null
}

function httpsUrl(raw: string | null | undefined): string | null {
  const t = (raw || "").trim()
  if (!/^https?:\/\/[^\s<>"']+$/i.test(t)) return null
  try {
    const u = new URL(t)
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
  } catch {
    return null
  }
}

function dayOf(raw: string | null): string | null {
  if (!raw) return null
  const t = Date.parse(xmlText(raw))
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}

/** A feed's newest items, RSS or Atom, each with a title and an http(s) link, at most `max`. */
export function parseFeed(xml: string, max = FEED_ITEMS_MAX): FeedItem[] {
  if (typeof xml !== "string" || !xml) return []
  const out: FeedItem[] = []
  const rss = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? []
  for (const item of rss) {
    const title = xmlText(tag(item, "title") ?? "")
    const url = httpsUrl(xmlText(tag(item, "link") ?? "")) ?? httpsUrl(xmlText(tag(item, "guid") ?? ""))
    if (title && url) out.push({ title: title.slice(0, 160), url, date: dayOf(tag(item, "pubDate") ?? tag(item, "dc:date")) })
    if (out.length >= max) return out
  }
  if (out.length) return out
  const atom = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? []
  for (const entry of atom) {
    const title = xmlText(tag(entry, "title") ?? "")
    const links = [...entry.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1])
    const alt = links.find((a) => !/rel=["'](?!alternate)/i.test(a)) ?? links[0] ?? ""
    const url = httpsUrl(alt.match(/href=["']([^"']+)["']/i)?.[1])
    if (title && url) out.push({ title: title.slice(0, 160), url, date: dayOf(tag(entry, "published") ?? tag(entry, "updated")) })
    if (out.length >= max) break
  }
  return out
}

/* ─── Bandsintown ──────────────────────────────────────────────────── */

export interface ImportedEvent {
  id: string
  title: string
  date: string
  venue: string
  url?: string
  sold_out?: boolean
}

/** An artist's name as Bandsintown's address takes it, or null. */
export function bandsintownArtist(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let t = raw.trim()
  const m = t.match(/bandsintown\.com\/a\/\d+-([^/?#]+)/i) ?? t.match(/bandsintown\.com\/(?:[a-z]{2}\/)?a\/([^/?#]+)/i)
  if (m) t = decodeURIComponent(m[1]).replace(/-/g, " ")
  t = t.replace(/\s+/g, " ").trim()
  return t && t.length <= 80 && !/[/?#\\<>]/.test(t) ? t : null
}

/** Bandsintown's events answer as the block's events: upcoming, a day, where, and the ticket link. */
export function bandsintownEvents(json: unknown, max = 12): ImportedEvent[] {
  if (!Array.isArray(json)) return []
  const out: ImportedEvent[] = []
  for (const raw of json) {
    const e = raw as { id?: unknown; datetime?: unknown; title?: unknown; url?: unknown; venue?: { name?: unknown; city?: unknown; country?: unknown } | null; offers?: Array<{ url?: unknown; status?: unknown; type?: unknown }> | null }
    const date = typeof e?.datetime === "string" ? e.datetime.slice(0, 10) : ""
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const venue = e.venue ?? {}
    const where = [venue.city, venue.country].filter((v): v is string => typeof v === "string" && !!v.trim()).join(", ")
    const name = typeof venue.name === "string" ? venue.name.trim() : ""
    const offer = Array.isArray(e.offers) ? e.offers.find((o) => o && typeof o.url === "string") : undefined
    const url = httpsUrl(typeof offer?.url === "string" ? offer.url : typeof e.url === "string" ? e.url : null)
    out.push({
      id: `bit_${String(e.id ?? `${date}_${name}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40)}`,
      title: (typeof e.title === "string" && e.title.trim() ? e.title.trim() : name || where || "Show").slice(0, 80),
      date,
      venue: (name && where ? `${name}, ${where}` : name || where).slice(0, 80),
      ...(url ? { url } : {}),
      ...(offer && typeof offer.status === "string" && /sold/i.test(offer.status) ? { sold_out: true } : {}),
    })
    if (out.length >= max) break
  }
  return out
}

/** The creator's own dates and the imported ones, one per day and place, in date order. */
export function mergeEvents<T extends { date?: string; venue?: string; id: string }>(own: T[], imported: T[]): T[] {
  const seen = new Set(own.map((e) => `${e.date ?? ""}|${(e.venue ?? "").toLowerCase()}`))
  const extra = imported.filter((e) => !seen.has(`${e.date ?? ""}|${(e.venue ?? "").toLowerCase()}`))
  return [...own, ...extra].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
}
