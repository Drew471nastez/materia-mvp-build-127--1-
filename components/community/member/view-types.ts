/**
 * WHAT THE MEMBER SCREENS ARE HANDED, beyond the shared view types in
 * lib/communities/types.ts. Types and tiny pure helpers only, so a client
 * component and a server module can both import this file.
 */
import type { SocialLinkView } from "@/lib/communities/social-links"
import type { AuthorView, CommentView, CommunityAccess, CommunityVisibility, FeedPostView, MemberView, PostMedia, Role, SpaceKind } from "@/lib/communities/types"

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
  /** Round 33: where the cover sits in the card's frame (CSS object-position), or null for the middle. */
  coverPosition?: string | null
  memberCount: number
  postCount: number
  classroomEnabled: boolean
  eventsEnabled: boolean
  directoryEnabled: boolean
  chatEnabled: boolean
  gamificationEnabled: boolean
  archived: boolean
  /** How people get in (the invite sheet says what a shared link does): free, paid, invite only, by a product. */
  access?: CommunityAccess
  /** Who can find it: with `access` it says whether the community is private (lib/communities/access-model.ts). */
  visibility?: CommunityVisibility
  /** Joining waits for an admin's yes. */
  approvalRequired?: boolean
  /**
   * Round 26: what the community card says under the address, already resolved: the creator's short description, else
   * the tagline, else the start of the description (components/community/public/about-facts.ts cardSummary).
   */
  summary?: string | null
  /** Round 26: the website and social pages as the card's icons (lib/communities/social-links.ts). */
  links?: SocialLinkView[]
  /** Round 26: published (not a draft), for whether the card's cover offers Share. */
  published?: boolean
  /** Round 38: the Chat tab, opening this channel (the admins' main one, else the first the member may read); null without the tab. */
  chatTab?: { slug: string } | null
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
  me: {
    name: string
    avatarUrl: string | null
    profileHref: string
    /** Their @handle, under their name in the account menu. */
    username?: string | null
    /** Whether the account has seller access: the account menu starts with Dashboard rather than Start creating. */
    seller?: boolean
  } | null
  /** Communities they are an active member of, most recently visited first (this one included when they are in it). */
  communities: TopBarCommunity[]
  /** /app/community/<id> for its owner and staff with a creator account; null for everybody else. */
  manageHref: string | null
}

/* ── The wall: the columns either side of the feed (round 5) ──────────── */

/** A member's face in the stack on the community card. */
export interface WallFace {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  hasStorefront?: boolean
}

/**
 * The community card at the top of the left column: Members / Online /
 * Admins (Online and Admins null when they cannot be known, and then left
 * out), up to seven faces of the most recently active members, how many
 * more there are, and Settings for the people who run it.
 */
export interface WallCardData {
  stats: { members: number; online: number | null; admins: number | null }
  faces: WallFace[]
  /** Active members beyond the faces shown; 0 draws no "+N". */
  more: number
  /** /app/community/<id>/settings for its owner and staff with a creator account; null hides the button. */
  settingsHref: string | null
}

/** The next event the viewer may see, for the right column. */
export interface WallEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  /** RSVPs marked going, from the trigger kept count. */
  going: number
}

/**
 * Top contributors: by points over 30 days while the community counts
 * points, otherwise the members with the most posts and comments over 30
 * days (or since `since`, when the window had to be cut short to stay
 * cheap), and the card says which.
 */
export interface WallContributors {
  basis: "points" | "activity"
  /** When the activity window is shorter than 30 days, where it starts; null for the full 30 days. */
  since: string | null
  rows: { rank: number; userId: string; name: string; username: string | null; avatarUrl: string | null; hasStorefront?: boolean; value: number }[]
}

/** Everything the frame draws beside the page. Null cards are not drawn. */
export interface WallData {
  card: WallCardData
  upcoming: WallEvent | null
  contributors: WallContributors | null
}

/* ── Search inside a community ───────────────────────────────────────── */

export interface SearchSpaceHit {
  id: string
  slug: string
  name: string
  kind: SpaceKind
  /** The admin's emoji or an old word name (space-glyph.ts reads either). */
  icon?: string | null
  description: string | null
}

export interface SearchPostHit {
  id: string
  title: string | null
  /** A short piece of the text around the match. */
  snippet: string
  createdAt: string
  space: { slug: string; name: string; icon?: string | null; kind?: string } | null
  author: { name: string; avatarUrl: string | null } | null
}

export interface SearchMemberHit {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  href: string
  role: Role | null
}

