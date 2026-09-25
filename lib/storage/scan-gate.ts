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
 */
import type { SupabaseClient } from "@supabase/supabase-js"

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

/** Scan one asset now and record the result. Returns the status written. */
export async function scanAsset(admin: SupabaseClient, asset: ScannableAsset): Promise<ScanResult["status"]> {
  const header = await headerVerdict(admin, asset)
  if (header?.status === "infected") {
    await updateAssetScanStatus(admin, asset.id, header)
    await handleInfectedFile(admin, asset.id, header)
    return "infected"
  }

  const size = Number(asset.file_size) || 0
  if (hasExternalScanner() && asset.file_path && size > 0 && size <= MAX_SCAN_SIZE_BYTES) {
    const bucket = asset.storage_bucket || STORAGE_BUCKET
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
