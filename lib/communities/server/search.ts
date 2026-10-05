import "server-only"

/**
 * ===========================================================================
 *  SEARCH INSIDE A COMMUNITY
 * ===========================================================================
 * The community's search (components/community/member/search.tsx) asks
 * GET /api/community/<id>/search?q= and gets short groups back, ranked
 * (round 10, components/community/member/search-rank.ts: every word
 * typed must be there, a title or a name counts more than a body, a word's
 * start more than its middle). Only what this member may see:
 *
 *   SPACES   the spaces they may see (a restricted space by its access rule,
 *            a chat space only while chat is on), by name or description.
 *   POSTS    published posts in those spaces (and posts whose space is gone,
 *            as the feed shows them) holding every word in the title or the
 *            text: the newest SEARCH_CANDIDATES that do, ranked, the best
 *            SEARCH_POSTS kept. Never a removed or deleted post, never one
 *            in a space they may not see, never a chat message.
 *   MEMBERS  active members by name or handle, through the directory's own
 *            search (lib/communities/server/directory.ts), and only while
 *            the community has its directory on (its staff always).
 *   CLASSROOM (round 10) the courses this member may open and their lessons,
 *            by title, while the classroom is on; a locked course is not
 *            searched at all.
 *   EVENTS   (round 10) the community's scheduled events whose access lets
 *            this member in, by title, while events are on.
 *
 * ?index=1 answers searchIndex instead: what the search knows before a key
 * is pressed (the spaces, the latest posts, the members here lately, the
 * open courses' lessons, the coming events), read once by the frame when it
 * is idle, so the first results come from the browser at once.
 *
 * COST. Each group is one or two bounded reads inside the community, on its
 * own indexes; ilike over a few dozen rows at most. The route is rate
 * limited per member.
 */
import { evaluateAccess, parseAccessRule } from "../access"
import { can } from "../permissions"
import type { CommunityRow } from "../types"
import { memberHref } from "@/components/community/member/person-href"
import { rankAll, rankItem, searchWords } from "@/components/community/member/search-rank"
import type { SearchEventHit, SearchIndex, SearchLessonHit, SearchMemberHit, SearchPostHit, SearchResults, SearchSpaceHit } from "@/components/community/member/view-types"
import { attachedCourses, courseDenial } from "./classroom"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { authorViews, excerpt, listMembers } from "./directory"
import { accessOf, canSeeSpace, listSpaces } from "./feed"

/** Shorter than this is not searched: one letter matches everything. */
export const SEARCH_MIN = 2
export const SEARCH_MAX = 60
export const SEARCH_SPACES = 4
export const SEARCH_POSTS = 6
export const SEARCH_MEMBERS = 5
/** Posts holding every word read, newest first, before they are ranked. */
export const SEARCH_CANDIDATES = 30
export const SEARCH_LESSONS = 4
export const SEARCH_EVENTS = 3
/** What the preloaded index carries at most. */
export const INDEX_POSTS = 60
export const INDEX_MEMBERS = 40
export const INDEX_LESSONS = 120
export const INDEX_EVENTS = 20

/**
 * What a search may contain: letters, digits, spaces and a few marks people
 * type in titles (. ' - & # + ? !). Everything else is dropped, so nothing
 * typed can reach the query as filter syntax (no commas, brackets, quotes,
 * backslashes, % or _).
 */
export function cleanSearch(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s.'&#+?!-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX)
    .trim()
}

/** The ilike pattern for a cleaned search, quoted for a PostgREST filter. */
export function likePattern(q: string): string {
  return JSON.stringify(`%${q}%`)
}

/** A piece of the text around the first match, cut at words; the start of the text when the match is elsewhere. */
export function snippetAround(text: string | null | undefined, q: string, max = 120): string {
  const t = (text || "").replace(/\s+/g, " ").trim()
  if (!t) return ""
  const at = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (at < 0 || at + q.length <= max - 20) return excerpt(t, max)
  let start = Math.max(0, at - 40)
  const space = t.lastIndexOf(" ", start)
  if (space > 0 && start - space < 20) start = space + 1
  return `...${excerpt(t.slice(start), max - 3)}`
}

export function emptyResults(q = ""): SearchResults {
  return { q, spaces: [], posts: [], members: [] }
}

interface PostHitRow {
  id: string
  space_id: string | null
  author_id: string | null
  title: string | null
  body_text: string | null
  created_at: string
}

