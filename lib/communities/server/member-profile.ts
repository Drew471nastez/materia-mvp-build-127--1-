import "server-only"

/**
 * ===========================================================================
 *  A PERSON'S PROFILE INSIDE A COMMUNITY, READ ONCE
 * ===========================================================================
 * Round 15 (R, items 20 and 21): the community shell's `profile` place,
 * `/community/<slug>?profile=<handle>` and `?profile=me`. One loader for the
 * server render of that address and for the shell's JSON place route, so the
 * two can never disagree (ARCH15, THE CONTRACTS). It answers the shape in
 * lib/communities/member-profile-view.ts, or null when there is nobody to
 * show here (no such person, or not a member of this community).
 *
 * WHO IS LOOKING. `viewer` is this community's own viewer (viewerContext),
 * and the shell only draws places for an active member; this checks it
 * again, so a direct call cannot read past it.
 *
 * SOMEBODY ELSE'S POSTS: only in this community, only from spaces this
 * viewer may read here (the feed's own rule: canSeeSpace over each space's
 * access, no chat spaces, nothing archived; a post in no space is the
 * general feed every member reads), published and not deleted. Newest first,
 * a keyset page on (created_at, id) over the author index
 * (community_feed_posts_author_idx: author_id, created_at desc).
 *
 * MY OWN POSTS, ACROSS COMMUNITIES (item 21). "Never a read of every row":
 *   1. the communities I am an active, unbanned member of, my most recently
 *      used first, at most PROFILE_COMMUNITIES_MAX, and only open ones
 *   2. every space of those communities in one read, and the products their
 *      rules name in one ownership read, so whether I may still see each
 *      space is decided here, with my row in that community (role, tier,
 *      level) exactly as the community would decide it
 *   3. ONE keyset query: my posts (author index) in those communities, not
 *      in a space I may not see now, newest first, PROFILE_POSTS_PAGE + 1
 * Each post carries its community and whether I may edit or delete it from
 * here (ownPostRights: the same rules as the post routes).
 *
 * MY RECENT ACTIVITY: community_activity on its user index, in the same
 * communities, the kinds worth a line (joined, commented, finished a course,
 * going to an event, a new level); a comment names its post only when I may
 * still read that post.
 *
 * THEIR ACTIVITY BOARD (round 18, item 11): memberBoard below, the day grid
 * from SQL part 125 in one call, their level and points, and the facts.
 *
 * Every read is the service role's after these checks, as every community
 * read is.
 */
import { evaluateAccess, parseAccessRule, type AccessViewer } from "../access"
import { POST_COLUMNS, type CommunityRow, type PostRow, type Role } from "../types"
import {
  PROFILE_ACTIVITY_MAX,
  PROFILE_COMMUNITIES_MAX,
  PROFILE_POSTS_PAGE,
  ownPostRights,
  profilePostView,
  profileRefOf,
  type MemberProfileData,
  type ProfileActivityKind,
  type ProfileActivityView,
  type ProfileCommunity,
  type ProfilePerson,
  type ProfilePostsPage,
} from "../member-profile-view"
import type { Viewer } from "./context"
import { missing, type Db } from "./db"
import { accessOf, canSeeSpace, cursorAfter, decodeCursor, keysetCondition, listSpaces } from "./feed"
import { ownedProductIds } from "./membership"
import { displayName } from "./directory"
import { followCounts, isFollowing } from "@/lib/profile/follows"
import { locationLine, readProfileLocation } from "@/lib/profile/location"
import { parseProfileCover } from "@/lib/profile/cover"
import { personHref } from "@/lib/profile/person-href"
import { TIME_ZONE_COOKIE, isTimeZone, readTimeZone } from "@/lib/orders/time-zone"
import { boardFrom, parseActivityAnswer, standingOf, zoneToday, type LevelStep, type MemberBoard } from "../member-activity"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function rows<T>(run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await run()
    return error ? [] : ((data as T[] | null) ?? [])
  } catch {
    return []
  }
}

async function one<T>(run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await run()
    return error ? null : ((data as T | null) ?? null)
  } catch {
    return null
  }
}

/** A handle for ilike, with its own `_` and `%` taken literally. */
const literal = (handle: string) => handle.replace(/[\\%_]/g, (c) => `\\${c}`)

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
}

