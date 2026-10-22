/**
 * ===========================================================================
 *  WHO TO WRITE TO, AND A POST SENT IN A CHAT (round 39)
 * ===========================================================================
 * The owner: "It should have some creators there recommended, so I can
 * create conversations with them from the community; I don't only have to
 * manually search them." And: "Make sure I can share posts into chats."
 *
 * Everything here is a rule rather than a read, so the server
 * (lib/communities/server/chat-people.ts, chat-post.ts) and the browser
 * (components/community/member/people-picker.tsx, share-to-chat.tsx,
 * chat-post-card.tsx) share it and tests/community-people-r39.test.ts checks
 * it directly.
 *
 *   SUGGESTED  the community's owner and team first (owner, admins,
 *              moderators, at most TEAM_MAX), then the people the member
 *              actually deals with (a conversation, a comment on their post,
 *              a post of theirs the member liked, scored and most recent
 *              first), then the top contributors by points, then whoever was
 *              here lately. Never the member, never somebody blocked either
 *              way, never somebody the community's message rules would refuse
 *              (`allowed`, decided on the server by dmDecision).
 *   SEARCH     a name or an @handle; the handle or name that matches from its
 *              first letter first, the team before the rest on a tie.
 *   A POST     a message carries at most one, stored as { type: "post",
 *              postId } and nothing else: no title, no words, no picture. The
 *              card is drawn from the post as it is when each reader reads it,
 *              and only for a reader who may see the post's space; anybody
 *              else reads "Post not available".
 */

export type PickSource = "team" | "talked" | "commented" | "liked" | "top" | "active"

/** A person in the picker, as the server answers them. */
export interface PickPerson {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  /** "owner" for the community's owner whatever their member row says; null for a member. */
  role: "owner" | "admin" | "moderator" | "member" | null
  /** Seen in the last few minutes; null when the community has no heartbeat to read. */
  online: boolean | null
  /** A press opens a conversation. False comes with `why`, the short reason drawn in place of the handle. */
  can: boolean
  why: string | null
  /** Where a suggestion came from (never drawn; the order is what it is for). */
  from?: PickSource
}

export interface SuggestSignals {
  me: string
  ownerId: string | null
  team: { id: string; role: string }[]
  /** The member's conversations with a message in them. */
  talked: { id: string; at: string | null }[]
  /** One entry per comment somebody left on one of the member's posts. */
  commented: { id: string; at: string }[]
  /** One entry per post of theirs the member liked, by the post's author. */
  liked: { id: string; at: string }[]
  top: { id: string; points: number }[]
  /** Last seen here, newest first. */
  active: { id: string; at: string }[]
}

export const SUGGEST_MAX = 12
export const TEAM_MAX = 4
/** How many search results the picker shows at most. */
export const SEARCH_MAX = 20
/** A post sent to this many chats at most in one go. */
export const SHARE_TARGETS_MAX = 5
export const SHARE_NOTE_MAX = 1000

const TEAM_RANK: Record<string, number> = { owner: 0, admin: 1, moderator: 2 }
const DAY = 86_400_000

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : 0
}

/** Up to 4 points for something this week, falling to none after a month. */
function recency(at: number, now: number): number {
  if (!at) return 0
  const days = Math.max(0, (now - at) / DAY)
  return days >= 30 ? 0 : 4 * (1 - days / 30)
}

/**
 * The Suggested list, in order. `allowed` says whether the member may write
 * to somebody (not blocked, an active member, the community's rules); anybody
 * it refuses is left out rather than drawn greyed.
 */
export function rankSuggestions(s: SuggestSignals, allowed: (id: string) => boolean, max = SUGGEST_MAX, now = Date.now()): { id: string; from: PickSource }[] {
  const out: { id: string; from: PickSource }[] = []
  const seen = new Set<string>([s.me])
  const push = (id: string, from: PickSource): boolean => {
    if (!id || seen.has(id) || !allowed(id)) return false
    seen.add(id)
    out.push({ id, from })
    return true
  }

  /* The owner, then admins, then moderators. */
  const team = [...(s.ownerId ? [{ id: s.ownerId, role: "owner" }] : []), ...s.team]
    .map((t) => ({ id: t.id, rank: t.id === s.ownerId ? -1 : (TEAM_RANK[t.role] ?? 9) }))
    .filter((t) => t.rank < 9)
    .sort((a, b) => a.rank - b.rank)
  let n = 0
  for (const t of team) {
    if (n >= TEAM_MAX) break
    if (push(t.id, "team")) n++
  }

  /* The people the member deals with: a conversation counts most, then comments on their posts, then likes. */
  const score = new Map<string, { score: number; last: number; from: PickSource; best: number }>()
  const add = (id: string, points: number, at: number, from: PickSource) => {
    if (!id || id === s.me) return
    const cur = score.get(id) ?? { score: 0, last: 0, from, best: 0 }
    cur.score += points
    cur.last = Math.max(cur.last, at)
    if (points > cur.best) {
      cur.best = points
      cur.from = from
    }
    score.set(id, cur)
  }
  for (const t of s.talked) add(t.id, 6 + recency(ms(t.at), now), ms(t.at), "talked")
  const capped = (list: { id: string; at: string }[], each: number, cap: number, from: PickSource) => {
    const count = new Map<string, number>()
    for (const x of list) {
      const c = count.get(x.id) ?? 0
      if (c >= cap) continue
      count.set(x.id, c + 1)
      add(x.id, each + recency(ms(x.at), now) / 4, ms(x.at), from)
    }
  }
  capped(s.commented, 2, 3, "commented")
  capped(s.liked, 1.5, 3, "liked")
  for (const [id, v] of [...score].sort((a, b) => b[1].score - a[1].score || b[1].last - a[1].last)) push(id, v.from)

  for (const t of [...s.top].sort((a, b) => b.points - a.points)) {
    if (out.length >= max) break
    if (t.points > 0) push(t.id, "top")
  }
  for (const a of [...s.active].sort((x, y) => ms(y.at) - ms(x.at))) {
    if (out.length >= max) break
    push(a.id, "active")
  }
  return out.slice(0, max)
}

