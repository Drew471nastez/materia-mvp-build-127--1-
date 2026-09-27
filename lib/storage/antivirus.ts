/**
 * ===========================================================================
 *  A PRODUCT FILE'S SCAN STATUS
 * ===========================================================================
 * The states digital_assets.scan_status can hold, and the small helpers the
 * storage barrel (lib/storage/index.ts) has always exported. What sets them
 * is lib/security/uploads/pipeline.ts: Storelib's built-in checks decide at
 * upload ("clean" or "blocked"), and a malware engine, when one is switched
 * on by SECURITY_MALWARE_PROVIDER, adds its verdict in the background
 * (lib/security/uploads/providers.ts).
 *
 * The cloud engines this file used to call on its own (CLAMAV_REST_URL,
 * CLOUDMERSIVE_API_KEY, VIRUSTOTAL_API_KEY) are no longer called: any of
 * those set by accident would have sent creators' files to a third party and
 * held downloads waiting for it. An engine is now a provider, and only runs
 * when the flag names it.
 */

import { type SupabaseClient } from "@supabase/supabase-js"

export type ScanStatus = "pending_scan" | "scanning" | "clean" | "blocked" | "infected" | "scan_error" | "skipped"

export interface ScanResult {
  status: ScanStatus
  engine: string
  threatName?: string
  scanDurationMs?: number
  scannedAt: string
  sha256?: string
  signatures?: number | null
  engineVersion?: string | null
}

/** Statuses a buyer never gets a file in. */
const REFUSED = new Set(["blocked", "infected", "quarantined"])

/** Write a scan result on a digital asset. */
export async function updateAssetScanStatus(admin: SupabaseClient, assetId: string, scanResult: ScanResult): Promise<void> {
  await admin
    .from("digital_assets")
    .update({
      scan_status: scanResult.status,
      scan_result: {
        engine: scanResult.engine,
        threatName: scanResult.threatName,
        scanDurationMs: scanResult.scanDurationMs,
        scannedAt: scanResult.scannedAt,
        ...(scanResult.sha256 ? { sha256: scanResult.sha256 } : {}),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId)
}

/**
 * Whether a digital asset may be downloaded. Only a file the checks refused
 * is not; a file still without a verdict (from before the checks) is served,
 * as it always was. The download routes use lib/storage/scan-gate.ts, which
 * also gives an unchecked file its verdict.
 */
export async function isAssetSafeToDownload(admin: SupabaseClient, assetId: string): Promise<{ safe: boolean; reason?: string }> {
  const { data: asset } = await admin.from("digital_assets").select("scan_status").eq("id", assetId).maybeSingle()
  if (!asset) return { safe: false, reason: "This file isn't available." }
  return REFUSED.has(String(asset.scan_status ?? "")) ? { safe: false, reason: "This file isn't available. Contact the seller for help." } : { safe: true }
}

/** Assets with no verdict yet, oldest first. */
export async function getPendingScanAssets(
  admin: SupabaseClient,
  limit: number = 10,
): Promise<Array<{ id: string; file_path: string; file_name: string; mime_type: string; storage_bucket: string }>> {
  const { data } = await admin
    .from("digital_assets")
    .select("id, file_path, file_name, mime_type, storage_bucket")
    .eq("scan_status", "pending_scan")
    .eq("upload_status", "completed")
    .order("created_at", { ascending: true })
    .limit(limit)
  return data || []
}

/** Mark an asset blocked and remove its object: an engine found it infected. */
export async function handleInfectedFile(admin: SupabaseClient, assetId: string, scanResult: ScanResult): Promise<void> {
  const { data: asset } = await admin.from("digital_assets").select("id, file_path, file_name, file_size, storage_bucket, uploaded_by").eq("id", assetId).maybeSingle()
  if (!asset) return
  const { blockAsset } = await import("@/lib/security/uploads/pipeline")
  await blockAsset(admin, asset, { code: "provider_infected", provider: scanResult.engine, threat: scanResult.threatName, remove: true })
}
