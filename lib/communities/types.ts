/**
 * ===========================================================================
 *  STORELIB COMMUNITIES: EVERY NAME, ONCE
 * ===========================================================================
 * The words the database allows (supabase/sql/run-now/81_communities.sql),
 * the rows as the tables hold them, and the shapes pages are handed. Pure and
 * browser safe: no server import, so a client component may read it.
 *
 * Each list below is the CHECK in the SQL, word for word, so a value the
 * TypeScript accepts is a value the database accepts.
 */
import type { CommunityAction } from "./permissions"

/* ── The words ──────────────────────────────────────────────────────────── */

export const COMMUNITY_VISIBILITIES = ["public", "private", "unlisted"] as const
export type CommunityVisibility = (typeof COMMUNITY_VISIBILITIES)[number]

export const COMMUNITY_ACCESS = ["free", "paid", "invite_only", "product", "custom"] as const
export type CommunityAccess = (typeof COMMUNITY_ACCESS)[number]

export const COMMUNITY_STATUSES = ["draft", "published", "archived", "suspended"] as const
export type CommunityStatus = (typeof COMMUNITY_STATUSES)[number]

export const ROLES = ["owner", "admin", "moderator", "member"] as const
export type Role = (typeof ROLES)[number]

export const MEMBER_STATUSES = ["pending", "active", "paused", "cancelled", "expired", "banned", "removed"] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

export const MEMBER_SOURCES = ["owner", "free", "subscription", "purchase", "product", "invite", "manual", "platform"] as const
export type MemberSource = (typeof MEMBER_SOURCES)[number]

/** Sources that billing keeps in step: access ends when the payment or the product does. */
export const PAID_SOURCES = ["subscription", "purchase", "product"] as const satisfies readonly MemberSource[]

export const NOTIFY_LEVELS = ["all", "important", "mentions", "none"] as const
export type NotifyLevel = (typeof NOTIFY_LEVELS)[number]

export const TIER_KINDS = ["free", "paid"] as const
export type TierKind = (typeof TIER_KINDS)[number]

export const TIER_BILLING = ["recurring", "one_time"] as const
export type TierBilling = (typeof TIER_BILLING)[number]

export const SPACE_KINDS = ["feed", "chat", "announcements", "resources"] as const
export type SpaceKind = (typeof SPACE_KINDS)[number]

/** Who may start a post in a space: this role or above. */
export const POST_ROLES = ["member", "moderator", "admin"] as const
export type PostRole = (typeof POST_ROLES)[number]

export const POST_KINDS = ["post", "announcement", "poll", "resource"] as const
export type PostKind = (typeof POST_KINDS)[number]

/** Posts, comments and chat messages share these three. */
export const CONTENT_STATUSES = ["published", "removed", "deleted"] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const REACTION_TARGETS = ["post", "comment", "message"] as const
export type ReactionTarget = (typeof REACTION_TARGETS)[number]

export const REPORT_TARGETS = ["post", "comment", "member", "message"] as const
export type ReportTarget = (typeof REPORT_TARGETS)[number]

export const REPORT_REASONS = ["spam", "abuse", "harassment", "off_topic", "illegal", "other"] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const AUDIT_ACTOR_KINDS = ["member", "platform", "system"] as const
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number]

export const EVENT_KINDS = ["online", "in_person", "live", "workshop", "ama", "meetup"] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const EVENT_STATUSES = ["scheduled", "cancelled"] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const RSVP_STATUSES = ["going", "waitlist", "cancelled"] as const
export type RsvpStatus = (typeof RSVP_STATUSES)[number]

export const POINT_REASONS = ["reaction_received", "course_completed", "event_attended", "admin_award", "admin_adjust"] as const
export type PointReason = (typeof POINT_REASONS)[number]

export const BADGE_KINDS = ["manual", "milestone", "course", "event", "achievement"] as const
export type BadgeKind = (typeof BADGE_KINDS)[number]

