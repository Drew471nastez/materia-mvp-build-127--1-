/**
 * ===========================================================================
 *  A SLOW DATABASE IS ASKED AGAIN BEFORE A RUN'S CODE IS GIVEN UP
 * ===========================================================================
 * Production, Nov 2026: "theme agent: code commit failed
 * sections/theme-header.storelib DeadlineExceeded: store_theme_custom_files
 * took longer than 30s". One slow write threw away every file a run had
 * written and checked, and the creator read "could not be saved".
 *
 * Saving a section file is the same draft written again (an upsert of the
 * same content), so asking again is safe. A transient failure (our
 * deadline, a dropped connection, a 5xx, a 429) is retried with backoff
 * while the function still has room; anything else (a refused path, a
 * file that does not compile) is answered at once.
 *
 * Pure apart from the timer, so it has a test with fakes
 * (tests/aifix-w5.test.ts).
 */

export type SaveAnswer = { ok: true } | { ok: false; error: string }

const TRANSIENT = /deadlineexceeded|took longer than|timed? ?out|timeout|etimedout|econnreset|econnrefused|socket hang up|fetch failed|network|connection|\b50[0234]\b|\b429\b|temporarily|unavailable|too many requests|statement timeout|canceling statement/i

/** Whether a failed save is worth asking again: the database or the network was slow, not the file wrong. */
export function transientSaveFailure(why: unknown): boolean {
  if (why === null || why === undefined) return false
  if (typeof why === "string") return TRANSIENT.test(why)
  if (typeof why === "object") {
    const e = why as { name?: unknown; message?: unknown; status?: unknown; code?: unknown }
    if (e.name === "DeadlineExceeded" || e.name === "TimeoutError") return true
    if (typeof e.status === "number" && (e.status === 429 || e.status >= 500)) return true
    return TRANSIENT.test(`${String(e.message ?? "")} ${String(e.code ?? "")}`)
  }
  return false
}

export interface RetryOptions {
  /** Waits before the second and later tries, ms. Two by default: three tries in all. */
  pausesMs?: readonly number[]
  /** How long the function still has; a retry is only made with at least `perTryMs` of it left after the pause. */
  roomMs?: () => number
  /** What one try may take at most (the write deadline, lib/net/deadline.ts). */
  perTryMs?: number
  sleep?: (ms: number) => Promise<void>
  /** Told about each retry, for the log and the chat's "the database was slow" line. */
  onRetry?: (attempt: number, why: string) => void
}

export const SAVE_RETRY_PAUSES_MS = [1_000, 3_000] as const

/** The plain sentence for a commit that still failed on a slow database: nothing is half saved, and the same request works again. */
export const SLOW_SAVE_MESSAGE =
  "The database was too slow to save the section's code just now, so every file is back to how it was. Send the same request again in a moment."

/**
 * `save` once, and again after a transient failure, with backoff, while
 * there is room. A throw counts as a failure with its message.
 */
export async function saveWithRetry(save: () => Promise<SaveAnswer>, options: RetryOptions = {}): Promise<SaveAnswer & { tries: number; transient?: boolean }> {
  const pauses = options.pausesMs ?? SAVE_RETRY_PAUSES_MS
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let last: SaveAnswer = { ok: false, error: "not tried" }
  let transient = false
  let tries = 0
  for (let attempt = 0; attempt <= pauses.length; attempt++) {
    if (attempt > 0) {
      const pause = pauses[attempt - 1]
      const room = options.roomMs?.() ?? Number.POSITIVE_INFINITY
      if (room < pause + (options.perTryMs ?? 0)) break
      options.onRetry?.(attempt, last.ok === false ? last.error : "")
      await sleep(pause)
    }
    tries++
    try {
      last = await save()
    } catch (thrown) {
      const name = thrown && typeof thrown === "object" ? String((thrown as { name?: unknown }).name ?? "") : ""
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      last = { ok: false, error: name && !message.startsWith(name) ? `${name}: ${message}` : message }
    }
    if (last.ok === true) return { ok: true, tries }
    transient = transientSaveFailure(last.error)
    if (!transient) return { ...last, tries, transient: false }
  }
  return { ...(last as { ok: false; error: string }), tries, transient }
}
