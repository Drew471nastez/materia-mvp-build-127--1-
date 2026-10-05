/**
 * What the "In <community>" section on a profile draws, as plain data, so
 * the server (lib/profile/shared-posts.ts), the route and the client
 * component (components/profile/shared-community-posts.tsx) agree on one
 * shape. Pure.
 */
export const SHARED_PAGE = 6
/** At most this many shared communities get a section on one profile. */
export const SHARED_COMMUNITIES_MAX = 3

export interface SharedCommunity {
  id: string
  slug: string
  name: string
  logoUrl: string | null
}

export interface SharedPostView {
  id: string
  /** The post's title, else its first words. */
  title: string
  /** The rest of what it says, short. Null when the title already is all of it. */
  excerpt: string | null
  /** The space it is in, when it is in one. */
  space: string | null
  at: string
  reactions: number
  comments: number
  href: string
  /** Its first picture, when it has one. */
  imageUrl: string | null
}

export interface SharedPostsPage {
  posts: SharedPostView[]
  next: string | null
  /** How many posts of theirs the viewer may read there in all; on the first page only, null when it was not counted. */
  total?: number | null
}

/**
 * WHAT THEY GIVE TO A COMMUNITY (round 13, ask 30: "on a person's profile,
 * their contributions per community and their posts"). Real figures only:
 * the posts of theirs the viewer may read there, and their level and points
 * where the community keeps points (null otherwise, and then not drawn).
 */
export interface ContributionStats {
  posts: number | null
  level: number | null
  points: number | null
}

/** One community's section on a profile: the community, what they gave it, their first page of posts, and whether these are the viewer's own (then each post can be edited). */
export interface ContributionSection {
  community: SharedCommunity
  stats: ContributionStats
  page: SharedPostsPage
  own: boolean
}

/** "Level 3 · 84 points · 12 posts", each part only when it is known; the empty string when nothing is. */
export function contributionLine(s: ContributionStats): string {
  const parts: string[] = []
  if (s.level && s.level > 0) parts.push(`Level ${s.level}`)
  if (s.points !== null && s.points > 0) parts.push(`${s.points.toLocaleString("en-US")} ${s.points === 1 ? "point" : "points"}`)
  if (s.posts !== null) parts.push(`${s.posts.toLocaleString("en-US")} ${s.posts === 1 ? "post" : "posts"}`)
  return parts.join(" · ")
}

/** Where an own post opens for editing: the post, with the editor asked for (the post page opens its composer on ?edit=1). */
export function editHref(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}edit=1`
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/** A post row as the section draws it. */
export function sharedPostView(
  row: { id: string; title: string | null; body_text: string | null; space_id: string | null; created_at: string; reaction_count: number | null; comment_count: number | null; media?: unknown },
  community: { slug: string },
  spaceName: (id: string) => string | null,
): SharedPostView {
  const text = (row.body_text || "").replace(/\s+/g, " ").trim()
  const titled = (row.title || "").trim()
  /* A post with a title shows it and the start of its words; one without leads with its words. */
  const title = titled || clip(text, 140) || "A post"
  const excerpt = titled && text ? clip(text, 200) : null
  const media = Array.isArray(row.media) ? (row.media as Array<{ type?: string; url?: string }>) : []
  const image = media.find((m) => m && m.type === "image" && typeof m.url === "string")
  return {
    id: row.id,
    title,
    excerpt,
    space: row.space_id ? spaceName(row.space_id) : null,
    at: row.created_at,
    reactions: Math.max(0, Number(row.reaction_count) || 0),
    comments: Math.max(0, Number(row.comment_count) || 0),
    href: `/community/${community.slug}/post/${row.id}`,
    imageUrl: image?.url ?? null,
  }
}
