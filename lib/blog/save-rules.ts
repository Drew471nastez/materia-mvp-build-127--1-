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

/**
 * BEFORE SQL PART 345 a reader's view adds one to blog_posts.views, and the
 * table's original trigger moves updated_at on every update, so updated_at
 * changes each time somebody reads a live post. Used as the version it made
 * every Update on a read post a false "changed somewhere else". Without
 * part 345 (a row read with select("*") that has no draft_saved_at column)
 * the version is a fingerprint of what the editor writes instead: what a
 * reader sees, never the view count.
 */
const EDITED_COLUMNS = ["title", "slug", "excerpt", "content", "category", "read_time", "author_name", "cover_image_url", "seo_title", "seo_description", "seo_keywords", "is_published", "published_at"] as const

function fnv1a(text: string, seed: number): string {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

/** A fingerprint of the columns the editor writes, for a table without part 345. */
export function contentFingerprint(row: Record<string, unknown>): string {
  const text = JSON.stringify(EDITED_COLUMNS.map((c) => (c === "published_at" && typeof row[c] === "string" ? Date.parse(row[c] as string) || row[c] : row[c] ?? null)))
  return `c:${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x01000193)}`
}

/** The version the editor is handed and sends back: postVersion with part 345, the content's fingerprint without it. */
export function editVersion(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null
  if (!("draft_saved_at" in row) && "content" in row) return contentFingerprint(row)
  return postVersion(row as Versioned)
}

/** Whether a save made from `clientVersion` is out of date against `row`. A save that names no version is out of date. */
export function isStaleSave(clientVersion: string | null | undefined, row: (Versioned & { [column: string]: unknown }) | null | undefined, force = false): boolean {
  if (force) return false
  const current = row && !("draft_saved_at" in row) && "content" in row ? editVersion(row as Record<string, unknown>) : postVersion(row)
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
