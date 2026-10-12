/**
 * How long a page waits for Stripe while it is being drawn.
 *
 * Stripe's Node client waits 80s by default. A page that asks Stripe while it
 * renders (a receipt, the upgrade screen) showed nothing at all for as long
 * as Stripe took, and on a slow minute that was the whole minute. Pages pass
 * this as the call's own timeout and decide what a slow Stripe means for
 * them; webhooks and payment calls keep the client's default.
 */
export const STRIPE_RENDER_WAIT_MS = 8_000

/**
 * Stripe did not answer (timeout, connection) or had a problem of its own
 * (5xx). Says nothing about the thing that was asked for.
 */
export function isStripeUnreachable(error: unknown): boolean {
  const e = error as { type?: string; statusCode?: number } | null
  if (!e) return false
  if (e.type === "StripeConnectionError" || e.type === "StripeAPIError") return true
  return typeof e.statusCode === "number" && e.statusCode >= 500
}
