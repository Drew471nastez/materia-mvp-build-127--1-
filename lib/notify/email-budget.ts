/**
 * ===========================================================================
 *  WHICH NOTIFICATIONS MAY BE AN EMAIL, AND HOW MANY A DAY
 * ===========================================================================
 * Email is for what matters. Everything else lands in the bell and, when the
 * person wants it, on their phone (lib/notifications/push-bridge.ts). This is
 * the one list: every notification type is here, in one of three classes,
 * and the type checker refuses a new type until it is placed.
 *
 *   essential   always an email (it still respects a hard bounce): money
 *               (payments, payouts, receipts, refunds, disputes, the
 *               Storelib plan), a membership the person pays for or just
 *               joined (welcome, approval, renewals, a cancellation, its
 *               end), and security (password, email, verification).
 *   budgeted    an email, counted against the account's daily cap
 *               (ACCOUNT_DAILY_EMAIL_CAP): a moderator's daily report
 *               summary, the weekly community digest the person asked for,
 *               an invite somebody sent to an address, and a seller's own
 *               lifecycle and store news (each also under the engine's
 *               older limits: three optional a day, one nudge a day).
 *   never       no email at all; the bell and the phone only: a community
 *               announcement, an event reminder, a new program or lesson.
 *
 * The engine (engine.ts) reads this before any email: a "never" type is
 * skipped as EMAIL_BUDGET, a budgeted one over the cap as DAILY_CAP. The
 * community workflow (workflows/communities.ts) plans no job for a "never"
 * type, so nothing waits in the queue for an email that will not go, and the
 * community jobs ask emailAllowed before they raise one.
 *
 * Pure data: no server imports, so Settings can read it too.
 */
import type { NotificationType } from "./types"

export type EmailClass = "essential" | "budgeted" | "never"

/** Budgeted emails one account (one address) gets in 24 hours. Essential ones are never counted or held. */
export const ACCOUNT_DAILY_EMAIL_CAP = 4

export const EMAIL_POLICY: Record<NotificationType, EmailClass> = {
  /* A seller's account and store */
  WELCOME_TO_STORELIB: "essential",
  VERIFY_EMAIL: "essential",
  FIRST_PRODUCT_REMINDER: "budgeted",
  FIRST_PRODUCT_REMINDER_2: "budgeted",
  FINISH_PRODUCT_REMINDER: "budgeted",
  PUBLISH_PRODUCT_REMINDER: "budgeted",
  FIRST_PRODUCT_PUBLISHED: "budgeted",
  STORE_SETUP_UNFINISHED: "budgeted",
  STORE_SETUP_UNFINISHED_2: "budgeted",
  PHYSICAL_SETUP_UNFINISHED: "budgeted",
  PHYSICAL_SETUP_UNFINISHED_2: "budgeted",
  PHYSICAL_STORE_NOT_READY: "budgeted",
  PHYSICAL_STORE_NOT_READY_2: "budgeted",
  DOMAIN_CONNECTED: "budgeted",
  DOMAIN_CONNECTION_FAILED: "budgeted",

  /* Getting paid */
  PAYMENT_SETUP_REMINDER: "budgeted",
  PAYMENT_SETUP_REMINDER_2: "budgeted",
  PAYOUT_SETUP_UNFINISHED: "budgeted",
  PAYOUT_SETUP_UNFINISHED_2: "budgeted",
  PAYOUT_SETUP_WEEKLY: "budgeted",
  PAYMENT_SETUP_COMPLETED: "essential",
  PAYMENT_VERIFICATION_REQUIRED: "essential",
  PAYMENT_SETUP_FAILED: "essential",
  PAYOUT_METHOD_ADDED: "essential",
  PAYOUT_METHOD_PROBLEM: "essential",
  PAYOUT_METHOD_CHANGED: "essential",
  PAYOUT_SCHEDULED: "essential",
  PAYOUT_SENT: "essential",
  PAYOUT_FAILED: "essential",
  PAYOUT_ACTION_REQUIRED: "essential",
  VERIFICATION_REMINDER: "essential",
  VERIFICATION_REMINDER_2: "essential",
  PAYOUT_RESTRICTED: "essential",

  /* Sales, refunds and disputes */
  FIRST_SALE: "essential",
  NEW_SALE: "essential",
  REFUND_CREATED: "essential",
  DISPUTE_CREATED: "essential",
  DISPUTE_ACTION_REQUIRED: "essential",
  DISPUTE_CLOSED: "essential",

  /* The Storelib plan */
  SUBSCRIPTION_CREATED: "essential",
  SUBSCRIPTION_PAYMENT_FAILED: "essential",
  SUBSCRIPTION_CANCELLED: "essential",

  /* Security */
  PASSWORD_CHANGED: "essential",
  EMAIL_CHANGED: "essential",
  ACCOUNT_RESTRICTED: "essential",

  /* A buyer */
  PURCHASE_CONFIRMATION: "essential",
  DIGITAL_PRODUCT_ACCESS: "essential",
  CUSTOMER_REFUND_PROCESSED: "essential",
  REVIEW_REQUEST: "budgeted",
  REVIEW_REMINDER: "budgeted",

  /* A membership somebody pays for */
  MEMBERSHIP_STARTED: "essential",
  MEMBERSHIP_RENEWED: "essential",
  MEMBERSHIP_RENEWAL_REMINDER: "essential",
  MEMBERSHIP_PAYMENT_FAILED: "essential",
  MEMBERSHIP_CANCELED: "essential",
  MEMBERSHIP_ENDED: "essential",

  /* A member of a community */
  COMMUNITY_WELCOME: "essential",
  COMMUNITY_JOIN_APPROVED: "essential",
  COMMUNITY_INVITE: "budgeted",
  COMMUNITY_ANNOUNCEMENT: "never",
  COMMUNITY_EVENT_REMINDER: "never",
  COMMUNITY_COURSE_AVAILABLE: "never",
  /* A ticket for a paid event is money: the receipt, a free invite, a refund and an event called off always go, and are never counted. */
  COMMUNITY_EVENT_TICKET: "essential",
  COMMUNITY_EVENT_TICKET_INVITE: "essential",
  COMMUNITY_EVENT_REFUND: "essential",
  COMMUNITY_EVENT_CANCELLED: "essential",
  COMMUNITY_REPORT_DIGEST: "budgeted",
  COMMUNITY_WEEKLY_DIGEST: "budgeted",
}

/** The class of a type; anything unknown is never emailed. */
export function emailClass(type: string): EmailClass {
  return Object.prototype.hasOwnProperty.call(EMAIL_POLICY, type) ? EMAIL_POLICY[type as NotificationType] : "never"
}

/** Whether this type may be an email at all. */
export function emailAllowed(type: string): boolean {
  return emailClass(type) !== "never"
}

/** The types counted against ACCOUNT_DAILY_EMAIL_CAP. */
export const BUDGETED_TYPES: readonly NotificationType[] = (Object.keys(EMAIL_POLICY) as NotificationType[]).filter((t) => EMAIL_POLICY[t] === "budgeted")

/** Whether one more budgeted email may go to an account that had `sentToday` of them in the last 24 hours. */
export function underAccountCap(type: string, sentToday: number): boolean {
  return emailClass(type) !== "budgeted" || sentToday < ACCOUNT_DAILY_EMAIL_CAP
}
