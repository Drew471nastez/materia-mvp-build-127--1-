/**
 * ===========================================================================
 *  A READ THE EDITOR'S PAGE WAITS FOR, WITH AN END
 * ===========================================================================
 * "Sometimes when I want to go to the OnePage editor, it doesn't take me
 * there. It shows the loading thing but it never takes me there, or it takes
 * me there very delayed." The editor's server page (app/app/onepage/page.tsx)
 * awaited its Supabase reads with no ceiling at all. A read that hung (a
 * cold connection, a dropped socket, the database busy) held the router's
 * answer for as long as it hung: the shell's spinner came up, gave way at
 * its cap to the page you were on, and the editor landed whenever the read
 * finally came back, or never.
 *
 * Every read the page waits for goes through this now: each try is aborted
 * after `attemptMs`, a failed or timed out try is asked once more only while
 * the whole `budgetMs` has room for it, and the answer is always a result,
 * never a throw and never a promise that does not settle. The page turns an
 * error into its own error screen with a Try again (app/app/error.tsx), on
 * the editor's address, so a press on OnePage ends somewhere every time.
 */

export type ReadError = { code?: string; message?: string }
export type ReadResult<T> = { data: T | null; error: ReadError | null }

/** The code of a try that got no answer in time. */
export const READ_TIMEOUT = "READ_TIMEOUT"

/** How long one try may take, and how long all tries of one read may take between them. */
export const EDITOR_READ_ATTEMPT_MS = 2500
export const EDITOR_READ_BUDGET_MS = 4000

type Timers = {
  now: () => number
  setTimeout: (cb: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}

const realTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}

/** One try: its own answer, or a timeout error after `ms` (and the request aborted). A throw becomes an error. */
export function within<T>(
  read: (signal: AbortSignal) => PromiseLike<ReadResult<T>>,
  ms: number,
  timers: Timers = realTimers,
): Promise<ReadResult<T>> {
  const controller = new AbortController()
  return new Promise((resolve) => {
    let done = false
    const finish = (r: ReadResult<T>) => {
      if (done) return
      done = true
      timers.clearTimeout(timer)
      resolve(r)
    }
    const timer = timers.setTimeout(() => {
      finish({ data: null, error: { code: READ_TIMEOUT, message: `no answer in ${ms}ms` } })
      controller.abort()
    }, ms)
    try {
      Promise.resolve(read(controller.signal)).then(
        (r) => finish(r ?? { data: null, error: { message: "no result" } }),
        (e: unknown) => finish({ data: null, error: { message: e instanceof Error ? e.message : "the read failed" } }),
      )
    } catch (e) {
      finish({ data: null, error: { message: e instanceof Error ? e.message : "the read failed" } })
    }
  })
}

/**
 * A read, asked a second time when the first failed for any reason (a row
 * that is not there is not a failure: that is `data: null` with no error),
 * as long as the budget has room for a real second try.
 */
export async function readTwice<T>(
  read: (signal: AbortSignal) => PromiseLike<ReadResult<T>>,
  { attemptMs = EDITOR_READ_ATTEMPT_MS, budgetMs = EDITOR_READ_BUDGET_MS }: { attemptMs?: number; budgetMs?: number } = {},
  timers: Timers = realTimers,
): Promise<ReadResult<T>> {
  const start = timers.now()
  const first = await within(read, Math.min(attemptMs, budgetMs), timers)
  if (!first.error) return first
  const left = budgetMs - (timers.now() - start)
  if (left < 250) return first
  return within(read, Math.min(attemptMs, left), timers)
}
