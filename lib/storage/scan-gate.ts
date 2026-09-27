import "server-only"

/**
 * ===========================================================================
 *  WHAT A DOWNLOAD ROUTE ASKS BEFORE IT HANDS OUT A FILE
 * ===========================================================================
 * gateDownload() is the last check every buyer download goes through
 * (/api/download/[assetId], /api/v2/download/[token], the email token links
 * in lib/storage/token-download.ts):
 *
 *   blocked, infected, quarantined
 *              never served. The buyer reads one plain sentence.
 *   clean and every other verdict
 *              served.
 *   no verdict (pending_scan, scanning, or none at all: a file from before
 *              the checks) served too, after its first bytes are checked
 *              once, as the old header check always did, and the answer is
 *              written so the next download does not ask again. A program
 *              renamed as a PDF is refused here as it always was; anything
 *              newer the checks can find is left to the daily sweep and the
 *              admin, so a file buyers have bought keeps working.
 *
 * Nothing here waits for a malware engine, and nothing ever answers "still
 * being checked" (409): with no engine switched on there is nothing to wait
 * for, and with one switched on it runs in the background
 * (lib/security/uploads/pipeline.ts). The creator can always fetch their own
 * file, whatever its status.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { DOWNLOAD_UNAVAILABLE } from "@/lib/security/uploads/policy"
import { BLOCKED_STATUSES, UNRESOLVED_STATUSES, resolveAsset, sweepAssets, type AssetRow } from "@/lib/security/uploads/pipeline"

export type ScannableAsset = AssetRow

export type DownloadGate = { ok: true } | { ok: false; error: string; status: number; code: "blocked" }

export async function gateDownload(admin: SupabaseClient, asset: ScannableAsset, options: { isCreator: boolean }): Promise<DownloadGate> {
  const status = String(asset.scan_status ?? "")
  if (BLOCKED_STATUSES.has(status)) {
    if (options.isCreator) return { ok: true }
    return { ok: false, error: DOWNLOAD_UNAVAILABLE, status: 403, code: "blocked" }
  }
  if (!UNRESOLVED_STATUSES.has(status) || options.isCreator) return { ok: true }

  /* A file from before the checks: its first bytes, once. A read that fails serves the file. */
  const now = await resolveAsset(admin, asset, { archive: false, source: "download" }).catch(() => "unread" as const)
  if (now === "blocked") return { ok: false, error: DOWNLOAD_UNAVAILABLE, status: 403, code: "blocked" }
  return { ok: true }
}

/** Resolve one asset's verdict now (the storage cron and the creator's own editor ask this). */
export function scanAsset(admin: SupabaseClient, asset: ScannableAsset): Promise<string> {
  return resolveAsset(admin, asset, { source: "sweep" })
}

export { sweepAssets }
