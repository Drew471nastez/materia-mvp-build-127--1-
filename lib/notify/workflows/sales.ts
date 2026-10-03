/**
 * ===========================================================================
 *  SALES, REFUNDS AND DISPUTES, FOR THE CREATOR
 * ===========================================================================
 *   sale.first_created, order.first_created   FIRST_SALE, once per creator. The
 *                                             email half is the seller's sale
 *                                             email (lib/email.tsx), drawn as
 *                                             FIRST_SALE; the engine writes the bell.
 *   sale.created, order.created               NEW_SALE, keyed by the order.
 *                                             The email half is sent by
 *                                             lib/email.tsx sendOrderEmails;
 *                                             the engine writes the bell row.
 *   order.refunded                            REFUND_CREATED (the email half
 *                                             is lib/email.tsx sendRefundEmails)
 *   dispute.created                           DISPUTE_CREATED
 *   dispute.updated, needing a response       DISPUTE_ACTION_REQUIRED, while
 *                                             the dispute is still open
 *   dispute.closed                            DISPUTE_CLOSED: won, lost, or an
 *                                             inquiry the bank closed
 *
 * The buyer's side of an order and a refund is customer.ts.
 */
import { job, plan, str, type Workflow } from "./common"

function needsResponse(payload: Record<string, unknown>): boolean {
  if (payload.needsResponse === true || payload.needs_response === true) return true
  const status = str(payload.status)
  return status === "needs_response" || status === "warning_needs_response"
}

export const sales: Workflow = (event, ctx) => {
  const orderId = event.entityType === "order" ? event.entityId : str(event.payload.orderId)
  const order = { entityType: "order" as const, entityId: orderId ?? null, data: orderId ? { orderId } : {} }
  switch (event.name) {
    case "sale.first_created":
    case "order.first_created":
      return plan([job("FIRST_SALE", event, ctx, { ...order, entityType: "creator", entityId: ctx.creatorId, step: "once" })])
    case "sale.created":
    case "order.created":
      return plan([job("NEW_SALE", event, ctx, { ...order, step: orderId ? "sale" : null })])
    case "order.refunded":
      return plan([job("REFUND_CREATED", event, ctx, order)])
    case "dispute.closed": {
      const disputeId = event.entityType === "dispute" ? event.entityId : str(event.payload.disputeId)
      return plan([job("DISPUTE_CLOSED", event, ctx, { entityType: "dispute", entityId: disputeId ?? null, data: disputeId ? { disputeId } : {}, step: disputeId ? "closed" : null })])
    }
    case "dispute.created":
    case "dispute.updated": {
      const disputeId = event.entityType === "dispute" ? event.entityId : str(event.payload.disputeId)
      const dispute = { entityType: "dispute" as const, entityId: disputeId ?? null, data: disputeId ? { disputeId } : {} }
      if (event.name === "dispute.created") return plan([job("DISPUTE_CREATED", event, ctx, { ...dispute, step: disputeId ? "created" : null })])
      /* Stripe's own reminder updates on an inquiry are not a case to answer. */
      if (event.payload.inquiry === true) return null
      if (!needsResponse(event.payload)) return null
      return plan([job("DISPUTE_ACTION_REQUIRED", event, ctx, dispute)])
    }
    default:
      return null
  }
}
