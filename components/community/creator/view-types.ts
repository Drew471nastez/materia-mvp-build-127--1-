/**
 * WHAT THE CREATOR'S COMMUNITY SCREENS ARE HANDED. The server reads rows
 * (lib/communities/server/{creator,tiers,invites,analytics,moderation}.ts)
 * and gives each screen one of these, so a client component never sees a
 * row it should not, and never imports server code to know a shape.
 * Emails appear only in fields the server fills for an owner or an admin.
 */
import type { CommunityAction, PermissionKey } from "@/lib/communities/permissions"
import type {
  AccessRuleJson,
  CommunityAccess,
  CommunityFaq,
  CommunityLink,
  CommunityOnboarding,
  CommunityRule,
  CommunityStatus,
  CommunityVisibility,
  EventKind,
  EventStatus,
  MemberSource,
  MemberStatus,
  NotifyLevel,
  PostKind,
  PostRole,
  ReportReason,
  ReportStatus,
  ReportTarget,
  Role,
  SpaceKind,
  TierBilling,
  TierKind,
} from "@/lib/communities/types"
import type { GalleryItem, NextStep } from "./logic"

/** The sections under a community's name, in order. */
export type SectionId = "overview" | "feed" | "spaces" | "classroom" | "events" | "members" | "moderation" | "analytics" | "gamification" | "settings"

/** The community as every section's header shows it. */
export interface CommunityHead {
  id: string
  slug: string
  name: string
  tagline: string | null
  logoUrl: string | null
  coverUrl: string | null
  status: CommunityStatus
  access: CommunityAccess
  visibility: CommunityVisibility
  memberCount: number
  postCount: number
  archived: boolean
  suspended: boolean
  gamificationEnabled: boolean
  classroomEnabled: boolean
  eventsEnabled: boolean
  /** What the signed in person may do here (lib/communities/permissions.ts). */
  role: Role
  can: Partial<Record<CommunityAction, boolean>>
  /** Open reports, for the Moderation tab's count. */
  openReports: number
}

export interface CommunityListRow {
  id: string
  slug: string
  name: string
  logoUrl: string | null
  status: CommunityStatus
  access: CommunityAccess
  visibility: CommunityVisibility
  memberCount: number
  postCount: number
  role: Role
  priceLine: string | null
  createdAt: string
  /** Round 13 cards: the cover, the line under the name, and the money when this person may see it. */
  coverUrl: string | null
  tagline: string | null
  /** Monthly recurring revenue, for a paid community and somebody allowed to see analytics; else null. */
  mrrCents: number | null
  currency: string
  archived: boolean
  /** What this person may do from the card's menu (the owner's choices for their role included). */
  can: { edit: boolean; analytics: boolean; archive: boolean; duplicate: boolean }
}

/** The Free plan's community limit as the list sees it (lib/communities/plan-limit.ts). */
export interface CommunityLimitView {
  /** Null: no limit on this plan. */
  max: number | null
  /** Communities this account owns now, archived ones included. */
  owned: number
}

export interface UpcomingEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  timezone: string
  goingCount: number
  capacity: number | null
  kind: EventKind
}

export interface OverviewFigures {
  members: number
  active30d: number
  new30d: number
  paidMembers: number
  /** Monthly recurring revenue in cents, from the linked memberships (monthlyValue). */
  mrrCents: number
  currency: string
  cancellations30d: number
  posts7d: number
  comments7d: number
  openReports: number
  pendingRequests: number
}

export interface OverviewData {
  figures: OverviewFigures
  upcoming: UpcomingEvent[]
  steps: NextStep[]
  /** Whether the community sells anything (a paid tier). Revenue figures only mean something then. */
  sells: boolean
  publicUrl: string
}

export interface TierView {
  id: string
  name: string
  description: string | null
  kind: TierKind
  billing: TierBilling | null
  isDefault: boolean
  archived: boolean
  productId: string | null
  productStatus: string | null
  monthlyCents: number | null
  yearlyCents: number | null
  priceCents: number | null
  priceLine: string
  benefits: string[]
  members: number
  /** Other products that also give this tier (community_access_products). */
  accessProducts: { id: string; title: string; type: string }[]
}

export interface PickProduct {
  id: string
  title: string
  type: string
  status: string
  cover: string | null
}

export interface SettingsData {
  description: string
  tagline: string | null
  category: string | null
  rules: CommunityRule[]
  faq: CommunityFaq[]
  benefits: string[]
  links: CommunityLink[]
  onboarding: CommunityOnboarding
  discoveryEnabled: boolean
  platformHidden: boolean
  approvalRequired: boolean
  directoryEnabled: boolean
  chatEnabled: boolean
  seoTitle: string | null
  seoDescription: string | null
  tiers: TierView[]
  products: PickProduct[]
  paymentsReady: boolean
  /** The owner's own notification choices in this community (their member row). */
  myNotify: { level: NotifyLevel; emailAnnouncements: boolean; emailEvents: boolean }
  levels: LevelView[]
  badges: BadgeView[]
  /** The pictures and videos at the top of the page (communities.gallery), in order. */
  gallery: GalleryItem[]
  /** False until the database update that adds communities.gallery has run. */
  galleryReady: boolean
  /** What the editor shows for each video in the gallery. */
  galleryVideos: Record<string, GalleryVideoView>
  /** What admins and moderators may do: the owner's only (null for anybody else). */
  roles: RolesView | null
  /** The refund policy and contact email: the owner's only (null for anybody else). */
  policies: PoliciesView | null
}

