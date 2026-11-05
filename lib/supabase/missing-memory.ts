/**
 * ===========================================================================
 *  A COLUMN THE DATABASE DOES NOT HAVE IS ASKED FOR ONCE, NOT ON EVERY READ
 * ===========================================================================
 * Many reads ask with the newest columns first and, when Postgres answers
 * that one is missing (42703, PGRST204: a SQL part not run yet), ask again
 * with fewer. That kept pages working, but on a database without the part
 * the first ask failed on every single read: a Postgres ERROR line, a 400
 * in the API gateway and a wasted round trip each time, on a public page
 * that is drawn for every crawler (round 54, the owner's logs: 153,830 of
 * 154,391 Postgres log lines were errors).
 *
 * `readLadder` remembers, per server and per read, the first rung that
 * answered, and starts there for MISSING_FOR_MS. After that it tries the
 * top rung once again, so running the SQL part is picked up within minutes
 * with no deploy. Only a missing column or table moves it down: a timeout or
 * any other error is answered as before and remembers nothing.
 */

type PgError = { code?: string; message?: string } | null | undefined

/** How long a read starts below a rung the database said it cannot answer. */
export const MISSING_FOR_MS = 10 * 60 * 1000

const MISSING_CODES = new Set(["42703", "PGRST204", "42P01", "PGRST205", "PGRST200"])

/** A column, table or relationship the database does not have. */
export function isMissingSchema(error: PgError): boolean {
  return !!error && MISSING_CODES.has(String(error.code ?? ""))
}

const startAt = new Map<string, { rung: number; until: number }>()

/** The rung `key` starts on now (0 unless a lower one was remembered and is still fresh). */
export function rememberedRung(key: string, now = Date.now()): number {
  const held = startAt.get(key)
  if (!held) return 0
  if (now >= held.until) {
    startAt.delete(key)
    return 0
  }
  return held.rung
}

/** Remember that `key` answered on `rung` after the ones above it were missing. */
export function rememberRung(key: string, rung: number, now = Date.now()): void {
  if (rung <= 0) {
    startAt.delete(key)
    return
  }
  if (startAt.size > 500) startAt.clear()
  startAt.set(key, { rung, until: now + MISSING_FOR_MS })
}

/** For the tests: forget everything remembered. */
export function forgetMissing(): void {
  startAt.clear()
}

/**
 * Runs `rungs` in order, from the remembered one, moving down only while the
 * answer is a missing column (`missing`, isMissingSchema by default). The
 * last answer is returned as it came, error and all.
 */
export async function readLadder<F extends () => PromiseLike<unknown>>(
  key: string,
  rungs: readonly F[],
  missing: (error: PgError) => boolean = isMissingSchema,
): Promise<Awaited<ReturnType<F>>> {
  type R = Awaited<ReturnType<F>>
  const errorOf = (a: R): PgError => (a as { error?: PgError } | null)?.error ?? null
  const from = Math.min(rememberedRung(key), rungs.length - 1)
  let answer = (await rungs[from]()) as R
  let at = from
  while (errorOf(answer) && missing(errorOf(answer)) && at < rungs.length - 1) {
    at++
    answer = (await rungs[at]()) as R
  }
  if (at !== from && !(errorOf(answer) && missing(errorOf(answer)))) rememberRung(key, at)
  return answer
}
