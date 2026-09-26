/**
 * Every rule, in the order they are asked. Adding one: a file beside these,
 * a line here, and a case in tests/notification-rules.test.ts that shows it
 * firing, deduping and resolving on fixture data.
 */
import type { Rule } from "../types"
import { domainHttps, domainNotConnected } from "./domains"
import { campaignFailed, checkoutReminderOff, emailBounceRate, subscribersNotEmailed } from "./email"
import { firstReview, salesMilestone, subscribersMilestone } from "./milestones"
import { disputeOpened, payoutFailed, payoutsNotConnected, proPaymentFailed, stripeRequirementsDue, stripeRestricted } from "./payments"
import { checkoutNotCompleting, couponExpiring, productMissingFile, productViewsNoSales, receiptNotDelivered } from "./products"
import { setupNextStep, websiteNotPublished } from "./setup"
import { featureLaunch } from "./updates"

export const RULES: readonly Rule[] = [
  /* critical */
  stripeRestricted,
  payoutsNotConnected,
  stripeRequirementsDue,
  payoutFailed,
  disputeOpened,
  proPaymentFailed,
  domainHttps,
  emailBounceRate,
  /* problem */
  productMissingFile,
  receiptNotDelivered,
  checkoutNotCompleting,
  campaignFailed,
  domainNotConnected,
  /* next step */
  setupNextStep,
  websiteNotPublished,
  /* opportunity */
  checkoutReminderOff,
  productViewsNoSales,
  subscribersNotEmailed,
  couponExpiring,
  /* milestone */
  salesMilestone,
  firstReview,
  subscribersMilestone,
  /* update */
  featureLaunch,
]

/** The digest the planner makes of several opportunities at once. Not a rule: nothing evaluates it. */
export const DIGEST_KIND = "opportunity_digest"

export function ruleOf(kind: string | null | undefined): Rule | undefined {
  return RULES.find((r) => r.kind === kind)
}

/** The kinds that say the same thing as the panel's "Set up payments" to-do, so it steps aside for them. */
export const COVERS_PAYMENT_SETUP = ["stripe_restricted", "stripe_requirements_due", "payouts_not_connected"] as const
