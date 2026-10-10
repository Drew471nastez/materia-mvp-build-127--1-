/**
 * ===========================================================================
 *  A READ A LIVE WEBSITE DEPENDS ON
 * ===========================================================================
 * supabase-js does not throw when the database is slow or away: a statement
 * timeout or a dropped connection comes back as `{ data: null, error }`, and
 * a read that looks only at `data` takes it for "there is no such row". On
 * a live website that turned a few seconds of database trouble into "Coming
 * soon" or a 404, cached for an hour as if it were true.
 *
 * So a read the site cannot stand without goes through here: tried twice
 * within a time limit (lib/onepage/bounded-read.ts), and if it still fails it
 * THROWS. A thrown error is never cached: the cache and the page keep the
 * last good copy and try again later, which is what a visitor should see.
 * Only a read that worked and found nothing is "nothing".
 */
import { readTwice, type ReadResult } from "@/lib/onepage/bounded-read"

export class SiteReadError extends Error {
  constructor(what: string, why: string) {
    super(`${what}: ${why}`)
    this.name = "SiteReadError"
  }
}

/** One attempt's limit, and the whole read's, for a public page. */
export const SITE_READ_ATTEMPT_MS = 4000
export const SITE_READ_BUDGET_MS = 7000

export async function siteRead<T>(what: string, read: (signal: AbortSignal) => PromiseLike<ReadResult<T>>): Promise<T | null> {
  const r = await readTwice(read, { attemptMs: SITE_READ_ATTEMPT_MS, budgetMs: SITE_READ_BUDGET_MS })
  if (r.error) throw new SiteReadError(what, r.error.message ?? r.error.code ?? "the read failed")
  return r.data
}

/** Whether an error is the database being unreachable, as opposed to an answer. */
export function isSiteReadError(e: unknown): e is SiteReadError {
  return e instanceof SiteReadError
}
