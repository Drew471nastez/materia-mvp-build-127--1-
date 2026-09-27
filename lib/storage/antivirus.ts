/**
 * Antivirus scanning for uploaded files.
 *
 * Strategy:
 * 1. Files upload with scan_status = "pending_scan"
 * 2. Background scan via /api/v2/upload/scan endpoint
 * 3. If clean → scan_status = "clean"
 * 4. If infected → scan_status = "infected", file deleted, creator notified
 * 5. Downloads blocked until scan_status = "clean"
 *
 * Supports multiple scanning backends:
 * - ClamAV (self-hosted, via REST API)
 * - Cloudmersive (cloud API)
 * - VirusTotal (cloud API, rate-limited)
 * - Fallback: basic heuristic scan (already in security.ts)
 */

import { type SupabaseClient } from "@supabase/supabase-js"
import { isScannerConfigured } from "@/lib/security/file-scanner-core"
import { STORAGE_BUCKET } from "./plans"

// ── Types ──────────────────────────────────────────────────────────

export type ScanStatus = "pending_scan" | "scanning" | "clean" | "infected" | "scan_error" | "skipped"

export interface ScanResult {
  status: ScanStatus
  engine: string
  threatName?: string
  scanDurationMs?: number
  scannedAt: string
  /** From the Storelib file scanner (lib/security/file-scanner.ts). */
  sha256?: string
  signatures?: number | null
  engineVersion?: string | null
}

// ── Configuration ──────────────────────────────────────────────────

/** Files smaller than this skip virus scanning (too small to be threats). */
const MIN_SCAN_SIZE_BYTES = 256

/**
 * Maximum file size a full scan downloads. Larger files are judged by their
 * header alone (lib/storage/scan-gate.ts): a function holding a 5 GB file in
 * memory to scan it is an outage, not a scan.
 */
export const MAX_SCAN_SIZE_BYTES = 500 * 1024 * 1024 // 500MB

/** Timeout for external scan APIs. */
const SCAN_TIMEOUT_MS = 60_000

/**
 * Whether a real antivirus engine is configured. Without one the scan is the
 * header heuristic in security.ts, which is fast enough to run inline.
 *
 * The Storelib file scanner (CLAMAV_SERVICE_URL and CLAMAV_SERVICE_SECRET,
 * lib/security/file-scanner.ts) is the engine Storelib runs; the other three
 * are older options kept working for anyone who set one.
 */
export function hasExternalScanner(): boolean {
  return Boolean(isScannerConfigured() || process.env.CLAMAV_REST_URL || process.env.CLOUDMERSIVE_API_KEY || process.env.VIRUSTOTAL_API_KEY)
}

/** The scan's own details, for scan_result: never the file, only what was found and by what. */
function resultDetails(scanResult: ScanResult) {
  return {
    engine: scanResult.engine,
    threatName: scanResult.threatName,
    scanDurationMs: scanResult.scanDurationMs,
    scannedAt: scanResult.scannedAt,
    ...(scanResult.sha256 ? { sha256: scanResult.sha256 } : {}),
    ...(scanResult.signatures != null ? { signatures: scanResult.signatures } : {}),
    ...(scanResult.engineVersion ? { engineVersion: scanResult.engineVersion } : {}),
  }
}

// ── Scan Backends ──────────────────────────────────────────────────

/**
 * Scan a file buffer using the configured antivirus backend.
 * Returns a ScanResult with status and threat info.
 */
export async function scanFileForViruses(
  fileBuffer: ArrayBuffer | Buffer,
  fileName: string,
  mimeType: string,
): Promise<ScanResult> {
  const startTime = Date.now()
  const fileSize = fileBuffer.byteLength

  // Skip tiny files (not a realistic threat vector)
  if (fileSize < MIN_SCAN_SIZE_BYTES) {
    return {
      status: "clean",
      engine: "size-skip",
      scanDurationMs: Date.now() - startTime,
      scannedAt: new Date().toISOString(),
    }
  }

  // Try backends in order of preference
  const clamavUrl = process.env.CLAMAV_REST_URL
  const cloudmersiveKey = process.env.CLOUDMERSIVE_API_KEY
  const virusTotalKey = process.env.VIRUSTOTAL_API_KEY

  if (clamavUrl) {
    return scanWithClamAV(fileBuffer, fileName, clamavUrl, startTime)
  }

  if (cloudmersiveKey) {
    return scanWithCloudmersive(fileBuffer, fileName, mimeType, cloudmersiveKey, startTime)
  }

  if (virusTotalKey) {
    return scanWithVirusTotal(fileBuffer, fileName, virusTotalKey, startTime)
  }

  // No AV backend configured — use heuristic scan only
  return scanWithHeuristics(fileBuffer, fileName, mimeType, startTime)
}

