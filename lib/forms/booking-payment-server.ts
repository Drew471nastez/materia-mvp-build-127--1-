import "server-only"
import { after } from "next/server"
import { BOOKING_METADATA_KEY, applyBookingFailure, applyBookingPayment, applyBookingRefund, type PaidIntent } from "./booking-payment"
import { queueJobs, runFormJobs } from "./delivery-server"

/*
  The Stripe webhook's three calls for a booking paid with a product
  (app/api/stripe/webhook). Each is safe to repeat. A database error throws,
  so the webhook answers 500 and Stripe sends the event again.
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export function isBookingIntent(pi: { metadata?: Record<string, string | undefined> | null }): boolean {
  return typeof pi.metadata?.[BOOKING_METADATA_KEY] === "string" && !!pi.metadata[BOOKING_METADATA_KEY]
}

export async function bookingPaid(db: Db, pi: PaidIntent) {
  const verdict = await applyBookingPayment(db, pi, async (b) => {
    /* One confirmation email per booking: the job is unique per response and kind. */
    const ids = await queueJobs(db, { ownerId: b.owner_id, formId: b.form_id, submissionId: b.submission_id, jobs: [{ provider: "booking_confirmed", state: "ready" }] })
    if (ids.length) after(() => runFormJobs(db, { ids, until: Date.now() + 20_000 }).then(() => undefined, () => undefined))
  })
  if (verdict.kind === "review") console.warn("[forms] booking payment needs review:", pi.id, verdict.reason)
  return verdict
}

export async function bookingPaymentFailed(db: Db, pi: Pick<PaidIntent, "id" | "metadata">) {
  return applyBookingFailure(db, pi)
}

export async function bookingRefunded(db: Db, intentId: string) {
  return applyBookingRefund(db, intentId)
}
