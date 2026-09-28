/**
 * What the membership pages are drawn from: plain data the server reads
 * (lib/memberships/library.ts) and hands to the client components
 * (components/memberships). Types only, so a client component can import
 * them without pulling in anything that runs on the server.
 */
import type { StatusView } from "./state"

export interface PostImageView {
  url: string
  width?: number | null
  height?: number | null
}

export interface PostAttachmentView {
  assetId: string
  name: string
  size: number
}

export interface CreatorCard {
  id: string | null
  name: string
  avatarUrl: string | null
  handle: string | null
}

export interface MembershipCard {
  id: string
  title: string
  cover: string | null
  creator: CreatorCard
  status: string
  view: StatusView
  access: boolean
  unread: number
  lastPostAt: string | null
  billingInterval: string
  amountCents: number
  currency: string
}

export interface IncludedItem {
  id: string
  title: string
  type: string
  cover: string | null
  href: string
}

export interface FeedPost {
  id: string
  title: string
  body: string | null
  images: PostImageView[]
  attachments: PostAttachmentView[]
  links: { id: string; title: string; cover: string | null; href: string }[]
  publishedAt: string
  unread: boolean
}

export interface InvoiceItem {
  id: string
  amountCents: number
  currency: string
  status: string
  paidAt: string | null
  createdAt: string
  url: string | null
}

export interface MembershipPage {
  membership: {
    id: string
    title: string
    status: string
    view: StatusView
    access: boolean
    graceEndsAt: string | null
    billingInterval: string
    amountCents: number
    currency: string
    currentPeriodEnd: string | null
    trialEnd: string | null
    cardLast4: string | null
    cardBrand: string | null
    emailUpdates: boolean
    startedAt: string | null
  }
  product: { id: string | null; slug: string | null; description: string; cover: string | null }
  benefits: string[]
  included: IncludedItem[]
  creator: CreatorCard
  posts: FeedPost[]
  hasOlder: boolean
  invoices: InvoiceItem[]
}

/* ── The creator's screens (lib/memberships/creator.ts) ───────────────── */

export interface CreatorMembershipProduct {
  id: string
  title: string
  slug: string | null
  description: string | null
  status: string
  thumbnail_url: string | null
  created_at?: string
}

export interface PostRow {
  id: string
  title: string
  body: string
  images: { url: string; width?: number | null; height?: number | null }[]
  attachments: { assetId: string; name: string; size: number }[]
  linked_product_ids: string[]
  published_at: string
  email_status: string
  emailed_count: number
}

export interface MemberView {
  id: string
  name: string | null
  email: string
  status: string
  billing_interval: string
  amount_cents: number
  currency: string
  current_period_end: string | null
  trial_end: string | null
  past_due_since: string | null
  started_at: string | null
  created_at: string
}

export interface MembershipStats {
  members: number
  trialing: number
  pastDue: number
  cancelling: number
  monthlyCents: number
}

export interface CreatorMembershipRow {
  id: string
  title: string
  status: string
  cover: string | null
  monthlyPriceCents: number | null
  yearlyPriceCents: number | null
  stats: MembershipStats
}

export interface PickableProduct {
  id: string
  title: string
  type: string
  status: string
  cover: string | null
}

export interface CreatorMembershipScreen {
  product: CreatorMembershipProduct & { descriptionText: string }
  plan: { monthlyPriceCents: number | null; yearlyPriceCents: number | null; trialDays: number; benefits: string[]; includedProductIds: string[] }
  posts: PostRow[]
  members: MemberView[]
  stats: MembershipStats
  products: PickableProduct[]
  handle: string | null
  paymentsReady: boolean
}
