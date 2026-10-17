import "server-only"

/**
 * ===========================================================================
 *  REFERENCES THAT ALREADY POINT AT NOTHING
 * ===========================================================================
 * Before the retention above existed, Files deleted the object. Every row
 * that still holds one of those addresses now points at bytes that are not
 * there: an empty logo on a receipt, a gap in a website section, a product
 * tile with nothing in it.
 *
 * This reads those rows back and says how many there are, surface by
 * surface. It fixes only what can honestly be fixed:
 *
 *   PUT BACK   the address points at an object that IS there, and the only
 *              reason the picture had gone from Files is a `removed_at` row.
 *              The row is cleared, so the file is in the library again and
 *              the cron will not look at it. Nothing about the reference
 *              changes: it was always right.
 *
 *   REPORTED   the object is gone. Nothing is written. There is no copy to
 *              bring back, and putting a DIFFERENT picture in its place
 *              would be worse than the gap, so the row keeps the address it
 *              has and the count says how many.
 *
 * Read only unless `apply` is set, and bounded, so it can be run from the
 * cron or by hand without a surprise.
 */

import { SURFACES, needlesFor, type Owner, type Surface } from "./references"
import { restoreAssets } from "./assets"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface BrokenReference {
  /** The surface the owner would name. */
  label: string
  surface: string
  bucket: string
  path: string
  /** The object is there: clearing `removed_at` puts it back in the library. */
  recoverable: boolean
}

export interface RepairReport {
  /** Rows holding an address whose object is not in storage. */
  broken: number
  /** Rows that say the bytes were collected while the object is still there. */
  recoverable: number
  /** Put back in the library this run (0 unless `apply`). */
  recovered: number
  /** Objects kept alive by the retention: removed from the library, still there, still pointed at. */
  retained: number
  /** Addresses whose bytes are gone. Nothing can bring them back. */
  unrecoverable: number
  /** Up to a few of each, for the report. */
  examples: BrokenReference[]
  /** A surface that could not be read: its rows are not in these numbers. */
  unreadable: string[]
}

