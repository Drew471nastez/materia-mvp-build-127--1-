import "server-only"

/**
 * ===========================================================================
 *  STORELIB'S MALWARE SCANNER CLIENT
 * ===========================================================================
 * Storelib on Vercel -> the file scanner (services/file-scanner, a small
 * Node API) -> ClamAV (clamd, with freshclam keeping the signatures fresh).
 *
 * Every function here returns a FileScanResult and never throws:
 *
 *   clean        ClamAV read every byte and found nothing
 *   infected     ClamAV found `threat`
 *   error        no verdict: the scanner was down, slow, refused the secret,
 *                or ClamAV failed on the file (`reason` says which)
 *   not_scanned  scanning is off (no CLAMAV_SERVICE_URL or no secret), or
 *                the file is over the scanner's size limit
 *
 * What to do with each is the caller's decision, and differs between a
 * paid download and a profile photo: see lib/storage/scan-gate.ts.
 *
 * The file is STREAMED: from the request, or from storage by a short signed
 * URL, straight into the scanner's request body. A function never holds a
 * large file in memory to scan it, and nothing is written to disk on either
 * side. Failed attempts that could succeed on a second try (scanner down or
 * busy, a timeout, storage hiccup) are retried twice with a short back off,
 * inside an overall deadline so a route never outlives its maxDuration.
 *
 * With scanning off, the first call logs one line saying so and every call
 * returns "not_scanned" at once. That is how production runs until the
 * scanner has an address, and it changes nothing about uploads.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  attemptTimeoutMs,
  interpretScanResponse,
  isRetryable,
  readScannerSetup,
  scannerMaxBytes,
  type FileScanResult,
  type ScannerConfig,
} from "./file-scanner-core"

export {
  eicarTestBytes,
  isScannerConfigured,
  isVerdict,
  readScannerSetup,
  scannerMaxBytes,
  type FileScanResult,
  type ScanEngine,
  type ScanReason,
  type ScanStatus,
} from "./file-scanner-core"

type Opened = { body: Uint8Array | ReadableStream<Uint8Array>; size: number | null; cancel?: () => void }
type Source = (signal: AbortSignal) => Promise<Opened>

export interface ScanOptions {
  /** The file's size when known: a file over the limit is not sent at all. */
  size?: number | null
  /** An id for the logs (an asset id, a bucket path). Never the file's contents. */
  ref?: string
  /** One attempt's time limit. Defaults to 20 s plus 1 s every 10 MB. */
  timeoutMs?: number
  /** Everything, retries included, is over by then. Default 240 s. */
  deadlineMs?: number
  /** Extra attempts after a retryable failure. Default 2. */
  retries?: number
}

class SourceError extends Error {}

let saidOff = false
function sayOffOnce(missing: string[]) {
  if (saidOff) return
  saidOff = true
  console.info(JSON.stringify({ scope: "file-scanner", msg: "malware scanning is off; uploads are not scanned", missing }))
}

