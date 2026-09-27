import "server-only"

/**
 * ===========================================================================
 *  FILES NOTHING REFERS TO ANY MORE
 * ===========================================================================
 * Storage fills with files no row points at: a theme package whose import
 * was abandoned, a digital file whose upload was started and never finished,
 * a picture dropped into a product description and deleted again, product
 * photos removed in the editor (the editor stopped deleting them at once, so
 * that Cancel can bring them back), a download ZIP for a file set that has
 * changed. Each is somebody's storage bill, and some are somebody's photos.
 *
 * This is the collector, run once a day by /api/cron/storage-cleanup.
 *
 * What it may delete is decided in the database, by
 * public.storage_cleanup_candidates (supabase/migrations/20260929_upload_safety.sql),
 * which reads storage.objects against the rows that could refer to each file
 * and errs towards keeping: a path it does not understand, or a table it
 * cannot read, keeps the file. This side then checks every candidate again
 * against the shape its reason promises before removing anything, so a bug
 * in one half cannot delete what the other half would have kept.
 *
 * It also:
 *   - removes upload records left "pending" or "failed" for two days, with
 *     their file, unless a variant still lists them;
 *   - gives older files their first check and a SHA-256, a few a run
 *     (lib/security/uploads/pipeline.ts), and trims the security log.
 *
 * Bounded: at most `limit` files per run, so a backlog drains over several
 * days instead of one request timing out and removing nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { DIGITAL_BUCKETS } from "./plans"
import { pruneSecurityLog } from "@/lib/security/uploads/audit"
import { sweepAssets } from "@/lib/security/uploads/pipeline"

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/** Every reason the database may give, the bucket it may name, and the shape the path must have. */
export const CLEANUP_RULES: Record<string, { buckets: readonly string[]; path: RegExp }> = {
  "theme-import": { buckets: ["digital-products"], path: new RegExp(`^${UUID}/theme-imports/${UUID}\\.zip$`, "i") },
  "digital-orphan": {
    buckets: ["digital-products", "product-files"],
    path: new RegExp(`^(${UUID}/digital-products/[^/]+|products/${UUID}/[^/]+)$`, "i"),
  },
  "bundle-orphan": { buckets: ["digital-products"], path: new RegExp(`^${UUID}/bundles/[^/]+\\.zip$`, "i") },
  "description-image": { buckets: ["product-images"], path: new RegExp(`^${UUID}/(${UUID}|temp)/[^/]*_description_[^/]+$`, "i") },
  "removed-image": { buckets: ["product-images"], path: new RegExp(`^${UUID}/(${UUID}|temp)/`, "i") },
}

/** Whether a candidate is one this side agrees may go. */
export function mayRemove(candidate: { bucket_id: string; name: string; reason: string }): boolean {
  const rule = CLEANUP_RULES[candidate.reason]
  if (!rule) return false
  if (!rule.buckets.includes(candidate.bucket_id)) return false
  if (candidate.name.split("/").some((p) => p === ".." || p === "")) return false
  return rule.path.test(candidate.name)
}

/** Upload records this old and still not finished are abandoned. */
export const STALE_UPLOAD_HOURS = 48

export interface CleanupSummary {
  dryRun: boolean
  candidates: number
  removed: Record<string, number>
  refused: number
  staleUploads: number
  /** Older files given their verdict this run. */
  scanned: number
  /** Files given their SHA-256 this run. */
  hashed?: number
  errors: string[]
}

export async function runStorageCleanup(
  admin: SupabaseClient,
  options: { dryRun?: boolean; limit?: number; imageFromDays?: number; scanLimit?: number } = {},
): Promise<CleanupSummary> {
  const dryRun = options.dryRun === true
  const limit = Math.max(1, Math.min(options.limit ?? 300, 1000))
  const imageFromDays = Math.max(31, Math.min(options.imageFromDays ?? 32, 3650))
  const summary: CleanupSummary = { dryRun, candidates: 0, removed: {}, refused: 0, staleUploads: 0, scanned: 0, errors: [] }

  /* 1. Files no row refers to. */
  const { data: candidates, error } = await admin.rpc("storage_cleanup_candidates", {
    p_limit: limit,
    p_image_from_days: imageFromDays,
  })
  if (error) {
    summary.errors.push(`candidates: ${error.message}`)
  } else {
    const list = (candidates ?? []) as { bucket_id: string; name: string; reason: string }[]
    summary.candidates = list.length
    const byBucket = new Map<string, { name: string; reason: string }[]>()
    for (const c of list) {
      if (!mayRemove(c)) {
        summary.refused++
        continue
      }
      const group = byBucket.get(c.bucket_id) ?? []
      group.push({ name: c.name, reason: c.reason })
      byBucket.set(c.bucket_id, group)
    }
    for (const [bucket, files] of byBucket) {
      for (let i = 0; i < files.length; i += 100) {
        const batch = files.slice(i, i + 100)
        if (!dryRun) {
          const { error: removeError } = await admin.storage.from(bucket).remove(batch.map((f) => f.name))
          if (removeError) {
            summary.errors.push(`${bucket}: ${removeError.message}`)
            continue
          }
        }
        for (const f of batch) summary.removed[f.reason] = (summary.removed[f.reason] ?? 0) + 1
      }
    }
  }

  /* 2. Uploads started and never finished. */
  const cutoff = new Date(Date.now() - STALE_UPLOAD_HOURS * 3600 * 1000).toISOString()
  const { data: stale } = await admin
    .from("digital_assets")
    .select("id, file_path, storage_bucket")
    .in("upload_status", ["pending", "failed"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(100)
  if (stale && stale.length > 0) {
    const { data: mapped } = await admin
      .from("product_variant_files")
      .select("digital_asset_id")
      .in("digital_asset_id", stale.map((s) => s.id))
    const kept = new Set((mapped ?? []).map((m: { digital_asset_id: string }) => m.digital_asset_id))
    for (const s of stale) {
      if (kept.has(s.id)) continue
      const bucket = s.storage_bucket && (DIGITAL_BUCKETS as readonly string[]).includes(s.storage_bucket) ? s.storage_bucket : null
      if (!dryRun) {
        if (bucket && s.file_path && !s.file_path.split("/").includes("..")) {
          await admin.storage.from(bucket).remove([s.file_path]).then(
            () => undefined,
            () => undefined,
          )
        }
        await admin.from("digital_assets").delete().eq("id", s.id)
      }
      summary.staleUploads++
    }
  }

  /* 3. Files with no verdict yet (from before the checks) and files not yet
     hashed, a few at a time (lib/security/uploads/pipeline.ts sweepAssets),
     then the security log's old rows. */
  if (!dryRun) {
    try {
      const swept = await sweepAssets(admin, { budgetMs: 120_000, limit: Math.max(1, Math.min(options.scanLimit ?? 50, 200)) })
      summary.scanned = swept.resolved + swept.blocked
      summary.hashed = swept.hashed
      for (const e of swept.errors) summary.errors.push(`check ${e}`)
    } catch (e) {
      summary.errors.push(`check: ${e instanceof Error ? e.message : String(e)}`)
    }
    await pruneSecurityLog(admin)
  }

  return summary
}