type SearchCommunityRow = Pick<CommunityRow, "id" | "slug" | "chat_enabled" | "directory_enabled"> & Partial<Pick<CommunityRow, "classroom_enabled" | "events_enabled">>

/** The spaces this member may see (a chat space only while chat is on). */
async function visibleSpaces(db: Db, community: SearchCommunityRow, viewer: Viewer) {
  const access = accessOf(viewer)
  return (await listSpaces(db, community.id)).filter((s) => (s.kind !== "chat" || community.chat_enabled) && canSeeSpace(s, access))
}

/** The "in a space this member may see, or in none" filter for posts. */
function inSpacesFilter(readable: { id: string }[]): string {
  return readable.length ? `space_id.is.null,space_id.in.(${readable.map((s) => s.id).join(",")})` : "space_id.is.null"
}

/** Posts as hits, with their space and author, read for these rows only. */
async function postHits(db: Db, communityId: string, rows: PostHitRow[], bySpace: Map<string, { slug: string; name: string; icon?: string | null; kind?: string }>, q: string, snippetMax = 120): Promise<(SearchPostHit & { text: string })[]> {
  const authors = await authorViews(db, communityId, rows.map((r) => r.author_id))
  return rows.map((r) => {
    const space = r.space_id ? bySpace.get(r.space_id) : null
    const a = r.author_id ? authors.get(r.author_id) : null
    return {
      id: r.id,
      title: r.title?.trim() || null,
      snippet: snippetAround(r.body_text, q, snippetMax),
      text: excerpt(r.body_text, 400),
      createdAt: r.created_at,
      space: space ? { slug: space.slug, name: space.name, icon: space.icon ?? null, kind: space.kind } : null,
      author: a ? { name: a.name, avatarUrl: a.avatarUrl } : null,
    }
  })
}

/**
 * The courses this member may open (no lock: tier, product, level, role or
 * a drip not yet open), with their titles and their course ids. A locked
 * course and its lessons are never searched.
 */
async function openCourses(db: Db, community: SearchCommunityRow, viewer: Viewer): Promise<{ productId: string; title: string; courseId: string | null }[]> {
  const attached = await attachedCourses(db, community.id)
  if (!attached.length) return []
  const lock = { role: viewer.role, active: viewer.active, tierId: viewer.tierId, ownedProductIds: viewer.ownedProductIds, level: viewer.level, joinedAt: viewer.member?.joined_at ?? viewer.member?.created_at ?? null }
  const open = attached.filter((a) => !courseDenial(a, lock))
  if (!open.length) return []
  const { data: productRows } = await db.from("products").select("id, title, type").in("id", open.map((a) => a.productId))
  const products = new Map(((productRows as { id: string; title: string | null; type: string | null }[] | null) ?? []).filter((p) => p.type === "course").map((p) => [p.id, p]))
  const { data: courseRows } = products.size ? await db.from("courses").select("id, product_id").in("product_id", [...products.keys()]) : { data: [] }
  const courseOf = new Map(((courseRows as { id: string; product_id: string }[] | null) ?? []).map((c) => [c.product_id, c.id]))
  return open.flatMap((a) => {
    const p = products.get(a.productId)
    return p ? [{ productId: p.id, title: p.title?.trim() || "Course", courseId: courseOf.get(p.id) ?? null }] : []
  })
}

/** The open courses and their lessons as hits; with `like`, only lessons whose title holds it. */
async function classroomItems(db: Db, community: SearchCommunityRow, viewer: Viewer, opts: { like?: string; limit: number }): Promise<SearchLessonHit[]> {
  if (!community.classroom_enabled) return []
  try {
    const courses = await openCourses(db, community, viewer)
    if (!courses.length) return []
    const base = `/community/${community.slug}/classroom`
    const out: SearchLessonHit[] = courses.map((c) => ({ id: `course:${c.productId}`, kind: "course", title: c.title, course: null, href: `${base}/${c.productId}` }))
    const courseIds = courses.map((c) => c.courseId).filter((v): v is string => !!v)
    if (!courseIds.length) return out
    const { data: moduleRows } = await db.from("course_modules").select("id, course_id").in("course_id", courseIds)
    const modules = (moduleRows as { id: string; course_id: string }[] | null) ?? []
    if (!modules.length) return out
    let read = db.from("course_lessons").select("id, title, module_id").in("module_id", modules.map((m) => m.id))
    if (opts.like) read = read.ilike("title", opts.like)
    const { data: lessonRows, error } = await read.limit(opts.limit)
    if (error) {
      if (!missing(error)) console.error(`[communities] search lessons: ${reasonOf(error)}`)
      return out
    }
    const courseOfModule = new Map(modules.map((m) => [m.id, m.course_id]))
    const byCourseId = new Map(courses.filter((c) => c.courseId).map((c) => [c.courseId as string, c]))
    for (const l of (lessonRows as { id: string; title: string | null; module_id: string }[] | null) ?? []) {
      const c = byCourseId.get(courseOfModule.get(l.module_id) ?? "")
      if (!c || !l.title?.trim()) continue
      out.push({ id: `lesson:${l.id}`, kind: "lesson", title: l.title.trim(), course: c.title, href: `${base}/${c.productId}?lesson=${l.id}` })
    }
    return out
  } catch (e) {
    console.error(`[communities] search lessons: ${reasonOf(e)}`)
    return []
  }
}