export const ACTIVITY_KINDS = ["joined", "post", "comment", "reaction", "lesson_completed", "course_completed", "rsvp", "attended", "level_up", "left"] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export const NOTIFICATION_KINDS = [
  "reaction",
  "comment",
  "reply",
  "mention",
  "announcement",
  "event",
  "event_reminder",
  "course_available",
  "level_up",
  "membership",
  "admin_message",
  "report",
  "join_request",
] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const JOB_KINDS = ["fanout_announcement", "fanout_event", "event_reminder", "recount", "rollup", "trending", "video_poll", "fanout_followers", "fanout_membership_post", "push_digest"] as const
export type JobKind = (typeof JOB_KINDS)[number]

/**
 * JOBS THAT ARE NOT ABOUT A COMMUNITY. A creator's followers hearing about a
 * new product and members of a membership hearing about a new post have
 * nothing to do with the communities switch, so the cron runs these kinds
 * whether communities are on or off (app/api/cron/community). Part 85 adds
 * both to the queue's check. A held push (push_digest, part 86) may be about
 * a creator somebody follows as well as a community: it runs either way and
 * a community's own digest ends without a push while communities are off.
 */
export const PLATFORM_JOB_KINDS = ["fanout_followers", "fanout_membership_post", "push_digest"] as const satisfies readonly JobKind[]

export const JOB_STATES = ["pending", "running", "done", "failed"] as const
export type JobState = (typeof JOB_STATES)[number]

export const VIDEO_PROVIDERS = ["storage", "mux", "cloudflare", "bunny"] as const
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number]

export const VIDEO_STATUSES = ["uploading", "processing", "ready", "failed"] as const
export type VideoStatus = (typeof VIDEO_STATUSES)[number]

/** Whether a value is one of a list's words: `isOneOf(ROLES, body.role)`. */
export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value)
}

/* ── The rows ───────────────────────────────────────────────────────────── */

export interface CommunityRule {
  title: string
  body: string
}
export interface CommunityFaq {
  q: string
  a: string
}
export interface CommunityLink {
  label: string
  url: string
}
export interface CommunityOnboarding {
  enabled?: boolean
  welcome?: string
  askIntro?: boolean
  showRules?: boolean
  /** Round AF: the welcome's own heading, intro video (a YouTube, Vimeo or Loom link), button words, and whether it opens as a popup on the first visit. */
  title?: string
  videoUrl?: string
  button?: string
  style?: "card" | "popup"
  /** "dark" is the dark look. Anything else, including missing, is white. */
  appearance?: "light" | "dark"
}

