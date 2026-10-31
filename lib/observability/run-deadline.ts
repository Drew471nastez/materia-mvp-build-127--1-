/**
 * ===========================================================================
 *  ONE CLOCK FOR A WHOLE CRON RUN
 * ===========================================================================
 * A cron with several steps used to give each step its own budget counted
 * from that step's own start, so the budgets added up past the function's
 * maxDuration and the platform killed the run partway through a later step
 * (no answer, cron_runs never finished, nothing reported). The same defect
 * process-scheduled-emails fixed with "THE WHOLE RUN'S CLOCK".
 *
 * Here the clock starts at the request's start, the run has one deadline
 * below maxDuration, and each step takes what is left, capped at its own
 * budget. A step whose share is too small to be worth starting is skipped,
 * and what it would have done waits for the next run (every step here
 * already resumes from the database).
 */

export interface RunDeadline {
  /** When the run began (ms since epoch). */
  readonly started: number
  /** The run's own deadline (ms since epoch), below maxDuration. */
  readonly until: number
  /** Milliseconds left before the deadline, never negative. */
  left(): number
  /** A step's budget: what is left, at most `capMs`. 0 when the step should not start (less than `minMs` left). */
  share(capMs: number, minMs?: number): number
  /** A deadline for a step that must end earlier than the run, `atMs` after the start, so later steps get a turn. */
  shareUntil(atMs: number, capMs: number, minMs?: number): number
}

/** Below this a step is not started: a query and a cleanup alone can take that long. */
export const MIN_STEP_MS = 2_000

export function runDeadline(totalMs: number, opts: { started?: number; now?: () => number } = {}): RunDeadline {
  const now = opts.now ?? Date.now
  const started = opts.started ?? now()
  const until = started + Math.max(0, totalMs)
  const shareTo = (end: number, capMs: number, minMs: number) => {
    const left = Math.min(end, until) - now()
    if (left < minMs) return 0
    return Math.max(0, Math.min(capMs, left))
  }
  return {
    started,
    until,
    left: () => Math.max(0, until - now()),
    share: (capMs, minMs = MIN_STEP_MS) => shareTo(until, capMs, minMs),
    shareUntil: (atMs, capMs, minMs = MIN_STEP_MS) => shareTo(started + atMs, capMs, minMs),
  }
}

/** maxDuration (seconds) less a margin for the answer and cron_runs' finish, in milliseconds. */
export function runBudgetMs(maxDurationS: number, marginMs = 8_000): number {
  return Math.max(1_000, maxDurationS * 1000 - marginMs)
}
