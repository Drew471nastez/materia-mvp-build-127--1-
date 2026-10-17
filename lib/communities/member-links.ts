/**
 * ===========================================================================
 *  A COMMUNITY'S SHORT DESCRIPTION AND ITS MEMBER LINKS (round 26)
 * ===========================================================================
 * Two fields the Page editor writes (components/community/creator/page-editor)
 * and run-now part 220 stores:
 *
 *   SUMMARY        communities.summary: one plain line, up to 160 characters,
 *                  that introduces the community on its card. Null means the
 *                  card falls back to the tagline, then to the start of the
 *                  description (the public card does that, never this file:
 *                  a fallback is never written back as the summary).
 *   MEMBER LINKS   communities.member_links: up to four shortcuts members see
 *                  in the community (a course, a product, a resource, a
 *                  booking page). Never on the public page or a public API:
 *                  the column is not granted to the browser's keys, and the
 *                  member side reads it on the server for an active member.
 *
 * A link is { id, label, url, icon, hidden }. Its address is http(s), or a
 * path on this site that starts with one "/" (an internal page keeps its own
 * permissions: a member link is a shortcut, not a key). Nothing else:
 * javascript:, data:, a protocol relative "//host", a backslash, a user and
 * password in the address, or spaces are all refused.
 *
 * Pure and browser safe: the editor, the server and the tests read it.
 */

export const SUMMARY_MAX = 160
export const MEMBER_LINKS_MAX = 4
export const MEMBER_LINK_LABEL_MAX = 40
export const MEMBER_LINK_URL_MAX = 2000

/** The icons a member link may carry (lucide names), drawn by components/community/member-link-icon.tsx. */
export const MEMBER_LINK_ICONS = ["link", "globe", "shopping-bag", "book-open", "graduation-cap", "calendar", "video", "file-text", "message-circle", "headphones", "gift", "star"] as const
export type MemberLinkIcon = (typeof MEMBER_LINK_ICONS)[number]

export interface MemberLink {
  /** Short and random, made when the link is added; the click counts are kept against it. */
  id: string
  label: string
  url: string
  icon: MemberLinkIcon | null
  hidden: boolean
}

const CONTROL_CHARS = "\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\ufeff"
const CONTROL = new RegExp(`[${CONTROL_CHARS}]`, "g")
const HAS_CONTROL = new RegExp(`[${CONTROL_CHARS}]`)

/** One line of plain words: controls and invisible marks out, runs of space as one. */
function oneLine(v: unknown): string {
  return typeof v === "string" ? v.replace(CONTROL, " ").replace(/\s+/g, " ").trim() : ""
}

/* ── The short description ─────────────────────────────────────────────── */

/** The summary as stored and drawn: one plain line, at most 160 characters, or null for none. Lenient: a longer one is cut. */
export function cleanSummary(raw: unknown): string | null {
  const s = Array.from(oneLine(raw)).slice(0, SUMMARY_MAX).join("")
  return s || null
}

/** A summary the creator sends: refused over 160 characters rather than cut, so what they read is what is saved. */
export function checkSummary(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw !== null && raw !== undefined && typeof raw !== "string") return { ok: false, error: "The short description is words." }
  const s = oneLine(raw)
  if (Array.from(s).length > SUMMARY_MAX) return { ok: false, error: `The short description is up to ${SUMMARY_MAX} characters.` }
  return { ok: true, value: s || null }
}

/* ── A member link's address ───────────────────────────────────────────── */

const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#]|$)/i

/**
 * The address a member link opens, or why it cannot be one. "/learn" stays a
 * path on this site; "example.com/x" becomes https://example.com/x; http and
 * https addresses are kept as the browser reads them.
 */
