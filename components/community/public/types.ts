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
import type { CommunityAccess, CommunityVisibility, CommunityStatus, MemberStatus, Role, TierBilling, TierKind } from "@/lib/communities/types"

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
}

export interface PublicCreatorView {
  name: string
  username: string | null
  avatarUrl: string | null
  /** Their Storelib page, or null when they have no handle. */
  href: string | null
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

/** What /community/[slug] and /about need to draw the sales page. */
export interface SalesPageData {
  community: PublicCommunityView
  join: JoinStateView
  /** A draft or suspended community seen by its owner: one line saying so. */
  notice: string | null
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
}