const PROFILE_FIELDS = "id, username, display_name, avatar_url, bio"

/** The person a ref names: me, an id (the old /members/<id> addresses), or a handle, following a rename. */
export async function resolveProfileRef(db: Db, viewer: Pick<Viewer, "userId">, raw: string): Promise<ProfileRow | null> {
  const ref = profileRefOf(raw)
  if (!ref) return null
  const byId = (id: string) => one<ProfileRow>(() => db.from("profiles").select(PROFILE_FIELDS).eq("id", id).maybeSingle())
  if (ref === "me") return viewer.userId ? byId(viewer.userId) : null
  if (UUID.test(ref)) return byId(ref)
  const found = await one<ProfileRow>(() => db.from("profiles").select(PROFILE_FIELDS).ilike("username", literal(ref)).limit(1).maybeSingle())
  if (found) return found
  /* A handle somebody changed away from still finds them (app/api/profile/username writes the history). */
  const moved = await one<{ new_username: string | null }>(() =>
    db.from("username_history").select("new_username").ilike("old_username", literal(ref)).order("changed_at", { ascending: false }).limit(1).maybeSingle(),
  )
  const next = moved?.new_username ? profileRefOf(moved.new_username) : null
  if (!next || next === ref || next === "me" || UUID.test(next)) return null
  return one<ProfileRow>(() => db.from("profiles").select(PROFILE_FIELDS).ilike("username", literal(next)).limit(1).maybeSingle())
}

/** Their cover as stored: only a picture of ours (https), with its crop; nothing for anything else. */
async function coverOf(db: Db, userId: string): Promise<{ url: string | null; crop: { x: number; y: number; zoom: number } }> {
  const row = await one<{ cover_url?: string | null }>(() => db.from("profiles").select("cover_url").eq("id", userId).maybeSingle())
  const cover = parseProfileCover(row?.cover_url ?? null)
  const url = cover.url && /^https:\/\//.test(cover.url) ? cover.url : null
  return { url, crop: { x: cover.crop.x, y: cover.crop.y, zoom: cover.crop.zoom } }
}

async function hasStorefront(db: Db, userId: string): Promise<boolean> {
  const row = await one<{ onboarding_completed: boolean | null }>(() => db.from("creators").select("onboarding_completed").eq("user_id", userId).maybeSingle())
  return !!row?.onboarding_completed
}

interface MemberFacts {
  community_id: string
  status: string
  role: Role
  tier_id: string | null
  level: number | null
  points?: number | null
  joined_at: string | null
  muted_until: string | null
  banned_at: string | null
}

const MEMBER_FACTS = "community_id, status, role, tier_id, level, points, joined_at, muted_until, banned_at"

const communityOf = (c: { id: string; slug: string; name: string; logo_url: string | null }): ProfileCommunity => ({ id: c.id, slug: c.slug, name: c.name, logoUrl: c.logo_url })

/* ── Somebody's posts in this community ───────────────────────────────── */

/**
 * One page of `targetId`'s posts in this community, as this viewer may read
 * them here. Their own (the viewer is the author) carry Edit and Delete.
 */
export async function communityPostsPage(db: Db, community: CommunityRow, viewer: Viewer, targetId: string, cursorRaw: string | null): Promise<ProfilePostsPage> {
  if (!viewer.active || !UUID.test(targetId)) return { posts: [], next: null }
  const spaces = await listSpaces(db, community.id)
  const access = accessOf(viewer)
  const readable = spaces.filter((s) => s.kind !== "chat" && canSeeSpace(s, access))
  const names = new Map(readable.map((s) => [s.id, s.name]))
  const spaceScope = readable.length ? `space_id.is.null,space_id.in.(${readable.map((s) => s.id).join(",")})` : "space_id.is.null"
  const cursor = decodeCursor(cursorRaw, "new")
  let q = db.from("community_feed_posts").select(POST_COLUMNS).eq("author_id", targetId).eq("community_id", community.id).eq("status", "published").is("deleted_at", null)
  q = cursor ? q.or(`and(or(${spaceScope}),or(${keysetCondition("new", cursor)}))`) : q.or(spaceScope)
  const found = await rows<PostRow>(() => q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PROFILE_POSTS_PAGE + 1))
  const page = found.slice(0, PROFILE_POSTS_PAGE)
  const last = page[page.length - 1]
  const where = communityOf(community)
  const rights = ownPostRights({ authorId: targetId, viewerId: viewer.userId, member: viewer.member, community })
  return {
    posts: page.map((row) => profilePostView(row, where, (id) => names.get(id) ?? null, rights)),
    next: found.length > PROFILE_POSTS_PAGE && last ? cursorAfter("new", last) : null,
  }
}

