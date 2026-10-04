import "server-only"

/**
 * ===========================================================================
 *  SEARCH INSIDE A COMMUNITY
 * ===========================================================================
 * The search field in the community's bar (components/community/member/
 * search.tsx) asks GET /api/community/<id>/search?q= and gets three short
 * groups back: spaces, posts and members. Only what this member may see:
 *
 *   SPACES   the spaces they may see (a restricted space by its access rule,
 *            a chat space only while chat is on), by name or description.
 *   POSTS    published posts in those spaces (and posts whose space is gone,
 *            as the feed shows them), by title or text, newest first. Never
 *            a removed or deleted post, never one in a space they may not
 *            see, never a chat message.
 *   MEMBERS  active members by name or handle, through the directory's own
 *            search (lib/communities/server/directory.ts), and only while
 *            the community has its directory on (its staff always).
 *
 * COST. Each group is one bounded read: the posts read stays inside the
 * community on (community_id, created_at DESC) and stops at a handful of
 * rows; ilike on the title and the plain text is fine at this size. The
 * route is rate limited per member.
 */
import { can } from "../permissions"
import type { CommunityRow } from "../types"
import { memberHref } from "@/components/community/member/person-href"
import type { SearchMemberHit, SearchPostHit, SearchResults, SearchSpaceHit } from "@/components/community/member/view-types"
import type { Viewer } from "./context"
import { missing, reasonOf, type Db } from "./db"
import { authorViews, excerpt, listMembers } from "./directory"
import { accessOf, canSeeSpace, listSpaces } from "./feed"

/** Shorter than this is not searched: one letter matches everything. */
export const SEARCH_MIN = 2
export const SEARCH_MAX = 60
export const SEARCH_SPACES = 4
export const SEARCH_POSTS = 6
export const SEARCH_MEMBERS = 5

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

/** Everything this member may find for `raw` in this community. */
export async function searchCommunity(db: Db, community: Pick<CommunityRow, "id" | "slug" | "chat_enabled" | "directory_enabled">, viewer: Viewer, raw: unknown): Promise<SearchResults> {
  const q = cleanSearch(raw)
  if (q.length < SEARCH_MIN) return emptyResults(q)
  const needle = q.toLowerCase()
  const access = accessOf(viewer)
  const spaces = (await listSpaces(db, community.id)).filter((s) => (s.kind !== "chat" || community.chat_enabled) && canSeeSpace(s, access))

  const spaceHits: SearchSpaceHit[] = spaces
    .filter((s) => s.name.toLowerCase().includes(needle) || (s.description || "").toLowerCase().includes(needle))
    .slice(0, SEARCH_SPACES)
    .map((s) => ({ id: s.id, slug: s.slug, name: s.name, kind: s.kind, description: s.description }))

  const readable = spaces.filter((s) => s.kind !== "chat")
  const bySpace = new Map(readable.map((s) => [s.id, s]))
  const posts = async (): Promise<SearchPostHit[]> => {
    try {
      const like = likePattern(q)
      const inSpaces = readable.length ? `space_id.is.null,space_id.in.(${readable.map((s) => s.id).join(",")})` : "space_id.is.null"
      const { data, error } = await db
        .from("community_feed_posts")
        .select("id, space_id, author_id, title, body_text, created_at")
        .eq("community_id", community.id)
        .eq("status", "published")
        .or(`and(or(${inSpaces}),or(title.ilike.${like},body_text.ilike.${like}))`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(SEARCH_POSTS)
      if (error) {
        if (!missing(error)) console.error(`[communities] search posts: ${reasonOf(error)}`)
        return []
      }
      const rows = ((data as PostHitRow[] | null) ?? []).filter((r) => !r.space_id || bySpace.has(r.space_id))
      const authors = await authorViews(db, community.id, rows.map((r) => r.author_id))
      return rows.map((r) => {
        const space = r.space_id ? bySpace.get(r.space_id) : null
        const a = r.author_id ? authors.get(r.author_id) : null
        return {
          id: r.id,
          title: r.title?.trim() || null,
          snippet: snippetAround(r.body_text, q),
          createdAt: r.created_at,
          space: space ? { slug: space.slug, name: space.name } : null,
          author: a ? { name: a.name, avatarUrl: a.avatarUrl } : null,
        }
      })
    } catch (e) {
      console.error(`[communities] search posts: ${reasonOf(e)}`)
      return []
    }
  }

  const members = async (): Promise<SearchMemberHit[]> => {
    if (!community.directory_enabled && !can(viewer.role, "manage_members")) return []
    const found = await listMembers(db, community.id, { q, limit: SEARCH_MEMBERS })
    return found.members.map((m) => ({ id: m.userId, name: m.name, username: m.username, avatarUrl: m.avatarUrl, role: m.role, href: memberHref(community.slug, { id: m.userId, username: m.username, hasStorefront: m.hasStorefront }) }))
  }

  const [postHits, memberHits] = await Promise.all([posts(), members()])
  return { q, spaces: spaceHits, posts: postHits, members: memberHits }
}
