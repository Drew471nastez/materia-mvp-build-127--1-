/**
 * ===========================================================================
 *  EVERY NOTIFICATION, DECLARED ONCE
 * ===========================================================================
 * What each notification type is: who gets it, how much it matters, whether
 * the person can turn it off, which channels carry it, which email layout it
 * uses, how long before the same thing may be said again, and what must
 * still be true when it sends. The worker reads this and nothing else to
 * decide; the workflows only say which types an event plans.
 *
 * Three groups by requirement:
 *
 *   required_service   security, money that did not arrive, receipts. Always
 *                      sent, no unsubscribe link, only a hard bounce stops it.
 *   optional_product   sales, milestones, lifecycle nudges. On by default,
 *                      off per category and channel in Settings.
 *   marketing          nothing yet. Needs consent before the first one.
 *
 * Plain data: no secrets, no server imports, so the Settings panel can read
 * categories and labels from here too.
 */
import type { NotificationType, RegistryEntry } from "./types"

const HOUR = 3600
const DAY = 24 * HOUR

type Entry = Omit<RegistryEntry, "type">

const E = (e: Entry): Entry => e

const ENTRIES: Record<NotificationType, Entry> = {
  /* ── Onboarding and lifecycle ─────────────────────────────────────── */
  WELCOME_TO_STORELIB: E({ category: "account", priority: "normal", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "base", defaultOn: true, cooldownSeconds: 0 }),
  VERIFY_EMAIL: E({ category: "security", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email"], template: "security", defaultOn: true, cooldownSeconds: 10 * 60 }),
  FIRST_PRODUCT_REMINDER: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "lifecycle", defaultOn: true, cooldownSeconds: 20 * HOUR, condition: "no_product_yet" }),
  FIRST_PRODUCT_REMINDER_2: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["email"], template: "lifecycle", defaultOn: true, cooldownSeconds: 20 * HOUR, condition: "no_product_yet" }),
  FINISH_PRODUCT_REMINDER: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "lifecycle", defaultOn: true, cooldownSeconds: 3 * DAY, condition: "has_unfinished_draft" }),
  PUBLISH_PRODUCT_REMINDER: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "lifecycle", defaultOn: true, cooldownSeconds: 3 * DAY, condition: "has_ready_unpublished_product" }),
  FIRST_PRODUCT_PUBLISHED: E({ category: "product_and_store", priority: "normal", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "success", defaultOn: true, cooldownSeconds: 0 }),
  /* Getting started with steps left. Lifecycle: useful, and nobody has to get it. The condition reads the same steps Home's card shows, so a step finished in between ends the nudge. */
  STORE_SETUP_UNFINISHED: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "lifecycle", defaultOn: true, cooldownSeconds: 5 * DAY, condition: "store_setup_unfinished" }),
  STORE_SETUP_UNFINISHED_2: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["email"], template: "lifecycle", defaultOn: true, cooldownSeconds: 5 * DAY, condition: "store_setup_unfinished" }),

  /* ── Getting paid ─────────────────────────────────────────────────── */
  PAYMENT_SETUP_REMINDER: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "lifecycle", defaultOn: true, cooldownSeconds: 20 * HOUR, condition: "payment_setup_incomplete" }),
  PAYMENT_SETUP_REMINDER_2: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["email"], template: "lifecycle", defaultOn: true, cooldownSeconds: 20 * HOUR, condition: "payment_setup_incomplete" }),
  /* Payout setup begun and left unfinished, or a product live with no way to be paid. Lifecycle, like the two reminders above, and on the same condition, so whichever sequence is running stops the moment Stripe is connected.
     The bell already says this as a critical stop the moment a paid product goes live with no payouts (lib/notifications/rules/payments payouts_not_connected); this is the quieter line two days later, and the email. */
  PAYOUT_SETUP_UNFINISHED: E({ category: "lifecycle", priority: "normal", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "lifecycle", defaultOn: true, cooldownSeconds: 20 * HOUR, condition: "payment_setup_incomplete" }),
  /* Once a week while payments are not set up (lib/notify/payout-weekly.ts). Lifecycle, so it carries an unsubscribe link and the one a day cap. */
  PAYOUT_SETUP_WEEKLY: E({ category: "lifecycle", priority: "normal", requirement: "optional_product", recipient: "creator", channels: ["email"], template: "lifecycle", defaultOn: true, cooldownSeconds: 6 * DAY, condition: "payment_setup_incomplete" }),
  PAYOUT_SETUP_UNFINISHED_2: E({ category: "lifecycle", priority: "normal", requirement: "optional_product", recipient: "creator", channels: ["email"], template: "lifecycle", defaultOn: true, cooldownSeconds: 20 * HOUR, condition: "payment_setup_incomplete" }),
  PAYMENT_SETUP_COMPLETED: E({ category: "payouts_and_payments", priority: "normal", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "success", defaultOn: true, cooldownSeconds: HOUR }),
  PAYMENT_VERIFICATION_REQUIRED: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY }),
  PAYMENT_SETUP_FAILED: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY }),
  PAYOUT_METHOD_ADDED: E({ category: "security", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "security", defaultOn: true, cooldownSeconds: 0 }),
  PAYOUT_METHOD_CHANGED: E({ category: "security", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "security", defaultOn: true, cooldownSeconds: 0 }),
  PAYOUT_SCHEDULED: E({ category: "payouts_and_payments", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["in_app"], template: "transaction", defaultOn: true, cooldownSeconds: 0 }),
  /* Stripe could not verify the bank, or marked it errored: the same weight as a payout that bounced, and told once per bank and state. */
  PAYOUT_METHOD_PROBLEM: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY }),
  PAYOUT_SENT: E({ category: "payouts_and_payments", priority: "normal", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "transaction", defaultOn: true, cooldownSeconds: 0 }),
  PAYOUT_FAILED: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: 0, condition: "payout_still_failed" }),
  PAYOUT_ACTION_REQUIRED: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY }),
  /*
     Stripe asked for details (an identity document, a date of birth, a company number) and is still waiting. Required
     service, not lifecycle: payouts pause when this is not done, so it is not something to unsubscribe from, and it is
     not held back by the optional daily cap. The condition reads what Stripe still asks for, so the moment the account
     is cleared the rest of the sequence is skipped.
  */
  VERIFICATION_REMINDER: E({ category: "payouts_and_payments", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY, condition: "verification_still_needed" }),
  VERIFICATION_REMINDER_2: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY, condition: "verification_still_needed" }),
  PAYOUT_RESTRICTED: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY }),

  /* ── Sales ────────────────────────────────────────────────────────── */
  /* The first sale's email is the seller's sale email itself (lib/email.tsx sendSellerNotificationEmail draws FIRST_SALE
     for the creator's first paid order), so the first sale is one email with the order in it, not two. The engine keeps the bell. */
  FIRST_SALE: E({ category: "sales", priority: "important", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "success", defaultOn: true, cooldownSeconds: 0, emailSentElsewhere: true }),
  /* The seller's sale email is lib/email.tsx sendOrderEmails, once per order through email_logs. */
  NEW_SALE: E({ category: "sales", priority: "normal", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "transaction", defaultOn: true, cooldownSeconds: 0, emailSentElsewhere: true }),
  /* lib/email.tsx sendRefundEmails already emails the seller as well as the buyer. */
  REFUND_CREATED: E({ category: "sales", priority: "normal", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "transaction", defaultOn: true, cooldownSeconds: 0, emailSentElsewhere: true }),
  DISPUTE_CREATED: E({ category: "sales", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: 0 }),
  DISPUTE_ACTION_REQUIRED: E({ category: "sales", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY, condition: "dispute_still_open" }),
  DISPUTE_CLOSED: E({ category: "sales", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "base", defaultOn: true, cooldownSeconds: 0 }),

  /* ── The creator's Storelib plan ──────────────────────────────────── */
  SUBSCRIPTION_CREATED: E({ category: "account", priority: "normal", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "receipt", defaultOn: true, cooldownSeconds: 0 }),
  SUBSCRIPTION_PAYMENT_FAILED: E({ category: "account", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY }),
  SUBSCRIPTION_CANCELLED: E({ category: "account", priority: "normal", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "base", defaultOn: true, cooldownSeconds: 0 }),

  /* ── Domains ──────────────────────────────────────────────────────── */
  DOMAIN_CONNECTED: E({ category: "product_and_store", priority: "normal", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "success", defaultOn: true, cooldownSeconds: 0 }),
  DOMAIN_CONNECTION_FAILED: E({ category: "product_and_store", priority: "important", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY, condition: "domain_still_failing" }),

  /* ── Security ─────────────────────────────────────────────────────── */
  PASSWORD_CHANGED: E({ category: "security", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email"], template: "security", defaultOn: true, cooldownSeconds: 0 }),
  EMAIL_CHANGED: E({ category: "security", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email"], template: "security", defaultOn: true, cooldownSeconds: 0 }),
  ACCOUNT_RESTRICTED: E({ category: "account", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: 0 }),

  /* ── Customers ────────────────────────────────────────────────────── */
  /* The buyer's receipt with the download is lib/email.tsx sendBuyerDownloadEmail, once per order. */
  PURCHASE_CONFIRMATION: E({ category: "sales", priority: "important", requirement: "required_service", recipient: "customer", channels: ["email"], template: "receipt", defaultOn: true, cooldownSeconds: 0, emailSentElsewhere: true }),
  DIGITAL_PRODUCT_ACCESS: E({ category: "sales", priority: "important", requirement: "required_service", recipient: "customer", channels: ["email"], template: "receipt", defaultOn: true, cooldownSeconds: 0, emailSentElsewhere: true }),
  CUSTOMER_REFUND_PROCESSED: E({ category: "sales", priority: "normal", requirement: "required_service", recipient: "customer", channels: ["email"], template: "transaction", defaultOn: true, cooldownSeconds: 0, emailSentElsewhere: true }),
  /*
    Asking the buyer for a review (lib/reviews/request-rules has every rule). Optional, with an unsubscribe
    link that turns only these off; lifecycle, so an address gets at most one of them a day whatever it
    bought. Each is decided again right before it sends: review_still_wanted.
  */
  REVIEW_REQUEST: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "customer", channels: ["email"], template: "lifecycle", defaultOn: true, cooldownSeconds: 0, condition: "review_still_wanted" }),
  REVIEW_REMINDER: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "customer", channels: ["email"], template: "lifecycle", defaultOn: true, cooldownSeconds: 0, condition: "review_still_wanted" }),

  /* ── A buyer's membership of a creator ────────────────────────────── */
  /*
    Billing notices about a subscription the member pays for: required, like a receipt, so no unsubscribe link and no
    daily cap. Each is keyed by the membership and the period or invoice it is about (lib/notify/workflows/memberships.ts),
    so a webhook Stripe delivers twice, or a reminder run that comes round again, sends one. The creator's own updates to
    members are not these: those are the creator's email, with its own way out (lib/memberships/update-email.ts).
  */
  MEMBERSHIP_STARTED: E({ category: "sales", priority: "important", requirement: "required_service", recipient: "customer", channels: ["email"], template: "receipt", defaultOn: true, cooldownSeconds: 0 }),
  MEMBERSHIP_RENEWED: E({ category: "sales", priority: "normal", requirement: "required_service", recipient: "customer", channels: ["email"], template: "receipt", defaultOn: true, cooldownSeconds: 0 }),
  MEMBERSHIP_RENEWAL_REMINDER: E({ category: "sales", priority: "normal", requirement: "required_service", recipient: "customer", channels: ["email"], template: "transaction", defaultOn: true, cooldownSeconds: 0 }),
  MEMBERSHIP_PAYMENT_FAILED: E({ category: "sales", priority: "important", requirement: "required_service", recipient: "customer", channels: ["email"], template: "action_required", defaultOn: true, cooldownSeconds: 12 * HOUR }),
  MEMBERSHIP_CANCELED: E({ category: "sales", priority: "normal", requirement: "required_service", recipient: "customer", channels: ["email"], template: "transaction", defaultOn: true, cooldownSeconds: 0 }),
  MEMBERSHIP_ENDED: E({ category: "sales", priority: "normal", requirement: "required_service", recipient: "customer", channels: ["email"], template: "base", defaultOn: true, cooldownSeconds: 0 }),

  /* ── A member of a community ──────────────────────────────────────── */
  /*
    Sent through lib/communities/server/email.ts, once per key. The welcome and an approved request are about the
    person's own membership, so they are required, like a receipt. The rest are optional: they respect an unsubscribe or
    a complaint (email_suppressions) and the three optional emails a day, and the member's own switches in the community
    (email_announcements, email_events) are checked before the event is raised. A feed post never sends an email; only
    an announcement does, once.
  */
  COMMUNITY_WELCOME: E({ category: "account", priority: "normal", requirement: "required_service", recipient: "customer", channels: ["email"], template: "base", defaultOn: true, cooldownSeconds: 0 }),
  COMMUNITY_JOIN_APPROVED: E({ category: "account", priority: "normal", requirement: "required_service", recipient: "customer", channels: ["email"], template: "success", defaultOn: true, cooldownSeconds: 0 }),
  COMMUNITY_INVITE: E({ category: "product_and_store", priority: "normal", requirement: "optional_product", recipient: "customer", channels: ["email"], template: "base", defaultOn: true, cooldownSeconds: 0 }),
  COMMUNITY_ANNOUNCEMENT: E({ category: "product_and_store", priority: "normal", requirement: "optional_product", recipient: "customer", channels: ["email"], template: "base", defaultOn: true, cooldownSeconds: 0 }),
  COMMUNITY_EVENT_REMINDER: E({ category: "product_and_store", priority: "normal", requirement: "optional_product", recipient: "customer", channels: ["email"], template: "transaction", defaultOn: true, cooldownSeconds: 0 }),
  COMMUNITY_COURSE_AVAILABLE: E({ category: "product_and_store", priority: "info", requirement: "optional_product", recipient: "customer", channels: ["email"], template: "base", defaultOn: true, cooldownSeconds: 0 }),
  /*
    The day's new reports, to a moderator who runs the community from /app. Keeping a community safe is part of running
    it, so it is not counted against the three optional emails a day; it is at most one a day per community already, and
    the person can turn it off in account settings (lib/notifications/push-kinds.ts, emailOff), checked before it is raised.
  */
  COMMUNITY_REPORT_DIGEST: E({ category: "account", priority: "normal", requirement: "required_service", recipient: "creator", channels: ["email"], template: "base", defaultOn: true, cooldownSeconds: 0 }),
}

export const REGISTRY: Record<NotificationType, RegistryEntry> = Object.fromEntries(
  (Object.keys(ENTRIES) as NotificationType[]).map((type) => [type, Object.freeze({ type, ...ENTRIES[type] })]),
) as Record<NotificationType, RegistryEntry>

export function entryFor(type: NotificationType): RegistryEntry {
  const entry = REGISTRY[type]
  if (!entry) throw new Error(`No registry entry for ${String(type)}`)
  return entry
}

/** A type string from a row, checked against the registry. */
export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(REGISTRY, value)
}

/** Categories a person can turn off: everything except the required ones. */
export const OPTIONAL_EMAIL_CATEGORIES = ["lifecycle", "tips", "marketing"] as const
