import "server-only"

/**
 * ===========================================================================
 *  MEMBER LINKS ON THE SERVER: WHO READS THEM, AND THE PRESSES (round 26)
 * ===========================================================================
 * communities.member_links (SQL part 220) is the creator's up to four links
 * for members. It is never in a visitor's column grant and never in
 * COMMUNITY_COLUMNS, so no public read (the sales page, Explore, the public
 * APIs, the metadata) can carry it. The one read is here, for somebody who
 * is inside: an active member, or the community's owner or staff, of a
 * community they may open. Anybody else gets an empty list without the
 * column being read at all.
 *
 * A PRESS is counted once per member, per link, per day (UTC) in
 * community_member_link_clicks (SQL part 221: server only, no policy, the
 * service role writes it). A second press the same day is the same row, so
 * a member pressing again, a double tap or a retried beacon never counts
 * twice; the owner's own presses are not counted. memberLinkClicks is what
 * the Page editor's member links list may show beside each link.
 *
 * Before part 220 there is no column (no links); before part 221 there is no
 * table (presses are not counted, nothing fails).
 */
import { MEMBER_LINK_ID, memberLinkViews, type MemberLinkView } from "@/lib/communities/member-link-view"
import type { CommunityRow } from "@/lib/communities/types"
import { meetsRole } from "@/lib/communities/permissions"
import { communityOpen, type Viewer } from "./context"
import { admin, isUniqueViolation, missing, reasonOf, type Db } from "./db"

const CLICKS = "community_member_link_clicks"

/** Whether this viewer may see the community's member links: inside it, and it is open to them. */
export function seesMemberLinks(community: Pick<CommunityRow, "status" | "suspended_at" | "deleted_at">, viewer: Pick<Viewer, "active" | "isOwner" | "banned" | "role"> | null): boolean {
  if (!viewer || viewer.banned || community.deleted_at) return false
  const staff = viewer.isOwner || (viewer.active && meetsRole(viewer.role, "moderator"))
  if (!communityOpen(community as CommunityRow) && !viewer.isOwner) return false
  /* A draft is its staff's until it is published (components/community/member/data.ts memberPage). */
  if (community.status === "draft") return staff
  return viewer.active || staff
}

/** The stored list, raw, or [] for none, a missing column (before part 220) or a failed read. */
async function readStoredLinks(db: Db, communityId: string): Promise<unknown> {
  try {
    const { data, error } = await db.from("communities").select("member_links").eq("id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] member links read: ${reasonOf(error)}`)
      return []
    }
    return (data as { member_links?: unknown } | null)?.member_links ?? []
  } catch (e) {
    console.error(`[communities] member links read: ${reasonOf(e)}`)
    return []
  }
}

/** The links this viewer sees: the visible ones, cleaned, for a member or staff only; [] for anybody else, without reading the column. */
export async function memberLinksForViewer(community: CommunityRow, viewer: Viewer | null, db: Db = admin()): Promise<MemberLinkView[]> {
  if (!seesMemberLinks(community, viewer)) return []
  return memberLinkViews(await readStoredLinks(db, community.id))
}

/** The day a press is counted under: the UTC date. */
export function clickDay(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

export type ClickOutcome = "counted" | "repeat" | "skipped" | "unknown_link" | "unavailable"

/**
 * One press by a member on a link: counted once per member, link and day.
 * The link must be one the member can see now (visible, in the list), so the
 * table only ever holds presses on real links. The caller has checked who is
 * asking (seesMemberLinks).
 */
export async function recordMemberLinkClick(db: Db, a: { community: CommunityRow; viewer: Viewer; linkId: string; now?: number }): Promise<ClickOutcome> {
  if (!a.viewer.userId || !MEMBER_LINK_ID.test(a.linkId)) return "unknown_link"
  const links = memberLinkViews(await readStoredLinks(db, a.community.id))
  if (!links.some((l) => l.id === a.linkId)) return "unknown_link"
  /* The owner trying their own links is not a member using them. */
  if (a.viewer.isOwner) return "skipped"
  try {
    const { error } = await db.from(CLICKS).insert({ community_id: a.community.id, link_id: a.linkId, user_id: a.viewer.userId, day: clickDay(a.now) })
    if (!error) return "counted"
    if (isUniqueViolation(error)) return "repeat"
    if (!missing(error)) console.error(`[communities] member link click: ${reasonOf(error)}`)
    return "unavailable"
  } catch (e) {
    console.error(`[communities] member link click: ${reasonOf(e)}`)
    return "unavailable"
  }
}

/**
 * How many presses each link has had: members, counted once a day each,
 * since the link was made (or since `sinceDays` days ago). Keys are link
 * ids; the links asked about default to the community's current list
 * (hidden ones included, so the editor can show a hidden link's count). A
 * link nobody pressed is 0; before part 221 every link is 0.
 */
export async function memberLinkClicks(communityId: string, opts: { linkIds?: string[]; sinceDays?: number; db?: Db; now?: number } = {}): Promise<Record<string, number>> {
  const db = opts.db ?? admin()
  let ids = opts.linkIds
  if (!ids) {
    const stored = await readStoredLinks(db, communityId)
    ids = Array.isArray(stored) ? stored.map((l) => (l && typeof l === "object" ? (l as { id?: unknown }).id : null)).filter((id): id is string => typeof id === "string") : []
  }
  ids = [...new Set(ids.filter((id) => MEMBER_LINK_ID.test(id)))].slice(0, 8)
  const out: Record<string, number> = {}
  for (const id of ids) out[id] = 0
  if (ids.length === 0) return out
  const since = opts.sinceDays ? clickDay((opts.now ?? Date.now()) - opts.sinceDays * 86_400_000) : null
  await Promise.all(
    ids.map(async (id) => {
      try {
        let q = db.from(CLICKS).select("link_id", { count: "exact", head: true }).eq("community_id", communityId).eq("link_id", id)
        if (since) q = q.gte("day", since)
        const { count, error } = await q
        if (error) {
          if (!missing(error)) console.error(`[communities] member link clicks: ${reasonOf(error)}`)
          return
        }
        out[id] = count ?? 0
      } catch (e) {
        console.error(`[communities] member link clicks: ${reasonOf(e)}`)
      }
    }),
  )
  return out
}