/** Settings, Roles (run-now part 100): each staff role's groups, on or off. */
export interface RolesView {
  /** False until part 100 has run: the defaults are shown and saving waits for the update. */
  ready: boolean
  admin: Record<PermissionKey, boolean>
  moderator: Record<PermissionKey, boolean>
}

/** Settings, Rules and policies (worker M's columns, run-now part 101). */
export interface PoliciesView {
  ready: boolean
  refundPolicy: string
  contactEmail: string
  contactEmailPublic: boolean
}

export interface GalleryVideoView {
  status: "uploading" | "processing" | "ready" | "failed"
  thumbnailUrl: string | null
  durationSeconds: number | null
}

export interface SpaceView {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  kind: SpaceKind
  position: number
  postRole: PostRole
  commentsEnabled: boolean
  viewAccess: AccessRuleJson
  archived: boolean
  /** Published posts in it (counted, capped at 1000), so delete is only offered when empty. */
  posts: number
}

export interface CourseView {
  productId: string
  title: string
  cover: string | null
  status: string
  position: number
  access: AccessRuleJson
  dripDays: number | null
}

export interface EventEditView {
  id: string
  title: string
  description: string
  coverUrl: string | null
  kind: EventKind
  startsAt: string
  endsAt: string | null
  timezone: string
  location: string | null
  meetingUrl: string | null
  livestreamUrl: string | null
  capacity: number | null
  goingCount: number
  access: AccessRuleJson
  replayVideoId: string | null
  status: EventStatus
}

export interface MemberRowView {
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  /** Owners and admins only. */
  email: string | null
  role: Role
  status: MemberStatus
  source: MemberSource
  tierId: string | null
  tierName: string | null
  level: number
  points: number
  joinedAt: string | null
  requestedAt: string | null
  requestNote: string | null
  lastActiveAt: string | null
  mutedUntil: string | null
  approved: boolean
}

export interface MemberPage {
  rows: MemberRowView[]
  next: string | null
  /** A search reads at most this many matches; more means "refine the search". */
  capped: boolean
}

export interface InviteView {
  id: string
  email: string | null
  maxUses: number | null
  uses: number
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  tierName: string | null
  /** Shown once, right after it is made: the raw token is never stored. */
  url?: string
}

export interface FeedRowView {
  id: string
  kind: PostKind
  title: string | null
  excerpt: string
  spaceName: string | null
  authorName: string
  pinned: boolean
  locked: boolean
  featured: boolean
  status: "published" | "removed" | "deleted"
  reactionCount: number
  commentCount: number
  createdAt: string
}

export interface ReportView {
  id: string
  targetType: ReportTarget
  targetId: string
  reason: ReportReason
  note: string | null
  status: ReportStatus
  createdAt: string
  reporterName: string | null
  /** What was reported: a post's title or opening, a comment, a message, a member's name. */
  preview: string
  /** The author of the reported content, or the reported member: `role` while they are active, `member` their row as it is (null when they never joined). */
  subject: { userId: string; name: string; role: Role | null; member?: { role: Role; status: MemberStatus; source: MemberSource; mutedUntil: string | null } | null } | null
  /** The content's own state: still up, removed, deleted, or gone. */
  targetState: "published" | "removed" | "deleted" | "missing" | "member"
  resolution: string | null
}

export interface AuditView {
  id: number
  action: string
  actorName: string | null
  actorKind: "member" | "platform" | "system"
  targetType: string | null
  targetLabel: string | null
  reason: string | null
  createdAt: string
}

export interface LevelView {
  level: number
  name: string
  minPoints: number
  reward: string | null
}

export interface BadgeView {
  id: string
  name: string
  description: string | null
  icon: string | null
  awarded: number
}

/* ── Money and growth (lib/communities/server/stats.ts) ─────────────────── */

export interface RevenueStats {
  currency: string
  mrrCents: number
  activeSubscribers: number
  newSubscribers: number
  cancellations: number
  /** Why, when the cancellations record says (worker M's part 101); otherwise empty. */
  reasons: { reason: string; count: number }[]
  latestCancellations: { reason: string; note: string | null; endsAt: string | null; createdAt: string }[]
  /** Percent, one decimal, or null when there was nobody to lose. */
  churnRate: number | null
  refunds: { count: number; totalCents: number; currency: string }
}

export interface JoinStats {
  total: number
  bySource: { source: MemberSource; count: number }[]
  invites: { id: string; label: string; uses: number; revoked: boolean }[]
}

export interface MoneyAndGrowth {
  days: number
  /** Null for a community that sells nothing. */
  revenue: RevenueStats | null
  joins: JoinStats
  active: { last7: number; last30: number }
}

export interface AnalyticsView {
  days: number
  today: string
  series: {
    members: { day: string; value: number }[]
    newMembers: { day: string; value: number }[]
    activeMembers: { day: string; value: number }[]
    posts: { day: string; value: number }[]
    comments: { day: string; value: number }[]
    reactions: { day: string; value: number }[]
  }
  totals: { newMembers: number; left: number; posts: number; comments: number; reactions: number; rsvps: number; lessons: number }
  /** Today so far, counted live; the series above ends yesterday. */
  live: { members: number; newToday: number; postsToday: number; commentsToday: number }
  /** Whether the daily rollup has written anything yet. */
  rolledUp: boolean
  topPosts: { id: string; title: string; reactions: number; comments: number }[]
  /** Revenue, joins by source and active members (round 13); absent from an older answer. */
  money?: MoneyAndGrowth
}

/** What an access rule can name in this community, for the editors. */
export interface RuleOptions {
  tiers: { id: string; name: string }[]
  levels: { level: number; name: string }[]
}
