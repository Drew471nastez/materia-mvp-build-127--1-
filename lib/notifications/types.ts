/**
 * ===========================================================================
 *  WHAT THE NOTIFICATION RULES ARE MADE OF
 * ===========================================================================
 * A rule looks at one creator's real data (a CreatorSnapshot) and says what
 * is true right now: a list of findings, or `undefined` when it could not
 * tell (a table missing, a read that failed, data only a webhook carries).
 * "Could not tell" is not "nothing is wrong": it neither creates a
 * notification nor resolves one.
 *
 * The planner (lib/notifications/plan.ts) turns findings into rows: once per
 * dedupe key, never over the daily limit, resolved when the finding goes
 * away. The engine (lib/notifications/engine.ts) runs it for every creator,
 * hourly and on the events that matter.
 *
 * Pure types, no imports: the panel and the tests read them too.
 */

/** How much it matters, most first. The panel orders and labels by it. */
export type Category = "critical" | "problem" | "next_step" | "opportunity" | "milestone" | "update"

export const CATEGORIES: readonly Category[] = ["critical", "problem", "next_step", "opportunity", "milestone", "update"]

/** What a rule needs read. The event paths load only the parts their rules name. */
export type SnapshotPart =
  | "creator"
  | "products"
  | "files"
  | "payouts"
  | "disputes"
  | "domains"
  | "campaigns"
  | "emailHealth"
  | "subscribers"
  | "sales"
  | "traffic"
  | "checkout"
  | "recovery"
  | "coupons"
  | "reviews"
  | "delivery"
  | "website"

export interface CreatorFacts {
  id: string
  userId: string | null
  createdAt: string | null
  stripeAccountId: string | null
  chargesEnabled: boolean | null
  payoutsEnabled: boolean | null
  detailsSubmitted: boolean | null
  /**
   * creators.stripe_onboarding_status: "connected" once Stripe has the
   * details and both switches are on, else "pending" or "not_connected".
   * Checkout asks for "connected" (app/api/checkout), so the rules do too.
   * Undefined when not read.
   */
  onboardingStatus?: string | null
  /** creators.subscription_plan_id ("free", "growth", "pro") and subscription_status ("active", "past_due"). Undefined when not read. */
  subscriptionPlan?: string | null
  subscriptionStatus?: string | null
  hasAvatar: boolean
  hasBio: boolean
  /** An IANA zone, for the dates in messages. Null writes them in UTC. */
  timeZone: string | null
}

export interface ProductFacts {
  id: string
  title: string
  status: string | null
  type: string | null
  createdAt: string | null
  /**
   * Its price, and whether the buyer names it. A product at 0 that is not
   * pay what you want is free: it is handed over without Stripe
   * (app/api/checkout/quick-free). Undefined or null when not read, which
   * counts as paid.
   */
  priceCents?: number | null
  payWhatYouWant?: boolean | null
}

export interface PayoutFacts {
  /** Stripe's po_ id. */
  id: string
  status: string
  amountCents: number
  currency: string
  createdAt: string
  failureCode: string | null
}

export interface DisputeFacts {
  /** Stripe's dp_ id. */
  id: string
  amountCents: number
  currency: string
  openedAt: string
  closed: boolean
}

export interface DomainFacts {
  id: string
  domain: string
  status: string | null
  sslStatus: string | null
  verifiedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  /**
   * Whether an HTTPS request to it completed just now. Asked only of a
   * domain whose row says it is stuck or failed: the row moves on only when
   * someone checks it again in Settings, so a certificate that came up since
   * would otherwise still read as missing. Null when not asked.
   */
  httpsOk?: boolean | null
}

export interface CampaignFacts {
  id: string
  subject: string
  status: string
  scheduledAt: string | null
  createdAt: string | null
}

export interface EmailHealth {
  /** Campaign messages that left in the last 30 days (sent, delivered, bounced, complained). */
  wentOut: number
  bounced: number
  complained: number
}

export interface SubscriberFacts {
  /** Subscribed contacts now. */
  count: number
  /** Subscribed contacts that joined before a week ago. */
  countWeekAgo: number
}

export interface SalesFacts {
  /** Payments that are sales (a basket is one), oldest first, as far as was read. */
  times: string[]
  /** The first sale's product and money, for the first sale's words. */
  first: { productTitle: string | null; amountCents: number; currency: string } | null
  /** More rows existed than were read: every threshold at or below times.length is long past. */
  truncated: boolean
}

export interface TrafficFacts {
  /** Product page views per product over the last 14 whole days (the daily rollups). */
  views14: Record<string, number>
  /** Orders per product over the same days. */
  orders14: Record<string, number>
  /** Products with an order in the last two days, which the rollups have not counted yet. */
  soldRecently: string[]
}

export interface CheckoutFacts {
  /** Checkouts that reached Pay between 25 and 1 hours ago, and how many different people. */
  starts: number
  buyers: number
  /** Orders in the same window. */
  orders: number
  /** Any sale in the 30 days before, so a new store is not told its checkout is broken. */
  soldBefore: boolean
}

export interface RecoveryFacts {
  /** Checkouts left in the last 7 days by people who agreed to emails and did not buy. */
  recoverable: number
  reminderOn: boolean
  /** A checkout reminder that exists but is not on, to open instead of making a second. */
  flowId: string | null
}

export interface CouponFacts {
  id: string
  code: string
  expiresAt: string
  usageCount: number
  usageLimit: number | null
}