/** Scheduled events this member may see (their access rule lets them in), soonest coming first; with `like`, by title. */
async function eventItems(db: Db, community: SearchCommunityRow, viewer: Viewer, opts: { like?: string; limit: number; upcoming?: boolean }): Promise<SearchEventHit[]> {
  if (!community.events_enabled) return []
  try {
    let read = db.from("community_events").select("id, title, starts_at, access, status").eq("community_id", community.id).eq("status", "scheduled")
    if (opts.like) read = read.ilike("title", opts.like)
    if (opts.upcoming) read = read.gte("starts_at", nowIso(Date.now() - 3_600_000))
    const { data, error } = await read.order("starts_at", { ascending: !!opts.upcoming }).limit(opts.limit)
    if (error) {
      if (!missing(error)) console.error(`[communities] search events: ${reasonOf(error)}`)
      return []
    }
    const v = { role: viewer.role, active: viewer.active, tierId: viewer.tierId, ownedProductIds: viewer.ownedProductIds, level: viewer.level }
    return ((data as { id: string; title: string; starts_at: string; access: unknown }[] | null) ?? [])
      .filter((e) => evaluateAccess(parseAccessRule(e.access), v).ok)
      .map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, href: `/community/${community.slug}/events/${e.id}` }))
  } catch (e) {
    console.error(`[communities] search events: ${reasonOf(e)}`)
    return []
  }
}