/**
 * Scan using ClamAV REST API (e.g., clamav-rest or clamdscan endpoint).
 */
async function scanWithClamAV(
  fileBuffer: ArrayBuffer | Buffer,
  fileName: string,
  clamavUrl: string,
  startTime: number,
): Promise<ScanResult> {
  try {
    const formData = new FormData()
    const blob = new Blob([fileBuffer])
    formData.append("file", blob, fileName)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)

    const res = await fetch(`${clamavUrl}/scan`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.error("[antivirus] ClamAV scan failed:", res.status)
      return {
        status: "scan_error",
        engine: "clamav",
        scanDurationMs: Date.now() - startTime,
        scannedAt: new Date().toISOString(),
      }
    }

    const result = await res.json()
    const isInfected = result.infected === true || result.status === "FOUND" || result.result === "FOUND"

    return {
      status: isInfected ? "infected" : "clean",
      engine: "clamav",
      threatName: isInfected ? (result.viruses?.[0] || result.description || "Unknown threat") : undefined,
      scanDurationMs: Date.now() - startTime,
      scannedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error("[antivirus] ClamAV error:", err)
    return {
      status: "scan_error",
      engine: "clamav",
      scanDurationMs: Date.now() - startTime,
      scannedAt: new Date().toISOString(),
    }
  }
}

/**
 * Scan using Cloudmersive Virus Scan API.
 */
