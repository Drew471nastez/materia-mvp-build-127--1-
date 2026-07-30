/**
 * eAWB (Innoship) server-side client — ISOLATED, SERVER-ONLY.
 *
 * eAWB.ro is operated by Innoship and exposes a REST API:
 *   - https://query.innoship.com  → GET  endpoints (locations, track, couriers…)
 *   - https://api.innoship.com    → POST endpoints (order, price, label…)
 *
 * Authentication is via two headers on every request:
 *   X-Api-Key: <EAWB_API_KEY>
 *   api-version: 1.0
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SECURITY
 *   `EAWB_API_KEY` is a server-only secret.
 *   - NEVER expose it to the browser. Do NOT rename it to NEXT_PUBLIC_*.
 *   - NEVER log it. No error message, thrown value, or console line in this file
 *     includes the key, and callers must keep it that way.
 *   This module must only ever be imported from server code (route handlers,
 *   server actions, server components) — never from a "use client" module.
 * ────────────────────────────────────────────────────────────────────────────
 */

// Base URLs are overridable via env (e.g. staging), defaulting to production.
const QUERY_BASE_URL = (process.env.EAWB_QUERY_BASE_URL || "https://query.innoship.com").replace(/\/+$/, "")
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future POST calls (order/label)
const API_BASE_URL = (process.env.EAWB_API_BASE_URL || "https://api.innoship.com").replace(/\/+$/, "")
const API_VERSION = "1.0"

/** Outcome codes for an eAWB request. Discriminates every failure mode the caller must handle. */
export type EawbOutcomeCode =
  | "ok"
  | "missing_key" // EAWB_API_KEY is not configured on the server
  | "auth" // eAWB rejected our credentials (401/403)
  | "http_error" // eAWB replied with a non-2xx (other than auth)
  | "parse_error" // eAWB replied 2xx but the body was not valid JSON
  | "network_error" // we could not reach eAWB at all (DNS/TLS/timeout)

/** Non-sensitive result of a connection/auth check. Contains NO secrets. */
export interface EawbConnectionResult {
  ok: boolean
  code: EawbOutcomeCode
  /** Human-readable, safe-to-surface summary. Never contains the API key. */
  message: string
  /** HTTP status eAWB returned, or null when the request never completed. */
  upstreamStatus: number | null
  /** Number of client locations returned on success — a lightweight sanity signal. */
  locationCount: number | null
}

/** Thrown internally when the server is missing its eAWB credentials. */
export class EawbConfigError extends Error {
  constructor(message = "EAWB_API_KEY is not configured") {
    super(message)
    this.name = "EawbConfigError"
  }
}

/**
 * Read the API key from the environment, or throw {@link EawbConfigError}.
 * The returned value is intentionally never logged or echoed by this module.
 */
function getApiKey(): string {
  const key = process.env.EAWB_API_KEY
  if (!key || !key.trim()) {
    throw new EawbConfigError()
  }
  return key
}

/** Truncate an upstream body so diagnostics never dump large/sensitive payloads. */
function safeSnippet(text: string, max = 300): string {
  const clean = text.replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

/**
 * Perform an authenticated GET against the eAWB query API and parse JSON.
 *
 * Every failure mode is normalised into a thrown {@link Error} subclass or a
 * plain Error tagged with a `code` matching {@link EawbOutcomeCode}, so callers
 * can map outcomes without ever seeing the key.
 */
async function eawbGetJson<T>(path: string): Promise<T> {
  const apiKey = getApiKey() // throws EawbConfigError → "missing_key"
  const url = `${QUERY_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`

  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
        "api-version": API_VERSION,
        Accept: "application/json",
      },
      // Never cache credentialed diagnostics.
      cache: "no-store",
    })
  } catch (err) {
    const cause = err instanceof Error ? err.message : "unknown error"
    throw taggedError("network_error", `Could not reach eAWB: ${cause}`)
  }

  const rawBody = await response.text().catch(() => "")

  if (response.status === 401 || response.status === 403) {
    throw taggedError("auth", `eAWB rejected the API key (HTTP ${response.status})`, response.status)
  }
  if (!response.ok) {
    throw taggedError(
      "http_error",
      `eAWB returned HTTP ${response.status}: ${safeSnippet(rawBody)}`,
      response.status,
    )
  }

  try {
    return JSON.parse(rawBody) as T
  } catch {
    throw taggedError("parse_error", "eAWB returned a 2xx response that was not valid JSON", response.status)
  }
}

/** Attach an EawbOutcomeCode (+ optional upstream status) to an Error for uniform mapping. */
function taggedError(code: EawbOutcomeCode, message: string, upstreamStatus?: number): Error & {
  code: EawbOutcomeCode
  upstreamStatus?: number
} {
  const e = new Error(message) as Error & { code: EawbOutcomeCode; upstreamStatus?: number }
  e.name = "EawbError"
  e.code = code
  if (typeof upstreamStatus === "number") e.upstreamStatus = upstreamStatus
  return e
}

/**
 * Verify that the server can authenticate against eAWB WITHOUT creating a
 * shipment. Uses the parameter-less, read-only `ClientLocations` GET endpoint.
 *
 * Never throws — every failure mode (missing key, auth, non-2xx, bad JSON,
 * network) is returned as a structured, secret-free {@link EawbConnectionResult}.
 */
export async function verifyConnection(): Promise<EawbConnectionResult> {
  try {
    const data = await eawbGetJson<unknown>("/api/Location/ClientLocations")
    const locationCount = Array.isArray(data) ? data.length : null
    return {
      ok: true,
      code: "ok",
      message: "eAWB authentication succeeded.",
      upstreamStatus: 200,
      locationCount,
    }
  } catch (err) {
    if (err instanceof EawbConfigError) {
      return {
        ok: false,
        code: "missing_key",
        message: "EAWB_API_KEY is not configured on the server.",
        upstreamStatus: null,
        locationCount: null,
      }
    }
    const tagged = err as Error & { code?: EawbOutcomeCode; upstreamStatus?: number }
    const code: EawbOutcomeCode = tagged.code ?? "network_error"
    return {
      ok: false,
      code,
      // tagged.message is authored in this file and contains no secret.
      message: tagged.message || "eAWB connection failed.",
      upstreamStatus: tagged.upstreamStatus ?? null,
      locationCount: null,
    }
  }
}
