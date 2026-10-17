import "server-only"

/**
 * ===========================================================================
 *  A FILE'S IDENTITY, AND TAKING IT OUT OF THE LIBRARY WITHOUT DELETING IT
 * ===========================================================================
 * `library_assets` (SQL part 222). One row per object in a store's Files
 * library: which folder it belongs to, and whether it has been taken out of
 * the list.
 *
 * "Remove from Files" writes `removed_at` and leaves the object alone. That
 * is the whole fix: the bytes stay, so a store logo, a receipt, a website
 * section, a product photo or a checkout icon that still points at the
 * address keeps drawing. The list stops showing it, which is what the person
 * asked for.
 *
 * `purge_after` is thirty days on. Only the daily cron collects the bytes,
 * and only after both reference gates say nothing points at the object
 * (lib/files/references.ts collectable). Within those thirty days the person
 * can put it back (`restoreAssets`).
 *
 * WHY NOT REFERENCE COUNTING. An address is stored in about thirty places,
 * most of them inside a JSON blob a theme, a page, a post or a lesson wrote,
 * by dozens of code paths that share no single helper. A counter would have
 * to be incremented by every one of them, and the first writer anybody
 * forgot would make the counter say zero while a live page still drew the
 * picture, which is this bug again with a number on it. Retention plus a
 * reference check at collection time is wrong in the safe direction: the
 * worst it does is keep a file nobody needs for thirty days.
 *
 * WITHOUT PART 222 none of this is available, and the library refuses to
 * remove a file anything still points at rather than deleting it
 * (lib/files/library.ts).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** How long a removed file's bytes are kept before the cron may collect them. */
export const RETENTION_DAYS = 30

/** The database does not have part 222 yet. */
const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"])
export const NEEDS_PART = "Files needs its database update. Run SQL part 222 in Supabase, then try again."

export function isMissing(error: { code?: string } | null | undefined): boolean {
  return !!error?.code && MISSING.has(error.code)
}

export interface AssetKey {
  bucket: string
  path: string
}

export interface LibraryAsset extends AssetKey {
  id: string
  removedAt: string | null
  purgeAfter: string | null
  purgedAt: string | null
  usesAtRemoval: number | null
}

const row = (r: Record<string, unknown>): LibraryAsset => ({
  id: String(r.id ?? ""),
  bucket: String(r.bucket ?? ""),
  path: String(r.path ?? ""),
  removedAt: typeof r.removed_at === "string" ? r.removed_at : null,
  purgeAfter: typeof r.purge_after === "string" ? r.purge_after : null,
  purgedAt: typeof r.purged_at === "string" ? r.purged_at : null,
  usesAtRemoval: typeof r.uses_at_removal === "number" ? r.uses_at_removal : null,
})

/** `bucket:path`, the id the API and the library use for one file. */
export const assetId = (a: AssetKey) => `${a.bucket}:${a.path}`

/**
 * THE FILES THIS STORE HAS TAKEN OUT OF ITS LIBRARY, as `bucket:path`. The
 * listing leaves these out; the objects are still there.
 *
 * `ready: false` means part 222 has not run: the listing then shows
 * everything, as it did before, which is the safe way round (a file shown
 * that should be hidden, never a file deleted).
 */
export async function removedAssetIds(db: Db, owner: { userId: string; creatorId: string }): Promise<{ ids: Set<string>; ready: boolean }> {
  try {
    const { data, error } = await db
      .from("library_assets")
      .select("bucket, path")
      .or(`owner_user_id.eq.${owner.userId},owner_creator_id.eq.${owner.creatorId}`)
      .not("removed_at", "is", null)
      .limit(5000)
    if (error) return { ids: new Set(), ready: !isMissing(error) }
    const ids = new Set<string>()
    for (const r of (data ?? []) as Record<string, unknown>[]) ids.add(`${r.bucket}:${r.path}`)
    return { ids, ready: true }
  } catch {
    return { ids: new Set(), ready: false }
  }
}

/** One asset's row, or null when there is none (or part 222 has not run). */
export async function readAsset(db: Db, key: AssetKey): Promise<LibraryAsset | null> {
  try {
    const { data, error } = await db.from("library_assets").select("id, bucket, path, removed_at, purge_after, purged_at, uses_at_removal").eq("bucket", key.bucket).eq("path", key.path).maybeSingle()
    if (error || !data) return null
    return row(data as Record<string, unknown>)
  } catch {
    return null
  }
}

