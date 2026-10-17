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
  PostMedia,
  PostRole,
  ReportReason,
  ReportStatus,
  ReportTarget,
  Role,
  SpaceKind,
  TierBilling,
  TierKind,
} from "@/lib/communities/types"
import type { TicketSource, TicketStatus } from "@/lib/communities/event-tickets"
import type { PageLook } from "@/lib/communities/page-look"
import type { GalleryItem, NextStep } from "./logic"

/** The sections under a community's name, in order. */
export type SectionId = "overview" | "feed" | "spaces" | "classroom" | "events" | "members" | "moderation" | "analytics" | "gamification" | "page" | "settings"

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
  /** Round 26: its deletion is scheduled; the header's badge says Pending deletion. Absent on older callers. */
  deleting?: PendingDeletionView | null
  gamificationEnabled: boolean
  classroomEnabled: boolean
  eventsEnabled: boolean
  /** What the signed in person may do here (lib/communities/permissions.ts). */
  role: Role
  can: Partial<Record<CommunityAction, boolean>>
  /** Open reports, for the Moderation tab's count. */
  openReports: number
  /**
   * Round 31: the signed in person, for the Feed's writer (the member side's composer, which shows their picture and
   * posts as them). Optional so an older caller that never filled it still type checks; the Feed then has no writer.
   */
  me?: { userId: string; name: string; avatarUrl: string | null }
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
  /** Round 33: where the cover sits in the card (CSS object-position), or null for the middle. */
  coverPosition?: string | null
  tagline: string | null
  /** Monthly recurring revenue, for a paid community and somebody allowed to see analytics; else null. */
  mrrCents: number | null
  currency: string
  archived: boolean
  /** Round 26: its deletion is scheduled (run-now part 202): when, and whether the owner can still keep it. Null or absent: not being deleted. */
  deleting?: PendingDeletionView | null
  /** What this person may do from the card's menu (the owner's choices for their role included). */
  can: { edit: boolean; analytics: boolean; archive: boolean; duplicate: boolean }
}

/** A scheduled deletion as a card and the header show it (lib/communities/server/creator-policies.ts pendingDeletions). */
export interface PendingDeletionView {
  deleteAt: string
  /** Keep (Undo) is still possible for this person: the owner, a deletion at the end of the paid time, before its date. */
  canKeep: boolean
}

