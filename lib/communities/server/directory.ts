import "server-only"

/**
 * ===========================================================================
 *  WHO IS IN HERE: NAMES, FACES AND THE MEMBER DIRECTORY
 * ===========================================================================
 * Every name a member screen draws comes through authorViews: one read of
 * profiles and one of community_members for a whole page of people, never a
 * read per post. The directory pages through active members newest first on
 * (joined_at, id), so ten thousand members is the same cost as ten. Search
 * finds people by name or username in profiles first (bounded), then keeps
 * the ones who are members here.
 *
 * Nothing here ever answers an email, a payment or a source: a member sees
 * a name, a picture, a role, a level and a short bio, and nothing more.
 */
import { evaluateAccess, type AccessViewer } from "../access"
import type { AuthorView, MemberView, Role } from "../types"
import type { MemberProfileView } from "@/components/community/member/view-types"
import { missing, reasonOf, type Db } from "./db"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const DIRECTORY_PAGE = 30

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

/** The name a person goes by: their display name, their username, or "Member". */
export function displayName(p: { display_name?: string | null; username?: string | null } | null | undefined): string {
  const name = (p?.display_name || "").trim() || (p?.username || "").trim()
  return name || "Member"
}

async function profilesOf(db: Db, ids: string[]): Promise<Map<string, ProfileRow>> {
  const out = new Map<string, ProfileRow>()
  const list = [...new Set(ids.filter((id) => typeof id === "string" && UUID.test(id)))]
  if (!list.length) return out
  try {
    const { data, error } = await db.from("profiles").select("id, username, display_name, avatar_url").in("id", list)
    if (error) {
      if (!missing(error)) console.error(`[communities] profiles read: ${reasonOf(error)}`)
      return out
    }
    for (const p of (data as ProfileRow[] | null) ?? []) out.set(p.id, p)
  } catch (e) {
    console.error(`[communities] profiles read: ${reasonOf(e)}`)
  }
  return out
}

/** Names, pictures, roles and levels for a page of people, in two reads. */
export async function authorViews(db: Db, communityId: string, userIds: (string | null | undefined)[]): Promise<Map<string, AuthorView>> {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))]
  const out = new Map<string, AuthorView>()
  if (!ids.length) return out
  const [profiles, members] = await Promise.all([
    profilesOf(db, ids),
    db
      .from("community_members")
      .select("user_id, role, level, status")
      .eq("community_id", communityId)
      .in("user_id", ids)
      .then((r: { data: { user_id: string; role: Role; level: number; status: string }[] | null }) => r.data ?? [], () => []),
  ])
  const memberOf = new Map<string, { role: Role; level: number; status: string }>()
  for (const m of members as { user_id: string; role: Role; level: number; status: string }[]) memberOf.set(m.user_id, m)
  for (const id of ids) {
    const p = profiles.get(id)
    const m = memberOf.get(id)
    out.set(id, {
      id,
      name: displayName(p),
      username: p?.username ?? null,
      avatarUrl: p?.avatar_url ?? null,
      role: m && m.status === "active" ? m.role : null,
      level: m ? Number(m.level) || 1 : null,
    })
  }
  return out
}

/** The level names of a community, 1 to 20. */
export async function levelNames(db: Db, communityId: string): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  try {
    const { data } = await db.from("community_levels").select("level, name").eq("community_id", communityId)
    for (const l of (data as { level: number; name: string }[] | null) ?? []) out.set(Number(l.level), l.name)
  } catch {
    /* No names: the level number alone. */
  }
  return out
}

/* ── The directory ─────────────────────────────────────────────────────── */

export interface DirectoryCursor {
  /** joined_at of the last member on the page ("" when it had none). */
  j: string
  /** Their row id. */
  i: string
}

export function encodeDirectoryCursor(c: DirectoryCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url")
}

export function decodeDirectoryCursor(raw: string | null | undefined): DirectoryCursor | null {
  if (!raw || raw.length > 300) return null
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>
    const j = typeof v.j === "string" ? v.j : ""
    const i = typeof v.i === "string" && UUID.test(v.i) ? v.i : ""
    if (!i || (j && !Number.isFinite(Date.parse(j)))) return null
    return { j, i }
  } catch {
    return null
  }
}

