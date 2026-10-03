/**
 * WHAT THE MEMBER SCREENS ARE HANDED, beyond the shared view types in
 * lib/communities/types.ts. Types and tiny pure helpers only, so a client
 * component and a server module can both import this file.
 */
import type { AuthorView, CommentView, FeedPostView, MemberView, PostMedia, Role, SpaceKind } from "@/lib/communities/types"

export type { AuthorView, CommentView, FeedPostView, MemberView }

/** "home", "classroom", ..., or "space:<slug>". */
export type ShellSection = "home" | "classroom" | "events" | "members" | "leaderboard" | "saved" | "notifications" | "about" | `space:${string}`

/** A space as the shell and the composer list it. Only spaces the viewer may see are ever handed over. */
export interface SpaceView {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  kind: SpaceKind
  /** Whether this viewer may start a post (or a message) here. */
  canPost: boolean
  commentsEnabled: boolean
  /** Unread chat messages, for a chat space; 0 otherwise. */
  unread: number
}

/** The community as the member shell draws it. Never the private columns. */
export interface ShellCommunity {
  id: string
  slug: string
  name: string
  tagline: string | null
  logoUrl: string | null
  coverUrl: string | null
  memberCount: number
  postCount: number
  classroomEnabled: boolean
  eventsEnabled: boolean
  directoryEnabled: boolean
  chatEnabled: boolean
  gamificationEnabled: boolean
  archived: boolean
}

/** A community as the top bar and its switcher draw it. */
export interface TopBarCommunity {
  id: string
  slug: string
  name: string
  logoUrl: string | null
}

/**
 * The community's own top bar, for everyone on a community's pages: whose it
 * is, who is looking, and the other communities they are in. Built on the
 * server (lib/communities/server/public.ts topBarData).
 */
export interface TopBarData {
  community: TopBarCommunity
  /** "By <name>", opening their page; null when the community has no creator on record. */
  creator: { name: string; href: string | null } | null
  /** The signed in person, or null for a visitor. */
  me: { name: string; avatarUrl: string | null; profileHref: string } | null
  /** Communities they are an active member of, most recently visited first (this one included when they are in it). */
  communities: TopBarCommunity[]
  /** /app/community/<id> for its owner and staff with a creator account; null for everybody else. */
  manageHref: string | null
}

export interface ChatMessageView {
  id: string
  spaceId: string
  body: string
  status: "published" | "removed" | "deleted"
  author: AuthorView | null
  replyToId: string | null
  createdAt: string
  editedAt: string | null
  canEdit: boolean
  canModerate: boolean
}

export interface NotificationView {
  id: string
  kind: string
  title: string
  body: string | null
  url: string | null
  read: boolean
  createdAt: string
  actor: { name: string; avatarUrl: string | null } | null
}

export interface LinkPreview {
  url: string
  title: string | null
  image: string | null
  site: string | null
}

export interface LeaderboardRow {
  rank: number
  userId: string
  points: number
  level: number
  levelName: string | null
  name: string
  username: string | null
  avatarUrl: string | null
  /** They sell on Storelib, so their page is /<handle> rather than /@handle. */
  hasStorefront?: boolean
}

export interface ProfileActivity {
  id: string
  kind: "post"
  title: string
  url: string
  createdAt: string
}

export interface MemberProfileView extends MemberView {
  badges: { id: string; name: string; icon: string | null; description: string | null }[]
  posts: number
  recent: ProfileActivity[]
  /** The person's Storelib page, when they sell on Storelib. */
  creatorUrl: string | null
  isSelf: boolean
}

export interface ComposerSpace {
  id: string
  name: string
  kind: SpaceKind
}

/** What a client may send as a post's media. */
export type MediaInput = PostMedia

/** "owner" reads as "Owner": the small role tag beside a name. Members get none. */
export function roleTag(role: Role | null | undefined): string | null {
  if (role === "owner") return "Owner"
  if (role === "admin") return "Admin"
  if (role === "moderator") return "Moderator"
  return null
}
