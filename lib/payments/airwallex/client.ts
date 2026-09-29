import "server-only"

/**
 * ===========================================================================
 *  THE ONE WAY STORELIB TALKS TO AIRWALLEX
 * ===========================================================================
 * Every Airwallex call goes through `call()`. It:
 *
 *   logs in with the client id and API key (POST /api/v1/authentication/login)
 *   and reuses the token until a minute before `expires_at` (tokens last 30
 *   minutes). Two requests that both find no token share one login.
 *
 *   sends `x-on-behalf-of` only when the caller names a connected account.
 *   It is required for what the CREATOR owns (their onboarding, balances,
 *   beneficiaries, payouts) and wrong for what STORELIB owns: in the
 *   "collect payments directly" model a payment intent, its refunds and its
 *   splits belong to the platform, and the creator is named in the body
 *   (`connected_account_id`, `destination`). `onBehalfOf` is therefore a
 *   required argument with no default, so no call site sends it or leaves it
 *   out by accident.
 *
 *   pins `x-api-version` when AIRWALLEX_API_VERSION is set.
 *
 *   retries once after a 401 with a fresh token (a token revoked early), and
 *   never retries anything else: a money moving request is retried by its
 *   caller with the SAME request_id, which Airwallex deduplicates.
 *
 * Errors come back as AirwallexError with the status and Airwallex's `code`.
 * Nothing here logs a request or response body: they can hold bank details
 * and identity data.
 */

import { airwallexConfig, type AirwallexConfig } from "./config"

export type Fetch = typeof fetch

export class AirwallexError extends Error {
  readonly status: number
  readonly code: string | null
  /** Airwallex's own message. For logs and support, never for a creator. */
  readonly providerMessage: string | null
  constructor(status: number, code: string | null, providerMessage: string | null) {
    super(`Airwallex ${status}${code ? ` ${code}` : ""}`)
    this.name = "AirwallexError"
    this.status = status
    this.code = code
    this.providerMessage = providerMessage
  }
}

export interface CallOptions {
  /** The connected account this acts for, or `null` for the platform itself. Required, on purpose. */
  onBehalfOf: string | null
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  /** Abort after this long. Default 20s. */
  timeoutMs?: number
}

interface Token {
  value: string
  /** ms epoch at which to stop using it. */
  until: number
}

export interface AirwallexClient {
  call<T>(method: "GET" | "POST", path: string, options: CallOptions): Promise<T>
  readonly config: AirwallexConfig
}

const REFRESH_EARLY_MS = 60_000

export function createAirwallexClient(config: AirwallexConfig = airwallexConfig(), fetchImpl: Fetch = fetch): AirwallexClient {
  let token: Token | null = null
  let loggingIn: Promise<Token> | null = null

  const login = async (): Promise<Token> => {
    const res = await fetchImpl(`${config.baseUrl}/api/v1/authentication/login`, {
      method: "POST",
      headers: {
        "x-client-id": config.clientId,
        "x-api-key": config.apiKey,
        "content-type": "application/json",
        ...(config.apiVersion ? { "x-api-version": config.apiVersion } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw await errorFrom(res)
    const json = (await res.json()) as { token?: string; expires_at?: string }
    if (!json.token) throw new AirwallexError(res.status, "no_token", null)
    const expires = json.expires_at ? Date.parse(json.expires_at.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : NaN
    /* 30 minutes is the documented life; use it when the date does not parse. */
    const until = (Number.isFinite(expires) ? expires : Date.now() + 30 * 60_000) - REFRESH_EARLY_MS
    return { value: json.token, until }
  }

  const bearer = async (fresh = false): Promise<string> => {
    if (!fresh && token && token.until > Date.now()) return token.value
    if (!loggingIn) {
      loggingIn = login().then(
        (t) => {
          token = t
          loggingIn = null
          return t
        },
        (e) => {
          loggingIn = null
          throw e
        },
      )
    }
    return (await loggingIn).value
  }

  const call = async <T,>(method: "GET" | "POST", path: string, options: CallOptions): Promise<T> => {
    if (!path.startsWith("/api/v1/")) throw new Error("An Airwallex path starts with /api/v1/.")
    if (options.onBehalfOf !== null && !/^acct_[A-Za-z0-9_-]+$/.test(options.onBehalfOf)) {
      throw new Error("x-on-behalf-of must be a connected account id.")
    }
    const url = new URL(config.baseUrl + path)
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v))
    }
    const send = async (fresh: boolean) =>
      fetchImpl(url.toString(), {
        method,
        headers: {
          authorization: `Bearer ${await bearer(fresh)}`,
          "content-type": "application/json",
          ...(options.onBehalfOf ? { "x-on-behalf-of": options.onBehalfOf } : {}),
          ...(config.apiVersion ? { "x-api-version": config.apiVersion } : {}),
        },
        body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      })
    let res = await send(false)
    if (res.status === 401) {
      token = null
      res = await send(true)
    }
    if (!res.ok) throw await errorFrom(res)
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return { call, config }
}

async function errorFrom(res: Response): Promise<AirwallexError> {
  let code: string | null = null
  let message: string | null = null
  try {
    const j = (await res.json()) as { code?: unknown; message?: unknown }
    code = typeof j.code === "string" ? j.code : null
    message = typeof j.message === "string" ? j.message.slice(0, 300) : null
  } catch {
    /* not JSON: the status is the whole story */
  }
  return new AirwallexError(res.status, code, message)
}

/* One client per server instance, made on first use. */
let shared: AirwallexClient | null = null
export function airwallex(): AirwallexClient {
  if (!shared) shared = createAirwallexClient()
  return shared
}

/**
 * A request id Airwallex will deduplicate, derived from what the request is
 * FOR rather than made up per attempt: the same order's payment, the same
 * refund, the same payout always send the same id, so a retry after a
 * timeout is the same request and not a second one. At most 64 characters
 * (the tightest limit, Funds Split's; Charges allow 50, handled by `max`).
 */
export function requestId(kind: string, ...parts: Array<string | number>): string {
  const id = [kind, ...parts.map(String)].join(":").replace(/[^A-Za-z0-9:_-]/g, "-")
  return id.length <= 64 ? id : `${kind}:${hash(id)}`
}

export function requestIdMax(max: number, kind: string, ...parts: Array<string | number>): string {
  const id = requestId(kind, ...parts)
  return id.length <= max ? id : `${kind.slice(0, 8)}:${hash(id)}`.slice(0, max)
}

/** A short stable hash (FNV-1a, 2 × 32 bits) for ids that would be too long. */
function hash(s: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ (c + i), 0x01000193) >>> 0
  }
  return a.toString(36) + b.toString(36)
}
