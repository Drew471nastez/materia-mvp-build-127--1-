/**
 * ===========================================================================
 *  ONE WAY TO ASK A FULFILMENT PROVIDER ANYTHING
 * ===========================================================================
 * Every call Storelib makes to Printful or Printify goes through `call`:
 * a timeout, JSON both ways, and an answer that says which kind of failure
 * it was, because that decides what happens next:
 *
 *   retry       the provider is busy (429, with its Retry-After), down (5xx)
 *               or could not be reached. The job is tried again later with
 *               backoff (lib/physical/jobs-server.ts), nothing is lost.
 *   refused     the provider read the request and said no (a SKU it does
 *               not have, an address it cannot ship to, a key it no longer
 *               accepts). Trying again changes nothing, so the order is
 *               marked for the seller to send by hand, with the reason.
 *
 * `fetch` is the global one, so a test replaces it with a stub of the
 * provider's API and nothing real is ever called.
 */

export class ProviderError extends Error {
  readonly status: number
  readonly retry: boolean
  readonly retryAfterSeconds: number | null
  constructor(message: string, status: number, retry: boolean, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = "ProviderError"
    this.status = status
    this.retry = retry
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export const PROVIDER_TIMEOUT_MS = 12_000

/** What a provider's error body says, in one line, or null. Printful: { error: { message } } or { result: "..." }; Printify: { message } or { errors: { reason } }. */
export function providerMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return typeof body === "string" && body.trim() ? body.trim().slice(0, 200) : null
  const b = body as Record<string, any>
  /* ShipStation (lib/integrations/shipping) answers { Message, ExceptionMessage }; EasyPost { error: { message } }; Shippo { detail }. */
  const candidates = [b.error?.message, typeof b.error === "string" ? b.error : null, b.message, b.errors?.reason, typeof b.result === "string" ? b.result : null, b.ExceptionMessage, b.Message, b.detail]
  for (const c of candidates) if (typeof c === "string" && c.trim()) return c.trim().slice(0, 200)
  return null
}

export async function call<T = unknown>(
  name: string,
  url: string,
  init: { method?: "GET" | "POST" | "PUT" | "DELETE"; headers: Record<string, string>; body?: unknown },
): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { Accept: "application/json", "User-Agent": "Storelib/1.0 (+https://storelib.com)", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
  const said = providerMessage(body)
  if (res.status === 429) {
    const after = Number(res.headers.get("retry-after"))
    throw new ProviderError(`${name} is busy right now. Storelib tries again shortly.`, 429, true, Number.isFinite(after) && after > 0 ? Math.min(after, 3600) : null)
  }
  if (res.status >= 500) throw new ProviderError(`${name} had a problem (${res.status}). Storelib tries again shortly.`, res.status, true)
  if (res.status === 401 || res.status === 403) throw new ProviderError(`${name} no longer accepts the saved key. Connect it again in Settings > Integrations.`, res.status, false)
  throw new ProviderError(said ? `${name}: ${said}` : `${name} refused the request (${res.status}).`, res.status, false)
}

/** A person's name as a provider wants it, first and last. */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: "Customer", last: "" }
  if (parts.length === 1) return { first: parts[0], last: "" }
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] }
}

/** A checkout's id as a provider's order reference: its 32 hex digits (Printful takes at most 32 characters). */
export function externalIdOf(checkoutId: string): string {
  return checkoutId.replace(/-/g, "").toLowerCase()
}

/** And back: the checkout id from an external reference, or null when it is not one of ours. */
export function checkoutIdOf(externalId: unknown): string | null {
  const hex = String(externalId ?? "").trim().toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) return null
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
