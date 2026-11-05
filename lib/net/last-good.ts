/**
 * ===========================================================================
 *  THE LAST ROW THAT WAS READ, FOR WHEN THE NEXT READ OF IT FAILS (round 53)
 * ===========================================================================
 * The /app shell decides everything from two rows, the profile and the
 * creator, and drew "Storelib is not answering right now" over the whole
 * screen when either read failed, even when the same instance had read the
 * same two rows a minute before. A seller saw it on a full load, a pull to
 * refresh, and after every save that refreshes the page (router.refresh
 * draws the layout again).
 *
 * This keeps the last good answer per key in the instance's memory, for a
 * while, so a failed read can stand on it instead. It is ONLY read after a
 * read failed: an answer the database gave (a row, or no row) always wins.
 * Keys are a signed in person's own id, verified before anything is read
 * (lib/auth/request-scope), so one person's row is never anyone else's
 * answer. Bounded: the oldest key goes first past MAX_KEYS.
 *
 * Pure: no imports, no I/O. Safe to import anywhere on the server.
 */

/** How long a kept row may stand in for a failed read. */
export const LAST_GOOD_MS = 30 * 60_000
const MAX_KEYS = 5_000

type Kept = { value: unknown; at: number }

export class LastGood {
  private readonly rows = new Map<string, Kept>()
  constructor(private readonly maxKeys = MAX_KEYS, private readonly now: () => number = Date.now) {}

  /** A good answer, kept. */
  remember(key: string, value: unknown): void {
    this.rows.delete(key)
    this.rows.set(key, { value, at: this.now() })
    if (this.rows.size > this.maxKeys) {
      const oldest = this.rows.keys().next().value
      if (oldest !== undefined) this.rows.delete(oldest)
    }
  }

  /** The kept answer while it is young enough, else undefined. */
  recall<T>(key: string, maxAgeMs = LAST_GOOD_MS): T | undefined {
    const kept = this.rows.get(key)
    if (!kept) return undefined
    if (this.now() - kept.at > maxAgeMs) {
      this.rows.delete(key)
      return undefined
    }
    return kept.value as T
  }

  forget(key: string): void {
    this.rows.delete(key)
  }

  get size(): number {
    return this.rows.size
  }
}

/** The instance's one store of last good rows. */
export const lastGood = new LastGood()
