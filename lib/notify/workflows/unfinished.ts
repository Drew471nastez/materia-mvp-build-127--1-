/**
 * ===========================================================================
 *  STARTED AND NOT FINISHED
 * ===========================================================================
 * Three things a creator can leave half done, and the emails that come back
 * for them. Every other workflow here answers something that happened;
 * these answer something that did not.
 *
 *   payment_setup.started           the Stripe account row appeared and the
 *   product.first_published         onboarding was never finished, or a
 *     (paymentsReady false)         product went live with no way to be paid
 *                                   -> PAYOUT_SETUP_UNFINISHED     day 2
 *                                      PAYOUT_SETUP_UNFINISHED_2   day 7
 *
 *   store.created                   Getting started still has a step with a
 *                                   page to finish it on
 *                                   -> STORE_SETUP_UNFINISHED      day 5
 *                                      STORE_SETUP_UNFINISHED_2    day 12
 *
 *   payout.action_required          Stripe asked for details (an identity
 *                                   document, a date of birth, a company
 *                                   number) and is still waiting
 *                                   -> VERIFICATION_REMINDER       day 2
 *                                      VERIFICATION_REMINDER_2     day 7
 *
 * ---------------------------------------------------------------------------
 *  WHY IT IS SHAPED LIKE THIS
 * ---------------------------------------------------------------------------
 * WAIT FIRST. Nothing goes out at the moment somebody stops. People stop to
 * find a passport, to ask an accountant, or because the phone rang, and they
 * come back on their own within a day. An email in the first hours is a
 * reflex, not a reminder; the first one here is two days later, and the
 * setup one five, because Getting started already has its own product and
 * payment reminders on days 1 and 3 and a third mail in that window is noise.
 *
 * TWO, THEN STOP. A first reminder, one more about a week later, and that is
 * the end of it. The second says it is the last one. Nothing here repeats
 * forever: a sequence that never ends is how a product teaches people to
 * filter its mail.
 *
 * NEVER AFTER IT IS DONE. Each type carries a condition (registry.ts), read
 * against the database in the seconds before it sends (conditions.ts), not
 * when it was planned. Payments connected in the meantime, the step ticked
 * off, Stripe satisfied: the job is skipped, CONDITION_NO_LONGER_TRUE. On top
 * of that, payment_setup.completed cancels every pending job of the payout
 * and verification workflows outright (payments.ts), so a finished task
 * leaves nothing pending behind it.
 *
 * ONE OF EACH, EVER. The idempotency key is the type, the person, the
 * creator and the step, so the same sequence planned from two different
 * moments (they started Stripe and then published a product) is one set of
 * jobs, and a cron that runs twice or an event handled twice writes nothing
 * new. The key has no timestamp in it on purpose: this is said once per
 * account, not once per attempt.
 *
 * ONE PAYMENTS SEQUENCE AT A TIME. Starting Stripe cancels the "you have not
 * set up payments" reminders of the onboarding workflow: from then on the
 * true thing to say is that setup was begun and not finished, and saying
 * both would be four emails about payments in one week.
 *
 * WHAT KIND OF MAIL EACH IS. The payout and setup nudges are lifecycle:
 * useful, on by default, with an unsubscribe link, and under the one
 * lifecycle email a day cap. The verification reminders are required
 * service, like every other notice about money that cannot reach somebody:
 * payouts pause when Stripe is not answered, so it is not something to
 * unsubscribe from.
 */
import { DAY_MS, WORKFLOWS, cancelFor, job, plan, str, type Plan, type Workflow, type WorkflowContext } from "./common"
import type { DomainEvent } from "../types"

/** A lifecycle nudge a week late reads as noise, so each one expires two days after its day. */
const LIFECYCLE_WINDOW_MS = 2 * DAY_MS
/** A verification notice is about money that stops, so it is still worth sending a week late. */
const VERIFICATION_WINDOW_MS = 7 * DAY_MS

/**
 * The payout sequence, planned the same way whichever moment starts it: same
 * types, same steps, so the keys collide and only one set exists.
 */
