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
