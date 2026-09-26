/**
 * ===========================================================================
 *  THE BUYER'S SIDE
 * ===========================================================================
 * The buyer's receipt with the download and the refund confirmation are sent
 * by lib/email.tsx (sendOrderEmails, sendRefundEmails), once per order
 * through email_logs. The engine plans them so the trace shows them, and the
 * registry marks them emailSentElsewhere, so the worker records the job and
 * sends nothing a second time.
 *
 *   order.created, sale.created   PURCHASE_CONFIRMATION to payload.buyerEmail
 *   order.refunded                CUSTOMER_REFUND_PROCESSED to payload.buyerEmail
 *
 * A customer job has an address and no Storelib user: a creator template can
 * never reach it, and the worker refuses one that tries.
 */
import { job, plan, str, type Workflow } from "./common"

export const customer: Workflow = (event, ctx) => {
  const buyerEmail = str(event.payload.buyerEmail) ?? str(event.payload.customerEmail)
  if (!buyerEmail || !buyerEmail.includes("@")) return null
  const orderId = event.entityType === "order" ? event.entityId : str(event.payload.orderId)
  const on = { recipientType: "customer" as const, recipientUserId: null, recipientEmail: buyerEmail, entityType: "order" as const, entityId: orderId ?? null }
  switch (event.name) {
    case "order.created":
    case "sale.created":
      return plan([job("PURCHASE_CONFIRMATION", event, ctx, { ...on, step: orderId ? "receipt" : null })])
    case "order.refunded":
      return plan([job("CUSTOMER_REFUND_PROCESSED", event, ctx, on)])
    default:
      return null
  }
}