function payoutSetup(event: DomainEvent, ctx: WorkflowContext, data: Record<string, unknown>): Plan {
  const on = { workflow: WORKFLOWS.payoutSetup, entityType: "creator" as const, entityId: ctx.creatorId, expiresInMs: LIFECYCLE_WINDOW_MS, data }
  return plan(
    [
      job("PAYOUT_SETUP_UNFINISHED", event, ctx, { ...on, step: "day_2", delayMs: 2 * DAY_MS }),
      job("PAYOUT_SETUP_UNFINISHED_2", event, ctx, { ...on, step: "day_7", delayMs: 7 * DAY_MS }),
    ],
    cancelFor(ctx, WORKFLOWS.onboardingPayment, "payout setup begun"),
  )
}

export const unfinished: Workflow = (event, ctx) => {
  switch (event.name) {
    /* `started` changes what the email says: they have entered something and Stripe kept it. */
    case "payment_setup.started":
      return payoutSetup(event, ctx, { started: true })
    case "product.first_published":
      /* Only when there is still no way to be paid. The trigger sends paymentsReady; anything else leaves it alone. */
      if (event.payload.paymentsReady !== false) return null
      return payoutSetup(event, ctx, { started: false, productTitle: str(event.payload.productTitle) })
    /*
     * The weekly sweep (lib/notify/payout-weekly.ts) asked for this one. It is
     * keyed by the creator and the day the sweep ran, so a sweep that runs
     * twice plans one email, and it is sent at once: the sweep already waited
     * the week. The condition is read again just before it sends.
     */
    case "payment_setup.weekly_check": {
      const day = str(event.payload.day)
      if (!day) return null
      return plan([
        job("PAYOUT_SETUP_WEEKLY", event, ctx, {
          workflow: WORKFLOWS.payoutSetup,
          entityType: "creator",
          entityId: ctx.creatorId,
          step: `week_${day}`,
          expiresInMs: LIFECYCLE_WINDOW_MS,
          data: { started: event.payload.started === true },
        }),
      ])
    }
    case "store.created": {
      const on = { workflow: WORKFLOWS.storeSetup, entityType: "creator" as const, entityId: ctx.creatorId, expiresInMs: LIFECYCLE_WINDOW_MS }
      return plan([
        job("STORE_SETUP_UNFINISHED", event, ctx, { ...on, step: "day_5", delayMs: 5 * DAY_MS }),
        job("STORE_SETUP_UNFINISHED_2", event, ctx, { ...on, step: "day_12", delayMs: 12 * DAY_MS }),
      ])
    }
    /*
     * "How do you fulfil your physical orders?" answered. Two days later, and
     * once more five days after that, if the store still can't take an order
     * it would ship: the next of Home's physical steps, read again from the
     * store the moment each is due (conditions.ts physical_setup_unfinished),
     * so a store that finished in between gets nothing. Keyed by the creator
     * alone: answering the question twice plans the same two jobs.
     */
    case "physical_setup.started": {
      const on = { workflow: WORKFLOWS.physicalSetup, entityType: "creator" as const, entityId: ctx.creatorId, expiresInMs: LIFECYCLE_WINDOW_MS }
      return plan([
        job("PHYSICAL_SETUP_UNFINISHED", event, ctx, { ...on, step: "day_2", delayMs: 2 * DAY_MS }),
        job("PHYSICAL_SETUP_UNFINISHED_2", event, ctx, { ...on, step: "day_7", delayMs: 7 * DAY_MS }),
      ])
    }
    case "payout.action_required": {
      /*
       * Stripe says this over and over while it waits (every account.updated
       * carries the same list), so the follow-ups are keyed by the creator
       * and the step alone: the tenth webhook plans the same two jobs as the
       * first and writes nothing. What Stripe asked for is read again from
       * the creator row when each one is due, never taken from here.
       */
      const on = { workflow: WORKFLOWS.verification, entityType: "creator" as const, entityId: ctx.creatorId, expiresInMs: VERIFICATION_WINDOW_MS }
      return plan([
        job("VERIFICATION_REMINDER", event, ctx, { ...on, step: "day_2", delayMs: 2 * DAY_MS }),
        job("VERIFICATION_REMINDER_2", event, ctx, { ...on, step: "day_7", delayMs: 7 * DAY_MS }),
      ])
    }
    default:
      return null
  }
}
