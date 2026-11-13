/**
 * ===========================================================================
 *  WHICH COPY OF THE PAGE AN EDITOR STARTED FROM (round AU)
 * ===========================================================================
 * The OnePage editor sends the whole page on every Save. An editor left open
 * on a phone since yesterday, saved after the same page was changed on a
 * computer, used to put yesterday's blocks back over today's without a word.
 *
 * The fingerprint below names the parts of the row only the editor writes:
 * the blocks, the archive, the look and the bio. The title, the photo, the
 * social links and the settings are left out on purpose, because other
 * screens write them too (lib/account/profile-follow, lib/social/onepage-sync,
 * the share picture's own upload) and a guard that fired on those would ask
 * about changes nobody made in another editor.
 *
 * The server works it out from the row it read (the page the editor opens
 * with, and the row each save wrote) and the editor hands back the one it
 * holds as `base_version`. A save whose base no longer matches the row is
 * answered 409 and writes nothing (app/api/onepage PUT); the editor says so,
 * and a second Save is the creator choosing to keep what they have.
 *
 * Pure and isomorphic: a stable JSON (keys sorted, so jsonb's own key order
 * never matters) through 64 bits of FNV-1a, no crypto module needed.
 */

type Row = {
  draft_blocks?: unknown
  archived_blocks?: unknown
  theme?: unknown
  bio?: unknown
}

function stable(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (typeof value === "object") {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/** 64-bit FNV-1a over UTF-16 code units, as 16 hex digits. */
function fnv64(text: string): string {
  let h1 = 0x811c9dc5 >>> 0
  let h2 = 0xcbf29ce4 >>> 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x0100019b) >>> 0
    h2 = (h2 ^ (h1 >>> 7)) >>> 0
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")
}

/** The fingerprint of the parts of a `onepages` row only the editor writes. */
export function onePageEditVersion(row: Row | null | undefined): string | null {
  if (!row) return null
  const blocks = Array.isArray(row.draft_blocks) ? row.draft_blocks : []
  const archived = Array.isArray(row.archived_blocks) ? row.archived_blocks : []
  const bio = typeof row.bio === "string" ? row.bio : ""
  return fnv64(stable([blocks, archived, row.theme ?? null, bio]))
}

/** A base the editor sent: a 16 digit fingerprint, or nothing (an older editor, which is not asked). */
export function sentBaseVersion(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{16}$/.test(value) ? value : null
}