/** Every Storelib media or storage address in a piece of text, as bucket and path. */
export function addressesIn(text: string): { bucket: string; path: string }[] {
  const out: { bucket: string; path: string }[] = []
  const seen = new Set<string>()
  const re = /(?:\/media\/|\/storage\/v1\/object\/public\/)(store-builder-images|product-images)\/([A-Za-z0-9/_%.-]{3,300})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    let path = m[2]
    try {
      path = decodeURIComponent(path)
    } catch {
      /* left as it is */
    }
    const key = `${m[1]}:${path}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ bucket: m[1], path })
  }
  return out
}

const textOf = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return ""
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}

async function rowsOf(db: Db, surface: Surface, owner: Owner): Promise<{ rows: Record<string, unknown>[]; ok: boolean }> {
  const cols = ["id", ...surface.columns].join(", ")
  const limit = surface.limit ?? 400
  try {
    if (surface.scope.kind === "own") {
      const scope = surface.scope
      const id = scope.owner === "creator" ? owner.creatorId : owner.userId
      if (!id) return { rows: [], ok: true }
      const { data, error } = await db.from(surface.table).select(cols).eq(scope.column, id).limit(limit)
      if (error) return { rows: [], ok: false }
      return { rows: (data ?? []) as Record<string, unknown>[], ok: true }
    }
    const scope = surface.scope
    const parentId = scope.parentOwner === "creator" ? owner.creatorId : owner.userId
    const parent = await db.from(scope.parent).select("id").eq(scope.parentColumn, parentId).limit(600)
    if (parent.error) return { rows: [], ok: false }
    const ids = ((parent.data ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean)
    if (ids.length === 0) return { rows: [], ok: true }
    const { data, error } = await db.from(surface.table).select(cols).in(scope.column, ids).limit(limit)
    if (error) return { rows: [], ok: false }
    return { rows: (data ?? []) as Record<string, unknown>[], ok: true }
  } catch {
    return { rows: [], ok: false }
  }
}

/** Whether an object is in storage. One listing per folder, kept for the run. */
function objectChecker(db: Db) {
  const folders = new Map<string, Promise<Set<string>>>()
  return async (bucket: string, path: string): Promise<boolean> => {
    const at = path.lastIndexOf("/")
    if (at < 1) return false
    const prefix = path.slice(0, at)
    const name = path.slice(at + 1)
    const key = `${bucket}:${prefix}`
    let listing = folders.get(key)
    if (!listing) {
      listing = (async () => {
        try {
          const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 })
          if (error) return new Set<string>()
          return new Set(((data ?? []) as { name: string }[]).map((e) => e.name))
        } catch {
          return new Set<string>()
        }
      })()
      folders.set(key, listing)
    }
    return (await listing).has(name)
  }
}

/**
 * The broken references in one store, and, with `apply`, the ones put back.
 * `surfaces` is only for the tests, which pin one surface at a time.
 */
export async function repairBrokenReferences(
  db: Db,
  owner: Owner,
  options: { apply?: boolean; surfaces?: readonly Surface[]; maxExamples?: number } = {},
): Promise<RepairReport> {
  const surfaces = options.surfaces ?? SURFACES
  const maxExamples = options.maxExamples ?? 20
  const report: RepairReport = { broken: 0, recoverable: 0, recovered: 0, retained: 0, unrecoverable: 0, examples: [], unreadable: [] }
  const exists = objectChecker(db)
  const putBack: { bucket: string; path: string }[] = []
  const counted = new Set<string>()

  for (const surface of surfaces) {
    const { rows, ok } = await rowsOf(db, surface, owner)
    if (!ok) {
      report.unreadable.push(surface.key)
      continue
    }
    for (const row of rows) {
      const text = surface.columns.map((c) => textOf(row[c])).filter(Boolean).join("\n")
      if (!text) continue
      for (const address of addressesIn(text)) {
        /* Only this store's own folders: another store's picture on their page is not ours to touch. */
        const folder = address.path.split("/")[0]
        if (folder !== owner.userId && folder !== owner.creatorId) continue
        const key = `${surface.key}:${address.bucket}:${address.path}`
        if (counted.has(key)) continue
        counted.add(key)
        if (await exists(address.bucket, address.path)) {
          /* The object is there. It is broken only if the library is hiding it, which the caller can undo. */
          continue
        }
        /* Not in the folder listing. The library could still be hiding a real
           object the listing did not reach (a folder with more than a
           thousand entries), so a second look asks for the one name. */
        const there = await oneObject(db, address.bucket, address.path)
        if (there) continue
        report.broken++
        report.unrecoverable++
        if (report.examples.length < maxExamples) report.examples.push({ label: surface.label, surface: surface.key, bucket: address.bucket, path: address.path, recoverable: false })
      }
    }
  }

  /* Objects the retention is keeping alive: taken out of the library, still
     there, and still pointed at. Counted as proof, never touched. */
  report.retained = await retainedCount(db, owner, exists)

  /* The one thing that can honestly be put back: a row that says the bytes
     were collected while the object is in fact still there (a collection
     that failed halfway, or a row written before its storage call). The row
     is cleared, so the file is in Files again. No reference changes and no
     other picture is ever put in a reference's place. */
  const wrongly = await purgedButPresent(db, owner, exists)
  report.recoverable = wrongly.length
  for (const h of wrongly) {
    if (report.examples.length < maxExamples) report.examples.push({ label: "Files", surface: "library", bucket: h.bucket, path: h.path, recoverable: true })
    putBack.push(h)
  }
  if (options.apply && putBack.length > 0) {
    const out = await restoreAssets(db, { userId: owner.userId, creatorId: owner.creatorId }, putBack, { includePurged: true })
    if (out.ok) report.recovered = putBack.length
  }
  return report
}

/** One object, asked for by name, for a folder too big to list. */
async function oneObject(db: Db, bucket: string, path: string): Promise<boolean> {
  const at = path.lastIndexOf("/")
  if (at < 1) return false
  try {
    const { data, error } = await db.storage.from(bucket).list(path.slice(0, at), { limit: 1, search: path.slice(at + 1) })
    if (error) return false
    return ((data ?? []) as { name: string }[]).some((e) => e.name === path.slice(at + 1))
  } catch {
    return false
  }
}

/** The ledger's rows for this store, with the filter the caller wants on `purged_at`. */
async function ledger(db: Db, owner: Owner, purged: boolean): Promise<{ bucket: string; path: string }[]> {
  try {
    let query = db
      .from("library_assets")
      .select("bucket, path")
      .or(`owner_user_id.eq.${owner.userId},owner_creator_id.eq.${owner.creatorId}`)
      .not("removed_at", "is", null)
    query = purged ? query.not("purged_at", "is", null) : query.is("purged_at", null)
    const { data, error } = await query.limit(500)
    if (error) return []
    return ((data ?? []) as { bucket: string; path: string }[]).filter((r) => r.bucket && r.path)
  } catch {
    return []
  }
}

/**
 * Objects the retention is keeping alive: taken out of the library, never
 * collected, and still there for whatever points at them. The number that
 * says the fix is working.
 */
async function retainedCount(db: Db, owner: Owner, exists: (bucket: string, path: string) => Promise<boolean>): Promise<number> {
  let n = 0
  for (const r of await ledger(db, owner, false)) if (await exists(r.bucket, r.path)) n++
  return n
}

/**
 * Rows that say the bytes were collected while the object is still in
 * storage. The bytes are a real retained object, so clearing the row is a
 * real recovery, not a substitute.
 */
async function purgedButPresent(db: Db, owner: Owner, exists: (bucket: string, path: string) => Promise<boolean>): Promise<{ bucket: string; path: string }[]> {
  const out: { bucket: string; path: string }[] = []
  for (const r of await ledger(db, owner, true)) if (await exists(r.bucket, r.path)) out.push({ bucket: r.bucket, path: r.path })
  return out
}