/* ── My posts, in every community I am in ─────────────────────────────── */

interface MyCommunities {
  /** Open communities I am an active member of, my most recently used first. */
  list: (ProfileCommunity & { row: { status: string | null; archived_at: string | null } })[]
  member: Map<string, MemberFacts>
  /** Spaces I may not see now in any of them (archived, chat, or ruled out for me). */
  hidden: Set<string>
  /** The names of the spaces I may see, for the rows. */
  spaceNames: Map<string, string>
}

/** The communities, the spaces and the rules that decide what of my own I may see from my profile. Five reads, whatever the size. */
export async function myCommunities(db: Db, userId: string): Promise<MyCommunities> {
  const empty: MyCommunities = { list: [], member: new Map(), hidden: new Set(), spaceNames: new Map() }
  if (!UUID.test(userId)) return empty
  const mine = await rows<MemberFacts>(() =>
    db
      .from("community_members")
      .select(MEMBER_FACTS)
      .eq("user_id", userId)
      .eq("status", "active")
      .is("banned_at", null)
      .order("last_active_at", { ascending: false, nullsFirst: false })
      .limit(PROFILE_COMMUNITIES_MAX),
  )
  const ids = [...new Set(mine.map((m) => m.community_id))]
  if (!ids.length) return empty
  const [found, spaces] = await Promise.all([
    rows<{ id: string; slug: string; name: string; logo_url: string | null; status: string | null; archived_at: string | null }>(() =>
      db.from("communities").select("id, slug, name, logo_url, status, archived_at").in("id", ids).is("deleted_at", null).is("suspended_at", null).neq("status", "suspended"),
    ),
    rows<{ id: string; community_id: string; name: string; kind: string; view_access: unknown; archived_at: string | null }>(() =>
      db.from("community_spaces").select("id, community_id, name, kind, view_access, archived_at").in("community_id", ids),
    ),
  ])
  const open = new Map(found.map((c) => [c.id, c]))
  const member = new Map(mine.map((m) => [m.community_id, m]))
  /* The products any of those rules name, asked about once. */
  const named = new Set<string>()
  for (const s of spaces) for (const id of parseAccessRule(s.view_access).productIds ?? []) named.add(id)
  const owned = named.size ? await ownedProductIds(db, userId, [...named]).catch(() => [] as string[]) : []
  const hidden = new Set<string>()
  const spaceNames = new Map<string, string>()
  for (const s of spaces) {
    const m = member.get(s.community_id)
    const as: AccessViewer = { role: m?.role ?? null, active: m?.status === "active", tierId: m?.tier_id ?? null, ownedProductIds: owned, level: m?.level ?? 1 }
    if (s.archived_at || s.kind === "chat" || !evaluateAccess(s.view_access as never, as).ok) hidden.add(s.id)
    else spaceNames.set(s.id, s.name)
  }
  return {
    list: ids.flatMap((id) => {
      const c = open.get(id)
      return c ? [{ ...communityOf(c), row: { status: c.status, archived_at: c.archived_at } }] : []
    }),
    member,
    hidden,
    spaceNames,
  }
}

