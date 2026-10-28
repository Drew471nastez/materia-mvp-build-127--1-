/**
 * ===========================================================================
 *  THE SPINNER NEVER WAITS FOR THE WHOLE REFRESH
 * ===========================================================================
 * A pull used to hold its spinner until the refresh settled. On /app home
 * that is the Analytics answer (asked again beside itself after 4s, so a slow
 * one took 6 to 7s); on Orders it is router.refresh(), which waits for the
 * layout and the page to be drawn again on the server, with an 8s fallback.
 * Either way the page sat pulled down, spinning, for as long as the slowest
 * read took.
 *
 * iOS does not do that. The spinner says "asked"; the rows come in when they
 * come. So the gesture finishes when the refresh does or when PULL_SPIN_MAX_MS
 * has passed, whichever is first, and the refresh carries on behind it: every
 * caller draws its answer when it lands (setHomeAnswer, the orders rows, the
 * router's commit), with or without a spinner on the screen.
 *
 * Pure and timer-injectable, so tests/nav-speed.test.ts can run it without a
 * browser.
 */

/** The longest the page stays pulled down for one refresh. */
export const PULL_SPIN_MAX_MS = 1_800

export type SpinEnd = "settled" | "capped"

/**
 * Resolves with "settled" when `work` settles (a rejection counts: a failed
 * refresh still puts the spinner away) or "capped" after `maxMs`, whichever
 * comes first. Never rejects. `work` is not cancelled: it keeps running.
 */
export function spinUntil(
  work: () => Promise<unknown> | unknown,
  maxMs: number = PULL_SPIN_MAX_MS,
  timers: { set: (f: () => void, ms: number) => unknown; clear: (t: unknown) => void } = {
    set: (f, ms) => setTimeout(f, ms),
    clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  },
): Promise<SpinEnd> {
  return new Promise<SpinEnd>((resolve) => {
    let done = false
    const finish = (how: SpinEnd) => {
      if (done) return
      done = true
      timers.clear(timer)
      resolve(how)
    }
    const timer = maxMs > 0 && Number.isFinite(maxMs) ? timers.set(() => finish("capped"), maxMs) : null
    let running: Promise<unknown>
    try {
      running = Promise.resolve(work())
    } catch {
      running = Promise.resolve()
    }
    running.then(
      () => finish("settled"),
      () => finish("settled"),
    )
  })
}
