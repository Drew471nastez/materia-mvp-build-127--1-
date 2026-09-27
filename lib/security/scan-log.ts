import "server-only"

/**
 * ===========================================================================
 *  ONE ROW PER SCAN, FOR THE ADMIN PAGE
 * ===========================================================================
 * public.file_scans (supabase/sql/run-now/55_file_scans.sql): what was
 * scanned, where from, and what came of it. Never the file's contents, only
 * its bucket, path, size, SHA-256 and the verdict. Server only: row level
 * security is on and no policy lets a browser read or write it.
 *
 * Writing a row never fails a scan or an upload. Before part 55 has run the
 * table is missing; that is said once in the log and then ignored.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { FileScanResult } from "./file-scanner-core"

/** Where a file came from when it was scanned. */
export type ScanSource =
  | "product_file"
  | "public_image"
  | "link_page_file"
  | "image_sweep"
  | "theme_import"
  | "download_check"
  | "admin_test"

/** What Storelib did with the file because of the scan. */
export type ScanAction = "kept" | "removed" | "refused" | "pending" | "none"

export interface ScanLogRow {
  id: string
  created_at: string
  source: string
  bucket: string | null
  path: string | null
  asset_id: string | null
  status: string
  threat: string | null
  reason: string | null
  sha256: string | null
  bytes: number | null
  duration_ms: number | null
  engine_version: string | null
  signatures: number | null
  action: string | null
  attempts: number | null
}

let saidMissing = false
function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || /file_scans/.test(error.message ?? "")
}

export async function recordScan(
  admin: SupabaseClient,
  entry: {
    source: ScanSource
    result: FileScanResult
    bucket?: string | null
    path?: string | null
    assetId?: string | null
    action?: ScanAction
  },
): Promise<void> {
  /* Scanning off: nothing happened worth a row. */
  if (entry.result.status === "not_scanned" && entry.result.reason === "not_configured") return
  try {
    const { error } = await admin.from("file_scans").insert({
      source: entry.source,
      bucket: entry.bucket ?? null,
      path: entry.path ? entry.path.slice(0, 512) : null,
      asset_id: entry.assetId ?? null,
      status: entry.result.status,
      threat: entry.result.threat ?? null,
      reason: entry.result.reason ?? null,
      sha256: entry.result.sha256 ?? null,
      bytes: entry.result.bytes ?? null,
      duration_ms: Math.round(entry.result.durationMs),
      engine_version: entry.result.engine?.version ?? null,
      signatures: entry.result.engine?.signatures ?? null,
      action: entry.action ?? "none",
      attempts: entry.result.attempts ?? null,
    })
    if (error && missingTable(error) && !saidMissing) {
      saidMissing = true
      console.info("[file-scanner] file_scans is not there yet (supabase/sql/run-now/55_file_scans.sql); scans are not logged")
    }
  } catch {
    /* A log row is never worth failing an upload for. */
  }
}

/** The latest scans, newest first. `unavailable` when part 55 has not run. */
export async function recentScans(admin: SupabaseClient, limit = 25): Promise<{ rows: ScanLogRow[]; unavailable?: string }> {
  const { data, error } = await admin
    .from("file_scans")
    .select("id, created_at, source, bucket, path, asset_id, status, threat, reason, sha256, bytes, duration_ms, engine_version, signatures, action, attempts")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)))
  if (error) {
    return { rows: [], unavailable: missingTable(error) ? "The scan log starts after supabase/sql/run-now/55_file_scans.sql has run." : "The scan log could not be read." }
  }
  return { rows: (data ?? []) as ScanLogRow[] }
}

/**
 * Clean verdicts older than ninety days are dropped: the log answers "what
 * happened lately", and a clean picture from last spring answers nothing.
 * Infected files and failed scans are kept.
 */
export async function pruneScanLog(admin: SupabaseClient, days = 90): Promise<void> {
  try {
    await admin
      .from("file_scans")
      .delete()
      .in("status", ["clean", "not_scanned"])
      .lt("created_at", new Date(Date.now() - days * 86_400_000).toISOString())
  } catch {
    /* Before part 55 there is nothing to prune. */
  }
}