/** Everything this member may find for `raw` in this community, ranked. */
export async function searchCommunity(db: Db, community: SearchCommunityRow, viewer: Viewer, raw: unknown): Promise<SearchResults> {
  const q = cleanSearch(raw)
  if (q.length < SEARCH_MIN) return emptyResults(q)
  const words = searchWords(q)
  if (!words.length) return emptyResults(q)
  /* The longest word narrows the reads that take one word (lessons, events); every word is then checked by the ranking. */
  const longest = [...words].sort((a, b) => b.length - a.length)[0]
  const spaces = await visibleSpaces(db, community, viewer)

  const spaceHits: SearchSpaceHit[] = rankAll(spaces, (s) => rankItem([{ text: s.name, weight: 3 }, { text: s.description, weight: 1 }], words), SEARCH_SPACES).map((s) => ({ id: s.id, slug: s.slug, name: s.name, kind: s.kind, icon: s.icon ?? null, description: s.description }))

  const readable = spaces.filter((s) => s.kind !== "chat")
  const bySpace = new Map(readable.map((s) => [s.id, s]))
  const posts = async (): Promise<SearchPostHit[]> => {
    try {
      /* Every word somewhere in the title or the text, inside the spaces this member may see. */
      const each = words.map((w) => `or(title.ilike.${likePattern(w)},body_text.ilike.${likePattern(w)})`).join(",")
      const { data, error } = await db
        .from("community_feed_posts")
        .select("id, space_id, author_id, title, body_text, created_at")
        .eq("community_id", community.id)
        .eq("status", "published")
        .or(`and(or(${inSpacesFilter(readable)}),${each})`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(SEARCH_CANDIDATES)
      if (error) {
        if (!missing(error)) console.error(`[communities] search posts: ${reasonOf(error)}`)
        return []
      }
      const rows = ((data as PostHitRow[] | null) ?? []).filter((r) => !r.space_id || bySpace.has(r.space_id))
      const best = rankAll(rows, (r) => rankItem([{ text: r.title, weight: 3 }, { text: r.body_text, weight: 1 }], words, Date.parse(r.created_at)), SEARCH_POSTS)
      return (await postHits(db, community.id, best, bySpace, longest)).map(({ text: _text, ...hit }) => hit)
    } catch (e) {
      console.error(`[communities] search posts: ${reasonOf(e)}`)
      return []
    }
  }

  const members = async (): Promise<SearchMemberHit[]> => {
    if (!community.directory_enabled && !can(viewer.role, "manage_members")) return []
    const found = await listMembers(db, community.id, { q: words.length > 1 ? q : longest, limit: 20 })
    const hits = found.members.map((m) => ({ id: m.userId, name: m.name, username: m.username, avatarUrl: m.avatarUrl, role: m.role, href: memberHref(community.slug, { id: m.userId, username: m.username, hasStorefront: m.hasStorefront }) }))
    return rankAll(hits, (m) => rankItem([{ text: m.name, weight: 3 }, { text: m.username, weight: 2 }], words), SEARCH_MEMBERS)
  }

  const lessons = async (): Promise<SearchLessonHit[]> => {
    const items = await classroomItems(db, community, viewer, { like: likeRaw(longest), limit: 40 })
    return rankAll(items, (l) => rankItem([{ text: l.title, weight: l.kind === "course" ? 4 : 3 }, { text: l.course, weight: 1 }], words), SEARCH_LESSONS)
  }

  const events = async (): Promise<SearchEventHit[]> => {
    const items = await eventItems(db, community, viewer, { like: likeRaw(longest), limit: 20 })
    return rankAll(items, (e) => rankItem([{ text: e.title, weight: 3 }], words, Date.parse(e.startsAt)), SEARCH_EVENTS)
  }

  const [postResults, memberResults, lessonResults, eventResults] = await Promise.all([posts(), members(), lessons(), events()])
  return { q, spaces: spaceHits, posts: postResults, members: memberResults, lessons: lessonResults, events: eventResults }
}

/** The ilike pattern for one word, unquoted (for .ilike()). */
function likeRaw(word: string): string {
  return `%${word.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
}

/**
 * WHAT THE SEARCH KNOWS BEFORE ANYTHING IS TYPED (?index=1): the spaces this
 * member may see, the latest INDEX_POSTS posts in them, up to INDEX_MEMBERS
 * members (while the directory is open to them), the open courses and their
 * lessons, and the coming events they may see. The browser ranks these on
 * the first key (search-rank.ts) while the full search is on its way.
 */
export async function searchIndex(db: Db, community: SearchCommunityRow, viewer: Viewer): Promise<SearchIndex> {
  const spaces = await visibleSpaces(db, community, viewer)
  const readable = spaces.filter((s) => s.kind !== "chat")
  const bySpace = new Map(readable.map((s) => [s.id, s]))
  const posts = async () => {
    try {
      const { data, error } = await db
        .from("community_feed_posts")
        .select("id, space_id, author_id, title, body_text, created_at")
        .eq("community_id", community.id)
        .eq("status", "published")
        .or(inSpacesFilter(readable))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(INDEX_POSTS)
      if (error) return []
      const rows = ((data as PostHitRow[] | null) ?? []).filter((r) => !r.space_id || bySpace.has(r.space_id))
      return postHits(db, community.id, rows, bySpace, "", 120)
    } catch {
      return []
    }
  }
  const members = async (): Promise<SearchMemberHit[]> => {
    if (!community.directory_enabled && !can(viewer.role, "manage_members")) return []
    const found = await listMembers(db, community.id, { limit: INDEX_MEMBERS })
    return found.members.map((m) => ({ id: m.userId, name: m.name, username: m.username, avatarUrl: m.avatarUrl, role: m.role, href: memberHref(community.slug, { id: m.userId, username: m.username, hasStorefront: m.hasStorefront }) }))
  }
  const [postRows, memberRows, lessons, events] = await Promise.all([
    posts(),
    members(),
    classroomItems(db, community, viewer, { limit: INDEX_LESSONS }),
    eventItems(db, community, viewer, { limit: INDEX_EVENTS, upcoming: true }),
  ])
  return {
    at: Date.now(),
    spaces: spaces.map((s) => ({ id: s.id, slug: s.slug, name: s.name, kind: s.kind, icon: s.icon ?? null, description: s.description })),
    posts: postRows,
    members: memberRows,
    lessons,
    events,
  }
}
