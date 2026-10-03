/**
 * ===========================================================================
 *  THE NOTIFICATION ENGINE'S VOCABULARY
 * ===========================================================================
 * Every other file in lib/notify reads its words from here: the events the
 * rest of Storelib raises, the notifications those can turn into, and the
 * shapes that move between the steps.
 *
 *   business action
 *     -> domain event          (emit, lib/notify/outbox.ts, or a database trigger)
 *     -> orchestrator          (lib/notify/orchestrator.ts, the workflows in lib/notify/workflows)
 *     -> jobs                  (notification_jobs, durable, run_at for the delayed ones)
 *     -> worker                (lib/notify/worker.ts: fresh state, preferences, suppression, cooldown)
 *     -> channels              (lib/notify/channels: email through EmailProvider, in app)
 *     -> deliveries            (notification_deliveries, updated by the Mailgun webhook)
 *
 * Storelib owns every decision. Mailgun only carries the email.
 */

/* ── Domain events ─────────────────────────────────────────────────────── */

export const DOMAIN_EVENTS = [
  "user.created",
  "user.email_verified",
  "user.email_changed",
  "user.password_changed",
  "store.created",
  "store.updated",
  "store.published",
  "product.created",
  "product.updated",
  "product.published",
  "product.first_published",
  "product.deleted",
  "payment_setup.started",
  "payment_setup.completed",
  "payment_setup.action_required",
  "payment_setup.failed",
  /* The weekly sweep (lib/notify/payout-weekly.ts): payments still not set up, said again once a week. */
  "payment_setup.weekly_check",
  "payout_method.added",
  "payout_method.problem",
  "payout_method.changed",
  "payout.scheduled",
  "payout.sent",
  "payout.failed",
  "payout.action_required",
  "order.created",
  "order.first_created",
  "order.refunded",
  "sale.created",
  "sale.first_created",
  "dispute.created",
  "dispute.updated",
  "dispute.closed",
  "subscription.created",
  "subscription.renewed",
  "subscription.payment_failed",
  "subscription.cancelled",
  /* A buyer's membership of a creator (lib/memberships), told to the member. */
  "membership.started",
  "membership.renewed",
  "membership.renewal_upcoming",
  "membership.payment_failed",
  "membership.canceled",
  "membership.ended",
  /* A member of a community (lib/communities/server/email.ts sendCommunityEmail), told by email. Never one per feed post. */
  "community.welcome",
  "community.announcement",
  "community.event_reminder",
  "community.invite",
  "community.course_available",
  "community.join_approved",
  "domain.connected",
  "domain.connection_failed",
  "team.invitation_created",
  "team.member_joined",
  "account.restricted",
  "account.restriction_removed",
] as const

export type DomainEventName = (typeof DOMAIN_EVENTS)[number]

/**
 * One event as it is stored in notification_events (the outbox) and handed
 * to the orchestrator. `key` is what makes raising it twice harmless: a
 * Stripe event id, an order id plus what happened to it, a trigger's row id
 * plus the transition. `payload` holds ids and small facts, never secrets,
 * card or bank numbers, or tokens.
 */
export interface DomainEvent {
  id?: string
  name: DomainEventName
  key: string
  /** The Storelib user the event is about, when there is one. */
  userId?: string | null
  creatorId?: string | null
  entityType?: EntityType | null
  entityId?: string | null
  payload: Record<string, unknown>
  occurredAt: string
  /** Traces one business action through events, jobs and deliveries. */
  correlationId?: string | null
}

export type EntityType =
  | "user"
  | "creator"
  | "store"
  | "product"
  | "order"
  | "payout"
  | "payment_setup"
  | "dispute"
  | "subscription"
  | "membership"
  | "community"
  | "domain"
  | "team"

/* ── Notifications ─────────────────────────────────────────────────────── */