function logResult(ref: string | undefined, result: FileScanResult) {
  const line = {
    scope: "file-scanner",
    msg: "scan",
    ref: ref?.slice(0, 200),
    status: result.status,
    threat: result.threat,
    reason: result.reason,
    bytes: result.bytes,
    durationMs: result.durationMs,
    attempts: result.attempts,
    signatures: result.engine?.signatures ?? undefined,
  }
  if (result.status === "infected" || result.status === "error") console.warn(JSON.stringify(line))
  else console.info(JSON.stringify(line))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function attempt(config: ScannerConfig, source: Source, timeoutMs: number, ref: string | undefined): Promise<FileScanResult> {
  const t0 = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let opened: Opened | null = null
  try {
    try {
      opened = await source(controller.signal)
    } catch (e) {
      if (controller.signal.aborted) return { status: "error", reason: "timeout", message: "Reading the file took too long", durationMs: Date.now() - t0 }
      return { status: "error", reason: "source_error", message: e instanceof Error ? e.message : "The file could not be read", durationMs: Date.now() - t0 }
    }
    if (opened.size !== null && opened.size > scannerMaxBytes()) {
      return { status: "not_scanned", reason: "too_large", bytes: opened.size, durationMs: Date.now() - t0 }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.secret}`,
      "Content-Type": "application/octet-stream",
    }
    if (opened.size !== null) headers["Content-Length"] = String(opened.size)
    if (ref) headers["X-Request-Id"] = `sl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const res = await fetch(`${config.url}/scan`, {
      method: "POST",
      headers,
      body: opened.body as BodyInit,
      signal: controller.signal,
      cache: "no-store",
      /* Required by Node's fetch for a streamed body. */
      duplex: "half",
    } as RequestInit & { duplex: "half" })
    const body = await res.json().catch(() => null)
    return interpretScanResponse(res.status, body, Date.now() - t0)
  } catch (e) {
    if (controller.signal.aborted) return { status: "error", reason: "timeout", message: "The scanner did not answer in time", durationMs: Date.now() - t0 }
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : ""
    return {
      status: "error",
      reason: e instanceof SourceError ? "source_error" : "unavailable",
      message: `Could not reach the scanner${cause ? `: ${cause}` : ""}`.slice(0, 300),
      durationMs: Date.now() - t0,
    }
  } finally {
    clearTimeout(timer)
    opened?.cancel?.()
  }
}

/** Scans whatever `source` opens, with retries. `source` is called once per attempt. */
export async function scanSource(source: Source, options: ScanOptions = {}): Promise<FileScanResult> {
  const setup = readScannerSetup()
  if (!setup.configured) {
    sayOffOnce(setup.missing)
    return { status: "not_scanned", reason: "not_configured", durationMs: 0 }
  }
  const size = options.size ?? null
  if (size !== null && size > scannerMaxBytes()) {
    return { status: "not_scanned", reason: "too_large", bytes: size, durationMs: 0 }
  }
  const started = Date.now()
  const deadline = started + (options.deadlineMs ?? 240_000)
  const retries = Math.max(0, options.retries ?? 2)
  let result: FileScanResult | null = null
  for (let i = 0; i <= retries; i++) {
    const remaining = deadline - Date.now()
    if (remaining < 1_000) break
    const limit = Math.min(options.timeoutMs ?? attemptTimeoutMs(size, 240_000), remaining)
    result = { ...(await attempt(setup.config, source, limit, options.ref)), attempts: i + 1 }
    if (!isRetryable(result) || i === retries) break
    await sleep(Math.min(500 * 3 ** i, Math.max(0, deadline - Date.now() - 1_000)))
  }
  const final: FileScanResult = result
    ? { ...result, durationMs: Date.now() - started }
    : { status: "error", reason: "timeout", message: "No time left to scan", durationMs: Date.now() - started, attempts: 0 }
  logResult(options.ref, final)
  return final
}

/** Scans bytes already in memory (a small upload that came through a route). */
export function scanBytes(bytes: Uint8Array | ArrayBuffer, options: Omit<ScanOptions, "size"> = {}): Promise<FileScanResult> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return scanSource(async () => ({ body: view, size: view.byteLength }), { ...options, size: view.byteLength })
}

/**
 * Scans an object already in storage: a one minute signed URL, read as a
 * stream and passed on as the scanner's request body, so the function holds
 * only what is in flight.
 */
export function scanStoredObject(
  admin: SupabaseClient,
  bucket: string,
  path: string,
  options: ScanOptions = {},
): Promise<FileScanResult> {
  return scanSource(
    async (signal) => {
      const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60)
      if (error || !data?.signedUrl) throw new SourceError(`Storage could not sign ${bucket}/${path.split("/").pop()}`)
      const res = await fetch(data.signedUrl, { signal, cache: "no-store" })
      if (!res.ok || !res.body) {
        res.body?.cancel().catch(() => {})
        throw new SourceError(res.status === 404 || res.status === 400 ? "The file is not in storage" : `Storage answered ${res.status}`)
      }
      const length = Number(res.headers.get("content-length"))
      const body = res.body
      return {
        body,
        size: Number.isFinite(length) && length > 0 ? length : options.size ?? null,
        cancel: () => {
          body.cancel().catch(() => {})
        },
      }
    },
    { ...options, ref: options.ref ?? `${bucket}/${path}` },
  )
}

export interface ScannerHealth {
  configured: boolean
  missing: string[]
  invalidUrl?: boolean
  /** The scanner's address without any path, for display. */
  host?: string
  reachable?: boolean
  httpStatus?: number
  latencyMs?: number
  /** The scanner's /health answer as it came. */
  health?: Record<string, unknown> | null
  error?: string
}

/** The scanner's /health, for the admin page. */
export async function scannerHealth(timeoutMs = 6_000): Promise<ScannerHealth> {
  const setup = readScannerSetup()
  if (!setup.configured) {
    const invalidUrl = (setup as { invalidUrl?: boolean }).invalidUrl === true
    return { configured: false, missing: setup.missing, ...(invalidUrl ? { invalidUrl } : {}) }
  }
  const host = new URL(setup.config.url).host
  const t0 = Date.now()
  try {
    const res = await fetch(`${setup.config.url}/health`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) })
    const health = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { configured: true, missing: [], host, reachable: true, httpStatus: res.status, latencyMs: Date.now() - t0, health }
  } catch (e) {
    return {
      configured: true,
      missing: [],
      host,
      reachable: false,
      latencyMs: Date.now() - t0,
      error: e instanceof Error && e.name === "TimeoutError" ? "No answer in time" : "Could not connect",
    }
  }
}
