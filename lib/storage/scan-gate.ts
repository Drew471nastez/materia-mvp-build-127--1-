import "server-only"

/**
 * ===========================================================================
 *  NO FILE REACHES A BUYER BEFORE IT HAS BEEN LOOKED AT
 * ===========================================================================
 * lib/storage/antivirus.ts describes the design: a file uploads as
 * "pending_scan", is scanned, and downloads wait for the result. Two things
 * made that untrue. Nothing scanned a pending file unless the product editor
 * happened to call /api/v2/upload/scan after the upload, and the main download
 * route (/api/download/[assetId]) only refused files already marked infected,
 * so an unscanned file went to buyers as it was.
 *
 * Now:
 *   scanAsset      looks at one asset: its first bytes always (a renamed
 *                  executable, a script behind a document's name), the whole
 *                  file through the configured engine when there is one and
 *                  the file is small enough to hold. Called when an upload
 *                  completes, by the scan route, and hourly by the storage
 *                  cron for anything still pending.
 *   gateDownload   what a download route asks. A flagged file is refused. A
 *                  pending one is scanned by header on the spot; with no
 *                  external engine that result is final, with one the file
 *                  waits for the engine (the creator can always fetch their
 *                  own file).
 *
 * No paid service is added. CLAMAV_REST_URL, CLOUDMERSIVE_API_KEY or
 * VIRUSTOTAL_API_KEY switch the engine on; without them the heuristic is the
 * engine, and says so in scan_result.engine.
 *
 * ===========================================================================
 *  WITH STORELIB'S OWN SCANNER (ClamAV, lib/security/file-scanner.ts)
 * ===========================================================================
 * When CLAMAV_SERVICE_URL and CLAMAV_SERVICE_SECRET are both set, that is the
 * engine, and the whole file is streamed to it from storage (up to its size
 * limit, 1 GB), never held in the function. What each answer does to a paid
 * file:
 *
 *   clean       scan_status "clean", buyers can download it.
 *   infected    the object is deleted, the row is "infected" and
 *               "quarantined", the creator sees Blocked with the threat's
 *               name in the product editor, and no buyer ever gets it.
 *   too large   (over 1 GB) ClamAV cannot take it: the header check above is
 *               the whole scan, recorded honestly as "skipped", and the file
 *               is served. Blocking every large course or video would make
 *               them unsellable, and a renamed program is still refused.
 *   no verdict  (scanner down, busy, slow, wrong secret, ClamAV error) the
 *               file STAYS "pending_scan", with the attempt counted in
 *               scan_result. Buyers are told it is still being checked (409)
 *               and nothing is served; the creator can still fetch their own
 *               file. The editor retries, the scan-files cron retries every
 *               ten minutes, and a buyer's download of a small file tries
 *               once more on the spot. Failing closed here is the safe side:
 *               a paid file is the one thing a buyer runs on their machine
 *               because Storelib handed it to them.
 *
 * Without the two variables every path below is exactly what it was before.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { isScannerConfigured, scanStoredObject, type FileScanResult } from "@/lib/security/file-scanner"
import { recordScan, type ScanSource } from "@/lib/security/scan-log"

import {
  handleInfectedFile,
  hasExternalScanner,
  MAX_SCAN_SIZE_BYTES,
  scanFileForViruses,
  updateAssetScanStatus,
  type ScanResult,
} from "./antivirus"
import { STORAGE_BUCKET } from "./plans"
import { scanFile } from "./security"
import { readStoredHead } from "./upload-guard"

export interface ScannableAsset {
  id: string
  file_path: string | null
  file_name: string | null
  mime_type?: string | null
  file_size?: number | null
  storage_bucket?: string | null
  scan_status?: string | null
}

const BLOCKED = new Set(["infected", "quarantined"])
const UNSCANNED = new Set(["pending_scan", "scanning", "", "null"])

/** The header verdict: executables and scripts behind another name are infected, anything else passes this layer. */
async function headerVerdict(admin: SupabaseClient, asset: ScannableAsset): Promise<ScanResult | null> {
  const bucket = asset.storage_bucket || STORAGE_BUCKET
  if (!asset.file_path) return null
  const head = await readStoredHead(admin, bucket, asset.file_path, 8192)
  if (!head) return null
  const verdict = scanFile(asset.file_name || asset.file_path, asset.mime_type || "application/octet-stream", head)
  return {
    status: verdict.safe ? "clean" : "infected",
    engine: "heuristic",
    threatName: verdict.safe ? undefined : verdict.reason,
    scannedAt: new Date().toISOString(),
  }
}

