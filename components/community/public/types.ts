/**
 * ===========================================================================
 *  WHAT A COMMUNITY'S PUBLIC PAGE IS HANDED
 * ===========================================================================
 * The shapes lib/communities/server/public.ts builds on the server and the
 * public components draw: the sales page, its join card, the cards on
 * Explore, a creator's page and the library. Pure and browser safe, so a
 * client component and the probe can both import them.
 *
 * Nothing here is a number the page makes up: member counts are the
 * trigger kept member_count, prices come from the products that sell a tier,
 * and reviews are published reviews of those products.
 */
import type { CommunityAccess, CommunityCard, CommunityVisibility, CommunityStatus, MemberStatus, Role, TierBilling, TierKind } from "@/lib/communities/types"
import type { GalleryItemView } from "./gallery"
import type { SocialLinkView } from "@/lib/communities/social-links"
import type { JoinLookView } from "@/lib/communities/page-look"

export type { GalleryItemView }

/** One way to belong, as the page offers it. */
export interface JoinOption {
  tierId: string | null
  name: string
  description: string | null
  kind: TierKind
  billing: TierBilling | null
  /** The product that sells it (a membership or a community product), or null for a free tier. */
  productId: string | null
  monthlyCents: number | null
  yearlyCents: number | null
  /** A one time tier's price. */
  priceCents: number | null
  currency: string
  /** "Free", "$19/month", "$49", or "" while a paid tier has no price. */
  priceLine: string
  benefits: string[]
  /** A recurring plan's free trial in days (0 for none); a returning member is not given it again (app/api/memberships/checkout). */
  trialDays?: number
  /** Checkout addresses, built on the server; null when this tier cannot be bought right now. */
  checkout: { month: string | null; year: string | null; once: string | null } | null
}

/** A product whose owners get in (access "product"): bought on its own page. */
export interface AccessProductLink {
  productId: string
  title: string
  href: string
  priceLine: string
}

export interface PublicReviewView {
  id: string
  rating: number
  content: string
  name: string
  avatarUrl: string | null
  createdAt: string
  /** The reviewer's page (their storefront or their profile), or null with no username. */
  href: string | null
  /** "3 months" in "Still a paying member after 3 months"; null unless it is true today. */
  payingFor: string | null
}

export interface PublicCreatorView {
  name: string
  username: string | null
  avatarUrl: string | null
  /** Their page: /<handle> with a storefront, /@handle otherwise; null when they have no handle. */
  href: string | null
}

/** The three figures on the card. Online and admins are null when they cannot be known, and are then not drawn. */
export interface CommunityStatsView {
  members: number
  online: number | null
  admins: number | null
}

export interface PublicCommunityView {
  id: string
  slug: string
  name: string
  tagline: string | null
  logoUrl: string | null
  coverUrl: string | null
  category: string | null
  visibility: CommunityVisibility
  access: CommunityAccess
  status: CommunityStatus
  approvalRequired: boolean
  memberCount: number
  /** Sanitized html, or null when the description is plain text (then descriptionText). */
  descriptionHtml: string | null
  descriptionText: string | null
  benefits: string[]
  rules: { title: string; body: string }[]
  faq: { q: string; a: string }[]
  creator: PublicCreatorView | null
  /** Every way to join, in the creator's order. */
  options: JoinOption[]
  accessProducts: AccessProductLink[]
  reviews: { average: number; total: number; items: PublicReviewView[] } | null
  /** /community/<slug> */
  url: string
  /** "storelib.com/community/<slug>", as the card prints it. */
  address: string
  /** The pictures and videos the creator chose; the cover alone before part 85 or when none were chosen. */
  gallery: GalleryItemView[]
  stats: CommunityStatsView
  /** Round 33: the website and social pages, each with its network (lib/communities/social-links.ts), drawn as icons. */
  links?: SocialLinkView[]
  /** Round 33: where the cover sits in a frame that crops it (CSS object-position), or null for the middle. */
  coverPosition?: string | null
  /** Round 33: the join button's own words, style and line (lib/communities/page-look.ts), or null for the page's own. */
  joinLook?: JoinLookView | null
  /**
   * Round 26: the short description (communities.summary, part 220), plain text up to 160 characters, or null when the
   * creator wrote none: the card then says the tagline, else the start of the description (about-facts.ts cardSummary).
   */
  summary?: string | null
  /** Round 26: the active owner and admins, counted (stats.admins); 0 when it cannot be known. Drawn in the info card. */
  adminCount?: number
}

