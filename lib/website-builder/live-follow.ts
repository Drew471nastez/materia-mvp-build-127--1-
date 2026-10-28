/**
 * ===========================================================================
 *  FOLLOWING THE ACTIVITY LOG WHILE THE EDITOR IS OPEN
 * ===========================================================================
 * The editor hears about a GitHub push, an agent's write or a page rewritten
 * on the server by reading the activity log (useSiteActivity in
 * components/website-builder/site-connections.tsx). These are the decisions
 * that loop makes, pure, so tests/editor-live-follow.test.ts can drive them.
 *
 * What left a push unseen until the editor was reloaded:
 *
 *   A SLEEP THAT SAYS NOTHING. A laptop lid closed, or the iOS app put away,
 *   freezes the timers without a `visibilitychange`. The tab came back still
 *   "visible", the catch-up pass was never asked for, and the pile was read
 *   one page per tick: the canvas reloaded once per page. A tick that runs
 *   long after it was due is now an absence (`slept`).
 *
 *   ONE PAGE PER READ. Whatever the cause of a pile, a full page now reads
 *   the next ones in the same pass, so it is applied once (`readMore`).
 *
 *   A HUNG APPLY. Applying lines awaits file reads and the draft. One that
 *   never answered (a WKWebView fetch suspended in the background) held the
 *   loop busy for good. It has a ceiling now (`withinTime`), after which the
 *   theme is read again from the server and the loop carries on.
 *
 *   NOTHING CONNECTED YET. The loop only ran when the first answer named an
 *   agent or a repository, so one connected later, from another tab or
 *   device, was never followed. The brief is asked again on a return and
 *   every BRIEF_RECHECK_MS while visible (`briefDue`).
 */

/** Away longer than this, the log that piled up is taken in one pass. */
export const CATCH_UP_AWAY_MS = 8_000
/** How many pages of the log one pass will fold together. */
export const CATCH_UP_PAGES = 6
/** Rows in one page of the log (the route's limit). */
export const ACTIVITY_PAGE = 20
/** The longest one pass may spend applying what it read. */
export const APPLY_CEILING_MS = 25_000
/** How often a visible editor with nothing connected asks whether something is now. */
export const BRIEF_RECHECK_MS = 60_000
/** The least time between two such asks prompted by a return to the tab. */
export const BRIEF_WAKE_GAP_MS = 10_000

/**
 * Whether a tick ran so long after it was due that the timers were frozen
 * (sleep, a suspended web view) rather than merely late.
 */
export function slept(dueAt: number, now: number, awayMs: number = CATCH_UP_AWAY_MS): boolean {
  return dueAt > 0 && now - dueAt >= awayMs
}

/**
 * Whether a pass should read another page before applying anything: the page
 * it just read was full, and it has room left.
 */
export function readMore(batchLength: number, pagesRead: number, maxPages: number = CATCH_UP_PAGES, page: number = ACTIVITY_PAGE): boolean {
  return batchLength >= page && pagesRead < maxPages
}

/** Whether what a pass read is a pile, applied as the catch-up (one fresh read, no reload per page). */
export function isPile(input: { pending: boolean; slept: boolean; pagesRead: number }): boolean {
  return input.pending || input.slept || input.pagesRead > 1
}

/**
 * Where the cursor goes after a pass. Never backwards, never past a page
 * that failed, and a pass whose lines were applied (or timed out applying)
 * moves it to what was read.
 */
export function nextCursor(current: number | null, read: number | null, failed: boolean, eventsRead: number): number | null {
  if (read === null) return current
  if (failed && eventsRead === 0) return current
  if (current === null) return read
  return Math.max(current, read)
}

/** Whether the editor, with nothing connected, should ask for the brief again now. */
export function briefDue(lastAskedAt: number, now: number, reason: "timer" | "wake"): boolean {
  const gap = reason === "timer" ? BRIEF_RECHECK_MS : BRIEF_WAKE_GAP_MS
  return lastAskedAt <= 0 || now - lastAskedAt >= gap
}

/** A promise, or "late" once `ms` have passed. The work itself is not cancelled. */
export function withinTime<T>(work: Promise<T>, ms: number): Promise<T | "late"> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve("late"), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
