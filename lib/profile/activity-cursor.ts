/**
 * ===========================================================================
 *  ONE TIMELINE FROM THREE TABLES, PAGED WITHOUT OFFSETS
 * ===========================================================================
 * A profile's Activity tab merges community activity, reviews and products,
 * newest first. Each item has a position: its timestamp, then a key that is
 * unique across the three (`ca:` + the padded activity id, `pr:` + a product
 * id, `rv:` + a review id). The cursor is the position of the last item
 * shown, and every table is asked only for what comes strictly after it, so
 * page 40 costs what page 1 costs and nothing is skipped or shown twice when
 * new things arrive while somebody scrolls.
 *
 * A table whose page came back full has a HORIZON: the position of the last
 * row it returned. Anything older than the most restrictive horizon might
 * have a newer, unfetched neighbour in that table, so the page stops there
 * and the next page starts from it.
 *
 * Pure, so the merge rules are tested directly (tests/profiles-follows).
 */

export interface Position {
  at: string
  key: string
}

/** Microseconds as six digits, so two timestamps compare as strings exactly as Postgres orders them. */
export function sortableTime(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?/.exec(iso || "")
  if (!m) return ""
  return `${m[1]}T${m[2]}.${(m[3] || "").padEnd(6, "0")}`
}

/** Newest first: positive when `a` comes before `b` in the timeline. */
export function newerThan(a: Position, b: Position): number {
  const ta = sortableTime(a.at)
  const tb = sortableTime(b.at)
  if (ta !== tb) return ta > tb ? 1 : -1
  if (a.key === b.key) return 0
  return a.key > b.key ? 1 : -1
}

const KEY = /^(ca|pr|rv):[0-9a-z-]{1,40}$/i

export function encodeCursor(p: Position): string {
  return Buffer.from(`${p.at}|${p.key}`, "utf8").toString("base64url")
}

/** A cursor back into a position, or null for anything that is not one we made. */
export function decodeCursor(raw: unknown): Position | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) return null
  let text = ""
  try {
    text = Buffer.from(raw, "base64url").toString("utf8")
  } catch {
    return null
  }
  const [at, key, extra] = text.split("|")
  if (extra !== undefined || !at || !key || !KEY.test(key) || !sortableTime(at)) return null
  if (!Number.isFinite(Date.parse(at))) return null
  return { at, key }
}

/** The bigint activity id as a key that sorts as a number does. */
export function activityKey(id: number | string): string {
  return `ca:${String(id).padStart(15, "0")}`
}

export interface SourcePage<T extends Position> {
  items: T[]
  /** The last raw row's position when the table may have more, else null. */
  horizon: Position | null
}

/**
 * Merges what each table returned into one page of at most `limit`, newest
 * first, and the cursor for the next page (null when everything is shown).
 */
export function mergePages<T extends Position>(sources: SourcePage<T>[], limit: number, after: Position | null = null): { items: T[]; next: Position | null } {
  const horizons = sources.map((s) => s.horizon).filter((h): h is Position => !!h)
  /* The most restrictive horizon is the NEWEST one: past it, that table has not been read. */
  const cutoff = horizons.reduce<Position | null>((best, h) => (!best || newerThan(h, best) > 0 ? h : best), null)
  const seen = new Set<string>()
  const all = sources
    .flatMap((s) => s.items)
    .filter((it) => {
      if (seen.has(it.key)) return false
      seen.add(it.key)
      if (after && newerThan(it, after) >= 0) return false
      return !cutoff || newerThan(it, cutoff) >= 0
    })
    .sort((a, b) => newerThan(b, a))
  if (all.length > limit) {
    const page = all.slice(0, limit)
    const last = page[page.length - 1]
    return { items: page, next: { at: last.at, key: last.key } }
  }
  return { items: all, next: cutoff ? { at: cutoff.at, key: cutoff.key } : null }
}

/**
 * The PostgREST filter that keeps a table's rows strictly after `after`.
 * Rows at the same instant are ordered by key, and keys sort by their
 * prefix first (rv > pr > ca), so another table's rows at that instant are
 * either all already shown or all still to come.
 */
export function afterFilter(prefix: "ca" | "pr" | "rv", after: Position, rawId: (key: string) => string): { op: "lt" | "lte"; at: string } | { op: "or"; expr: string } {
  const cursorPrefix = after.key.slice(0, 2)
  if (prefix > cursorPrefix) return { op: "lt", at: after.at }
  if (prefix < cursorPrefix) return { op: "lte", at: after.at }
  const at = JSON.stringify(after.at)
  return { op: "or", expr: `created_at.lt.${at},and(created_at.eq.${at},id.lt.${rawId(after.key)})` }
}
