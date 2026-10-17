/**
 * ===========================================================================
 *  A COMMUNITY'S MEMBER LINKS, AS A MEMBER SEES THEM (round 26)
 * ===========================================================================
 * The creator keeps up to four links for members (communities.member_links,
 * SQL part 220, edited in the Page editor: lib/communities/member-links.ts
 * cleans them on save). This turns the stored list into what the member
 * area draws: the visible ones, in order, each with a safe address.
 *
 * Read again here, not trusted: the column is jsonb and a row written before
 * the editor's checks (or by hand) can hold anything. So an address is only
 * ever http(s) or a path on this site ("/x", never "//x"), never
 * javascript:, data: or anything else; a label is plain, one line, at most
 * 40 characters; a hidden link is not shown; at most four.
 *
 * Where it goes: a path, or a storelib.com address (turned into its path),
 * opens here in the same tab, so its page decides who may see it (a course
 * or a product keeps its own access); anything else opens in a new tab.
 *
 * Pure and browser safe.
 */

export const MEMBER_LINKS_SHOWN = 4

/** One link as the member area draws it. */
export interface MemberLinkView {
  id: string
  label: string
  /** A path on this site ("/products/x"), or an https/http address elsewhere. */
  href: string
  /** True for an address on another site: a new tab, rel noopener. */
  external: boolean
  /** The icon's name as the creator chose it (a lucide name), or null. */
  icon: string | null
}

/** A link's id: the editor's short random id. Letters, digits, - and _, up to 40. */
export const MEMBER_LINK_ID = /^[A-Za-z0-9_-]{1,40}$/

/** The hosts that are Storelib itself: an address on one of them is a page here. */
const OWN_HOSTS = new Set(["storelib.com", "www.storelib.com"])

/**
 * The address to draw for a stored url, or null when it is not one that may
 * be drawn. A path keeps its query and hash; a storelib.com address becomes
 * its path; any other http(s) address stays as it is, normalised by URL.
 */
export function memberLinkTarget(raw: unknown): { href: string; external: boolean } | null {
  if (typeof raw !== "string") return null
  const url = raw.trim()
  if (!url || url.length > 2048 || /[\u0000-\u001f\u007f\s]/.test(url)) return null
  if (url.startsWith("/")) {
    /* "//host" and "/\host" are another site to a browser. */
    if (url.startsWith("//") || url.startsWith("/\\")) return null
    return { href: url, external: false }
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null
  if (!parsed.hostname || parsed.username || parsed.password) return null
  if (OWN_HOSTS.has(parsed.hostname.toLowerCase())) return { href: `${parsed.pathname || "/"}${parsed.search}${parsed.hash}`, external: false }
  return { href: parsed.toString(), external: true }
}

function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const label = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  if (!label) return null
  return Array.from(label).slice(0, 40).join("")
}

function cleanIcon(raw: unknown): string | null {
  return typeof raw === "string" && /^[a-z0-9-]{1,40}$/.test(raw) ? raw : null
}

/**
 * The links a member sees, from the stored column: the visible ones, in
 * order, each with a safe address and a label, duplicates by id dropped,
 * at most four. Anything that is not such a list is no links.
 */
export function memberLinkViews(raw: unknown): MemberLinkView[] {
  if (!Array.isArray(raw)) return []
  const out: MemberLinkView[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (out.length >= MEMBER_LINKS_SHOWN) break
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    if (r.hidden === true) continue
    const id = typeof r.id === "string" && MEMBER_LINK_ID.test(r.id) ? r.id : null
    if (!id || seen.has(id)) continue
    const label = cleanLabel(r.label)
    const target = memberLinkTarget(r.url)
    if (!label || !target) continue
    seen.add(id)
    out.push({ id, label, href: target.href, external: target.external, icon: cleanIcon(r.icon) })
  }
  return out
}

/** Where a press on a link is counted (app/api/community/[communityId]/links/[linkId]/click). */
export function memberLinkClickPath(communityId: string, linkId: string): string {
  return `/api/community/${encodeURIComponent(communityId)}/links/${encodeURIComponent(linkId)}/click`
}