/** One page of my own posts across my communities, newest first. */
export async function myPostsPage(db: Db, userId: string, cursorRaw: string | null, known?: MyCommunities): Promise<ProfilePostsPage> {
  const mine = known ?? (await myCommunities(db, userId))
  if (!mine.list.length) return { posts: [], next: null }
  const cursor = decodeCursor(cursorRaw, "new")
  const hidden = [...mine.hidden]
  /* The spaces left out are few (chat, archived, a paid tier I no longer have), so the filter names those rather than every space I may read. */
  const spaceScope = hidden.length ? `space_id.is.null,space_id.not.in.(${hidden.join(",")})` : null
  let q = db
    .from("community_feed_posts")
    .select(POST_COLUMNS)
    .eq("author_id", userId)
    .in(
      "community_id",
      mine.list.map((c) => c.id),
    )
    .eq("status", "published")
    .is("deleted_at", null)
  if (cursor && spaceScope) q = q.or(`and(or(${spaceScope}),or(${keysetCondition("new", cursor)}))`)
  else if (cursor) q = q.or(keysetCondition("new", cursor))
  else if (spaceScope) q = q.or(spaceScope)
  const found = await rows<PostRow>(() => q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PROFILE_POSTS_PAGE + 1))
  const page = found.slice(0, PROFILE_POSTS_PAGE)
  const last = page[page.length - 1]
  const byId = new Map(mine.list.map((c) => [c.id, c]))
  const now = Date.now()
  return {
    posts: page.flatMap((row) => {
      const c = byId.get(row.community_id)
      if (!c) return []
      const { row: state, ...community } = c
      const rights = ownPostRights({ authorId: row.author_id, viewerId: userId, member: mine.member.get(c.id) ?? null, community: state, now })
      return [profilePostView(row, community, (id) => mine.spaceNames.get(id) ?? null, rights)]
    }),
    next: found.length > PROFILE_POSTS_PAGE && last ? cursorAfter("new", last) : null,
  }
}

/* ── My recent activity ───────────────────────────────────────────────── */

const ACTIVITY_KINDS: readonly ProfileActivityKind[] = ["joined", "comment", "course_completed", "rsvp", "level_up"]

