/**
 * ===========================================================================
 *  A NEW STORE'S FIRST DAYS
 * ===========================================================================
 * store.created (the creator row exists, database trigger on creators):
 *
 *   now     WELCOME_TO_STORELIB, email and the in-app checklist notice
 *   day_1   FIRST_PRODUCT_REMINDER      while there is no product
 *           FINISH_PRODUCT_REMINDER     while there is only an unfinished draft
 *           PUBLISH_PRODUCT_REMINDER    while a finished draft waits unpublished
 *           PAYMENT_SETUP_REMINDER      while Stripe is not connected
 *   day_3   FIRST_PRODUCT_REMINDER_2    still no product
 *           PAYMENT_SETUP_REMINDER_2    still not connected
 *
 * The same event also starts the store setup sequence on days 5 and 12
 * (workflows/unfinished.ts), after these, so the specific nudges lead and
 * the one about the rest of Getting started follows.
 *
 * The product reminders' conditions are exclusive (no product, a draft that
 * is not ready, a ready draft), so at most one of them sends on day 1. Each
 * reminder expires two days after its run time: a nudge a week late reads
 * as noise.
 *
 * Cancelling is by workflow: publishing the first product cancels every
 * pending product reminder (products.ts), connecting payments every pending
 * payment reminder (payments.ts).
 */
import { DAY_MS, WORKFLOWS, job, plan, type Workflow } from "./common"

export const onboarding: Workflow = (event, ctx) => {
  if (event.name !== "store.created") return null
  const product = { workflow: WORKFLOWS.onboardingProduct, expiresInMs: 2 * DAY_MS, entityType: "creator" as const, entityId: ctx.creatorId }
  const payment = { workflow: WORKFLOWS.onboardingPayment, expiresInMs: 2 * DAY_MS, entityType: "creator" as const, entityId: ctx.creatorId }
  return plan([
    job("WELCOME_TO_STORELIB", event, ctx, { step: "once", entityType: "creator", entityId: ctx.creatorId }),
    job("FIRST_PRODUCT_REMINDER", event, ctx, { ...product, step: "day_1", delayMs: DAY_MS }),
    job("FINISH_PRODUCT_REMINDER", event, ctx, { ...product, step: "day_1", delayMs: DAY_MS }),
    job("PUBLISH_PRODUCT_REMINDER", event, ctx, { ...product, step: "day_1", delayMs: DAY_MS }),
    job("PAYMENT_SETUP_REMINDER", event, ctx, { ...payment, step: "day_1", delayMs: DAY_MS }),
    job("FIRST_PRODUCT_REMINDER_2", event, ctx, { ...product, step: "day_3", delayMs: 3 * DAY_MS }),
    job("PAYMENT_SETUP_REMINDER_2", event, ctx, { ...payment, step: "day_3", delayMs: 3 * DAY_MS }),
  ])
}