/** A ClamAV verdict in the shape scan_result has always had. */
function fromService(result: FileScanResult & { status: "clean" | "infected" }): ScanResult {
  return {
    status: result.status,
    engine: "clamav",
    threatName: result.threat,
    scanDurationMs: result.durationMs,
    scannedAt: new Date().toISOString(),
    sha256: result.sha256,
    signatures: result.engine?.signatures ?? null,
    engineVersion: result.engine?.version ?? null,
  }
}

/**
 * No verdict this time: the row stays pending, with the attempt counted, so
 * the admin page and the next retry can see how long it has been waiting.
 * Only a row that is still unscanned is touched; a verdict written meanwhile
 * by another run is never taken back.
 */
async function notePending(admin: SupabaseClient, assetId: string, result: FileScanResult) {
  const { data } = await admin.from("digital_assets").select("scan_result").eq("id", assetId).maybeSingle()
  const before = (data?.scan_result ?? null) as { attempts?: unknown } | null
  const attempts = (Number(before?.attempts) || 0) + 1
  await admin
    .from("digital_assets")
    .update({
      scan_status: "pending_scan",
      scan_result: {
        engine: "clamav",
        attempts,
        lastError: result.reason ?? "unknown",
        lastAttemptAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId)
    .or("scan_status.is.null,scan_status.in.(pending_scan,scanning,scan_error)")
}

export interface ScanAssetOptions {
  /** Where the scan was asked from, for the scan log. */
  source?: ScanSource
  /** Everything over by then, retries included. */
  deadlineMs?: number
}

/** Scan one asset now and record the result. Returns the status written. */
export async function scanAsset(
  admin: SupabaseClient,
  asset: ScannableAsset,
  options: ScanAssetOptions = {},
): Promise<ScanResult["status"]> {
  const header = await headerVerdict(admin, asset)
  if (header?.status === "infected") {
    await updateAssetScanStatus(admin, asset.id, header)
    await handleInfectedFile(admin, asset.id, header)
    return "infected"
  }

  const bucket = asset.storage_bucket || STORAGE_BUCKET

  /* Storelib's own scanner: the whole file, streamed from storage. */
  if (isScannerConfigured() && asset.file_path) {
    const result = await scanStoredObject(admin, bucket, asset.file_path, {
      size: Number(asset.file_size) || null,
      ref: `asset:${asset.id}`,
      deadlineMs: options.deadlineMs,
    })
    const log = (action: "kept" | "removed" | "pending") =>
      recordScan(admin, { source: options.source ?? "product_file", result, bucket, path: asset.file_path, assetId: asset.id, action })

    if (result.status === "clean" || result.status === "infected") {
      const scan = fromService(result as FileScanResult & { status: "clean" | "infected" })
      await updateAssetScanStatus(admin, asset.id, scan)
      if (scan.status === "infected") await handleInfectedFile(admin, asset.id, scan)
      await log(scan.status === "infected" ? "removed" : "kept")
      return scan.status
    }
    if (result.status === "not_scanned" && result.reason === "too_large" && header) {
      await updateAssetScanStatus(admin, asset.id, { ...header, status: "skipped", engine: "heuristic-large-file" })
      await log("kept")
      return "skipped"
    }
    await notePending(admin, asset.id, result)
    await log("pending")
    return "pending_scan"
  }

  const size = Number(asset.file_size) || 0
  if (hasExternalScanner() && asset.file_path && size > 0 && size <= MAX_SCAN_SIZE_BYTES) {
    const { data: blob } = await admin.storage.from(bucket).download(asset.file_path)
    if (blob) {
      const result = await scanFileForViruses(
        await blob.arrayBuffer(),
        asset.file_name || "file",
        asset.mime_type || "application/octet-stream",
      )
      await updateAssetScanStatus(admin, asset.id, result)
      if (result.status === "infected") await handleInfectedFile(admin, asset.id, result)
      return result.status
    }
  }

  if (!header) return "pending_scan"
  /* With an engine configured but the file too large for it, the header is
     the whole scan, and the result says which engine made it. */
  await updateAssetScanStatus(admin, asset.id, { ...header, engine: hasExternalScanner() ? "heuristic-large-file" : "heuristic" })
  return header.status
}

/**
 * A buyer's download of a file still waiting for its scan gets one more try
 * on the spot when the file is small enough to scan in a few seconds.
 * Anything larger waits for the editor's scan or the cron.
 */
export const DOWNLOAD_CHECK_MAX_BYTES = 50 * 1024 * 1024

export type DownloadGate = { ok: true } | { ok: false; error: string; status: number }

export async function gateDownload(
  admin: SupabaseClient,
  asset: ScannableAsset,
  options: { isCreator: boolean },
): Promise<DownloadGate> {
  const status = String(asset.scan_status ?? "")
  if (BLOCKED.has(status)) {
    return {
      ok: false,
      error: "This file was flagged by the virus scan and cannot be downloaded. The seller has been told.",
      status: 403,
    }
  }
  if (!UNSCANNED.has(status)) return { ok: true }
  if (options.isCreator) return { ok: true }

  const flagged = {
    ok: false as const,
    error: "This file was flagged by the virus scan and cannot be downloaded. The seller has been told.",
    status: 403,
  }
  const waiting = { ok: false as const, error: "This file is still being checked. Try again in a few minutes.", status: 409 }

  /* Storelib's scanner: never hand out a file it has not passed. */
  if (isScannerConfigured()) {
    const size = Number(asset.file_size) || 0
    if (size > 0 && size <= DOWNLOAD_CHECK_MAX_BYTES) {
      const now = await scanAsset(admin, asset, { source: "download_check", deadlineMs: 20_000 }).catch(() => "pending_scan" as const)
      if (now === "clean" || now === "skipped") return { ok: true }
      if (now === "infected") return flagged
    }
    return waiting
  }

  const header = await headerVerdict(admin, asset)
  if (header?.status === "infected") {
    await updateAssetScanStatus(admin, asset.id, header)
    await handleInfectedFile(admin, asset.id, header)
    return {
      ok: false,
      error: "This file was flagged by the virus scan and cannot be downloaded. The seller has been told.",
      status: 403,
    }
  }
  if (!hasExternalScanner()) {
    if (header) await updateAssetScanStatus(admin, asset.id, header)
    return { ok: true }
  }
  return { ok: false, error: "This file is still being checked. Try again in a few minutes.", status: 409 }
}

export interface ScanSweepSummary {
  configured: boolean
  scanned: number
  clean: number
  infected: number
  pending: number
  skipped: number
  backfilled: number
  errors: string[]
}

/**
 * The retry loop behind /api/cron/scan-files, every ten minutes while
 * Storelib's scanner is on:
 *
 *   1. Paid files still waiting for a verdict, the ones waiting longest
 *      first (a failed attempt moves a file to the back, by updated_at).
 *   2. With time left, files that only ever had the header check (uploaded
 *      before the scanner was on), newest first because those are the ones
 *      being bought. A backfill scan that gets no verdict leaves the file as
 *      it was: it is never made unavailable because the scanner hiccuped.
 *
 * Everything stops inside `budgetMs`, so the route stays in its maxDuration.
 */
export async function sweepPendingScans(
  admin: SupabaseClient,
  options: { budgetMs?: number; limit?: number; backfill?: number } = {},
): Promise<ScanSweepSummary> {
  const summary: ScanSweepSummary = { configured: isScannerConfigured(), scanned: 0, clean: 0, infected: 0, pending: 0, skipped: 0, backfilled: 0, errors: [] }
  if (!summary.configured) return summary
  const stopAt = Date.now() + (options.budgetMs ?? 240_000)
  const columns = "id, file_path, file_name, file_size, mime_type, storage_bucket, scan_status"

  const tally = (status: string) => {
    summary.scanned++
    if (status === "clean") summary.clean++
    else if (status === "infected") summary.infected++
    else if (status === "skipped") summary.skipped++
    else summary.pending++
  }

  const { data: pending, error } = await admin
    .from("digital_assets")
    .select(columns)
    .in("scan_status", ["pending_scan", "scanning"])
    .or("upload_status.is.null,upload_status.eq.completed")
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(options.limit ?? 25, 100)))
  if (error) summary.errors.push(`pending: ${error.message}`)

  for (const asset of pending ?? []) {
    const left = stopAt - Date.now()
    if (left < 10_000) break
    try {
      tally(await scanAsset(admin, asset, { source: "product_file", deadlineMs: Math.min(150_000, left - 5_000) }))
    } catch (e) {
      summary.errors.push(`${asset.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const backfill = Math.max(0, Math.min(options.backfill ?? 10, 50))
  if (backfill > 0 && stopAt - Date.now() > 30_000) {
    const { data: older } = await admin
      .from("digital_assets")
      .select(columns)
      .eq("scan_status", "clean")
      .eq("scan_result->>engine", "heuristic")
      .or("upload_status.is.null,upload_status.eq.completed")
      .order("created_at", { ascending: false })
      .limit(backfill)
    for (const asset of older ?? []) {
      const left = stopAt - Date.now()
      if (left < 15_000) break
      try {
        const status = await scanAsset(admin, asset, { source: "product_file", deadlineMs: Math.min(150_000, left - 5_000) })
        summary.backfilled++
        if (status === "infected") summary.infected++
      } catch (e) {
        summary.errors.push(`${asset.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  return summary
}
