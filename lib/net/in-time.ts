/**
 * ===========================================================================
 *  A READ A PAGE CAN DO WITHOUT, WAITED FOR ONLY SO LONG (round AP)
 * ===========================================================================
 * Production, Nov 9 2026, 09:12 to 09:17 UTC, andrewrullz.storelib.com: a
 * live page waited "store_offers took longer than 20s", "theme_file_blobs
 * took longer than 20s" and then "store_theme_custom_files took longer than
 * 20s" one after the other. 20 seconds is the deadline every Supabase read
 * has (lib/net/deadline.ts), which is right for an order or a cron and far
 * too long for a visitor looking at a tab whose spinner does not stop. The
 * owner: "it takes more than 10 to 15 seconds", "sometimes it blocks
 * completely on loading infinitely".
 *
 * `inTime` waits for a promise up to `ms` and then goes on with `fallback`,
 * saying it did (`late`), so the caller can draw the page without that part
 * and keep the page from being held or shared as if it were whole. The read
 * itself is left to finish behind: a cache it fills (unstable_cache) is
 * filled for the next visitor. A rejection is the fallback too, not late.
 */

export interface InTime<T> {
  value: T
  /** The answer did not come within the time: `value` is the fallback. */
  late: boolean
  /** The read failed: `value` is the fallback. */
  failed: boolean
}

export function inTime<T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<InTime<T>> {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      resolve({ value: fallback, late: true, failed: false })
    }, Math.max(0, ms))
    /* Not unref'd: whoever waits is told, even when nothing else keeps the process up (a script, a test). */
    Promise.resolve(p).then(
      (value) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ value, late: false, failed: false })
      },
      () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ value: fallback, late: false, failed: true })
      },
    )
  })
}

/** The same, for a read the page cannot be drawn without: its answer within `ms`, or `onLate()` thrown. */
export async function inTimeOrThrow<T>(p: PromiseLike<T>, ms: number, onLate: () => Error): Promise<T> {
  const LATE = Symbol("late")
  const r = await inTime<T | typeof LATE>(
    Promise.resolve(p).then((v) => v, (e: unknown) => {
      throw e
    }),
    ms,
    LATE,
  )
  if (r.late) throw onLate()
  if (r.failed) return p as Promise<T>
  return r.value as T
}