/** A course or one of its lessons, in a course this member may open (round 10). */
export interface SearchLessonHit {
  id: string
  kind: "course" | "lesson"
  title: string
  /** The course's title, for a lesson. */
  course: string | null
  href: string
}

/** An event this member may see (round 10). */
export interface SearchEventHit {
  id: string
  title: string
  startsAt: string
  href: string
}

export interface SearchResults {
  q: string
  spaces: SearchSpaceHit[]
  posts: SearchPostHit[]
  members: SearchMemberHit[]
  /** Round 10: the classroom and the calendar too, when the community has them on. */
  lessons?: SearchLessonHit[]
  events?: SearchEventHit[]
}

/**
 * WHAT THE SEARCH KNOWS BEFORE ANYTHING IS TYPED (round 10): the spaces,
 * the latest posts, the members here most recently, the courses with their
 * lessons and the coming events this member may see, read once when the
 * frame is idle, so the first key already has answers (search.tsx). Posts
 * carry a longer piece of their text (`text`) to match against.
 */
export interface SearchIndex {
  at: number
  spaces: SearchSpaceHit[]
  posts: (SearchPostHit & { text: string })[]
  members: SearchMemberHit[]
  lessons: SearchLessonHit[]
  events: SearchEventHit[]
}

/** What a reply shows of the message it answers (round 37). */
export interface ChatReplyPreview {
  id: string
  authorName: string
  /** One line of its words, or what it carried ("Photo"), or "Message deleted". */
  text: string
}

/**
 * ONE MESSAGE, THE SAME SHAPE IN A CHANNEL, A CONVERSATION AND A GROUP
 * (round 37), so one chat screen (chat-surface.tsx) draws all three.
 */
export interface ChatLine {
  id: string
  authorId: string | null
  author: AuthorView | null
  mine: boolean
  body: string
  attachments: PostMedia[]
  replyTo: ChatReplyPreview | null
  /** The sender's own id for the message, so the copy it sent and the copy realtime brings are one. */
  clientId: string | null
  createdAt: string
  editedAt: string | null
  /** "event": a line about the group itself ("Ana added Ben"). */
  kind?: "message" | "event"
  reactionCount?: number
  reacted?: boolean
  canEdit: boolean
  canDelete: boolean
  canModerate: boolean
}

/** What a member is told about chat before they write (lib/communities/server/chat-settings.ts chatIntro). */
export interface ChatIntroView {
  ready: boolean
  rules: string
  rulesVersion: number
  needsRules: boolean
  dmPolicy: "everyone" | "level" | "days" | "staff" | "off"
  groupsPolicy: "members" | "staff" | "off"
  attachments: boolean
  myDms: "everyone" | "staff" | "nobody"
  restriction: { kind: "banned" } | { kind: "muted"; until: string } | null
  myName?: string | null
  /** Round 38, a channel only: its pinned message, as one line. */
  pinned?: { id: string; authorName: string; text: string } | null
  /** Round 38, a channel only: why this member cannot post here (the team only, or a level they have not reached). */
  postNote?: string | null
}

export interface ChatMessageView extends ChatLine {
  spaceId: string
  status: "published" | "removed" | "deleted"
  replyToId: string | null
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

/**
 * A person as the hover card in a community draws them
 * (GET /api/community/<id>/people/<userId>/card). Every figure is counted
 * from real rows; anything that cannot be known is null and left out.
 */
export interface PersonCardView {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  /** Their page: /<handle> for a storefront, /@handle for everybody else. */
  href: string
  /** Their Storelib bio, else the line they wrote for this community. */
  bio: string | null
  /** "Lisbon, Portugal" from their profile (round 12, part 98); null when they have not said. */
  location?: string | null
  role: Role | null
  /** Their level here, only while the community counts points. */
  level: number | null
  levelName: string | null
  /** The latest of their heartbeat and their last activity here; null when unknown. */
  activeAt: string | null
  /** Public communities they are in, and how many of those the viewer is in too; null while they hide their memberships. */
  communities: { count: number; inCommon: number } | null
  /** Public communities they own. */
  owns: number
  following: boolean
  isSelf: boolean
  /** The viewer can write to them here (chat on, both active members, messages set up). */
  canMessage: boolean
}

export interface ComposerSpace {
  id: string
  name: string
  /** Its address word, so Create post can ask for a space by it (lib/communities/client/compose-intent.ts). */
  slug?: string
  kind: SpaceKind
  /** The admin's emoji or icon word (space-glyph.ts spaceGlyph), round 13: the composer's space picker shows it. */
  icon?: string | null
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