/** The Free plan's community limit as the list sees it (lib/communities/plan-limit.ts). */
export interface CommunityLimitView {
  /** Null: no limit on this plan. */
  max: number | null
  /** Communities this account owns now that take a place: archived ones included, ones being deleted not (round 26). */
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

/** One line of the overview's Recent activity (round 32, lib/communities/server/overview-activity.ts): a post, or somebody joining. */
export interface OverviewActivity {
  kind: "post" | "join"
  /** Unique across both kinds (post:<id>, join:<user id>). */
  id: string
  name: string
  avatarUrl: string | null
  /** The post's title or its first words; empty for a join. */
  text: string
  at: string
  /** The post in the community, or Members. */
  href: string
}

export interface OverviewData {
  figures: OverviewFigures
  upcoming: UpcomingEvent[]
  /** Newest first. Missing (an older page) reads as nothing yet. */
  recent?: OverviewActivity[]
  steps: NextStep[]
  /** Whether the community sells anything (a paid tier). Revenue figures only mean something then. */
  sells: boolean
  /** Scheduled events carrying a price while payouts are not connected: nobody can buy those tickets. */
  pricedEventsUnsellable?: number
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
  /** Round 33: the description as stored (sanitized HTML, or the plain text of an older row), for the Page editor. */
  descriptionHtml?: string
  /** Round 33: the cover's focus and the join button (lib/communities/page-look.ts). */
  pageLook?: PageLook
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
  /* ── Tickets (round 14, run-now part 105; all null or 0 until it runs) ── */
  priceCents: number | null
  currency: string | null
  salesCloseAt: string | null
  refundWindowHours: number | null
  /** This event's own refund policy; empty falls back to the community's. */
  refundPolicy: string | null
  ticketsSold: number
  /** What this event took, from its ticket rows. Null for an event that was never priced. */
  money: EventTicketMoney | null
}

/** The money line on an event in the creator's list, and the head of its Tickets panel. */
export interface EventTicketMoney {
  sold: number
  invited: number
  grossCents: number
  refundedCents: number
  currency: string
}

/**
 * What the Tickets card in the event editor needs to know about selling:
 * whether the database update has run, the currency every charge is made
 * in, whether payouts take payments, and the community's own refund policy
 * as the fallback for an event without one.
 */
/**
 * One holder in the Tickets panel. The same fields worker E's
 * eventTickets() answers, written here so a client screen never has to
 * import a server module for a type.
 */
export interface TicketHolderView {
  ticketId: string
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  /** Only for somebody who may see member emails. */
  email: string | null
  status: TicketStatus
  source: TicketSource
  amountCents: number | null
  currency: string | null
  paidAt: string | null
  refundedAt: string | null
  attendedAt: string | null
  invitedByName: string | null
  createdAt: string
}

/** What the Tickets panel of one event shows: the money, the seats, and a page of holders. */
export interface EventTicketPanelView {
  eventId: string
  title: string
  startsAt: string
  cancelled: boolean
  priceCents: number | null
  currency: string | null
  capacity: number | null
  ticketsSold: number
  seatsLeft: number | null
  money: EventTicketMoney
  rows: TicketHolderView[]
  nextCursor: string | null
  /** A search read as many matches as it may; more means "type more of the name". */
  capped: boolean
  /** Whether run-now part 105 has run. */
  ready: boolean
}

/** One member in the Invite free picker: already holding a ticket is said, never hidden. */
export interface InvitePickMember {
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  /** Only for somebody who may see member emails. */
  email: string | null
  hasTicket: boolean
}

export interface EventTicketSetup {
  ready: boolean
  currency: string
  canSell: boolean
  communityPolicy: string | null
}

/**
 * WHO TOOK SOMEBODY'S ACCESS AWAY, WHEN, AND WHY, for the views that are not
 * active. `byRole` is their role now, which is what the undo's rank rule
 * reads: a moderator never undoes an action taken by somebody above them
 * (lib/communities/server/moderation.ts mayUndo).
 */
export interface MemberActionTaken {
  kind: "banned" | "removed" | "suspended" | "muted"
  byUserId: string | null
  byName: string | null
  byRole: Role | null
  at: string | null
  reason: string | null
  /** When a mute ends; null for the rest. */
  until: string | null
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
  /** Only on a person who is not active, or is muted. */
  acted?: MemberActionTaken | null
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
  /* Round 31: what the post carries, so the row shows it the way the community's feed does. Optional: an older answer has none. */
  /** Its pictures, videos, GIFs, files and embeds (empty for a removed post's row as well as one with none). */
  media?: PostMedia[]
  /** Its poll, in short. */
  poll?: { question: string; votes: number; options: number; closed: boolean } | null
  spaceId?: string | null
  spaceIcon?: string | null
  spaceKind?: SpaceKind | null
  authorId?: string | null
  authorAvatar?: string | null
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

/** What the events took in a period, counted from the ticket rows (round 14). */
export interface EventMoneyStats {
  /** Tickets bought in the period. */
  sold: number
  /** Free tickets given in the period (invites and grants). */
  invited: number
  grossCents: number
  refundedCents: number
  netCents: number
  /** How many refunds went out in the period. */
  refunds: number
  /** Events that took money in the period. */
  events: number
  currency: string
}

export interface MoneyAndGrowth {
  days: number
  /** Null for a community that sells nothing. */
  revenue: RevenueStats | null
  joins: JoinStats
  active: { last7: number; last30: number }
  /** Null until run-now part 105 has run, and while no ticket was ever sold. */
  events?: EventMoneyStats | null
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
