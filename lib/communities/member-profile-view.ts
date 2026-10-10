/**
 * ===========================================================================
 *  A PERSON INSIDE A COMMUNITY: WHAT THE PROFILE PLACE IS HANDED
 * ===========================================================================
 * Round 15 (R, items 20 and 21). A person's profile inside a community is a
 * place of the community shell, `/community/<slug>?profile=<handle>` (and
 * `?profile=me`), drawn with no page load. The server reads it once
 * (lib/communities/server/member-profile.ts loadMemberProfile), the same
 * loader for a server render of the address and for the shell's JSON place
 * route, and the view (components/community/member/member-profile.tsx)
 * draws exactly this shape. So this file is the contract between them:
 * types and small pure rules only, safe in a client bundle and in a test.
 *
 *   SOMEBODY ELSE   their cover, photo, name, where they are from, their
 *                   counts and Follow, a door to their full page, and their
 *                   posts IN THIS COMMUNITY that the viewer may read here,
 *                   newest first, a page at a time.
 *   ME              the same head (Edit profile instead of Follow), then MY
 *                   posts in EVERY community I am in, newest first, a page
 *                   at a time, each with its community, each with Edit and
 *                   Delete where I may; and my recent activity.
 */

import type { MemberBoard } from "./member-activity"

/** The page size of both post lists. Small enough for the first screen to come at once, big enough to fill a phone. */
export const PROFILE_POSTS_PAGE = 8
/** How many things of my recent activity are shown. */
export const PROFILE_ACTIVITY_MAX = 8
/** The most communities a person's own post list reads across (their most recently used first). */
export const PROFILE_COMMUNITIES_MAX = 100

/** "me", or a handle as typed in an address (lower case, no @), or null for anything that is neither. */
export function profileRefOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const v = raw.trim().replace(/^@/, "").toLowerCase()
  if (!v) return null
  if (v === "me") return "me"
  /* The old /members/<uuid> addresses name a person by id; a handle never looks like one. */
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return v
  return /^[a-z0-9][a-z0-9_.-]{0,39}$/.test(v) ? v : null
}

/** The community a post is in, as a row of my own posts names it. */
export interface ProfileCommunity {
  id: string
  slug: string
  name: string
  logoUrl: string | null
}

export interface ProfilePostView {
  id: string
  /** Its title, else its first words. */
  title: string
  /** The rest of what it says, short; null when the title is all of it. */
  excerpt: string | null
  /** The space it is in, when it is in one the viewer may see. */
  space: string | null
  at: string
  reactions: number
  comments: number
  /** The post's own address inside its community. */
  href: string
  /** Its first picture, when it has one. */
  imageUrl: string | null
  community: ProfileCommunity
  /** The author may change it here (their own post, in a community they may still post in). */
  canEdit: boolean
  /** The author may delete it here (their own post, in a community they are still in). */
  canDelete: boolean
}

export interface ProfilePostsPage {
  posts: ProfilePostView[]
  /** The cursor for the next page, or null at the end. */
  next: string | null
}

export type ProfileActivityKind = "joined" | "comment" | "course_completed" | "rsvp" | "level_up"

export interface ProfileActivityView {
  id: string
  kind: ProfileActivityKind
  at: string
  community: ProfileCommunity
  /** What it was about, when it has a name the viewer may see: a post's title, an event's. */
  title: string | null
  /** Where it opens, when it has a place. */
  href: string | null
  /** Level reached, for level_up. */
  level: number | null
}

export interface ProfilePerson {
  userId: string
  username: string | null
  name: string
  avatarUrl: string | null
  /** The cover's own address (no crop), already sized for the band; null when they have none. */
  coverUrl: string | null
  /** Where the picture sits in the band: object-position as percentages, and its zoom. */
  coverCrop: { x: number; y: number; zoom: number }
  bio: string | null
  /** "Lisbon, Portugal"; null when they never said. */
  location: string | null
  /** Their role here, when it is more than a member. */
  role: "owner" | "admin" | "moderator" | null
  level: number | null
  /** When they joined this community. */
  joinedAt: string | null
  followers: number
  following: number
  /** Their full page: the creator page for a live store, /@handle otherwise; null when they have no handle yet. */
  pageHref: string | null
  hasStorefront: boolean
}

