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
 *   order.created                 REVIEW_REQUEST seven days after the purchase and
 *                                 REVIEW_REMINDER fourteen days after it, both to
 *                                 payload.buyerEmail, keyed by the order and the
 *                                 step, so never more than those two for an order.
 *                                 Whether each goes is decided when it is due
 *                                 (lib/reviews/request-rules): a Storelib order
 *                                 and not a website's, still paid, not reviewed,
 *                                 not unsubscribed. Each waits at most a week for
 *                                 a late worker, then it is not worth sending.
 *
 * A customer job has an address and no Storelib user: a creator template can
 * never reach it, and the worker refuses one that tries.
 */
import { DAY_MS, REVIEW_EMAIL_WINDOW_DAYS, dueAt } from "@/lib/reviews/request-rules"
import { job, plan, str, type Workflow } from "./common"

export const customer: Workflow = (event, ctx) => {
  const buyerEmail = str(event.payload.buyerEmail) ?? str(event.payload.customerEmail)
  if (!buyerEmail || !buyerEmail.includes("@")) return null
  const orderId = event.entityType === "order" ? event.entityId : str(event.payload.orderId)
  const on = { recipientType: "customer" as const, recipientUserId: null, recipientEmail: buyerEmail, entityType: "order" as const, entityId: orderId ?? null }
  switch (event.name) {
    case "order.created": {
      const receipt = job("PURCHASE_CONFIRMATION", event, ctx, { ...on, step: orderId ? "receipt" : null })
      if (!orderId) return plan([receipt])
      /* From the moment of purchase, not from when this event was handled: a late worker does not push the ask later. */
      const bought = Date.parse(event.occurredAt) || ctx.now
      const review = (type: "REVIEW_REQUEST" | "REVIEW_REMINDER", step: "review_1" | "review_2") => {
        const due = dueAt(bought, step === "review_1" ? "request" : "reminder")
        /* Its week is over already (an event handled very late): not planned at all. */
        const until = due + REVIEW_EMAIL_WINDOW_DAYS * DAY_MS
        if (ctx.now >= until) return null
        return job(type, event, ctx, { ...on, step, delayMs: due - ctx.now, expiresInMs: until - Math.max(ctx.now, due), data: { orderId } })
      }
      return plan([receipt, review("REVIEW_REQUEST", "review_1"), review("REVIEW_REMINDER", "review_2")])
    }
    case "sale.created":
      return plan([job("PURCHASE_CONFIRMATION", event, ctx, { ...on, step: orderId ? "receipt" : null })])
    case "order.refunded":
      return plan([job("CUSTOMER_REFUND_PROCESSED", event, ctx, on)])
    default:
      return null
  }
}
