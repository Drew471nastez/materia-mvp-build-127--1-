/**
 * ===========================================================================
 *  THE CREATOR'S STORELIB PLAN
 * ===========================================================================
 * Storelib's own billing of creators (Growth, Pro), not anything a creator
 * sells:
 *
 *   subscription.created          SUBSCRIPTION_CREATED
 *   subscription.payment_failed   SUBSCRIPTION_PAYMENT_FAILED
 *   subscription.cancelled        SUBSCRIPTION_CANCELLED
 *   subscription.renewed          nothing: the invoice is the record
 */
import { job, plan, str, type Workflow } from "./common"

export const subscriptions: Workflow = (event, ctx) => {
  const subscriptionId = event.entityType === "subscription" ? event.entityId : str(event.payload.subscriptionId)
  const on = { entityType: "subscription" as const, entityId: subscriptionId ?? ctx.creatorId }
  switch (event.name) {
    case "subscription.created":
      return plan([job("SUBSCRIPTION_CREATED", event, ctx, on)])
    case "subscription.payment_failed":
      return plan([job("SUBSCRIPTION_PAYMENT_FAILED", event, ctx, on)])
    case "subscription.cancelled":
      return plan([job("SUBSCRIPTION_CANCELLED", event, ctx, on)])
    default:
      return null
  }
}