export interface CommunityRow {
  id: string
  creator_id: string | null
  owner_user_id: string | null
  slug: string
  name: string
  tagline: string | null
  description: string | null
  logo_url: string | null
  cover_url: string | null
  cover_video_id: string | null
  visibility: CommunityVisibility
  access: CommunityAccess
  status: CommunityStatus
  category: string | null
  language: string
  member_count: number
  post_count: number
  discovery_enabled: boolean
  approval_required: boolean
  default_role: "member"
  directory_enabled: boolean
  classroom_enabled: boolean
  events_enabled: boolean
  chat_enabled: boolean
  gamification_enabled: boolean
  rules: CommunityRule[]
  faq: CommunityFaq[]
  benefits: string[]
  links: CommunityLink[]
  onboarding: CommunityOnboarding
  seo_title: string | null
  seo_description: string | null
  trending_score: number
  trending_at: string | null
  platform_hidden: boolean
  suspended_at: string | null
  suspended_reason: string | null
  archived_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface TierRow {
  id: string
  community_id: string
  name: string
  description: string | null
  position: number
  kind: TierKind
  billing: TierBilling | null
  product_id: string | null
  benefits: string[]
  is_default: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface AccessProductRow {
  community_id: string
  tier_id: string
  product_id: string
  created_at: string
}

export interface MemberRow {
  id: string
  community_id: string
  user_id: string
  status: MemberStatus
  role: Role
  tier_id: string | null
  source: MemberSource
  source_membership_id: string | null
  source_product_id: string | null
  source_order_id: string | null
  invite_id: string | null
  invited_by: string | null
  request_note: string | null
  requested_at: string | null
  approved_by: string | null
  joined_at: string | null
  last_active_at: string | null
  expires_at: string | null
  points: number
  level: number
  muted_until: string | null
  ban_reason: string | null
  banned_at: string | null
  banned_by: string | null
  removed_at: string | null
  notify_level: NotifyLevel
  email_announcements: boolean
  email_events: boolean
  onboarded_at: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

/** Who may see a space, a course or an event. Read with parseAccessRule (access.ts). */
export interface AccessRuleJson {
  tierIds?: string[]
  productIds?: string[]
  minLevel?: number
  roles?: Role[]
}

export interface SpaceRow {
  id: string
  community_id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  kind: SpaceKind
  position: number
  view_access: AccessRuleJson
  post_role: PostRole
  comments_enabled: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type PostMedia =
  | { type: "image"; url: string; w?: number; h?: number }
  /**
   * `poster`: a still from the file, kept with the post's pictures (round 7). `blur` (round 33): the same still at 16px as a
   * WebP data address, made by the server from the poster (lib/communities/server/video-posters.ts) and drawn blurred under
   * it, so the card has the video's own colours in its first frame. Never taken from a browser.
   */
  | { type: "video"; videoId: string; poster?: string; w?: number; h?: number; blur?: string }
  /** `store: "community"`: a member's file in the community's own folder (lib/communities/server/post-files.ts); none is a product file (digital_assets). */
  | { type: "file"; assetId: string; name: string; size?: number; store?: "community" }
  | { type: "link"; url: string; title?: string; image?: string }
  /** A YouTube or Vimeo video by its address, played in their privacy player (lib/communities/post-media.ts). */
  | { type: "embed"; provider: "youtube" | "vimeo" | "loom"; id: string; url: string; hash?: string; thumb?: string; title?: string }
  /** A GIF from Giphy: its address and a still for the card. */
  | { type: "gif"; url: string; still: string; w?: number; h?: number; title?: string }

export interface PostRow {
  id: string
  community_id: string
  space_id: string | null
  author_id: string | null
  kind: PostKind
  title: string | null
  body: string
  body_text: string
  media: PostMedia[]
  pinned: boolean
  featured: boolean
  locked: boolean
  status: ContentStatus
  removed_by: string | null
  removed_reason: string | null
  removed_at: string | null
  edited_at: string | null
  reaction_count: number
  comment_count: number
  last_activity_at: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CommentRow {
  id: string
  post_id: string
  community_id: string
  parent_id: string | null
  author_id: string | null
  body: string
  status: ContentStatus
  reaction_count: number
  removed_by: string | null
  removed_reason: string | null
  edited_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  /** Pictures, GIFs and files under the words (round 11, run-now part 96); missing until that part has run. */
  media?: PostMedia[] | null
}

export interface ReactionRow {
  id: string
  community_id: string
  target_type: ReactionTarget
  target_id: string
  user_id: string
  kind: string
  created_at: string
}

export interface PollRow {
  id: string
  post_id: string
  community_id: string
  question: string
  multiple: boolean
  closes_at: string | null
  created_at: string
}

export interface PollOptionRow {
  id: string
  poll_id: string
  label: string
  position: number
  vote_count: number
}

export interface ReportRow {
  id: string
  community_id: string
  reporter_id: string | null
  target_type: ReportTarget
  target_id: string
  reason: ReportReason
  note: string | null
  status: ReportStatus
  assigned_to: string | null
  resolution: string | null
  resolved_by: string | null
  resolved_at: string | null
  escalated: boolean
  created_at: string
}

export interface AuditRow {
  id: number
  community_id: string | null
  actor_id: string | null
  actor_kind: AuditActorKind
  action: string
  target_type: string | null
  target_id: string | null
  target_label: string | null
  reason: string | null
  detail: Record<string, unknown>
  created_at: string
}

export interface InviteRow {
  id: string
  community_id: string
  token_hash: string
  email: string | null
  tier_id: string | null
  max_uses: number | null
  uses: number
  expires_at: string | null
  revoked_at: string | null
  created_by: string | null
  complimentary: boolean
  created_at: string
}

export interface CommunityCourseRow {
  community_id: string
  product_id: string
  position: number
  access: AccessRuleJson
  drip_days: number | null
  added_at: string
}

export interface EventRow {
  id: string
  community_id: string
  title: string
  description: string | null
  cover_url: string | null
  kind: EventKind
  starts_at: string
  ends_at: string | null
  timezone: string
  location: string | null
  meeting_url: string | null
  livestream_url: string | null
  capacity: number | null
  going_count: number
  access: AccessRuleJson
  host_id: string | null
  replay_video_id: string | null
  status: EventStatus
  reminder_24h_at: string | null
  reminder_1h_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  /* WHAT THE EVENT COSTS (run-now part 105). Absent until that part has run, and
     then still empty on every event nobody priced, which is what free means. Read
     them with EVENT_COLUMNS_PRICED and fall back to EVENT_COLUMNS, the way
     lib/communities/server/learn.ts falls back for a program's own columns. */
  price_cents?: number | null
  currency?: string | null
  sales_close_at?: string | null
  refund_window_hours?: number | null
  refund_policy?: string | null
  tickets_sold?: number | null
}

export interface RsvpRow {
  event_id: string
  user_id: string
  community_id: string
  status: RsvpStatus
  attended_at: string | null
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: string
  community_id: string
  space_id: string
  author_id: string | null
  body: string
  reply_to_id: string | null
  attachments: PostMedia[]
  status: ContentStatus
  reaction_count: number
  edited_at: string | null
  created_at: string
  deleted_at: string | null
}

export interface LevelRow {
  community_id: string
  level: number
  name: string
  min_points: number
  /** What reaching this level gives, in the creator's words. */
  reward: string | null
}

export interface PointEventRow {
  id: number
  community_id: string
  user_id: string
  points: number
  reason: PointReason
  source_key: string
  actor_id: string | null
  created_at: string
}

export interface BadgeRow {
  id: string
  community_id: string
  name: string
  description: string | null
  icon: string | null
  kind: BadgeKind
  rule: Record<string, unknown>
  created_at: string
}

export interface ActivityRow {
  id: number
  community_id: string
  user_id: string | null
  kind: ActivityKind
  target_type: string | null
  target_id: string | null
  created_at: string
}

export interface NotificationRow {
  id: string
  user_id: string
  community_id: string
  kind: NotificationKind
  actor_id: string | null
  target_type: string | null
  target_id: string | null
  title: string
  body: string | null
  url: string | null
  read_at: string | null
  dedupe_key: string | null
  created_at: string
}

export interface JobRow {
  id: number
  kind: JobKind
  payload: Record<string, unknown>
  run_at: string
  state: JobState
  attempts: number
  last_error: string | null
  lease_until: string | null
  idempotency_key: string | null
  created_at: string
  finished_at: string | null
}

export interface DailyStatsRow {
  community_id: string
  day: string
  members: number
  new_members: number
  left_members: number
  active_members: number
  posts: number
  comments: number
  reactions: number
  rsvps: number
  lessons_completed: number
}

export interface MediaVideoRow {
  id: string
  creator_id: string
  community_id: string | null
  provider: VideoProvider
  status: VideoStatus
  storage_path: string | null
  provider_asset_id: string | null
  playback_id: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  width: number | null
  height: number | null
  size_bytes: number | null
  mime: string | null
  captions_path: string | null
  error: string | null
  created_at: string
  updated_at: string
}

/* ── Column lists, so every read names what it takes ───────────────────── */

export const COMMUNITY_COLUMNS =
  "id, creator_id, owner_user_id, slug, name, tagline, description, logo_url, cover_url, cover_video_id, visibility, access, status, category, language, member_count, post_count, discovery_enabled, approval_required, default_role, directory_enabled, classroom_enabled, events_enabled, chat_enabled, gamification_enabled, rules, faq, benefits, links, onboarding, seo_title, seo_description, trending_score, trending_at, platform_hidden, suspended_at, suspended_reason, archived_at, deleted_at, created_at, updated_at"

/** The only columns a visitor's key may read (the GRANT in part 81); everything else is the server's. */
export const PUBLIC_COMMUNITY_COLUMNS =
  "id, slug, name, tagline, description, logo_url, cover_url, visibility, access, status, category, language, member_count, post_count, creator_id, created_at"

export const MEMBER_COLUMNS =
  "id, community_id, user_id, status, role, tier_id, source, source_membership_id, source_product_id, source_order_id, invite_id, invited_by, request_note, requested_at, approved_by, joined_at, last_active_at, expires_at, points, level, muted_until, ban_reason, banned_at, banned_by, removed_at, notify_level, email_announcements, email_events, onboarded_at, bio, created_at, updated_at"

export const TIER_COLUMNS = "id, community_id, name, description, position, kind, billing, product_id, benefits, is_default, archived_at, created_at, updated_at"

export const SPACE_COLUMNS = "id, community_id, slug, name, description, icon, kind, position, view_access, post_role, comments_enabled, archived_at, created_at, updated_at"

export const POST_COLUMNS =
  "id, community_id, space_id, author_id, kind, title, body, body_text, media, pinned, featured, locked, status, removed_by, removed_reason, removed_at, edited_at, reaction_count, comment_count, last_activity_at, created_at, updated_at, deleted_at"

export const COMMENT_COLUMNS =
  "id, post_id, community_id, parent_id, author_id, body, status, reaction_count, removed_by, removed_reason, edited_at, created_at, updated_at, deleted_at"

export const EVENT_COLUMNS =
  "id, community_id, title, description, cover_url, kind, starts_at, ends_at, timezone, location, meeting_url, livestream_url, capacity, going_count, access, host_id, replay_video_id, status, reminder_24h_at, reminder_1h_at, created_by, created_at, updated_at"

/** The same event with its price, for a database where run-now part 105 has run. */
export const EVENT_COLUMNS_PRICED = `${EVENT_COLUMNS}, price_cents, currency, sales_close_at, refund_window_hours, refund_policy, tickets_sold`

export const MESSAGE_COLUMNS = "id, community_id, space_id, author_id, body, reply_to_id, attachments, status, reaction_count, edited_at, created_at, deleted_at"

export const JOB_COLUMNS = "id, kind, payload, run_at, state, attempts, last_error, lease_until, idempotency_key, created_at, finished_at"

/* ── What pages are handed ──────────────────────────────────────────────── */

/** A person as a post, a comment or the members list shows them. */
export interface AuthorView {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  role: Role | null
  level: number | null
  /** They sell on Storelib, so their page is /<handle> rather than /@handle. */
  hasStorefront?: boolean
}

/** A community in a list: Explore, the library, a creator's page. */
export interface CommunityCard {
  id: string
  slug: string
  name: string
  tagline: string | null
  logoUrl: string | null
  coverUrl: string | null
  /** Round 33: where the cover sits in the card's frame (CSS object-position), or null for the middle. */
  coverPosition?: string | null
  category: string | null
  access: CommunityAccess
  visibility: CommunityVisibility
  memberCount: number
  /** "Free", "$19/month", or null when there is no price to show. */
  priceLine: string | null
  creator: { id: string | null; name: string | null; username: string | null; avatarUrl: string | null } | null
  url: string
  /** All time views, one per visitor per day (part 87). Null where it is not known: before the part has run, or a list that did not read it. */
  viewCount?: number | null
  /** The published reviews of the products that sell its tiers, averaged by their counts. Null when nobody has reviewed it. */
  rating?: { average: number; count: number } | null
  /** When it opened. Not drawn on the card (the owner took "Launched 1y ago" off); kept for the lists that sort or filter by it. */
  launchedAt?: string | null
  /** The description as plain text, cut short, for the card's sneak peek when there is no tagline. Null when there is a tagline or no description. */
  excerpt?: string | null
}

export interface PollView {
  id: string
  question: string
  multiple: boolean
  closesAt: string | null
  closed: boolean
  totalVotes: number
  options: { id: string; label: string; voteCount: number; voted: boolean }[]
}

export interface FeedPostView {
  id: string
  communityId: string
  /** Its space; `icon` and `kind` give its icon (components/community/member/space-glyph.ts spaceGlyph). */
  space: { id: string; slug: string; name: string; icon?: string | null; kind?: SpaceKind } | null
  kind: PostKind
  title: string | null
  /** Sanitized html. */
  body: string
  bodyText: string
  media: PostMedia[]
  pinned: boolean
  featured: boolean
  locked: boolean
  status: ContentStatus
  author: AuthorView | null
  reactionCount: number
  commentCount: number
  reacted: boolean
  bookmarked: boolean
  poll: PollView | null
  createdAt: string
  editedAt: string | null
  lastActivityAt: string
  canEdit: boolean
  canModerate: boolean
  /** Up to three people who commented most recently, newest first (round 7). */
  recentCommenters?: { id: string; name: string; avatarUrl: string | null }[]
  /** When the newest comment was written; null with none. */
  lastCommentAt?: string | null
  /** The community counts levels, so the author's is drawn on their picture. */
  showLevel?: boolean
}

export interface CommentView {
  id: string
  postId: string
  parentId: string | null
  /** "Deleted" when the comment was deleted but its replies are kept. */
  body: string
  status: ContentStatus
  deleted: boolean
  author: AuthorView | null
  reactionCount: number
  reacted: boolean
  createdAt: string
  editedAt: string | null
  replies: CommentView[]
  canEdit: boolean
  canModerate: boolean
  /** Pictures, GIFs and files under the words (round 11): only `image`, `gif` and the member's own `file`; none on a gone comment. */
  media?: PostMedia[]
}

export interface MemberView {
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  role: Role
  status: MemberStatus
  tierId: string | null
  tierName: string | null
  level: number
  levelName: string | null
  points: number
  bio: string | null
  joinedAt: string | null
  lastActiveAt: string | null
  /** They sell on Storelib, so their page is /<handle> rather than /@handle. */
  hasStorefront?: boolean
  /** "Lisbon, Portugal" from their profile (part 98, lib/communities/location.ts); null when they have not said. */
  location?: string | null
  /**
   * The community features them (round 34, lib/communities/featured-members.ts):
   * one quiet word beside their name, nothing ranked and nothing counted.
   * False before run-now part 223 has added the columns.
   */
  featured?: boolean
}

export interface EventView {
  id: string
  communityId: string
  title: string
  description: string | null
  coverUrl: string | null
  kind: EventKind
  startsAt: string
  endsAt: string | null
  timezone: string
  location: string | null
  /** Only for a member the event's access rule lets in; null for everyone else. */
  meetingUrl: string | null
  livestreamUrl: string | null
  capacity: number | null
  goingCount: number
  status: EventStatus
  myRsvp: RsvpStatus | null
  host: AuthorView | null
  replayVideoId: string | null
}

/** The signed in person as a community page sees them, safe to hand a client component. */
export interface ViewerView {
  userId: string | null
  signedIn: boolean
  role: Role | null
  status: MemberStatus | null
  active: boolean
  tierId: string | null
  level: number
  points: number
  isOwner: boolean
  isCreatorAccount: boolean
  mutedUntil: string | null
  /** When they joined: the post-join web push prompt (components/notifications/web-push-prompt.tsx) waits for it. */
  joinedAt?: string | null
  can: Partial<Record<CommunityAction, boolean>>
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  points: number
  level: number
}