/** What was typed into the search: no leading @, no control characters, one space between words, 60 characters. */
export function cleanPeopleQuery(v: unknown): string {
  if (typeof v !== "string") return ""
  return v
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^@+/, "")
    .slice(0, 60)
    .trim()
}

/** Search results in the order the picker draws them: what matches from its first letter first, the team first on a tie. */
export function rankSearch<T extends { name: string; username: string | null; role?: string | null }>(q: string, people: T[]): T[] {
  const term = cleanPeopleQuery(q).toLowerCase()
  const tier = (p: T): number => {
    const name = p.name.toLowerCase()
    const handle = (p.username ?? "").toLowerCase()
    if (handle && handle === term) return 0
    if (name === term) return 1
    if (name.startsWith(term)) return 2
    if (handle && handle.startsWith(term)) return 3
    if (name.split(/\s+/).some((w) => w.startsWith(term))) return 4
    return 5
  }
  return people
    .map((p, i) => ({ p, i, t: tier(p), staff: p.role && p.role !== "member" ? 0 : 1 }))
    .sort((a, b) => a.t - b.t || a.staff - b.staff || a.i - b.i)
    .map((x) => x.p)
}

/* ── A post in a chat ─────────────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What a message stores for a post: its id, nothing a reader could read without being allowed to. */
export interface ChatPostRef {
  type: "post"
  postId: string
}

/** The card a reader is shown: the post as it is now, or that it is not there for them. */
export type ChatSharedPost =
  | {
      postId: string
      available: true
      title: string | null
      excerpt: string
      author: { name: string; avatarUrl: string | null } | null
      image: string | null
      href: string
      space: string | null
    }
  | { postId: string; available: false }

function isPostItem(m: unknown): m is { type: "post"; postId?: unknown } {
  return !!m && typeof m === "object" && (m as { type?: unknown }).type === "post"
}

/** The post ids a message's stored attachments name (well formed ones only). */
export function postRefsIn(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const m of raw) if (isPostItem(m) && typeof m.postId === "string" && UUID.test(m.postId)) out.push(m.postId.toLowerCase())
  return out
}

export function postRefOf(raw: unknown): string | null {
  return postRefsIn(raw)[0] ?? null
}

/** A message's attachments without its post (the pictures and files go through their own checks). */
export function withoutPostRefs(raw: unknown): unknown {
  return Array.isArray(raw) ? raw.filter((m) => !isPostItem(m)) : raw
}

/** The post items a client sent, as they were sent: none, one, or too many. */
export function postItemsIn(raw: unknown): { type: "post"; postId?: unknown }[] {
  return Array.isArray(raw) ? raw.filter(isPostItem) : []
}

/** Two lines of a post's words for its card: one line of text, 160 characters at most. */
export function postExcerpt(text: string | null | undefined, max = 160): string {
  const line = (text ?? "").replace(/\s+/g, " ").trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/**
 * A post's card for one reader. `visible` is the server's answer for that
 * reader (published, in a space they may see); without it the card says
 * nothing about the post at all.
 */
export function sharedPostCard(i: {
  postId: string
  visible: boolean
  title: string | null
  bodyText: string
  image: string | null
  author: { name: string; avatarUrl: string | null } | null
  href: string
  space: string | null
}): ChatSharedPost {
  if (!i.visible) return { postId: i.postId, available: false }
  const title = (i.title ?? "").replace(/\s+/g, " ").trim()
  return {
    postId: i.postId,
    available: true,
    title: title ? title.slice(0, 140) : null,
    excerpt: postExcerpt(i.bodyText),
    author: i.author,
    image: i.image,
    href: i.href,
    space: i.space,
  }
}

/** The line a list shows for a message that carries a post and no words. */
export const POST_LINE = "Post"
