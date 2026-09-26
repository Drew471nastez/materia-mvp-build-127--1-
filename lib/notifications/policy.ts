/**
 * ===========================================================================
 *  HOW OFTEN STORELIB MAY SPEAK, AND HOW LOUDLY
 * ===========================================================================
 * "Not spammy at all, only what's actually important." These numbers are the
 * whole of that promise, in one place, so they can be read and changed
 * without reading the engine. tests/notification-rules.test.ts holds them.
 *
 *   A DAY      At most DAILY_LIMIT new notifications a creator can see in
 *              any 24 hours, critical ones apart: a payout that failed is
 *              never held back behind a coupon. What does not fit waits for
 *              the next run and is asked again, still true or not.
 *
 *   ONE THING  At most one open next step at a time (the Home page lists
 *              the rest), one opportunity every OPPORTUNITY_GAP_DAYS, one
 *              update a day.
 *
 *   A DIGEST   Two or more opportunities ready in the same run become one
 *              notification with a line each (up to DIGEST_ITEMS), not three.
 *
 *   PUSH       Critical and milestone kinds only, once per row, to the
 *              devices and browsers the creator turned notifications on for.
 *              The push says what happened in a few words and nothing else:
 *              no amounts, no names, no addresses, no buyer's words.
 *
 *   EMAIL      The engine sends none. The events that deserve an email
 *              are emailed by the notification engine in lib/notify, from
 *              the events the Stripe webhook raises (EMAILED_ELSEWHERE),
 *              and a second copy from here would be the spam this is meant
 *              to prevent.
 */
import type { Category } from "./types"

/** New notifications a creator can see in any 24 hours, critical ones not counted. */
export const DAILY_LIMIT = 3

/** Days between opportunities (one alone, or a digest of several). */
export const OPPORTUNITY_GAP_DAYS = 3

/** Opportunities ready in one run that become a digest instead. */
export const DIGEST_MIN = 2

/** Lines in a digest. */
export const DIGEST_ITEMS = 3

/** Days between next steps. */
export const NEXT_STEP_GAP_DAYS = 2

/** Days between updates about Storelib itself. */
export const UPDATE_GAP_DAYS = 1

/** Rows the engine read back for a creator: the open ones, and everything this recent. */
export const HISTORY_DAYS = 60

/** Which categories may push. */
export const PUSH_CATEGORIES: readonly Category[] = ["critical", "milestone"]

/**
 * The order within the daily limit, and the panel's order: critical first,
 * then problems, then the next step, then everything else by time.
 */
export const CATEGORY_RANK: Record<Category, number> = {
  critical: 0,
  problem: 1,
  next_step: 2,
  milestone: 3,
  opportunity: 3,
  update: 3,
}

/** Who goes first when the daily limit is short. */
export const LIMIT_ORDER: readonly Category[] = ["problem", "milestone", "next_step", "opportunity", "update"]

/**
 * The kinds whose news already goes by email, and which email. The engine
 * relies on these and sends nothing itself.
 */
export const EMAILED_ELSEWHERE: Record<string, string> = {
  stripe_restricted: "PAYOUT_ACTION_REQUIRED, lib/notify (payout.action_required from account.updated, when payouts go off)",
  stripe_requirements_due: "PAYOUT_ACTION_REQUIRED, lib/notify (payout.action_required from account.updated)",
  payout_failed: "PAYOUT_FAILED, lib/notify (payout.failed)",
  dispute_opened: "DISPUTE_CREATED, lib/notify (dispute.created)",
  sales_milestone: "FIRST_SALE, lib/notify (sale.first_created, the first sale only)",
}

export const DAY_MS = 86_400_000
export const HOUR_MS = 3_600_000