/**
 * What the one button does for this person:
 *
 *   open         an active member: Open community
 *   join_free    a free tier, no approval: joins on the press
 *   request      approval required: sends a request (a note is optional)
 *   pending      the request is waiting for an admin
 *   checkout     a paid tier: to checkout (approved first when approval is required)
 *   product      access comes with owning a product: to that product
 *   invite_only  nothing to press: an invite link is the way in
 *   banned       banned or removed: a plain sentence, no button
 *   closed       archived, suspended or a draft
 *   unavailable  a paid tier with no price yet, or a creator who cannot take payments
 */
export type JoinKind = "open" | "join_free" | "request" | "pending" | "checkout" | "product" | "invite_only" | "banned" | "closed" | "unavailable"

export interface JoinStateView {
  kind: JoinKind
  signedIn: boolean
  /** The button's words, or the sentence when there is no button. */
  label: string
  /** The tier the button is for. */
  option: JoinOption | null
  /**
   * Round AF: the plans to choose from when there is more than one this person could take (free, or on sale with a
   * price); the press opens the plan picker instead of joining or paying. Empty with one plan or none.
   */
  plans?: JoinOption[]
  /** Where the button goes when it is a link (open, product, a signed out visitor to sign in). */
  href: string | null
  /** A short line under the button: "Request sent. You'll get access once it's approved." */
  note: string | null
  isOwner: boolean
  /** Shown to an active member who is not the owner. */
  canLeave: boolean
  /** A member who pays by subscription manages it here (leaving is cancelling there). */
  manageHref: string | null
  /** The viewer's role while active, for the "You're an admin" line. */
  role: Role | null
  status: MemberStatus | null
}

/**
 * What else the About page says (round 10, lib/communities/server/about.ts),
 * every figure counted from real rows and left out when it is not above zero.
 */
export interface AboutExtras {
  activity: {
    /** Posts published in the last 30 days, or null for none (or unknown). */
    posts30: number | null
    /** Members active in the last 7 days (round 11: "active this week"), or null for none (or unknown). */
    active7: number | null
    /** When the community was made. */
    since: string | null
  }
  /** The classroom's published courses, the first few, and how many in all; null without any. */
  classroom: { total: number; courses: { productId: string; title: string; coverUrl: string | null; lessons: number }[] } | null
  /** The creator's own line (their profile's bio), for the creator card. */
  creatorBio: string | null
  /** Round 33: the members here most recently, a picture and a name each, for the overlapping faces by the member count. */
  faces?: { id: string; name: string; avatarUrl: string | null }[]
}

/** What /community/[slug] and /about need to draw the sales page. */
export interface SalesPageData {
  community: PublicCommunityView
  join: JoinStateView
  /** A draft or suspended community seen by its owner: one line saying so. */
  notice: string | null
  /** The About page's extra facts (round 10); left out, those parts are not drawn. */
  extras?: AboutExtras | null
  /** Leaving asks why (round 12): true once part 98 has made community_leave_reasons, for a member who can leave. */
  askWhy?: boolean
  /** Round AG: the owner's preview of the page and its plans as a visitor sees them. Nothing in it charges or joins. */
  preview?: boolean
}

/** A row in /library/communities. */
export interface LibraryCommunityRow {
  id: string
  slug: string
  name: string
  logoUrl: string | null
  coverUrl: string | null
  creatorName: string | null
  status: "active" | "pending"
  role: Role
  tierName: string | null
  memberCount: number
  url: string
  /** The community as every list draws it (components/explore/community-card.tsx): the same stats row as Explore. */
  card: CommunityCard
}