async function scanWithCloudmersive(
  fileBuffer: ArrayBuffer | Buffer,
  fileName: string,
  mimeType: string,
  apiKey: string,
  startTime: number,
): Promise<ScanResult> {
  try {
    const formData = new FormData()
    const blob = new Blob([fileBuffer], { type: mimeType })
    formData.append("inputFile", blob, fileName)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)

    const res = await fetch("https://api.cloudmersive.com/virus/scan/file/advanced", {
      method: "POST",
      headers: { Apikey: apiKey },
      body: formData,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.error("[antivirus] Cloudmersive scan failed:", res.status)
      return {
        status: "scan_error",
        engine: "cloudmersive",
        scanDurationMs: Date.now() - startTime,
        scannedAt: new Date().toISOString(),
      }
    }

    const result = await res.json()
    const isClean = result.CleanResult === true

    return {
      status: isClean ? "clean" : "infected",
      engine: "cloudmersive",
      threatName: !isClean
        ? (result.FoundViruses?.[0]?.VirusName || "Unknown threat")
        : undefined,
      scanDurationMs: Date.now() - startTime,
      scannedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error("[antivirus] Cloudmersive error:", err)
    return {
      status: "scan_error",
      engine: "cloudmersive",
      scanDurationMs: Date.now() - startTime,
      scannedAt: new Date().toISOString(),
    }
  }
}

/**
 * Scan using VirusTotal API v3.
 * Note: Free tier is rate-limited to 4 requests/minute.
 */
async function scanWithVirusTotal(
  fileBuffer: ArrayBuffer | Buffer,
  fileName: string,
  apiKey: string,
  startTime: number,
): Promise<ScanResult> {
  try {
    // Step 1: Upload file for scanning
    const formData = new FormData()
    const blob = new Blob([fileBuffer])
    formData.append("file", blob, fileName)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)

    const uploadRes = await fetch("https://www.virustotal.com/api/v3/files", {
      method: "POST",
      headers: { "x-apikey": apiKey },
      body: formData,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!uploadRes.ok) {
      console.error("[antivirus] VirusTotal upload failed:", uploadRes.status)
      return {
        status: "scan_error",
        engine: "virustotal",
        scanDurationMs: Date.now() - startTime,
        scannedAt: new Date().toISOString(),
      }
    }

    const uploadData = await uploadRes.json()
    const analysisId = uploadData.data?.id

    if (!analysisId) {
      return {
        status: "scan_error",
        engine: "virustotal",
        scanDurationMs: Date.now() - startTime,
        scannedAt: new Date().toISOString(),
      }
    }

    // Step 2: Poll for results (wait up to 60s)
    const pollDeadline = Date.now() + SCAN_TIMEOUT_MS
    while (Date.now() < pollDeadline) {
      await new Promise((r) => setTimeout(r, 5000)) // Wait 5s between polls

      const analysisRes = await fetch(
        `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
        { headers: { "x-apikey": apiKey } },
      )

      if (analysisRes.ok) {
        const analysisData = await analysisRes.json()
        const status = analysisData.data?.attributes?.status

        if (status === "completed") {
          const stats = analysisData.data?.attributes?.stats
          const malicious = (stats?.malicious || 0) + (stats?.suspicious || 0)

          return {
            status: malicious > 0 ? "infected" : "clean",
            engine: "virustotal",
            threatName: malicious > 0 ? `Detected by ${malicious} engines` : undefined,
            scanDurationMs: Date.now() - startTime,
            scannedAt: new Date().toISOString(),
          }
        }
      }
    }

    // Timed out waiting for results — mark as pending
    return {
      status: "pending_scan",
      engine: "virustotal",
      scanDurationMs: Date.now() - startTime,
      scannedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error("[antivirus] VirusTotal error:", err)
    return {
      status: "scan_error",
      engine: "virustotal",
      scanDurationMs: Date.now() - startTime,
      scannedAt: new Date().toISOString(),
    }
  }
}

/**
 * Heuristic scan fallback when no AV backend is configured.
 * Uses the existing security.ts pattern matching + additional checks.
 */
async function scanWithHeuristics(
  fileBuffer: ArrayBuffer | Buffer,
  fileName: string,
  mimeType: string,
  startTime: number,
): Promise<ScanResult> {
  const { scanFile, readBufferHeader } = await import("./security")

  const buffer = fileBuffer instanceof Buffer
    ? fileBuffer
    : Buffer.from(fileBuffer)

  const header = readBufferHeader(buffer)
  const result = scanFile(fileName, mimeType, header)

  return {
    status: result.safe ? "clean" : "infected",
    engine: "heuristic",
    threatName: result.safe ? undefined : (result.reason || "Suspicious content detected"),
    scanDurationMs: Date.now() - startTime,
    scannedAt: new Date().toISOString(),
  }
}

// ── Database Helpers ───────────────────────────────────────────────

/**
 * Update the scan status of a digital asset.
 */
export async function updateAssetScanStatus(
  admin: SupabaseClient,
  assetId: string,
  scanResult: ScanResult,
): Promise<void> {
  await admin
    .from("digital_assets")
    .update({
      scan_status: scanResult.status,
      scan_result: resultDetails(scanResult),
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId)
}

/**
 * Check if a digital asset has been scanned and is clean.
 * Returns true if the file is safe to download.
 */
export async function isAssetSafeToDownload(
  admin: SupabaseClient,
  assetId: string,
): Promise<{ safe: boolean; reason?: string }> {
  const { data: asset } = await admin
    .from("digital_assets")
    .select("scan_status, scan_result")
    .eq("id", assetId)
    .single()

  if (!asset) {
    return { safe: false, reason: "Asset not found" }
  }

  const status = asset.scan_status as ScanStatus | null

  // If no scan status, allow download (backwards compatibility)
  if (!status || status === "clean" || status === "skipped") {
    return { safe: true }
  }

  if (status === "infected") {
    return { safe: false, reason: "This file has been flagged by our security scanner and cannot be downloaded." }
  }

  if (status === "pending_scan" || status === "scanning") {
    return { safe: false, reason: "This file is being scanned for security. Please try again shortly." }
  }

  if (status === "scan_error") {
    // Allow download on scan error (fail open) but log it
    console.warn(`[antivirus] Asset ${assetId} has scan_error status, allowing download`)
    return { safe: true }
  }

  return { safe: true }
}

/**
 * Get all assets that need scanning.
 */
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

/**
 * Handle an infected file: delete from storage, update status, log event.
 */
export async function handleInfectedFile(
  admin: SupabaseClient,
  assetId: string,
  scanResult: ScanResult,
): Promise<void> {
  // Get asset info
  const { data: asset } = await admin
    .from("digital_assets")
    .select("id, file_path, storage_bucket, uploaded_by, product_id, file_name")
    .eq("id", assetId)
    .single()

  if (!asset) return

  // Delete file from storage
  try {
    await admin.storage
      .from(asset.storage_bucket || STORAGE_BUCKET)
      .remove([asset.file_path])
  } catch (err) {
    console.error("[antivirus] Failed to delete infected file:", err)
  }

  // Update asset status
  await admin
    .from("digital_assets")
    .update({
      scan_status: "infected",
      upload_status: "quarantined",
      scan_result: { ...resultDetails(scanResult), action: "deleted" },
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId)

  // Log the event
  try {
    await admin.from("upload_events").insert({
      creator_id: asset.uploaded_by,
      file_name: asset.file_name,
      file_size: 0,
      security_scan_result: "infected",
      security_threat_type: scanResult.threatName || "unknown",
    })
  } catch { /* log failure is non-fatal */ }

  console.warn(
    `[antivirus] INFECTED FILE REMOVED: asset=${assetId} file=${asset.file_name} threat=${scanResult.threatName}`,
  )
}
