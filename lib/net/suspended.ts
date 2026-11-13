/**
 * ===========================================================================
 *  A TIMER THAT FIRED LATE WAS NOT WAITING ON ANYBODY: THE SERVER WAS ASLEEP
 * ===========================================================================
 * Production, Nov 13 2026: "platform setting explore_marketplace not read: no
 * answer in 3000ms" eleven times in a day, on a read of one row by its key.
 * Each line carried the request id of an /explore request, and each was
 * written 11 to 515 seconds after that request began, during the next request
 * the same server instance took (/login, /signup). A three second timer
 * cannot run for eight minutes. The read was started after the answer went
 * out (a stale cache entry asked again behind the page), Vercel put the
 * instance to sleep with the read and its timer both pending, and when the
 * next request woke it the timer's time had long passed, so it fired before
 * the answer waiting on the socket was ever looked at. The database was never
 * slow; the page was told it was.
 *
 * So a deadline asks one more thing when it runs out: did this take far
 * longer than the time it was given? Then the instance slept through it, the
 * question was never really put, and it is asked once more, now that the
 * server is awake. A read that is honestly late runs out within a moment of
 * its time and is treated as late, exactly as before.
 */

/** How far past its time a timer may fire and still be an honest timeout (a busy event loop, a slow tick). */
export const SUSPEND_SLACK_MS = 2000

/** True when a deadline of `budgetMs` set at `startedAt` ran out so late that the instance must have been asleep. */
export function sleptThrough(startedAt: number, budgetMs: number, now: number = Date.now()): boolean {
  return now - startedAt > budgetMs + SUSPEND_SLACK_MS
}