export async function myRecentActivity(db: Db, userId: string, mine: MyCommunities): Promise<ProfileActivityView[]> {
  if (!mine.list.length) return []
  const found = await rows<{ id: number | string; community_id: string; kind: ProfileActivityKind; target_id: string | null; created_at: string }>(() =>
    db
      .from("community_activity")
      .select("id, community_id, kind, target_id, created_at")
      .eq("user_id", userId)
      .in(
        "community_id",
        mine.list.map((c) => c.id),
      )
      .in("kind", ACTIVITY_KINDS as string[])
      .order("created_at", { ascending: false })
      .limit(PROFILE_ACTIVITY_MAX * 3),
  )
  if (!found.length) return []
  const commentIds = found.filter((a) => a.kind === "comment" && a.target_id && UUID.test(a.target_id)).map((a) => a.target_id as string)
  const eventIds = found.filter((a) => a.kind === "rsvp" && a.target_id && UUID.test(a.target_id)).map((a) => a.target_id as string)
  const [comments, events] = await Promise.all([
    commentIds.length ? rows<{ id: string; post_id: string; status: string }>(() => db.from("community_feed_comments").select("id, post_id, status").in("id", commentIds)) : Promise.resolve([]),
    eventIds.length ? rows<{ id: string; title: string | null; status: string | null }>(() => db.from("community_events").select("id, title, status").in("id", eventIds)) : Promise.resolve([]),
  ])
  const postIds = [...new Set(comments.filter((c) => c.status === "published").map((c) => c.post_id))]
  const posts = postIds.length
    ? await rows<{ id: string; community_id: string; title: string | null; body_text: string | null; space_id: string | null; status: string; deleted_at: string | null }>(() =>
        db.from("community_feed_posts").select("id, community_id, title, body_text, space_id, status, deleted_at").in("id", postIds),
      )
    : []
  const postOf = new Map(comments.map((c) => [c.id, c.post_id]))
  const postById = new Map(posts.map((p) => [p.id, p]))
  const eventById = new Map(events.map((e) => [e.id, e]))
  const byId = new Map(mine.list.map((c) => [c.id, c]))
  const seen = new Set<string>()
  const out: ProfileActivityView[] = []
  for (const a of found) {
    if (out.length >= PROFILE_ACTIVITY_MAX) break
    const c = byId.get(a.community_id)
    if (!c) continue
    const { row: _state, ...community } = c
    void _state
    let title: string | null = null
    let href: string | null = `/community/${c.slug}`
    let level: number | null = null
    if (a.kind === "comment") {
      const post = postById.get(postOf.get(a.target_id ?? "") ?? "")
      /* A comment names its post only while I may still read it there. */
      if (!post || post.status !== "published" || post.deleted_at || post.community_id !== c.id || (post.space_id && mine.hidden.has(post.space_id))) continue
      const text = (post.title || "").trim() || (post.body_text || "").replace(/\s+/g, " ").trim()
      title = text ? (text.length > 90 ? `${text.slice(0, 89).trimEnd()}…` : text) : "a post"
      href = `/community/${c.slug}/post/${post.id}`
    } else if (a.kind === "rsvp") {
      const e = eventById.get(a.target_id ?? "")
      if (!e || e.status === "cancelled" || e.status === "deleted") continue
      title = (e.title || "").trim() || null
      href = `/community/${c.slug}/events/${e.id}`
    } else if (a.kind === "course_completed") {
      href = `/community/${c.slug}/learn`
    } else if (a.kind === "level_up") {
      const n = Number(a.target_id)
      level = Number.isInteger(n) && n > 0 ? n : null
    }
    /* Three comments on one post in a row are one line. */
    const key = `${a.kind}:${c.id}:${title ?? ""}:${level ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: String(a.id), kind: a.kind, at: a.created_at, community, title, href, level })
  }
  return out
}

/* ── Their activity board here (round 18) ─────────────────────────────── */

/**
 * The time zone the board's days are counted in: the storelib_tz cookie the
 * app writes (lib/orders/time-zone), UTC when there is none or outside a
 * request (a test).
 */
async function viewerZone(): Promise<string> {
  try {
    const { cookies } = await import("next/headers")
    return readTimeZone((await cookies()).get(TIME_ZONE_COOKIE)?.value)
  } catch {
    return "UTC"
  }
}

/** The community's levels, lowest first; empty when it has none or they cannot be read. */
async function levelSteps(db: Db, communityId: string): Promise<LevelStep[]> {
  const found = await rows<{ level: number; name: string; min_points: number }>(() => db.from("community_levels").select("level, name, min_points").eq("community_id", communityId))
  return found.map((l) => ({ level: Number(l.level), name: String(l.name ?? ""), minPoints: Math.max(0, Number(l.min_points) || 0) })).sort((a, b) => a.level - b.level)
}

/** Their published posts here, all time, counted on the author index. Null when it cannot be counted. */
async function postCount(db: Db, communityId: string, userId: string): Promise<number | null> {
  try {
    const { count, error } = await db
      .from("community_feed_posts")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId)
      .eq("community_id", communityId)
      .eq("status", "published")
      .is("deleted_at", null)
    return error || typeof count !== "number" ? null : count
  } catch {
    return null
  }
}

/**
 * THE BOARD: the day grid, their level and points, and the facts, for
 * somebody's profile in this community.
 *
 *   THE GRID   one call to community_member_activity (SQL part 125): their
 *              published posts and comments and the likes they gave here,
 *              counted per day in the viewer's zone over the last
 *              BOARD_WEEKS weeks, plus their all time post and comment counts.
 *              The function reads each table on its author or user index
 *              (part 125 adds the comments one), so a member with years of
 *              history costs the rows of one year, aggregated in the
 *              database, and one round trip. Before part 125 has run the call
 *              answers "no such function": no grid, the posts counted on
 *              their own (the author index is already there), the comments
 *              left out (they have no author index until then). Never an
 *              error on the page.
 *   STANDING   their level and points (community_members, kept by the points
 *              trigger) on the community's levels, only where it counts
 *              points.
 */
export async function memberBoard(
  db: Db,
  community: Pick<CommunityRow, "id" | "gamification_enabled">,
  member: Pick<MemberFacts, "level" | "points" | "joined_at">,
  userId: string,
  opts: { now?: number; tz?: string } = {},
): Promise<MemberBoard> {
  const tz = opts.tz && isTimeZone(opts.tz) ? opts.tz : await viewerZone()
  const today = zoneToday(opts.now ?? Date.now(), tz)
  const from = boardFrom(today)
  const [answer, steps] = await Promise.all([
    (async () => {
      try {
        const { data, error } = await db.rpc("community_member_activity", { p_community: community.id, p_user: userId, p_from: from, p_tz: tz })
        if (error) {
          if (!missing(error)) console.error(`[communities] activity board not read: ${(error as { message?: string }).message ?? "error"}`)
          return null
        }
        return parseActivityAnswer(data, today, from)
      } catch {
        return null
      }
    })(),
    community.gamification_enabled ? levelSteps(db, community.id) : Promise.resolve(null),
  ])
  const posts = answer ? answer.posts : await postCount(db, community.id, userId)
  return {
    grid: answer?.grid ?? null,
    standing: steps ? standingOf(member.level, member.points, steps) : null,
    joinedAt: member.joined_at ?? null,
    posts,
    comments: answer ? answer.comments : null,
  }
}

/* ── The place ────────────────────────────────────────────────────────── */

/**
 * THE PROFILE PLACE'S DATA: whose it is, their head, and the first page of
 * posts (theirs here, or mine everywhere) with my activity on my own. Null
 * when the viewer is not an active member here, or the ref names nobody who
 * is a member of this community.
 */
export async function loadMemberProfile(db: Db, community: CommunityRow, viewer: Viewer, ref: string, now: number = Date.now()): Promise<MemberProfileData | null> {
  if (!viewer.userId || !viewer.active) return null
  const person = await resolveProfileRef(db, viewer, ref)
  if (!person) return null
  const self = person.id === viewer.userId
  /* Somebody else is shown here only while they are a member of this community, not banned. */
  const theirs = self
    ? viewer.member
      ? ({ ...viewer.member, community_id: community.id } as unknown as MemberFacts)
      : null
    : await one<MemberFacts>(() => db.from("community_members").select(MEMBER_FACTS).eq("community_id", community.id).eq("user_id", person.id).maybeSingle())
  if (!self && (!theirs || theirs.status !== "active" || theirs.banned_at)) return null

  const mine = self ? await myCommunities(db, viewer.userId) : null
  const [cover, place, counts, following, storefront, posts, activity, board] = await Promise.all([
    coverOf(db, person.id),
    readProfileLocation(db, person.id),
    followCounts(db, person.id),
    self ? Promise.resolve(false) : isFollowing(db, viewer.userId, person.id),
    hasStorefront(db, person.id),
    mine ? myPostsPage(db, viewer.userId, null, mine) : communityPostsPage(db, community, viewer, person.id, null),
    mine ? myRecentActivity(db, viewer.userId, mine) : Promise.resolve(null),
    !self && theirs ? memberBoard(db, community, theirs, person.id, { now }) : Promise.resolve(null),
  ])
  const role = theirs?.role && theirs.role !== "member" ? (theirs.role as ProfilePerson["role"]) : null
  const page = personHref({ username: person.username, hasStorefront: storefront })
  return {
    self,
    person: {
      userId: person.id,
      username: person.username,
      name: displayName(person),
      avatarUrl: person.avatar_url,
      coverUrl: cover.url,
      coverCrop: cover.crop,
      bio: (person.bio || "").trim() || null,
      location: locationLine(place),
      role,
      level: typeof theirs?.level === "number" ? theirs.level : null,
      joinedAt: theirs?.joined_at ?? null,
      followers: counts.followers,
      following: counts.following,
      pageHref: page === "/" ? null : page,
      hasStorefront: storefront,
    },
    viewerFollowing: following,
    scope: self ? "all" : "community",
    posts,
    activity,
    board,
    now,
  }
}

/** The next page of a profile place's posts (the JSON route): mine across communities for "me", theirs here for anybody else. */
export async function memberProfilePostsPage(db: Db, community: CommunityRow, viewer: Viewer, ref: string, cursor: string | null): Promise<ProfilePostsPage | null> {
  if (!viewer.userId || !viewer.active) return null
  const person = await resolveProfileRef(db, viewer, ref)
  if (!person) return null
  if (person.id === viewer.userId) return myPostsPage(db, viewer.userId, cursor)
  const theirs = await one<MemberFacts>(() => db.from("community_members").select(MEMBER_FACTS).eq("community_id", community.id).eq("user_id", person.id).maybeSingle())
  if (!theirs || theirs.status !== "active" || theirs.banned_at) return null
  return communityPostsPage(db, community, viewer, person.id, cursor)
}
