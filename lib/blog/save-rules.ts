/**
 * ===========================================================================
 *  TWO TABS, ONE POST
 * ===========================================================================
 * Every save says which version of the post it was made from: the
 * `version` the editor was handed when it loaded, or by its last save. The
 * server compares it with the row's version now, and when they differ the
 * save is refused with 409 and nothing is written, so a second tab, or a
 * second person, never silently replaces work it has not seen. The editor
 * then offers Reload or Keep mine (`force`), which is the only way past it.
 *
 * The version is `draft_saved_at` (SQL part 345), which every save sets.
 * Before 345 it is `updated_at`. Compared as the exact string the database
 * gave: PostgREST writes microseconds, and two saves in one millisecond are
 * still two saves.
 */

export type Versioned = { draft_saved_at?: string | null; updated_at?: string | null }

export function postVersion(row: Versioned | null | undefined): string | null {
  return row?.draft_saved_at || row?.updated_at || null
}

/** Whether a save made from `clientVersion` is out of date against `row`. A save that names no version is out of date. */
export function isStaleSave(clientVersion: string | null | undefined, row: Versioned | null | undefined, force = false): boolean {
  if (force) return false
  const current = postVersion(row)
  if (!current) return false
  return !clientVersion || clientVersion !== current
}

/* ── Revisions: about fifty per post ─────────────────────────────────────── */

export const REVISION_CAP = 50

/** The ids to delete so that `cap` remain: `idsNewestFirst` as the database ordered them. */
export function revisionsToPrune(idsNewestFirst: string[], cap = REVISION_CAP): string[] {
  return idsNewestFirst.length > cap ? idsNewestFirst.slice(cap) : []
}

/* ── A slug changed on a published post ──────────────────────────────────── */

/**
 * What blog_redirects needs when a live post moves from `from` to `to`:
 * the old slug now points at the new one; any older slug that pointed at
 * `from` points at `to` directly (one hop, never a chain); and a redirect
 * away from `to` is removed, because `to` is a post again. Null when there
 * is nothing to record.
 */
export function slugChangePlan(from: string | null | undefined, to: string | null | undefined): { upsert: { from_slug: string; to_slug: string }; repointFrom: string; deleteFrom: string } | null {
  const a = (from ?? "").trim()
  const b = (to ?? "").trim()
  if (!a || !b || a === b) return null
  return { upsert: { from_slug: a, to_slug: b }, repointFrom: a, deleteFrom: b }
}
