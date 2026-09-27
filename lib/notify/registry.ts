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

  /* ── Getting paid ─────────────────────────────────────────────────── */
  PAYMENT_SETUP_REMINDER: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "lifecycle", defaultOn: true, cooldownSeconds: 20 * HOUR, condition: "payment_setup_incomplete" }),
  PAYMENT_SETUP_REMINDER_2: E({ category: "lifecycle", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["email"], template: "lifecycle", defaultOn: true, cooldownSeconds: 20 * HOUR, condition: "payment_setup_incomplete" }),
  PAYMENT_SETUP_COMPLETED: E({ category: "payouts_and_payments", priority: "normal", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "success", defaultOn: true, cooldownSeconds: HOUR }),
  PAYMENT_VERIFICATION_REQUIRED: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY }),
  PAYMENT_SETUP_FAILED: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY }),
  PAYOUT_METHOD_ADDED: E({ category: "security", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "security", defaultOn: true, cooldownSeconds: 0 }),
  PAYOUT_METHOD_CHANGED: E({ category: "security", priority: "important", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "security", defaultOn: true, cooldownSeconds: 0 }),
  PAYOUT_SCHEDULED: E({ category: "payouts_and_payments", priority: "info", requirement: "optional_product", recipient: "creator", channels: ["in_app"], template: "transaction", defaultOn: true, cooldownSeconds: 0 }),
  PAYOUT_SENT: E({ category: "payouts_and_payments", priority: "normal", requirement: "optional_product", recipient: "creator", channels: ["email", "in_app"], template: "transaction", defaultOn: true, cooldownSeconds: 0 }),
  PAYOUT_FAILED: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: 0, condition: "payout_still_failed" }),
  PAYOUT_ACTION_REQUIRED: E({ category: "payouts_and_payments", priority: "critical", requirement: "required_service", recipient: "creator", channels: ["email", "in_app"], template: "action_required", defaultOn: true, cooldownSeconds: DAY }),
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