/** The owner columns for a path: the folder it sits in is the owner it belongs to. */
function ownerFields(owner: { userId: string; creatorId: string }, bucket: string): Record<string, string | null> {
  return bucket === "product-images" ? { owner_creator_id: owner.creatorId, owner_user_id: owner.userId } : { owner_user_id: owner.userId, owner_creator_id: owner.creatorId }
}

export interface RemoveOutcome {
  ok: boolean
  /** Part 222 has not run, so nothing was written. */
  needsPart?: boolean
}

/**
 * TAKEN OUT OF THE LIST, KEPT ON DISK. One row per file, with the number of
 * places that were using it written down for the report, never for the
 * decision: the cron asks the reference gates again before any bytes go.
 */
export async function removeAssets(
  db: Db,
  owner: { userId: string; creatorId: string },
  files: readonly (AssetKey & { bytes?: number | null; mime?: string | null; uses?: number | null })[],
): Promise<RemoveOutcome> {
  if (files.length === 0) return { ok: true }
  const now = new Date()
  const purgeAfter = new Date(now.getTime() + RETENTION_DAYS * 86_400_000).toISOString()
  const payload = files.map((f) => ({
    ...ownerFields(owner, f.bucket),
    bucket: f.bucket,
    path: f.path,
    bytes: typeof f.bytes === "number" ? f.bytes : null,
    mime: typeof f.mime === "string" ? f.mime : null,
    uses_at_removal: typeof f.uses === "number" ? f.uses : null,
    removed_at: now.toISOString(),
    purge_after: purgeAfter,
    purged_at: null,
    updated_at: now.toISOString(),
  }))
  try {
    const { error } = await db.from("library_assets").upsert(payload, { onConflict: "bucket,path", ignoreDuplicates: false })
    if (error) return { ok: false, needsPart: isMissing(error) }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/**
 * Put back in the list. The object never went anywhere, so there is nothing
 * to fetch. A row that says the bytes were collected is left alone unless
 * `includePurged` is set, which the repair pass uses for a row whose object
 * turned out to be there after all (lib/files/repair.ts).
 */
export async function restoreAssets(db: Db, owner: { userId: string; creatorId: string }, files: readonly AssetKey[], options: { includePurged?: boolean } = {}): Promise<RemoveOutcome> {
  if (files.length === 0) return { ok: true }
  try {
    for (const f of files) {
      let query = db
        .from("library_assets")
        .update({ removed_at: null, purge_after: null, purged_at: null, uses_at_removal: null, updated_at: new Date().toISOString() })
        .eq("bucket", f.bucket)
        .eq("path", f.path)
      if (!options.includePurged) query = query.is("purged_at", null)
      const { error } = await query
      if (error) return { ok: false, needsPart: isMissing(error) }
    }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Written down when the bytes really go, by hand or by the cron. */
export async function markPurged(db: Db, files: readonly AssetKey[]): Promise<void> {
  const now = new Date().toISOString()
  for (const f of files) {
    try {
      await db.from("library_assets").update({ purged_at: now, updated_at: now }).eq("bucket", f.bucket).eq("path", f.path)
    } catch {
      /* the object is gone either way; the row catches up next run */
    }
  }
}

export interface DueAsset extends LibraryAsset {
  ownerUserId: string | null
  ownerCreatorId: string | null
}

/**
 * REMOVED LONG ENOUGH AGO THAT THE BYTES MAY BE LOOKED AT. Oldest first, at
 * most `limit`. Being due is not permission: the caller asks the reference
 * gates about each one (lib/files/references.ts collectable).
 */
export async function assetsDueForPurge(db: Db, limit = 100): Promise<{ rows: DueAsset[]; ready: boolean }> {
  try {
    const { data, error } = await db
      .from("library_assets")
      .select("id, bucket, path, removed_at, purge_after, purged_at, uses_at_removal, owner_user_id, owner_creator_id")
      .not("removed_at", "is", null)
      .is("purged_at", null)
      .lt("purge_after", new Date().toISOString())
      .order("purge_after", { ascending: true })
      .limit(Math.max(1, Math.min(limit, 500)))
    if (error) return { rows: [], ready: !isMissing(error) }
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      ...row(r),
      ownerUserId: typeof r.owner_user_id === "string" ? r.owner_user_id : null,
      ownerCreatorId: typeof r.owner_creator_id === "string" ? r.owner_creator_id : null,
    }))
    return { rows, ready: true }
  } catch {
    return { rows: [], ready: false }
  }
}
