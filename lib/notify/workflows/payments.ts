/**
 * ===========================================================================
 *  GETTING PAID: STRIPE CONNECT SETUP
 * ===========================================================================
 *   payment_setup.completed         PAYMENT_SETUP_COMPLETED, and every
 *                                   pending nudge about getting paid is
 *                                   cancelled: the onboarding reminders, the
 *                                   unfinished payout setup sequence and the
 *                                   verification reminders (unfinished.ts)
 *   payment_setup.action_required   PAYMENT_VERIFICATION_REQUIRED, critical.
 *                                   Stripe sends account.updated many times
 *                                   while it waits; the registry's one day
 *                                   cooldown keeps that to one email a day.
 *   payment_setup.failed            PAYMENT_SETUP_FAILED, critical
 *   payment_setup.started           the unfinished payout setup sequence
                                   (unfinished.ts), not an email now
 *
 * These can truly happen again (a creator disconnects and connects again),
 * so each job is keyed by the event, not "once".
 */
import { WORKFLOWS, cancelFor, job, plan, type Workflow } from "./common"

export const payments: Workflow = (event, ctx) => {
  const on = { entityType: "creator" as const, entityId: ctx.creatorId }
  switch (event.name) {
    case "payment_setup.completed":
      /* Connected: every pending nudge about getting paid goes, whichever sequence planned it (unfinished.ts). */
      return plan([job("PAYMENT_SETUP_COMPLETED", event, ctx, on)], [
        ...cancelFor(ctx, WORKFLOWS.onboardingPayment, "payment setup completed"),
        ...cancelFor(ctx, WORKFLOWS.payoutSetup, "payment setup completed"),
        ...cancelFor(ctx, WORKFLOWS.verification, "payment setup completed"),
      ])
    case "payment_setup.action_required":
      return plan([job("PAYMENT_VERIFICATION_REQUIRED", event, ctx, on)])
    case "payment_setup.failed":
      return plan([job("PAYMENT_SETUP_FAILED", event, ctx, on)])
    default:
      return null
  }
}
