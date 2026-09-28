/**
 * ===========================================================================
 *  A BUYER'S MEMBERSHIP
 * ===========================================================================
 * The member hears about their own subscription from Storelib, as a billing
 * notice, the way they hear about a receipt:
 *
 *   membership.started            MEMBERSHIP_STARTED, once per membership: the welcome,
 *                                 with what they pay, when, and where the posts are
 *   membership.renewed            MEMBERSHIP_RENEWED, once per paid renewal invoice
 *   membership.renewal_upcoming   MEMBERSHIP_RENEWAL_REMINDER, once per period, a few
 *                                 days before it renews (lib/memberships/reminders.ts)
 *   membership.payment_failed     MEMBERSHIP_PAYMENT_FAILED, once per failed attempt
 *   membership.canceled           MEMBERSHIP_CANCELED, once per scheduled end date
 *   membership.ended              MEMBERSHIP_ENDED, once per membership
 *
 * Each goes to payload.buyerEmail. The key's step is what makes it once: the
 * membership for a welcome, the invoice for a renewal, the period end for a
 * reminder or a cancellation. The event's own key carries the same thing,
 * so Stripe repeating a webhook plans nothing new.
 */
import type { NotificationType } from "../types"
import { job, plan, str, type Workflow } from "./common"

const TYPE_OF: Partial<Record<string, NotificationType>> = {
  "membership.started": "MEMBERSHIP_STARTED",
  "membership.renewed": "MEMBERSHIP_RENEWED",
  "membership.renewal_upcoming": "MEMBERSHIP_RENEWAL_REMINDER",
  "membership.payment_failed": "MEMBERSHIP_PAYMENT_FAILED",
  "membership.canceled": "MEMBERSHIP_CANCELED",
  "membership.ended": "MEMBERSHIP_ENDED",
}

export const memberships: Workflow = (event, ctx) => {
  const type = TYPE_OF[event.name]
  if (!type) return null
  const buyerEmail = str(event.payload.buyerEmail)
  if (!buyerEmail || !buyerEmail.includes("@")) return null
  const membershipId = event.entityType === "membership" ? event.entityId : str(event.payload.membershipId)
  const step =
    type === "MEMBERSHIP_STARTED" || type === "MEMBERSHIP_ENDED"
      ? "once"
      : str(event.payload.invoiceId) ?? str(event.payload.periodEnd) ?? str(event.payload.endsAt) ?? null
  return plan([
    job(type, event, ctx, {
      recipientType: "customer",
      recipientUserId: null,
      recipientEmail: buyerEmail,
      entityType: "membership",
      entityId: membershipId ?? null,
      step,
      /* A reminder a day late is still useful; one a week late is not. */
      expiresInMs: type === "MEMBERSHIP_RENEWAL_REMINDER" ? 3 * 86_400_000 : null,
      data: { membershipId },
    }),
  ])
}