export interface MemberProfileData {
  /** Whose profile: the viewer's own, or somebody else's. */
  self: boolean
  person: ProfilePerson
  /** Whether the viewer follows them (always false for the viewer's own). */
  viewerFollowing: boolean
  /** "community": their posts here; "all": my posts in every community I am in. */
  scope: "community" | "all"
  posts: ProfilePostsPage
  /** My recent activity, on my own profile only. */
  activity: ProfileActivityView[] | null
  /** Somebody else's activity board here (round 18): the day grid, level and points, and the facts. Absent on my own. */
  board?: MemberBoard | null
  /** The server's clock for the first render, so times read the same after hydration. */
  now: number
}

/**
 * WHO MAY EDIT OR DELETE ONE OF MY POSTS, FROM MY PROFILE. The same rules the
 * post routes keep (app/api/community/[communityId]/posts/[postId]): PATCH
 * passes requireMember "post" and then updatePost's author check, DELETE
 * passes requireMember "view" and deletePost's author check. So:
 *   delete  my own post, in a community where I am still an active member,
 *           not banned (requireMember's 403s), and the community open
 *   edit    all of that, and not muted right now, and the community not
 *           archived (both refuse "post")
 * Pure, so the list, the route and the test agree.
 */
export function ownPostRights(input: {
  authorId: string | null
  viewerId: string | null
  member: { status: string | null; banned_at?: string | null; muted_until?: string | null } | null
  community: { status?: string | null; archived_at?: string | null; suspended_at?: string | null; deleted_at?: string | null }
  now?: number
}): { canEdit: boolean; canDelete: boolean } {
  const { authorId, viewerId, member, community } = input
  const now = input.now ?? Date.now()
  const mine = !!viewerId && !!authorId && authorId === viewerId
  const open = !community.deleted_at && !community.suspended_at && community.status !== "suspended"
  const inIt = !!member && member.status === "active" && !member.banned_at
  const canDelete = mine && open && inIt
  const muted = !!member?.muted_until && Date.parse(member.muted_until) > now
  const archived = community.status === "archived" || !!community.archived_at
  return { canEdit: canDelete && !muted && !archived, canDelete }
}

/** Where a post opens with its editor (the post page opens its composer on ?edit=1). */
export function postEditHref(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}edit=1`
}

/** A person's full page from inside a community: it carries the way back to this very place (lib/profile/back communityBackTarget reads it). */
export function fullPageHref(pageHref: string, slug: string, profileRef: string): string {
  const back = `/community/${slug}?profile=${encodeURIComponent(profileRef)}`
  return `${pageHref}?${new URLSearchParams({ from: "community", back })}`
}

/** "Commented on", "Joined", ... : the verb of an activity line. */
export function activityVerb(kind: ProfileActivityKind, level: number | null = null): string {
  switch (kind) {
    case "joined":
      return "Joined"
    case "comment":
      return "Commented on"
    case "course_completed":
      return "Finished a course in"
    case "rsvp":
      return "Going to"
    case "level_up":
      return level ? `Reached level ${level} in` : "Levelled up in"
  }
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/** A post row as a profile list draws it. Pure. */
export function profilePostView(
  row: { id: string; title: string | null; body_text: string | null; space_id: string | null; created_at: string; reaction_count: number | null; comment_count: number | null; media?: unknown },
  community: ProfileCommunity,
  spaceName: (id: string) => string | null,
  rights: { canEdit: boolean; canDelete: boolean },
): ProfilePostView {
  const text = (row.body_text || "").replace(/\s+/g, " ").trim()
  const titled = (row.title || "").trim()
  const title = titled || clip(text, 140) || "A post"
  const excerpt = titled && text ? clip(text, 180) : null
  const media = Array.isArray(row.media) ? (row.media as Array<{ type?: string; url?: string; still?: string }>) : []
  const image = media.find((m) => m && ((m.type === "image" && typeof m.url === "string") || (m.type === "gif" && typeof m.still === "string")))
  return {
    id: row.id,
    title,
    excerpt,
    space: row.space_id ? spaceName(row.space_id) : null,
    at: row.created_at,
    reactions: Math.max(0, Number(row.reaction_count) || 0),
    comments: Math.max(0, Number(row.comment_count) || 0),
    href: `/community/${community.slug}/post/${row.id}`,
    imageUrl: image ? (image.type === "gif" ? (image.still ?? null) : (image.url ?? null)) : null,
    community,
    canEdit: rights.canEdit,
    canDelete: rights.canDelete,
  }
}
