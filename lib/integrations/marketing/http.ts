/**
 * ===========================================================================
 *  ONE WAY TO ASK KLAVIYO OR OMNISEND ANYTHING
 * ===========================================================================
 * Every call the marketing sync makes goes through `marketingCall`: a
 * timeout, JSON both ways, the provider's own limits kept (`pace`), and an
 * answer that says which kind of failure it was, the same way the print
 * partners do (lib/integrations/fulfilment/http.ts):
 *
 *   retry     busy (429, with its Retry-After), down (5xx) or not reached.
 *             The job is tried again later with backoff
 *             (lib/physical/jobs-server.ts runJobs), nothing is lost.
 *   refused   the provider read the request and said no (a key it no
 *             longer accepts, a scope the key lacks, a list that is gone).
 *             Trying again changes nothing: the integration card says why.
 *
 * `fetch` is the global one, so a test replaces it with a stub of the
 * provider's API and nothing real is ever called.
 */

import { ProviderError } from "@/lib/integrations/fulfilment/http"

export { ProviderError }

export const MARKETING_TIMEOUT_MS = 12_000

/* ── the providers' published limits, kept below ───────────────────────── */

/**
 * Requests a minute Storelib allows itself, a tenth under each provider's
 * steady limit, per store (each store's key is its own account):
 *
 *   Klaviyo   Create Event 3500/m, Bulk Subscribe and Bulk Unsubscribe
 *             750/m, Get Profiles and Get Lists 750/m, Bulk Import
 *             Profiles 150/m, Get Accounts 15/m (developers.klaviyo.com,
 *             each endpoint's "Rate limits")
 *   Omnisend  400 a minute per brand across every endpoint
 *             (api-docs.omnisend.com/reference/rate-limit-timeouts-errors)
 */
export const LIMITS = {
  "klaviyo:events": 3150,
  "klaviyo:subscriptions": 675,
  "klaviyo:read": 675,
  "klaviyo:import": 135,
  "klaviyo:accounts": 13,
  omnisend: 360,
} as const
export type LimitName = keyof typeof LIMITS

/**
 * Spaces requests out so a store never goes over a limit: each call waits
 * for its slot, one every 60s / limit. A burst never happens, so the
 * per-second limits are kept too. Within one server process; a second
 * process at once is covered by the 429 answer and the job's backoff.
 */
export class Pacer {
  private next = new Map<string, number>()
  constructor(
    public now: () => number = () => Date.now(),
    public sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}
  /** How long the call waited, in ms. */
  async wait(key: string, perMinute: number): Promise<number> {
    const gap = Math.ceil(60_000 / Math.max(1, perMinute))
    const t = this.now()
    const at = Math.max(t, this.next.get(key) ?? 0)
    this.next.set(key, at + gap)
    if (this.next.size > 5000) this.next.clear()
    if (at > t) await this.sleep(at - t)
    return at - t
  }
  reset() {
    this.next.clear()
  }
}

export const pacer = new Pacer()

/** What a provider's error body says, in one line. Klaviyo: { errors: [{ detail, title }] }; Omnisend: { title, detail, errors: [{ field, message }] }. */
export function marketingMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return typeof body === "string" && body.trim() && body.trim().length < 300 ? body.trim() : null
  const b = body as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const first = Array.isArray(b.errors) ? b.errors[0] : null
  const candidates = [first?.detail, first?.message, first?.title, b.detail, b.title, b.message, b.error]
  for (const c of candidates) if (typeof c === "string" && c.trim()) return c.trim().slice(0, 200)
  return null
}

export async function marketingCall<T = unknown>(
  name: string,
  url: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; headers: Record<string, string>; body?: unknown; limit: { key: string; name: LimitName } },
): Promise<T> {
  await pacer.wait(`${init.limit.name}:${init.limit.key}`, LIMITS[init.limit.name])
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { "User-Agent": "Storelib/1.0 (+https://storelib.com)", ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(MARKETING_TIMEOUT_MS),
      cache: "no-store",
    })
  } catch {
    throw new ProviderError(`${name} could not be reached.`, 0, true)
  }
  const text = await res.text().catch(() => "")
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (res.ok) return body as T
  const said = marketingMessage(body)
  if (res.status === 429) {
    const header = Number(res.headers.get("retry-after"))
    const inBody = body && typeof body === "object" ? Number((body as Record<string, unknown>).retryAfter) : NaN
    const after = Number.isFinite(header) && header > 0 ? header : Number.isFinite(inBody) && inBody > 0 ? inBody : null
    throw new ProviderError(`${name} asked Storelib to slow down. Storelib tries again shortly.`, 429, true, after ? Math.min(after, 3600) : null)
  }
  if (res.status >= 500) throw new ProviderError(`${name} had a problem (${res.status}). Storelib tries again shortly.`, res.status, true)
  if (res.status === 401) throw new ProviderError(`${name} no longer accepts the saved key. Connect it again with a new key.`, 401, false)
  if (res.status === 403) throw new ProviderError(`${name} refused: the key is missing a permission${said ? ` (${said})` : ""}. Make a key with the permissions listed on this page.`, 403, false)
  throw new ProviderError(said ? `${name}: ${said}` : `${name} refused the request (${res.status}).`, res.status, false)
}

/** First and last name from a full one, as both providers keep them. */
export function nameParts(full: string | null | undefined): { first: string | null; last: string | null } {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: null, last: null }
  if (parts.length === 1) return { first: parts[0].slice(0, 100), last: null }
  return { first: parts.slice(0, -1).join(" ").slice(0, 100), last: parts[parts.length - 1].slice(0, 100) }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
