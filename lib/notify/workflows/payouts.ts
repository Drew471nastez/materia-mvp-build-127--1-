/**
 * ===========================================================================
 *  PAYOUTS AND PAYOUT METHODS
 * ===========================================================================
 *   payout.scheduled          PAYOUT_SCHEDULED, in app only
 *   payout.sent               PAYOUT_SENT
 *   payout.failed             PAYOUT_FAILED, critical; skipped if the payout
 *                             no longer reads failed when it sends
 *   payout.action_required    PAYOUT_ACTION_REQUIRED, critical
 *   payout_method.added       PAYOUT_METHOD_ADDED, security, always sent
 *   payout_method.changed     PAYOUT_METHOD_CHANGED, security, always sent
 *
 * A payout is its own entity (the Stripe payout id), so a failed payout and
 * a later failed payout are two notifications, and the same failure raised
 * twice is one.
 */
import { job, plan, str, type Workflow } from "./common"

export const payouts: Workflow = (event, ctx) => {
  const payoutId = event.entityId ?? str(event.payload.payoutId)
  const payout = { entityType: "payout" as const, entityId: payoutId, data: payoutId ? { payoutId } : {} }
  switch (event.name) {
    case "payout.scheduled":
      return plan([job("PAYOUT_SCHEDULED", event, ctx, { ...payout, step: payoutId ? "scheduled" : null })])
    case "payout.sent":
      return plan([job("PAYOUT_SENT", event, ctx, { ...payout, step: payoutId ? "sent" : null })])
    case "payout.failed":
      return plan([job("PAYOUT_FAILED", event, ctx, { ...payout, step: payoutId ? "failed" : null })])
    case "payout.action_required":
      return plan([job("PAYOUT_ACTION_REQUIRED", event, ctx, { entityType: "creator", entityId: ctx.creatorId })])
    case "payout_method.added":
      return plan([job("PAYOUT_METHOD_ADDED", event, ctx, { entityType: "creator", entityId: ctx.creatorId })])
    case "payout_method.changed":
      return plan([job("PAYOUT_METHOD_CHANGED", event, ctx, { entityType: "creator", entityId: ctx.creatorId })])
    default:
      return null
  }
}
