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
import { ensureUsernames } from "@/lib/profile/ensure-username"
import { isCountryCode, placeLine } from "../location"
import { missing, reasonOf, type Db } from "./db"
import { DM_FROM, type DmFrom } from "../message-privacy"
import { featuredSet } from "./featured-members"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const DIRECTORY_PAGE = 30

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  /** Part 98; absent before it runs. */
  location_city?: string | null
  location_country?: string | null
}

/*
  WHERE PEOPLE ARE FROM (round 12, part 98). profiles.location_city and
  location_country are read with the names once part 98 has added them;
  before that the read without them is the read it always was. Whether they
  are there is remembered for the process (looked for again after a few
  minutes while they are not), so a page of people is still one read.
*/
const PROFILE_BASE = "id, username, display_name, avatar_url"
const PROFILE_WITH_PLACE = `${PROFILE_BASE}, location_city, location_country`
const PLACE_RECHECK_MS = 5 * 60_000
let placeColumns: boolean | null = null
let placeCheckedAt = 0

/** A column part 98 adds that is not there yet (42703, or PostgREST's PGRST204). */
function columnMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === "42703" || code === "PGRST204"
}

function placeColumnsWorthAsking(): boolean {
  return placeColumns !== false || Date.now() - placeCheckedAt > PLACE_RECHECK_MS
}

/** Whether profiles can say where people are from (part 98 has run): the directory's country filter is offered only then. */
export async function locationsReady(db: Db): Promise<boolean> {
  if (placeColumns !== null && !(placeColumns === false && placeColumnsWorthAsking())) return placeColumns
  try {
    const { error } = await db.from("profiles").select("location_country").limit(1)
    placeColumns = !error
    placeCheckedAt = Date.now()
  } catch {
    placeColumns = false
    placeCheckedAt = Date.now()
  }
  return placeColumns === true
}

/** The name a person goes by: their display name, their username, or "Member". */
export function displayName(p: { display_name?: string | null; username?: string | null } | null | undefined): string {
  const name = (p?.display_name || "").trim() || (p?.username || "").trim()
  return name || "Member"
}

/**
 * Names and pictures for a page of people, in one read. Anybody without a
 * handle yet is given one here (lib/profile/ensure-username.ts), so every
 * author, member and mention picker row can be @mentioned and opens a
 * /@handle page; nothing is written for people who already have one.
 */
async function profilesOf(db: Db, ids: string[]): Promise<Map<string, ProfileRow>> {
  const out = new Map<string, ProfileRow>()
  const list = [...new Set(ids.filter((id) => typeof id === "string" && UUID.test(id)))]
  if (!list.length) return out
  try {
    const withPlace = placeColumnsWorthAsking()
    let { data, error } = await db.from("profiles").select(withPlace ? PROFILE_WITH_PLACE : PROFILE_BASE).in("id", list)
    if (withPlace) {
      if (error && columnMissing(error)) {
        placeColumns = false
        placeCheckedAt = Date.now()
        ;({ data, error } = await db.from("profiles").select(PROFILE_BASE).in("id", list))
      } else if (!error) placeColumns = true
    }
    if (error) {
      if (!missing(error)) console.error(`[communities] profiles read: ${reasonOf(error)}`)
      return out
    }
    for (const p of (data as ProfileRow[] | null) ?? []) out.set(p.id, p)
    const unnamed = [...out.values()].filter((p) => !p.username).map((p) => p.id)
    if (unnamed.length) {
      const handles = await ensureUsernames(db, unnamed)
      for (const [id, username] of handles) {
        const p = out.get(id)
        if (p) out.set(id, { ...p, username })
      }
    }
  } catch (e) {
    console.error(`[communities] profiles read: ${reasonOf(e)}`)
  }
  return out
}

/**
 * WHICH OF THESE PEOPLE HAVE A STOREFRONT, so a name opens the right page:
 * /<handle> for a storefront, /@handle for everybody else. One read for a
 * whole page of people. A storefront is a finished creator onboarding, the
 * same test /<handle> itself makes (lib/profile/storefront-gate.ts), so a
 * link never lands on the redirect. Unreadable is "nobody": /@handle still
 * opens, and a creator's /@handle sends them on to their storefront.
 */
