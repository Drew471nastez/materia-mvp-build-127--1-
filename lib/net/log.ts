/**
 * ===========================================================================
 *  A LOG LINE ABOUT A FAILURE, WITH NOTHING PRIVATE IN IT
 * ===========================================================================
 * One JSON line per failure, so Vercel's log search can count them by kind:
 *
 *   {"evt":"service_unavailable","where":"creator","kind":"timeout","status":null,"code":null,"rid":"iad1::abc"}
 *
 * Never a token, a cookie, an email, a query string or a row: `where` is a
 * label the caller chose, `rid` the request's id (lib/net/request-id.ts),
 * and every string is cut to a length and stripped of anything that reads
 * as a JWT or a key.
 */
import type { ServiceUnavailable } from "@/lib/net/service-error"
import { REQUEST_ID_HEADER, cleanRequestId } from "@/lib/net/request-id"

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g
const KEYISH = /\b(?:sk|pk|rk|whsec|re|sb)_(?:live|test|secret|publishable)?_?[A-Za-z0-9]{12,}\b/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** A string fit for a log: no token, no key, no address, no query, at most 200 characters. */
export function sanitizeForLog(v: unknown): string {
  return String(v ?? "")
    .replace(JWT, "[jwt]")
    .replace(KEYISH, "[key]")
    .replace(EMAIL, "[email]")
    .replace(/([?&][^=\s]+=)[^&\s]+/g, "$1[…]")
    .slice(0, 200)
}

/** The current request's id, when there is a request (a page, a route). Never throws. */
export async function currentRequestId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers")
    const h = await headers()
    return cleanRequestId(h.get(REQUEST_ID_HEADER)) ?? cleanRequestId(h.get("x-vercel-id"))
  } catch {
    return null
  }
}

export function logLine(evt: string, fields: Record<string, string | number | boolean | null | undefined>): string {
  const out: Record<string, string | number | boolean | null> = { evt }
  for (const [k, v] of Object.entries(fields)) out[k] = typeof v === "string" ? sanitizeForLog(v) : v ?? null
  return JSON.stringify(out)
}

/** Logs a ServiceUnavailable as one line. Fire and forget: logging is never what fails a request. */
export function logServiceFailure(e: ServiceUnavailable): void {
  void currentRequestId()
    .then((rid) => console.warn(logLine("service_unavailable", { where: e.where, kind: e.kind, status: e.status, code: e.code, rid })))
    .catch(() => {})
}