export function memberLinkUrl(raw: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Add an address." }
  const text = raw.trim()
  if (!text) return { ok: false, error: "Add an address." }
  if (text.length > MEMBER_LINK_URL_MAX) return { ok: false, error: "That address is too long." }
  if (HAS_CONTROL.test(text) || /\s/.test(text) || text.includes("\\")) return { ok: false, error: "An address has no spaces." }
  /* A page on this site: one slash, then the path. "//host" would leave the site, so it is not one. */
  if (text.startsWith("/")) {
    if (text.startsWith("//")) return { ok: false, error: "Start with https:// or with one / for a page on Storelib." }
    try {
      const u = new URL(text, "https://storelib.invalid")
      if (u.origin !== "https://storelib.invalid") return { ok: false, error: "Start with https:// or with one / for a page on Storelib." }
      return { ok: true, url: `${u.pathname}${u.search}${u.hash}` }
    } catch {
      return { ok: false, error: "That is not an address." }
    }
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text)
  let candidate = text
  if (scheme) {
    const s = scheme[1].toLowerCase()
    if (s !== "http" && s !== "https") return { ok: false, error: "Only web addresses (https://) can be links." }
  } else if (HOST.test(text)) {
    candidate = `https://${text}`
  } else {
    return { ok: false, error: "Use a full address, like https://example.com, or a page on Storelib, like /learn." }
  }
  let u: URL
  try {
    u = new URL(candidate)
  } catch {
    return { ok: false, error: "That is not an address." }
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "Only web addresses (https://) can be links." }
  if (!u.hostname || !u.hostname.includes(".")) return { ok: false, error: "That address has no website in it." }
  if (u.username || u.password) return { ok: false, error: "An address with a password in it cannot be a link." }
  return { ok: true, url: u.href }
}

/** Whether an address leaves the site (opened in a new tab, with the usual guards) or is a page on it. */
export function memberLinkIsExternal(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/* ── The list ──────────────────────────────────────────────────────────── */

/** A new link's id: eight letters and digits. */
export function newMemberLinkId(): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = new Uint8Array(8)
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => abc[b % abc.length]).join("")
}

const ID = /^[a-z0-9_-]{4,24}$/i

function isIcon(v: unknown): v is MemberLinkIcon {
  return typeof v === "string" && (MEMBER_LINK_ICONS as readonly string[]).includes(v)
}

/**
 * The links as stored and read (lenient): anything that is not a whole, safe
 * link is left out, never repaired into one, ids made unique, at most four.
 * What the member side and the editor draw.
 */
export function cleanMemberLinks(raw: unknown): MemberLink[] {
  if (!Array.isArray(raw)) return []
  const out: MemberLink[] = []
  const ids = new Set<string>()
  for (const item of raw) {
    if (out.length >= MEMBER_LINKS_MAX) break
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const label = Array.from(oneLine(r.label)).slice(0, MEMBER_LINK_LABEL_MAX).join("")
    const url = memberLinkUrl(r.url)
    if (!label || !url.ok) continue
    let id = typeof r.id === "string" && ID.test(r.id) ? r.id : newMemberLinkId()
    while (ids.has(id)) id = newMemberLinkId()
    ids.add(id)
    out.push({ id, label, url: url.url, icon: isIcon(r.icon) ? r.icon : null, hidden: r.hidden === true })
  }
  return out
}

/**
 * The links a creator sends (strict): every one must be whole, so nothing is
 * dropped without them knowing. Answers the cleaned list, or the first
 * problem and which link it is in.
 */
export function checkMemberLinks(raw: unknown): { ok: true; value: MemberLink[] } | { ok: false; error: string; field: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Member links are a list.", field: "memberLinks" }
  if (raw.length > MEMBER_LINKS_MAX) return { ok: false, error: `Up to ${MEMBER_LINKS_MAX} member links.`, field: "memberLinks" }
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] && typeof raw[i] === "object" ? (raw[i] as Record<string, unknown>) : null
    if (!r) return { ok: false, error: "A member link is missing.", field: `memberLinks.${i}` }
    const label = oneLine(r.label)
    if (!label) return { ok: false, error: `Link ${i + 1} needs a name.`, field: `memberLinks.${i}.label` }
    if (Array.from(label).length > MEMBER_LINK_LABEL_MAX) return { ok: false, error: `A link's name is up to ${MEMBER_LINK_LABEL_MAX} characters.`, field: `memberLinks.${i}.label` }
    const url = memberLinkUrl(r.url)
    if (!url.ok) return { ok: false, error: `Link ${i + 1}: ${url.error}`, field: `memberLinks.${i}.url` }
    if (r.icon !== undefined && r.icon !== null && !isIcon(r.icon)) return { ok: false, error: "Pick an icon from the list.", field: `memberLinks.${i}.icon` }
  }
  return { ok: true, value: cleanMemberLinks(raw) }
}

/** What a member sees: the shown links only, in order. */
export function shownMemberLinks(links: readonly MemberLink[]): MemberLink[] {
  return links.filter((l) => !l.hidden)
}
