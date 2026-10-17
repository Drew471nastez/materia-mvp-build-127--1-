/**
 * ===========================================================================
 *  A COMMUNITY'S MEMBER LINKS, AS A MEMBER SEES THEM (round 26)
 * ===========================================================================
 * The creator keeps up to four links for members (communities.member_links,
 * SQL part 220, edited in the Page editor: lib/communities/member-links.ts
 * cleans them on save). This turns the stored list into what the member
 * area draws: the visible ones, in order, each with a safe address.
 *
 * Read again here with the editor's own rules (W5's lib/communities/
 * member-links.ts), not trusted: the column is jsonb and a row written by
 * hand can hold anything. So an address is only ever http(s) or a path on
 * this site ("/x", never "//x"), never javascript:, data: or anything else;
 * a label is plain, one line, at most 40 characters; a hidden link is not
 * shown; at most four.
 *
 * Where it goes: a path, or a storelib.com address (turned into its path),
 * opens here in the same tab, so its page decides who may see it (a course
 * or a product keeps its own access); anything else opens in a new tab.
 *
 * Pure and browser safe.
 */

import { MEMBER_LINKS_MAX, cleanMemberLinks, memberLinkUrl, shownMemberLinks, type MemberLinkIcon } from "./member-links"

export const MEMBER_LINKS_SHOWN = MEMBER_LINKS_MAX

/** One link as the member area draws it. */
export interface MemberLinkView {
  id: string
  label: string
  /** A path on this site ("/products/x"), or an https/http address elsewhere. */
  href: string
  /** True for an address on another site: a new tab, rel noopener. */
  external: boolean
  /** The icon the creator chose (lib/communities/member-links.ts MEMBER_LINK_ICONS), or null. */
  icon: MemberLinkIcon | null
}

/** A link's id as the click route accepts it (the editor's are eight letters and digits; the table allows up to 40). */
export const MEMBER_LINK_ID = /^[A-Za-z0-9_-]{1,40}$/

/** The hosts that are Storelib itself: an address on one of them is a page here. */
const OWN_HOSTS = new Set(["storelib.com", "www.storelib.com"])

/**
 * The address to draw for a stored url, or null when it is not one that may
 * be drawn: the editor's own rule (lib/communities/member-links.ts
 * memberLinkUrl), then a storelib.com address becomes its path, so it opens
 * here; any other http(s) address opens in a new tab.
 */
export function memberLinkTarget(raw: unknown): { href: string; external: boolean } | null {
  const checked = memberLinkUrl(raw)
  if (!checked.ok) return null
  const url = checked.url
  if (url.startsWith("/")) return { href: url, external: false }
  const parsed = new URL(url)
  if (OWN_HOSTS.has(parsed.hostname.toLowerCase())) return { href: `${parsed.pathname || "/"}${parsed.search}${parsed.hash}`, external: false }
  return { href: parsed.toString(), external: true }
}

/**
 * The links a member sees, from the stored column: the editor's reading of it
 * (cleanMemberLinks: whole, safe links only, at most four), the shown ones in
 * order (shownMemberLinks), each with where it opens.
 */
export function memberLinkViews(raw: unknown): MemberLinkView[] {
  const out: MemberLinkView[] = []
  for (const l of shownMemberLinks(cleanMemberLinks(raw))) {
    const target = memberLinkTarget(l.url)
    if (target) out.push({ id: l.id, label: l.label, href: target.href, external: target.external, icon: l.icon })
  }
  return out
}

/** Where a press on a link is counted (app/api/community/[communityId]/links/[linkId]/click). */
export function memberLinkClickPath(communityId: string, linkId: string): string {
  return `/api/community/${encodeURIComponent(communityId)}/links/${encodeURIComponent(linkId)}/click`
}
