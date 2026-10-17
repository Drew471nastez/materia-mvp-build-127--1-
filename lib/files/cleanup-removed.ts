import "server-only"

/**
 * ===========================================================================
 *  COLLECTING FILES REMOVED FROM A LIBRARY, ONCE NOTHING POINTS AT THEM
 * ===========================================================================
 * Keeping every removed file forever would be somebody's storage bill, so
 * the daily cron (/api/cron/storage-cleanup) comes back to them. A file is
 * only collected when ALL of this holds:
 *
 *   1. its row says removed, and `purge_after` has passed (thirty days,
 *      lib/files/assets.ts RETENTION_DAYS);
 *   2. the written down surfaces say nothing points at it, and every one of
 *      them could be read;
 *   3. public.storage_object_referenced (SQL part 18) says nothing points at
 *      it either, in a plain yes or no. A database without that function
 *      collects nothing.
 *
 * Anything else keeps the file and leaves the row alone, so the next run
 * asks again. A file put back in the library has no `removed_at` and is
 * never looked at here.
 *
 * BOUNDED. A time budget and a row limit, so a backlog drains over several
 * days instead of one request timing out and collecting nothing.
 */

import { assetsDueForPurge, markPurged } from "./assets"
import { collectable } from "./references"
import { isPosterName, posterPathFor } from "@/lib/media/video"

const VIDEO = /\.(mp4|webm|mov|m4v)$/i

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface RemovedSweep {
  /** Part 222 has not run: nothing to sweep, and not an error. */
  ready: boolean
  due: number
  collected: number
  /** Still referenced, so kept. */
  keptInUse: number
  /** The gates could not answer, so kept. */
  keptUnsure: number
  errors: string[]
}

export async function sweepRemovedLibraryFiles(db: Db, options: { dryRun?: boolean; limit?: number; budgetMs?: number } = {}): Promise<RemovedSweep> {
  const dryRun = options.dryRun === true
  const budgetMs = Math.max(5_000, Math.min(options.budgetMs ?? 60_000, 240_000))
  const started = Date.now()
  const out: RemovedSweep = { ready: true, due: 0, collected: 0, keptInUse: 0, keptUnsure: 0, errors: [] }
  const { rows, ready } = await assetsDueForPurge(db, options.limit ?? 100)
  if (!ready) return { ...out, ready: false }
  out.due = rows.length

  for (const asset of rows) {
    if (Date.now() - started > budgetMs) break
    /* A video's first frame goes with its video; on its own it is never looked at here. */
    if (isPosterName(asset.path)) continue
    const owner = { userId: asset.ownerUserId ?? "", creatorId: asset.ownerCreatorId ?? "" }
    if (!owner.userId && !owner.creatorId) {
      out.keptUnsure++
      continue
    }
    const verdict = await collectable(db, owner, asset.bucket, asset.path)
    if (!verdict.ok) {
      if (verdict.reason === "in-use" || verdict.reason === "in-use-elsewhere") out.keptInUse++
      else out.keptUnsure++
      continue
    }
    if (dryRun) {
      out.collected++
      continue
    }
    /* A video's first frame is part of the video, and was kept beside it. */
    const paths = asset.bucket === "store-builder-images" && VIDEO.test(asset.path) ? [asset.path, posterPathFor(asset.path)] : [asset.path]
    try {
      const { error } = await db.storage.from(asset.bucket).remove(paths)
      if (error) {
        out.errors.push(`${asset.bucket}: ${error.message}`)
        continue
      }
    } catch (e) {
      out.errors.push(`${asset.bucket}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    await markPurged(db, paths.map((p) => ({ bucket: asset.bucket, path: p })))
    out.collected++
  }
  return out
}