export const NOTIFICATION_TYPES = [
  "WELCOME_TO_STORELIB",
  "VERIFY_EMAIL",
  "FIRST_PRODUCT_REMINDER",
  "FIRST_PRODUCT_REMINDER_2",
  "FINISH_PRODUCT_REMINDER",
  "PUBLISH_PRODUCT_REMINDER",
  "FIRST_PRODUCT_PUBLISHED",
  /* Getting started with steps still open, the same steps Home's card shows (lib/home/progress.ts). */
  "STORE_SETUP_UNFINISHED",
  "STORE_SETUP_UNFINISHED_2",
  "PAYMENT_SETUP_REMINDER",
  "PAYMENT_SETUP_REMINDER_2",
  /* Started and left unfinished, rather than never started (lib/notify/workflows/unfinished.ts). */
  "PAYOUT_SETUP_UNFINISHED",
  "PAYOUT_SETUP_UNFINISHED_2",
  "PAYOUT_SETUP_WEEKLY",
  "PAYMENT_SETUP_COMPLETED",
  "PAYMENT_VERIFICATION_REQUIRED",
  "PAYMENT_SETUP_FAILED",
  "PAYOUT_METHOD_ADDED",
  "PAYOUT_METHOD_PROBLEM",
  "PAYOUT_METHOD_CHANGED",
  "PAYOUT_SCHEDULED",
  "PAYOUT_SENT",
  "PAYOUT_FAILED",
  "PAYOUT_ACTION_REQUIRED",
  /* Stripe asked for identity or business details and is still waiting (lib/notify/workflows/unfinished.ts). */
  "VERIFICATION_REMINDER",
  "VERIFICATION_REMINDER_2",
  "PAYOUT_RESTRICTED",
  "FIRST_SALE",
  "NEW_SALE",
  "REFUND_CREATED",
  "DISPUTE_CREATED",
  "DISPUTE_ACTION_REQUIRED",
  /* How a dispute ended: won (the money went back), lost, or an inquiry the bank closed. */
  "DISPUTE_CLOSED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_PAYMENT_FAILED",
  "SUBSCRIPTION_CANCELLED",
  "DOMAIN_CONNECTED",
  "DOMAIN_CONNECTION_FAILED",
  "PASSWORD_CHANGED",
  "EMAIL_CHANGED",
  "ACCOUNT_RESTRICTED",
  "PURCHASE_CONFIRMATION",
  "DIGITAL_PRODUCT_ACCESS",
  "CUSTOMER_REFUND_PROCESSED",
  /* The buyer, a week after a purchase on Storelib, and once more a week later (lib/reviews/request-rules). */
  "REVIEW_REQUEST",
  "REVIEW_REMINDER",
  /* A buyer's membership of a creator (lib/notify/workflows/memberships.ts): the welcome, each renewal's receipt, the reminder before a renewal, a failed payment, a cancellation and its end. */
  "MEMBERSHIP_STARTED",
  "MEMBERSHIP_RENEWED",
  "MEMBERSHIP_RENEWAL_REMINDER",
  "MEMBERSHIP_PAYMENT_FAILED",
  "MEMBERSHIP_CANCELED",
  "MEMBERSHIP_ENDED",
  /* A member of a community (lib/notify/workflows/communities.ts): the welcome, an approved request, an invite, an announcement, an event reminder, a new course in the classroom. */
  "COMMUNITY_WELCOME",
  "COMMUNITY_JOIN_APPROVED",
  "COMMUNITY_INVITE",
  "COMMUNITY_ANNOUNCEMENT",
  "COMMUNITY_EVENT_REMINDER",
  "COMMUNITY_COURSE_AVAILABLE",
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export type Channel = "email" | "in_app" | "push" | "sms"
/** The channels that deliver today. Push and SMS are named so a registry entry can ask for them later. */
export const LIVE_CHANNELS: readonly Channel[] = ["email", "in_app"]

export type Priority = "info" | "normal" | "important" | "critical"

/** Who receives it. A creator template never goes to a customer, and the reverse. */
export type RecipientType = "creator" | "customer" | "team_member" | "admin"

/** The preference groups a creator sees in Settings. */
export type PreferenceCategory =
  | "sales"
  | "payouts_and_payments"
  | "product_and_store"
  | "account"
  | "security"
  | "lifecycle"
  | "tips"
  | "marketing"

/**
 * How optional it is.
 *   required_service  security, payments, receipts: always sent, no unsubscribe link
 *   optional_product  sales, milestones: on by default, can be turned off per channel
 *   marketing         tips and news: needs consent, unsubscribe link and header
 * Lifecycle nudges are optional_product in the lifecycle category, with an
 * unsubscribe link, because they are useful but nobody has to get them.
 */
export type Requirement = "required_service" | "optional_product" | "marketing"

/** The email layouts in lib/notify/templates. */
export type TemplateFamily =
  | "base"
  | "action_required"
  | "success"
  | "security"
  | "transaction"
  | "receipt"
  | "digest"
  | "lifecycle"
  | "marketing"

/**
 * A condition checked against the database immediately before a job sends,
 * never against what was true when it was scheduled. Named, so a job row can
 * carry it and lib/notify/conditions.ts can run it.
 */
export type ConditionName =
  | "no_product_yet"
  | "has_unfinished_draft"
  | "has_ready_unpublished_product"
  | "payment_setup_incomplete"
  | "payment_setup_action_required"
  /** Getting started has a step left that has a page to finish it on (lib/home/progress.ts). */
  | "store_setup_unfinished"
  /** Stripe is still asking this account for details (creators.stripe_requirements, written by the webhook). */
  | "verification_still_needed"
  | "payout_still_failed"
  | "dispute_still_open"
  | "domain_still_failing"
  /** A Storelib order, still the buyer's, not reviewed, and its address has not turned review requests off (lib/reviews/request-rules). */
  | "review_still_wanted"

export interface RegistryEntry {
  type: NotificationType
  category: PreferenceCategory
  priority: Priority
  requirement: Requirement
  recipient: RecipientType
  channels: readonly Channel[]
  /** Which layout the email uses. */
  template: TemplateFamily
  /** On unless the person turned the category (or this channel of it) off. */
  defaultOn: boolean
  /** The same type to the same person about the same thing is not sent again within this. 0 means dedupe only. */
  cooldownSeconds: number
  /** Checked right before sending; the job is skipped with CONDITION_NO_LONGER_TRUE when it fails. */
  condition?: ConditionName
  /**
   * Sent by an older, already idempotent sender (the buyer receipt, the
   * seller sale email in lib/email.tsx). The engine records the in-app half
   * and the delivery, and does not send a second email.
   */
  emailSentElsewhere?: boolean
}

/* ── Jobs and deliveries ──────────────────────────────────────────────── */

export type JobState = "pending" | "processing" | "sent" | "skipped" | "cancelled" | "failed"

export type SkipReason =
  | "CONDITION_NO_LONGER_TRUE"
  | "PREFERENCE_OFF"
  | "SUPPRESSED"
  | "COOLDOWN"
  | "DUPLICATE"
  | "EXPIRED"
  | "WORKFLOW_CANCELLED"
  | "NO_RECIPIENT"
  | "WRONG_RECIPIENT_TYPE"
  | "EMAIL_SENT_ELSEWHERE"
  /** Optional email over the daily limit (3 a day, one lifecycle nudge a day). */
  | "DAILY_CAP"

/** One job the orchestrator plans: a notification to one person, now or later. */
export interface PlannedJob {
  type: NotificationType
  recipientType: RecipientType
  /** A Storelib user for creators; for customers the email alone. */
  recipientUserId?: string | null
  recipientEmail?: string | null
  creatorId?: string | null
  entityType?: EntityType | null
  entityId?: string | null
  /** recipient + type + entity + step, unique in notification_jobs. */
  idempotencyKey: string
  /** Which step of a workflow this is ("day_1", "day_3"), for the key and for cancelling. */
  step?: string | null
  /** Onboarding, payment_setup: jobs of one workflow for one person can be cancelled together. */
  workflow?: string | null
  runAt: string
  expiresAt?: string | null
  /** Small facts the template needs: amounts as numbers, names, ids. Never secrets. */
  data: Record<string, unknown>
}

/** What a channel reports back for one attempt. */
export interface ChannelResult {
  status: "sent" | "retry" | "failed" | "unknown"
  providerMessageId?: string | null
  error?: string | null
  /** A permanent failure of the address itself (hard bounce, invalid). */
  permanent?: boolean
}

/* ── Email provider ───────────────────────────────────────────────────── */

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
  /** Storelib <notifications@...>, from configuration. */
  from?: string
  /**
   * A display name to put in front of the configured address, for an email
   * sent on a seller's behalf ("Loudlib via Storelib <notifications@...>").
   * The address itself is Storelib's verified one either way, so nothing
   * about the envelope or the signing changes.
   */
  fromName?: string
  replyTo?: string
  headers?: Record<string, string>
  tags?: string[]
  /** Carried to the webhook so a delivery can be matched: delivery_id, job_id. */
  variables?: Record<string, string>
  /** A Message-Id this delivery keeps across retries. */
  messageId?: string
}

export interface EmailProvider {
  readonly name: string
  send(email: OutgoingEmail): Promise<ChannelResult>
}

/* ── Templates ────────────────────────────────────────────────────────── */

export interface RenderedEmail {
  subject: string
  /** The line inbox apps show after the subject. */
  preview: string
  html: string
  text: string
  /**
   * The name the inbox shows instead of "Storelib": the seller's, on the
   * review request emails they are asking for. Null on every other email,
   * which comes from Storelib. The address sent from never changes.
   */
  fromName?: string | null
  /** Where a reply goes: the seller's support inbox when they have one. Null leaves Storelib's. */
  replyTo?: string | null
}

export interface TemplateContext {
  /** Canonical base URL, from lib/notify/urls.ts. */
  baseUrl: string
  recipientName?: string | null
  /** Present on optional and marketing email only. */
  unsubscribeUrl?: string | null
  preferencesUrl?: string | null
  /** When it happened, already formatted in the recipient's time zone. */
  when?: string | null
}

/** The in-app half of a notification. */
export interface InAppContent {
  title: string
  body: string
  actionUrl?: string | null
  actionLabel?: string | null
}