export interface ReviewFacts {
  /** The earliest review of the last week, if there was one. */
  firstRecent: { id: string; at: string; rating: number; productId: string | null; productTitle: string | null } | null
  /** A review from before that week exists: the first review was long ago. */
  olderExists: boolean
}

/** A paid order whose receipt, with the buyer's download, did not go through. No address is read. */
export interface UndeliveredFacts {
  /** The order's page: its first row's id. */
  orderId: string
  createdAt: string
  productTitle: string | null
}

/** The creator's website in the builder (store_theme_installs). */
export interface WebsiteFacts {
  /** An install is published right now. */
  live: boolean
  /** An install was published and then taken down: a choice, not an unfinished step. */
  unpublished: boolean
  /** When the first draft install was made (the builder opened), or null when there is none. */
  draftSince: string | null
}

/** Stripe's own account object, from an account.updated webhook. Never stored. */
export interface StripeAccountFacts {
  chargesEnabled: boolean
  payoutsEnabled: boolean
  currentlyDue: string[]
  pastDue: string[]
  /** Unix seconds, or null. */
  currentDeadline: number | null
  disabledReason: string | null
}

/**
 * One creator, as the rules see them. Every part is `undefined` when it was
 * not read or could not be read, and each rule answers "cannot tell" then.
 */
export interface CreatorSnapshot {
  now: number
  creator?: CreatorFacts
  products?: ProductFacts[]
  /** Published products with a file a buyer can download. */
  deliverable?: string[]
  payouts?: PayoutFacts[]
  disputes?: DisputeFacts[]
  domains?: DomainFacts[]
  /** Scheduled campaigns that failed or partly failed in the last 14 days. */
  failedCampaigns?: CampaignFacts[]
  /** When the last campaign went out, or null when none has in the last 400 days (snapshot.ts SENT_WINDOW_DAYS). */
  lastCampaignSentAt?: string | null
  emailHealth?: EmailHealth
  subscribers?: SubscriberFacts
  sales?: SalesFacts
  traffic?: TrafficFacts
  checkout?: CheckoutFacts
  recovery?: RecoveryFacts
  coupons?: CouponFacts[]
  reviews?: ReviewFacts
  /** Paid orders of the last week whose receipt email failed and was not sent since. */
  undelivered?: UndeliveredFacts[]
  website?: WebsiteFacts
  stripeAccount?: StripeAccountFacts
}

/** One line of a digest: what it is and where it goes. */
export interface DigestItem {
  title: string
  href: string
}

/**
 * Something true about a creator that they should hear about. The subject
 * is what it is about (a product id, a payout id, "payouts"); with the kind
 * and the period it makes the dedupe key, so the same thing is said once.
 */
export interface Finding {
  subject: string
  /**
   * The part of the dedupe key that lets the same thing be said again later.
   * "" says it once ever (a payout that failed, a milestone). Unset means
   * the UTC day, for conditions that can come back after they are fixed.
   */
  period?: string
  title: string
  message: string
  /** Where a tap goes. Always inside /app. */
  href: string
  /** The word on the row: Payouts, Domains, Emails. */
  area: string
  /** A shorter title for a push, with no money, names or addresses in it. */
  pushTitle?: string
  /** The title said in a few words, for a line of a digest (an opportunity). */
  line?: string
  priority?: number
  productId?: string | null
  reviewId?: string | null
  /** Small facts for the panel, never an address or a message a buyer wrote. */
  data?: Record<string, string | number | boolean | null>
  /**
   * Long past already (a creator whose first sale was last year, the first
   * time the engine sees them). Recorded silently so it is never announced
   * and never looked for again.
   */
  baseline?: boolean
}

export interface Rule {
  kind: string
  category: Category
  /** 0 to 100, higher first within a category. */
  priority: number
  /** Written on each row, so a rule's words or conditions can change and old rows are known. */
  version: number
  needs: readonly SnapshotPart[]
  /** A row for the same subject blocks another for this many days after it was made. */
  cooldownDays: number
  /** A row of this kind, any subject, blocks another for this many days. */
  kindCooldownDays?: number
  /** An open row resolves on its own after this many days. */
  ttlDays: number
  /**
   * A row resolves as soon as its finding is no longer reported. True for
   * conditions (payouts paused), false for things that happened
   * (a milestone), which stay until read, dismissed or old.
   */
  resolveWhenGone: boolean
  /** Push to the creator's phone and browser. Critical and milestone kinds only. */
  push: boolean
  evaluate(s: CreatorSnapshot): Finding[] | undefined
}

/** A notification row as the engine reads it back. */
export interface ExistingRow {
  id: string
  creator_id: string
  kind: string | null
  category: string | null
  dedupe_key: string | null
  subject_id: string | null
  created_at: string
  read_at: string | null
  dismissed_at: string | null
  resolved_at: string | null
  pushed_at: string | null
  metadata: Record<string, unknown> | null
}

/** A row the planner wants written. */
export interface PlannedRow {
  kind: string
  category: Category
  priority: number
  version: number
  dedupeKey: string
  subject: string
  title: string
  message: string
  href: string
  area: string
  pushTitle: string | null
  push: boolean
  productId: string | null
  reviewId: string | null
  data: Record<string, string | number | boolean | null>
  /** Written already dismissed and resolved: a milestone long past. */
  baseline: boolean
  /** Written dismissed: one line of the digest named here. */
  foldedInto: string | null
  /** A digest's lines. */
  items: DigestItem[] | null
}

export interface Plan {
  inserts: PlannedRow[]
  /** Row ids to mark resolved. */
  resolve: string[]
  /** Findings held back by the daily limit or a gap; they are asked again next run. */
  deferred: number
}
