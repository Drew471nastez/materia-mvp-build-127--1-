/**
 * What a server keeps in memory under a site's stamp (./site-stamp.ts): a
 * value is handed back only while the stamp it was kept with is the stamp
 * now, and for MEMO_MAX_MS at most. The most recently used are kept.
 *
 * On its own, with nothing imported: the modules that keep things under a
 * stamp (./compat-site.ts, lib/storelib-theme/compat/stranger-hold.ts) are
 * themselves imported by what ./site-stamp.ts reads, and a class in that
 * circle would not be there yet when they are first loaded.
 */

/** How long a server trusts what it keeps in memory for a stamp, for what no tag names. */
export const MEMO_MAX_MS = 60_000

export class StampedMemo<T> {
  private readonly held = new Map<string, { stamp: string; at: number; value: T }>()
  constructor(
    private readonly max: number,
    private readonly maxAgeMs: number = MEMO_MAX_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string, stamp: string | null): T | undefined {
    if (!stamp) return undefined
    const e = this.held.get(key)
    if (!e) return undefined
    if (e.stamp !== stamp || this.now() - e.at > this.maxAgeMs) {
      this.held.delete(key)
      return undefined
    }
    this.held.delete(key)
    this.held.set(key, e)
    return e.value
  }

  set(key: string, stamp: string | null, value: T): void {
    if (!stamp) return
    this.held.delete(key)
    this.held.set(key, { stamp, at: this.now(), value })
    while (this.held.size > this.max) {
      const oldest = this.held.keys().next().value
      if (oldest === undefined) break
      this.held.delete(oldest)
    }
  }

  get size(): number {
    return this.held.size
  }
}
