/**
 * ===========================================================================
 *  THE MALWARE SCANNER, THE PARTS WITH NO NETWORK
 * ===========================================================================
 * lib/security/file-scanner.ts talks to the Storelib file scanner
 * (services/file-scanner: a small API in front of ClamAV). What it reads from
 * the environment and how it reads the scanner's answers live here, apart,
 * so the suite can run them and so lib/storage/antivirus.ts can ask "is a
 * scanner configured" without importing server only code.
 *
 * Configured means BOTH variables are set:
 *
 *   CLAMAV_SERVICE_URL     https://scanner.example.com (http only for localhost)
 *   CLAMAV_SERVICE_SECRET  the same secret the scanner was started with
 *
 * One without the other is "not configured", never an error: the secret
 * alone is how production runs until the scanner has an address, and the
 * app must behave exactly as it did before scanning existed.
 */

export type ScanStatus = "clean" | "infected" | "error" | "not_scanned"

/**
 * Why a scan did not give a verdict.
 *
 *   not_configured  no URL or no secret: scanning is off
 *   too_large       over the scanner's limit (header checks still apply)
 *   unavailable     the scanner could not be reached, or said it is busy
 *   timeout         no answer in time
 *   rejected        the scanner refused the secret (401) or the request (4xx)
 *   engine_error    ClamAV itself failed on this file
 *   source_error    the file could not be read from storage
 */
export type ScanReason = "not_configured" | "too_large" | "unavailable" | "timeout" | "rejected" | "engine_error" | "source_error"

export interface ScanEngine {
  version: string
  signatures: number | null
  updatedAt: string | null
}

export interface FileScanResult {
  status: ScanStatus
  threat?: string
  sha256?: string
  bytes?: number
  durationMs: number
  engine?: ScanEngine | null
  reason?: ScanReason
  message?: string
  requestId?: string
  /** How many requests it took, retries included. */
  attempts?: number
}

export interface ScannerConfig {
  url: string
  secret: string
}

export type ScannerSetup =
  | { configured: true; config: ScannerConfig; missing: [] }
  | { configured: false; config: null; missing: ("CLAMAV_SERVICE_URL" | "CLAMAV_SERVICE_SECRET")[]; invalidUrl?: boolean }

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

/**
 * Reads the two variables. Never throws, whatever they hold: a bad value is
 * reported as missing, so a typo in Vercel turns scanning off rather than
 * failing a build or an upload.
 */
export function readScannerSetup(env: Record<string, string | undefined> = process.env): ScannerSetup {
  const rawUrl = (env.CLAMAV_SERVICE_URL ?? "").trim()
  const secret = (env.CLAMAV_SERVICE_SECRET ?? "").trim()
  const missing: ("CLAMAV_SERVICE_URL" | "CLAMAV_SERVICE_SECRET")[] = []
  let url: string | null = null
  let invalidUrl = false
  if (rawUrl) {
    try {
      const u = new URL(rawUrl)
      const local = LOCAL_HOSTS.has(u.hostname)
      if (u.protocol === "https:" || (u.protocol === "http:" && local)) {
        url = u.origin + u.pathname.replace(/\/+$/, "")
      } else invalidUrl = true
    } catch {
      invalidUrl = true
    }
  }
  if (!url) missing.push("CLAMAV_SERVICE_URL")
  if (!secret) missing.push("CLAMAV_SERVICE_SECRET")
  if (url && secret) return { configured: true, config: { url, secret }, missing: [] }
  return { configured: false, config: null, missing, ...(invalidUrl ? { invalidUrl } : {}) }
}

export function isScannerConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readScannerSetup(env).configured
}

/**
 * The largest file Storelib sends to the scanner. The scanner has its own
 * limit (MAX_FILE_BYTES, 1 GiB by default) and answers 413 above it; this
 * one is checked first so a 5 GB file is not streamed out only to be
 * refused. Keep the two equal.
 */
export function scannerMaxBytes(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CLAMAV_SERVICE_MAX_BYTES)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1024 * 1024 * 1024
}

function engineOf(value: unknown): ScanEngine | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (typeof v.version !== "string") return null
  return {
    version: v.version,
    signatures: typeof v.signatures === "number" ? v.signatures : null,
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : null,
  }
}

/**
 * The scanner's answer as a result. `body` is whatever JSON came back, or
 * null when it was not JSON. Anything unexpected is an error, never clean:
 * a proxy's HTML error page must not read as "no virus found".
 */
export function interpretScanResponse(httpStatus: number, body: unknown, durationMs: number): FileScanResult {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null
  const common = {
    durationMs,
    ...(typeof b?.sha256 === "string" ? { sha256: b.sha256 } : {}),
    ...(typeof b?.bytes === "number" ? { bytes: b.bytes } : {}),
    ...(typeof b?.requestId === "string" ? { requestId: b.requestId } : {}),
    engine: engineOf(b?.engine),
  }
  if (httpStatus === 200 && b?.status === "clean" && typeof b.sha256 === "string") {
    return { status: "clean", ...common }
  }
  if (httpStatus === 200 && b?.status === "infected") {
    const threat = typeof b.threat === "string" && b.threat.trim() ? b.threat.trim().slice(0, 200) : "Unknown threat"
    return { status: "infected", threat, ...common }
  }
  const code = typeof b?.error === "string" ? b.error : ""
  const message = typeof b?.message === "string" ? b.message.slice(0, 300) : `The scanner answered ${httpStatus}`
  let reason: ScanReason
  if (httpStatus === 413 || code === "too_large") reason = "too_large"
  else if (httpStatus === 504 || code === "timeout") reason = "timeout"
  else if (httpStatus === 401 || httpStatus === 403) reason = "rejected"
  else if (code === "engine_error") reason = "engine_error"
  else if (httpStatus === 429 || httpStatus >= 500) reason = "unavailable"
  else if (httpStatus >= 400) reason = "rejected"
  else reason = "unavailable"
  /* Too large is not a failure of the scan: the file is simply beyond it. */
  if (reason === "too_large") return { status: "not_scanned", reason, message, ...common }
  return { status: "error", reason, message, ...common }
}

/** Whether another attempt could give a different answer. */
export function isRetryable(result: FileScanResult): boolean {
  return result.status === "error" && (result.reason === "unavailable" || result.reason === "timeout" || result.reason === "source_error")
}

/**
 * How long one attempt may take for a file of this size: 20 seconds, plus
 * a second for every 10 MB (storage to function to scanner, and ClamAV's
 * own read), never more than `ceilingMs`.
 */
export function attemptTimeoutMs(bytes: number | null | undefined, ceilingMs: number): number {
  const size = Number(bytes) > 0 ? Number(bytes) : 0
  return Math.min(ceilingMs, 20_000 + Math.ceil(size / (10 * 1024 * 1024)) * 1000)
}

/** A verdict that can be acted on: the file is known clean or known infected. */
export function isVerdict(result: FileScanResult): result is FileScanResult & { status: "clean" | "infected" } {
  return result.status === "clean" || result.status === "infected"
}

/**
 * The EICAR test file: the industry's harmless string every antivirus
 * reports as a virus, for checking a scanner end to end. Built from two
 * pieces so this source file is not itself flagged by a scanner on a
 * developer's machine or in a repository host.
 */
export function eicarTestBytes(): Uint8Array {
  return new TextEncoder().encode(["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join(""))
}
