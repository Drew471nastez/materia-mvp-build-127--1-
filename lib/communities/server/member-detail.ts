import "server-only"

/**
 * ===========================================================================
 *  ONE MEMBER, OPENED: THE READ
 * ===========================================================================
 * What the Members sheet asks for when a row is pressed (round 34; the
 * shape and the rules are in lib/communities/member-detail.ts). One
 * Promise.all; nothing waits on anything it does not need.
 *
 * WHO SEES WHAT is decided here and nowhere else:
 *   remove_member   the whole thing except the programs: whoever may open
 *                   Members at all, which includes a moderator.
 *   manage_members  the programs of this community they have access to. An
 *                   enrolment is private (lib/communities/DATA-SAFETY.md
 *                   section 3b), so a moderator is handed null and the
 *                   sheet does not draw the row at all.
 * No amount, no card, no Stripe id, no invoice, and nothing from any other
 * community, for anybody.
 *
 * Never throws: anything that cannot be read is null, and the sheet says so
 * rather than drawing a zero. The comments and the likes need SQL part 125's
 * function; before it the posts are still counted on their own index.
 */
import { boardFrom, parseActivityAnswer, zoneToday } from "../member-activity"
import type { MemberAccess, MemberDetail, MemberEngagement, MemberProgramAccess } from "../member-detail"
import { can, type RolePermissions } from "../permissions"
import type { CommunityRow, MemberRow, Role } from "../types"
import { missing, reasonOf, type Db } from "./db"
import { isUuid } from "@/components/community/creator/logic"

const NOTHING: MemberEngagement = { posts: null, comments: null, likes: null, lastPostAt: null }

/** Their published posts here, all time, on the author index. Null when it cannot be read. */
async function postCount(db: Db, communityId: string, userId: string): Promise<number | null> {
  try {
    const { count, error } = await db
      .from("community_feed_posts")
      .select("id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .eq("author_id", userId)
      .eq("status", "published")
    if (error) {
      if (!missing(error)) console.error(`[communities] member posts not counted: ${reasonOf(error)}`)
      return null
    }
    return count ?? 0
  } catch (e) {
    console.error(`[communities] member posts not counted: ${reasonOf(e)}`)
    return null
  }
}

/** When they last posted here, or null when they never have. */
async function lastPostAt(db: Db, communityId: string, userId: string): Promise<string | null> {
  try {
    const { data, error } = await db
      .from("community_feed_posts")
      .select("created_at")
      .eq("community_id", communityId)
      .eq("author_id", userId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return null
    return (data as { created_at?: string } | null)?.created_at ?? null
  } catch {
    return null
  }
}

/**
 * What they did here: the same one call the profile's activity board makes
 * (community_member_activity, SQL part 125), read for its totals rather than
 * its day grid. Before part 125 the posts are counted on their own and the
 * comments and the likes stay null.
 */
export async function memberEngagement(db: Db, communityId: string, userId: string, now: number = Date.now()): Promise<MemberEngagement> {
  const today = zoneToday(now, "UTC")
  const from = boardFrom(today)
  let answer: ReturnType<typeof parseActivityAnswer> = null
  try {
    const { data, error } = await db.rpc("community_member_activity", { p_community: communityId, p_user: userId, p_from: from, p_tz: "UTC" })
    if (error) {
      if (!missing(error)) console.error(`[communities] member engagement not read: ${reasonOf(error)}`)
    } else answer = parseActivityAnswer(data, today, from)
  } catch (e) {
    console.error(`[communities] member engagement not read: ${reasonOf(e)}`)
  }
  const [posts, last] = await Promise.all([answer ? Promise.resolve(answer.posts) : postCount(db, communityId, userId), lastPostAt(db, communityId, userId)])
  /* The likes are the year's, which is what the grid counted; the posts and the comments are all time. */
  const likes = answer ? answer.grid.days.reduce((n, d) => n + d[3], 0) : null
  return { ...NOTHING, posts, comments: answer ? answer.comments : null, likes, lastPostAt: last }
}

/** Names for a couple of accounts, for "invited by" and "approved by". Never an email. */
async function namesOf(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id && isUuid(id)))]
  if (!unique.length) return new Map()
  try {
    const { data } = await db.from("profiles").select("id, display_name, username").in("id", unique)
    return new Map(((data as { id: string; display_name: string | null; username: string | null }[] | null) ?? []).map((p) => [p.id, (p.display_name || "").trim() || p.username || "Someone"]))
  } catch {
    return new Map()
  }
}

/** The programs of THIS community they have access to, by name. Empty when they have none. */
async function programAccess(db: Db, communityId: string, userId: string): Promise<MemberProgramAccess[]> {
  try {
    const { data: programs, error } = await db.from("community_courses").select("id, title").eq("community_id", communityId).limit(100)
    if (error) return []
    const rows = (programs as { id: string; title: string | null }[] | null) ?? []
    if (!rows.length) return []
    const titles = new Map(rows.map((r) => [r.id, (r.title || "").trim() || "A program"]))
    /* Only the program and how it was come by: the payment, the session and the amount on the same row stay on the server. */
    const { data: access, error: accessError } = await db
      .from("community_program_access")
      .select("program_id, source")
      .eq("community_id", communityId)
      .eq("user_id", userId)
      .is("revoked_at", null)
      .limit(100)
    if (accessError) return []
    return ((access as { program_id: string; source: string | null }[] | null) ?? [])
      .filter((a) => titles.has(a.program_id))
      .map((a) => ({ title: titles.get(a.program_id) as string, how: a.source === "grant" ? ("given" as const) : ("bought" as const) }))
  } catch (e) {
    console.error(`[communities] member programs not read: ${reasonOf(e)}`)
    return []
  }
}

/**
 * Everything the sheet shows about one member, for an actor whose role the
 * caller has already gated on remove_member.
 */
export async function memberDetail(
  db: Db,
  community: Pick<CommunityRow, "id">,
  member: Pick<MemberRow, "user_id" | "status" | "source" | "tier_id" | "joined_at" | "expires_at" | "invited_by" | "approved_by">,
  actor: { role: Role; perms?: RolePermissions | null },
  now: number = Date.now(),
): Promise<MemberDetail> {
  /* An enrolment is private: only somebody the people permission reaches sees it. */
  const maySeeEnrolment = can(actor.role, "manage_members", actor.perms)
  const [engagement, tier, names, learning] = await Promise.all([
    memberEngagement(db, community.id, member.user_id, now),
    member.tier_id
      ? db
          .from("community_tiers")
          .select("name")
          .eq("id", member.tier_id)
          .maybeSingle()
          .then((r: { data: { name?: string } | null }) => r.data?.name ?? null)
          .catch(() => null)
      : Promise.resolve(null),
    namesOf(db, [member.invited_by, member.approved_by]),
    maySeeEnrolment ? programAccess(db, community.id, member.user_id) : Promise.resolve(null),
  ])
  const access: MemberAccess = {
    source: member.source,
    tierName: tier,
    joinedAt: member.joined_at,
    expiresAt: member.expires_at,
    complimentary: member.source === "manual",
    invitedBy: member.invited_by ? (names.get(member.invited_by) ?? null) : null,
    approvedBy: member.approved_by ? (names.get(member.approved_by) ?? null) : null,
  }
  return { userId: member.user_id, engagement, access, learning }
}
