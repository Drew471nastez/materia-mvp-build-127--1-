/**
 * ===========================================================================
 *  "CONFIRMING YOUR PAYMENT" ASKS AGAIN, THEN STOPS
 * ===========================================================================
 * The order page of a cart checkout (app/(storelib)/checkout/physical/order)
 * waits for the payment to be confirmed by reloading itself. It reloaded
 * every 4 seconds for as long as the tab stayed open, hidden or not: an
 * order whose payment never completed (a buyer who left the card step)
 * redrew the page fifteen times a minute, all day (round 55).
 *
 * Now each wait is longer than the one before, from 4 seconds up to 30, a
 * hidden tab waits until it is shown again, and after PENDING_TRIES the page
 * stops and says what to do instead, with a button that asks once more.
 * A payment confirms in a few seconds, so the first tries are as quick as
 * before.
 */

/** How many times the page reloads itself before it stops and offers Try again. */
export const PENDING_TRIES = 20

/** The wait before reload number `tries` (0 for the first), or null once the page should stop. */
export function pendingDelayMs(tries: number): number | null {
  if (!Number.isFinite(tries) || tries < 0) tries = 0
  if (tries >= PENDING_TRIES) return null
  return Math.min(30_000, Math.round(4_000 * 1.5 ** tries))
}

/** The address's own count of reloads, so the count survives each one without storage. */
export const PENDING_TRY_PARAM = "try"

/** `href` with the count of reloads set to `tries` (taken off at 0). */
export function pendingRetryUrl(href: string, tries: number): string {
  const u = new URL(href)
  if (tries > 0) u.searchParams.set(PENDING_TRY_PARAM, String(tries))
  else u.searchParams.delete(PENDING_TRY_PARAM)
  return u.toString()
}
