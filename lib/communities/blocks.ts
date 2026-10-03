/**
 * ===========================================================================
 *  A COMMUNITY ON A CREATOR'S OWN PAGES
 * ===========================================================================
 * What the creator page's Community section (components/store-builder/
 * community-section.tsx) and the website's Community card
 * (themes/default/sections/community_card.storelib) are handed. Built on the
 * server by lib/communities/server/blocks.ts from real rows, and only for a
 * community that is the page's creator's own, published and public, while
 * the communities switch is on. Pure and browser safe.
 *
 * WHAT A VISITOR MAY SEE. Only what the community's public page shows
 * anybody, and the previews the creator turned on:
 *   posts     only from spaces every member can read (an open access rule),
 *             never a chat, never a restricted space, words only
 *   members   avatars and first names, only when the member directory is on
 *   leaders   only when the community has points and levels on
 *   events    titles and times, only of events every member may attend
 *   reviews   published reviews of the products that sell it
 * No email, no payment detail, no meeting link, no location.
 */

export interface CommunityBlockPerson {
  name: string
  avatarUrl: string | null
}

export interface CommunityBlockData {
  id: string
  slug: string
  name: string
  tagline: string | null
  logoUrl: string | null
  coverUrl: string | null
  /** /community/<slug>, the community's own page: the sales page for a visitor. */
  url: string
  /** "Free", "$19/month", "$49", or null when there is no price to show. */
  priceLine: string | null
  /** "Join for free", "Join for $19/month", "Request to join", "See the community". */
  joinLabel: string
  memberCount: number
  postCount: number
  /** Scheduled events still to come that every member may attend. Null when events are off. */
  upcomingEventCount: number | null
  events: { id: string; title: string; startsAt: string; endsAt: string | null; timezone: string; kind: string }[]
  posts: { id: string; title: string | null; excerpt: string; author: CommunityBlockPerson | null; createdAt: string; reactionCount: number; commentCount: number }[]
  members: CommunityBlockPerson[]
  leaders: (CommunityBlockPerson & { rank: number; points: number; level: number })[]
  reviews: { average: number; count: number; items: { name: string; rating: number; content: string; createdAt: string }[] } | null
}

/** Which parts of the section the creator turned on. */
export interface CommunityBlockToggles {
  showStats: boolean
  showEvents: boolean
  showPosts: boolean
  showMembers: boolean
  showLeaderboard: boolean
  showReviews: boolean
  showJoin: boolean
}

export const DEFAULT_BLOCK_TOGGLES: CommunityBlockToggles = {
  showStats: true,
  showEvents: true,
  showPosts: true,
  showMembers: true,
  showLeaderboard: false,
  showReviews: true,
  showJoin: true,
}

export const BLOCK_LIMITS = { events: 3, posts: 3, members: 8, leaders: 5, reviews: 2, excerpt: 180 } as const

/** One of the creator's communities, as the builder's picker lists it. */
export interface CommunityChoice {
  id: string
  name: string
  slug: string
  status: string
  visibility: string
  /** Whether a visitor would see the section: published, public and not suspended. */
  shows: boolean
  /** Why not, in a few words, when it would not. */
  why: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCommunityId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

/** Why a community of the creator's would not show on their page, or null when it shows. */
export function whyHidden(c: { status: string; visibility: string; suspended_at?: string | null; deleted_at?: string | null; platform_hidden?: boolean | null }): string | null {
  if (c.deleted_at) return "Deleted"
  if (c.suspended_at || c.status === "suspended") return "Suspended"
  if (c.status === "draft") return "Not published yet"
  if (c.status === "archived") return "Archived"
  if (c.visibility !== "public") return c.visibility === "private" ? "Private" : "Unlisted"
  return null
}

/** The community ids the Community sections of a page name, once each. */
export function communityIdsIn(sections: readonly { type: string; settings?: unknown }[] | null | undefined): string[] {
  const ids = new Set<string>()
  for (const s of sections ?? []) {
    if (s?.type !== "community") continue
    const id = (s.settings as { communityId?: unknown } | undefined)?.communityId
    if (isCommunityId(id)) ids.add(id.toLowerCase())
  }
  return [...ids]
}

/** A post's words, cut at a word near the limit, for a preview. */
export function excerptOf(text: string | null | undefined, max: number = BLOCK_LIMITS.excerpt): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const at = cut.lastIndexOf(" ")
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:]+$/, "")}…`
}

/** A person as a public preview names them: the first name only. */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0]?.slice(0, 40) || "Member"
}