export async function storefrontsOf(db: Db, ids: (string | null | undefined)[]): Promise<Set<string>> {
  const out = new Set<string>()
  const list = [...new Set(ids.filter((id): id is string => typeof id === "string" && UUID.test(id)))]
  if (!list.length) return out
  try {
    const { data, error } = await db.from("creators").select("user_id").in("user_id", list).eq("onboarding_completed", true)
    if (error) {
      if (!missing(error)) console.error(`[communities] storefronts read: ${reasonOf(error)}`)
      return out
    }
    for (const c of (data as { user_id: string | null }[] | null) ?? []) if (c.user_id) out.add(c.user_id)
  } catch (e) {
    console.error(`[communities] storefronts read: ${reasonOf(e)}`)
  }
  return out
}

/** Names, pictures, roles and levels for a page of people, in three reads. */
export async function authorViews(db: Db, communityId: string, userIds: (string | null | undefined)[]): Promise<Map<string, AuthorView>> {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))]
  const out = new Map<string, AuthorView>()
  if (!ids.length) return out
  const [profiles, stores, members] = await Promise.all([
    profilesOf(db, ids),
    storefrontsOf(db, ids),
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
      hasStorefront: stores.has(id),
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

/** Tier names by id, in one read; none when it cannot be read. */
async function tierNames(db: Db, tierIds: (string | null)[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const ids = [...new Set(tierIds.filter((t): t is string => !!t))]
  if (!ids.length) return map
  try {
    const { data } = await db.from("community_tiers").select("id, name").in("id", ids)
    for (const t of (data as { id: string; name: string }[] | null) ?? []) map.set(t.id, t.name)
  } catch {
    /* No names: the tier stays unnamed. */
  }
  return map
}

async function toMemberViews(db: Db, communityId: string, rows: MemberRowLite[]): Promise<MemberView[]> {
  if (!rows.length) return []
  /*
    The featured members are one bounded read for the whole page (round 34,
    at most FEATURED_MAX rows), not a column on the list: the two columns are
    added by run-now part 223, and asking for one the database does not have
    would fail every directory read. Before the part runs the set is empty
    and no row says the word.
  */
  const [profiles, stores, levels, tiers, featured] = await Promise.all([
    profilesOf(db, rows.map((r) => r.user_id)),
    storefrontsOf(db, rows.map((r) => r.user_id)),
    levelNames(db, communityId),
    tierNames(db, rows.map((r) => r.tier_id)),
    featuredSet(db, communityId),
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
      hasStorefront: stores.has(r.user_id),
      location: placeLine(p?.location_city, p?.location_country),
      featured: featured.has(r.user_id),
    }
  })
}

export interface DirectoryQuery {
  q?: string
  role?: Role | null
  level?: number | null
  cursor?: string | null
  limit?: number
  /** Only members whose profile says this country (a two letter code, part 98). */
  country?: string | null
}

/** Members looked at per read while filtering by country, and at most per request: bounded however few match. */
export const COUNTRY_SCAN_CHUNK = 200
export const COUNTRY_SCAN_MAX = 2000

/**
 * THE COUNTRY FILTER (round 12, ask 15). Where somebody is from lives on
 * profiles, which cannot be joined to the members here in one read, and a
 * country's people across all of Storelib are far too many to list first.
 * So the members' own keyset is walked in chunks (COUNTRY_SCAN_CHUNK), each
 * chunk's people looked up in profiles by id and country, until a page is
 * full or COUNTRY_SCAN_MAX members have been looked at; the cursor is where
 * the walk stopped, so "Show more" carries on from there. Bounded the same
 * for ten members or ten thousand. Without part 98 nobody matches.
 */
async function byCountry(
  db: Db,
  communityId: string,
  country: string,
  from: DirectoryCursor | null,
  limit: number,
  readPage: (after: DirectoryCursor | null, size: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ members: MemberView[]; nextCursor: string | null }> {
  if (!(await locationsReady(db))) return { members: [], nextCursor: null }
  const found: MemberRowLite[] = []
  let after = from
  let scanned = 0
  let more = true
  while (found.length < limit && scanned < COUNTRY_SCAN_MAX && more) {
    const { data, error } = await readPage(after, COUNTRY_SCAN_CHUNK)
    if (error) {
      if (!missing(error as never)) console.error(`[communities] members by country: ${reasonOf(error)}`)
      return { members: [], nextCursor: null }
    }
    const rows = (data as MemberRowLite[] | null) ?? []
    more = rows.length === COUNTRY_SCAN_CHUNK
    if (!rows.length) break
    const { data: hits, error: hitError } = await db.from("profiles").select("id").in("id", rows.map((r) => r.user_id)).eq("location_country", country)
    if (hitError) return { members: [], nextCursor: null }
    const here = new Set(((hits as { id: string }[] | null) ?? []).map((h) => h.id))
    for (const r of rows) {
      scanned++
      after = { j: r.joined_at ?? "", i: r.id }
      if (here.has(r.user_id)) found.push(r)
      if (found.length >= limit) {
        /* Full: the walk stops at this member, and the next page starts after them. */
        more = more || r !== rows[rows.length - 1]
        break
      }
    }
  }
  return { members: await toMemberViews(db, communityId, found), nextCursor: more && after ? encodeDirectoryCursor(after) : null }
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
    /* One page of the members' keyset, from a cursor: the plain directory reads one, the country filter reads several. */
    const readPage = (after: DirectoryCursor | null, size: number) => {
      let read = db.from("community_members").select(MEMBER_LITE).eq("community_id", communityId).eq("status", "active")
      if (matchIds) read = read.in("user_id", matchIds)
      if (query.role) read = read.eq("role", query.role)
      if (query.level && query.level > 1) read = read.gte("level", Math.min(20, Math.floor(query.level)))
      if (after) {
        read = after.j
          ? read.or(`joined_at.lt."${after.j}",and(joined_at.eq."${after.j}",id.lt.${after.i}),joined_at.is.null`)
          : read.is("joined_at", null).lt("id", after.i)
      }
      return read.order("joined_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(size)
    }
    const cursor = decodeDirectoryCursor(query.cursor)
    const country = isCountryCode(query.country) ? query.country : null
    if (country) return await byCountry(db, communityId, country, cursor, limit, readPage)
    const { data, error } = await readPage(cursor, limit + 1)
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
  const [profiles, stores, levels] = await Promise.all([profilesOf(db, entries.map((e) => e.userId)), storefrontsOf(db, entries.map((e) => e.userId)), levelNames(db, communityId)])
  return entries.map((e) => {
    const p = profiles.get(e.userId)
    return { ...e, levelName: levels.get(e.level) ?? null, name: displayName(p), username: p?.username ?? null, avatarUrl: p?.avatar_url ?? null, hasStorefront: stores.has(e.userId) }
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
  /** Who may message them here (round 34, ../message-privacy.ts). Written only by run-now part 223's column. */
  dm_from?: DmFrom
}

/**
 * What a member may change about themselves here: how much they hear, who
 * may message them, their short bio, and that they have seen the welcome.
 */
export function checkMe(raw: unknown, now = Date.now()): { ok: true; value: MePatch } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const patch: MePatch = {}
  if (r.notifyLevel !== undefined) {
    if (!NOTIFY.includes(r.notifyLevel as (typeof NOTIFY)[number])) return { ok: false, error: "Choose what to hear about." }
    patch.notify_level = r.notifyLevel as (typeof NOTIFY)[number]
  }
  if (r.dmFrom !== undefined) {
    if (!(DM_FROM as readonly string[]).includes(r.dmFrom as string)) return { ok: false, error: "Choose who may message you." }
    patch.dm_from = r.dmFrom as DmFrom
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
  if (error) {
    /*
      Only the message choice needs run-now part 223's column. Before it has
      run, saving it says so and everything else on the page keeps saving.
    */
    if (missing(error) && patch.dm_from !== undefined) return false
    if (!missing(error)) console.error(`[communities] member settings: ${reasonOf(error)}`)
  }
  return !error
}
