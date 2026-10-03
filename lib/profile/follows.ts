import "server-only"

/**
 * ===========================================================================
 *  THE FOLLOW GRAPH: COUNTS, ONE QUESTION, AND THE TWO LISTS
 * ===========================================================================
 * `follows (follower_id, following_id, created_at)` points person to person
 * (supabase/migrations/20260731_follows.sql), so a buyer, a member and a
 * creator are all followed the same way. Indexed on both ends, and part 85
 * adds (following_id, created_at DESC) for the followers list.
 *
 * Counts are `head` counts on those indexes; the lists are keyset pages on
 * (created_at, id), newest first, with each person's name, photo and the
 * address their name opens (personHref). Read with the service role: the
 * graph is public by its own policy, and the profile columns read are the
 * public ones.
 */
import { personHref } from "./person-href"
import { ensureUsernames } from "./ensure-username"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const FOLLOW_PAGE = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v)
}

export interface FollowCounts {
  followers: number
  following: number
}

export async function followCounts(db: Db, userId: string): Promise<FollowCounts> {
  try {
    const [followers, following] = await Promise.all([
      db.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
      db.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
    ])
    return { followers: followers.error ? 0 : followers.count ?? 0, following: following.error ? 0 : following.count ?? 0 }
  } catch {
    return { followers: 0, following: 0 }
  }
}

export async function isFollowing(db: Db, followerId: string | null, targetId: string): Promise<boolean> {
  if (!followerId || followerId === targetId) return false
  try {
    const { data } = await db.from("follows").select("id").eq("follower_id", followerId).eq("following_id", targetId).maybeSingle()
    return !!data
  } catch {
    return false
  }
}

export interface PersonView {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  href: string
  /** Whether the viewer follows them (false for the viewer themself). */
  followedByViewer: boolean
  isViewer: boolean
}

export type FollowList = "followers" | "following"

export function encodeFollowCursor(at: string, id: string): string {
  return Buffer.from(`${at}|${id}`, "utf8").toString("base64url")
}

export function decodeFollowCursor(raw: unknown): { at: string; id: string } | null {
  if (typeof raw !== "string" || !raw || raw.length > 160) return null
  let text = ""
  try {
    text = Buffer.from(raw, "base64url").toString("utf8")
  } catch {
    return null
  }
  const [at, id, extra] = text.split("|")
  if (extra !== undefined || !at || !isUuid(id) || !Number.isFinite(Date.parse(at))) return null
  return { at, id }
}

/** People the viewer follows, among these ids. */
async function viewerFollows(db: Db, viewerId: string | null, ids: string[]): Promise<Set<string>> {
  if (!viewerId || ids.length === 0) return new Set()
  const { data } = await db.from("follows").select("following_id").eq("follower_id", viewerId).in("following_id", ids)
  return new Set(((data as { following_id: string }[] | null) ?? []).map((r) => r.following_id))
}

/** Names, photos and addresses for these people, in one round of reads. */
export async function peopleViews(db: Db, ids: string[], viewerId: string | null): Promise<Map<string, PersonView>> {
  const out = new Map<string, PersonView>()
  if (ids.length === 0) return out
  const [{ data: profiles }, { data: creators }, follows, handles] = await Promise.all([
    db.from("profiles").select("id, display_name, username, avatar_url").in("id", ids),
    db.from("creators").select("user_id, onboarding_completed").in("user_id", ids),
    viewerFollows(db, viewerId, ids),
    /* A person in a list is a person somebody can open: give them an address. */
    ensureUsernames(db, ids),
  ])
  const live = new Set(((creators as { user_id: string; onboarding_completed: boolean | null }[] | null) ?? []).filter((c) => c.onboarding_completed).map((c) => c.user_id))
  for (const p of (profiles as { id: string; display_name: string | null; username: string | null; avatar_url: string | null }[] | null) ?? []) {
    const username = p.username || handles.get(p.id) || null
    out.set(p.id, {
      id: p.id,
      name: (p.display_name || "").trim() || (username ? `@${username}` : "Member"),
      username,
      avatarUrl: p.avatar_url || null,
      href: personHref({ username, hasStorefront: live.has(p.id) }),
      followedByViewer: follows.has(p.id),
      isViewer: p.id === viewerId,
    })
  }
  return out
}

/** One page of a person's followers or of who they follow, newest follow first. */
export async function listFollows(
  db: Db,
  input: { userId: string; list: FollowList; cursor?: unknown; viewerId: string | null; limit?: number },
): Promise<{ people: PersonView[]; next: string | null }> {
  const limit = Math.max(1, Math.min(50, input.limit ?? FOLLOW_PAGE))
  const own = input.list === "followers" ? "following_id" : "follower_id"
  const other = input.list === "followers" ? "follower_id" : "following_id"
  const after = decodeFollowCursor(input.cursor)
  let q = db.from("follows").select(`id, ${other}, created_at`).eq(own, input.userId)
  if (after) {
    const at = JSON.stringify(after.at)
    q = q.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${after.id})`)
  }
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1)
  if (error) return { people: [], next: null }
  const rows = (data as Record<string, string>[] | null) ?? []
  const page = rows.slice(0, limit)
  const views = await peopleViews(db, page.map((r) => r[other]), input.viewerId)
  const people = page.map((r) => views.get(r[other])).filter((p): p is PersonView => !!p)
  const last = page[page.length - 1]
  return { people, next: rows.length > limit && last ? encodeFollowCursor(last.created_at, last.id) : null }
}