/** The text a search box may send: letters, digits, spaces and a few name characters, at most 60. */
export function cleanQuery(q: unknown): string {
  if (typeof q !== "string") return ""
  return q
    .replace(/^@/, "")
    .replace(/[^\p{L}\p{N} ._'-]/gu, "")
    .trim()
    .slice(0, 60)
}

interface MemberRowLite {
  id: string
  user_id: string
  role: Role
  status: MemberView["status"]
  tier_id: string | null
  level: number
  points: number
  bio: string | null
  joined_at: string | null
  last_active_at: string | null
}

const MEMBER_LITE = "id, user_id, role, status, tier_id, level, points, bio, joined_at, last_active_at"

async function toMemberViews(db: Db, communityId: string, rows: MemberRowLite[]): Promise<MemberView[]> {
  if (!rows.length) return []
  const [profiles, levels, tiers] = await Promise.all([
    profilesOf(db, rows.map((r) => r.user_id)),
    levelNames(db, communityId),
    (async () => {
      const ids = [...new Set(rows.map((r) => r.tier_id).filter((t): t is string => !!t))]
      const map = new Map<string, string>()
      if (!ids.length) return map
      const { data } = await db.from("community_tiers").select("id, name").in("id", ids)
      for (const t of (data as { id: string; name: string }[] | null) ?? []) map.set(t.id, t.name)
      return map
    })().catch(() => new Map<string, string>()),
  ])
  return rows.map((r) => {
    const p = profiles.get(r.user_id)
    return {
      userId: r.user_id,
      name: displayName(p),
      username: p?.username ?? null,
      avatarUrl: p?.avatar_url ?? null,
      role: r.role,
      status: r.status,
      tierId: r.tier_id,
      tierName: r.tier_id ? (tiers.get(r.tier_id) ?? null) : null,
      level: Number(r.level) || 1,
      levelName: levels.get(Number(r.level) || 1) ?? null,
      points: Number(r.points) || 0,
      bio: r.bio,
      joinedAt: r.joined_at,
      lastActiveAt: r.last_active_at,
    }
  })
}

export interface DirectoryQuery {
  q?: string
  role?: Role | null
  level?: number | null
  cursor?: string | null
  limit?: number
}

/**
 * Active members, newest first, a page at a time. With a search, the people
 * whose name or username matches (at most 200 looked at) who are members.
 */
export async function listMembers(db: Db, communityId: string, query: DirectoryQuery): Promise<{ members: MemberView[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(50, Math.floor(query.limit ?? DIRECTORY_PAGE)))
  const q = cleanQuery(query.q)
  try {
    let matchIds: string[] | null = null
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
      const { data, error } = await db.from("profiles").select("id").or(`display_name.ilike.${JSON.stringify(like)},username.ilike.${JSON.stringify(like)}`).limit(200)
      if (error) {
        if (!missing(error)) console.error(`[communities] member search: ${reasonOf(error)}`)
        return { members: [], nextCursor: null }
      }
      matchIds = ((data as { id: string }[] | null) ?? []).map((r) => r.id)
      if (!matchIds.length) return { members: [], nextCursor: null }
    }
    let read = db.from("community_members").select(MEMBER_LITE).eq("community_id", communityId).eq("status", "active")
    if (matchIds) read = read.in("user_id", matchIds)
    if (query.role) read = read.eq("role", query.role)
    if (query.level && query.level > 1) read = read.gte("level", Math.min(20, Math.floor(query.level)))
    const cursor = decodeDirectoryCursor(query.cursor)
    if (cursor) {
      read = cursor.j
        ? read.or(`joined_at.lt."${cursor.j}",and(joined_at.eq."${cursor.j}",id.lt.${cursor.i}),joined_at.is.null`)
        : read.is("joined_at", null).lt("id", cursor.i)
    }
    const { data, error } = await read
      .order("joined_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(limit + 1)
    if (error) {
      if (!missing(error)) console.error(`[communities] members read: ${reasonOf(error)}`)
      return { members: [], nextCursor: null }
    }
    const rows = (data as MemberRowLite[] | null) ?? []
    const page = rows.slice(0, limit)
    const last = page[page.length - 1]
    const nextCursor = rows.length > limit && last ? encodeDirectoryCursor({ j: last.joined_at ?? "", i: last.id }) : null
    return { members: await toMemberViews(db, communityId, page), nextCursor }
  } catch (e) {
    console.error(`[communities] members read: ${reasonOf(e)}`)
    return { members: [], nextCursor: null }
  }
}

/**
 * One member's page: who they are here, their badges, how many posts, and
 * their latest posts in spaces the viewer may see. Null for somebody who is
 * not an active member (a banned or departed person has no public page).
 */
export async function memberProfile(
  db: Db,
  community: { id: string; slug: string },
  userId: string,
  viewer: AccessViewer & { userId: string | null },
): Promise<MemberProfileView | null> {
  if (!UUID.test(userId)) return null
  try {
    const { data: row, error } = await db.from("community_members").select(MEMBER_LITE).eq("community_id", community.id).eq("user_id", userId).maybeSingle()
    if (error || !row || (row as MemberRowLite).status !== "active") return null
    const [view] = await toMemberViews(db, community.id, [row as MemberRowLite])
    const [badgeRows, spaces, creator, count] = await Promise.all([
      db
        .from("community_member_badges")
        .select("badge_id, awarded_at")
        .eq("community_id", community.id)
        .eq("user_id", userId)
        .order("awarded_at", { ascending: false })
        .limit(24)
        .then((r: { data: { badge_id: string }[] | null }) => r.data ?? [], () => []),
      db
        .from("community_spaces")
        .select("id, view_access")
        .eq("community_id", community.id)
        .is("archived_at", null)
        .then((r: { data: { id: string; view_access: unknown }[] | null }) => r.data ?? [], () => []),
      db
        .from("creators")
        .select("username, slug, store_published")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle()
        .then((r: { data: { username: string | null; slug: string | null; store_published: boolean | null } | null }) => r.data, () => null),
      db
        .from("community_feed_posts")
        .select("id", { count: "exact", head: true })
        .eq("community_id", community.id)
        .eq("author_id", userId)
        .eq("status", "published")
        .then((r: { count: number | null }) => r.count ?? 0, () => 0),
    ])
    const badgeIds = (badgeRows as { badge_id: string }[]).map((b) => b.badge_id)
    let badges: MemberProfileView["badges"] = []
    if (badgeIds.length) {
      const { data } = await db.from("community_badges").select("id, name, icon, description").in("id", badgeIds)
      const byId = new Map(((data as MemberProfileView["badges"] | null) ?? []).map((b) => [b.id, b]))
      badges = badgeIds.map((id) => byId.get(id)).filter((b): b is MemberProfileView["badges"][number] => !!b)
    }
    const visible = (spaces as { id: string; view_access: unknown }[]).filter((s) => evaluateAccess(s.view_access as never, viewer).ok).map((s) => s.id)
    let recent: MemberProfileView["recent"] = []
    if (visible.length) {
      const { data } = await db
        .from("community_feed_posts")
        .select("id, title, body_text, created_at")
        .eq("community_id", community.id)
        .eq("author_id", userId)
        .eq("status", "published")
        .in("space_id", visible)
        .order("created_at", { ascending: false })
        .limit(5)
      recent = ((data as { id: string; title: string | null; body_text: string; created_at: string }[] | null) ?? []).map((p) => ({
        id: p.id,
        kind: "post" as const,
        title: (p.title || "").trim() || excerpt(p.body_text, 90) || "A post",
        url: `/community/${community.slug}/post/${p.id}`,
        createdAt: p.created_at,
      }))
    }
    const handle = creator && creator.store_published !== false ? creator.username || creator.slug : null
    return {
      ...view,
      badges,
      posts: Number(count) || 0,
      recent,
      creatorUrl: handle ? `/${handle}` : null,
      isSelf: viewer.userId === userId,
    }
  } catch (e) {
    console.error(`[communities] member page ${userId}: ${reasonOf(e)}`)
    return null
  }
}

/** The first words of a text, cut at a word. */
export function excerpt(text: string | null | undefined, max = 140): string {
  const t = (text || "").replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}...`
}

/* ── The leaderboard, with names ───────────────────────────────────────── */

export async function leaderboardRows(
  db: Db,
  communityId: string,
  entries: { rank: number; userId: string; points: number; level: number }[],
): Promise<import("@/components/community/member/view-types").LeaderboardRow[]> {
  if (!entries.length) return []
  const [profiles, levels] = await Promise.all([profilesOf(db, entries.map((e) => e.userId)), levelNames(db, communityId)])
  return entries.map((e) => {
    const p = profiles.get(e.userId)
    return { ...e, levelName: levels.get(e.level) ?? null, name: displayName(p), username: p?.username ?? null, avatarUrl: p?.avatar_url ?? null }
  })
}

/* ── The member's own settings here ────────────────────────────────────── */

const NOTIFY = ["all", "important", "mentions", "none"] as const

export interface MePatch {
  notify_level?: (typeof NOTIFY)[number]
  email_announcements?: boolean
  email_events?: boolean
  bio?: string | null
  onboarded_at?: string
}

/** What a member may change about themselves here: how much they hear, their short bio, and that they have seen the welcome. */
export function checkMe(raw: unknown, now = Date.now()): { ok: true; value: MePatch } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const patch: MePatch = {}
  if (r.notifyLevel !== undefined) {
    if (!NOTIFY.includes(r.notifyLevel as (typeof NOTIFY)[number])) return { ok: false, error: "Choose what to hear about." }
    patch.notify_level = r.notifyLevel as (typeof NOTIFY)[number]
  }
  if (typeof r.emailAnnouncements === "boolean") patch.email_announcements = r.emailAnnouncements
  if (typeof r.emailEvents === "boolean") patch.email_events = r.emailEvents
  if (r.bio !== undefined) {
    const bio = typeof r.bio === "string" ? r.bio.replace(/\s+/g, " ").trim() : ""
    if (bio.length > 280) return { ok: false, error: "Keep it under 280 characters." }
    patch.bio = bio || null
  }
  if (r.onboarded === true) patch.onboarded_at = new Date(now).toISOString()
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to change." }
  return { ok: true, value: patch }
}

export async function updateMe(db: Db, communityId: string, userId: string, patch: MePatch): Promise<boolean> {
  const { error } = await db.from("community_members").update(patch).eq("community_id", communityId).eq("user_id", userId).eq("status", "active")
  if (error && !missing(error)) console.error(`[communities] member settings: ${reasonOf(error)}`)
  return !error
}
