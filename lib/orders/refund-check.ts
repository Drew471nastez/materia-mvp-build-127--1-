/**
 * THE ORDERS PAGE'S MISSED-REFUND CHECK, ONCE PER CREATOR PER SIX HOURS (database audit F8).
 *
 * app/app/orders/sales ran it on every visit and refresh: up to 60 PaymentIntent reads each on the platform's Stripe
 * key, whose rate limit checkout and the webhooks share. Kept per server instance: a net under a missed webhook does
 * not need to be tighter than that.
 */
export const REFUND_CHECK_EVERY_MS = 6 * 3_600_000

const g = globalThis as unknown as { __storelibRefundChecks?: Map<string, number> }
const refundChecks = (g.__storelibRefundChecks ??= new Map())

/** Whether this creator's missed-refund check may run now; records the run when it may. */
export function refundCheckDue(creatorId: string, now = Date.now()): boolean {
  const last = refundChecks.get(creatorId)
  if (last !== undefined && now - last < REFUND_CHECK_EVERY_MS) return false
  if (refundChecks.size > 5_000) refundChecks.clear()
  refundChecks.set(creatorId, now)
  return true
}
