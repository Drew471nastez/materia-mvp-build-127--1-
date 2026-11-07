/**
 * ===========================================================================
 *  EVERY CALL TO SUPABASE ENDS, AND A READ THAT HIT A BLIP IS ASKED AGAIN
 * ===========================================================================
 * The logs of Oct 28 2026: functions on orders, billing and the website
 * builder stopped at Vercel's 300 second ceiling, next to "fetch
 * HeadersTimeoutError". 300 seconds is undici's own default headersTimeout,
 * the only limit Node's fetch has: a request Supabase (or anything) accepted
 * and never answered held the whole function for five minutes, because no
 * call made through the Supabase clients carried a deadline of its own.
 * lib/auth/current-user.ts raced getUser() against three seconds, but a race
 * only stops waiting: the request itself went on, and with it the function.
 *
 * `deadlineFetch` gives every request a deadline by what it is, merged with
 * any signal the caller passed, and aborts the request itself when it runs
 * out. `transientRetry` asks a READ (GET or HEAD) again after a network
 * error, a 502, 503 or 504, or a 429, at most twice, with exponential
 * backoff and jitter, and only while the deadline leaves room. A write is
 * never repeated here: an insert, an update, an RPC, an order, a payment or
 * an upload may already have happened when its answer was lost.
 *
 * Browser safe, no imports beyond ./retry-budget (none of its own). Used by
 * lib/storage/media-url.ts mediaFetch, which every Supabase client in the
 * app fetches through, and by proxy.ts.
 *
 * Round 50: every retry here is paid for from one budget per instance
 * (./retry-budget.ts). A blip is asked again as before; an outage is not
 * multiplied by three.
 */
import { supabaseRetryBudget, type RetryBudget } from "./retry-budget"
import { breakerFor, type CircuitBreaker } from "./breaker"

/*
  ===========================================================================
   SUPABASE AUTH THAT IS NOT ANSWERING IS ASKED ONCE, NOT BY EVERY REQUEST
  ===========================================================================
  Round AL, from production. Nov 3 10:28 to 12:06 UTC, three signed in people:
  "auth/v1/token took longer than 10s" 1140 times on the proxy, and its
  AuthRetryableFetchError 510 more, plus the website editor's agent-activity
  poll; Oct 29 to Nov 2, "auth/v1/user took longer than 10s" 237 times over 40
  routes. Every page, prefetch and poll of the same few people waited out the
  same ten second deadline against an Auth that was plainly not answering,
  which is the "infinite loading" the owner saw.

  So on the server the token renewal gets a breaker (./breaker.ts): four in a row
  that got no answer at all (our deadline, a dropped connection) within half a
  minute open it, and for the next fifteen seconds a
  renewal fails at once instead of waiting ten. Supabase's client turns
  that throw into a retryable error with the session kept, the same as a
  timeout (A REFRESH THAT AUTH COULD NOT ANSWER IS NOT A SIGN OUT, below), so
  nobody is signed out by it. Then one request is let through as a trial; an
  answer closes it. A 5xx is an answer that came quickly and is left to the
  library's own retries, so it never opens the breaker. Only the renewal: a
  getUser that is a person's yes or no (a revoked session, a forged token) is
  always asked, so Auth's own no still signs out. Not in a browser: one tab is one person, and its own
  requests already back off.
*/
export const AUTH_BREAKER = { failures: 4, windowMs: 30_000, cooldownMs: 15_000 } as const

/** The breaker for Supabase Auth's token renewal on this server instance, or null in a browser and for any other request. */
function authBreaker(url: string, method: string): CircuitBreaker | null {
  if (typeof window !== "undefined" || !isRefreshTokenRequest(url, method)) return null
  return breakerFor("supabase-auth", AUTH_BREAKER)
}

export type DeadlineKind = "auth" | "read" | "write" | "rpc" | "storage-read" | "storage-write" | "functions" | "other"

/** How long each kind of request to Supabase may take, in ms. null: no deadline of ours. */
export const SUPABASE_DEADLINE_MS: Record<DeadlineKind, number | null> = {
  /* getUser, a token refresh, the signing keys: small answers. */
  auth: 10_000,
  /* PostgREST: the authenticated role's statement_timeout is 8s on Supabase, so a read past this is the network, not the query. */
  read: 20_000,
  write: 30_000,
  /* An RPC can be a cron's whole job (a rollup): longer, and still far short of 300s. */
  rpc: 60_000,
  "storage-read": 30_000,
  /* An upload from a server route. In the browser an upload is a person's file on their connection: not ours to cut (see deadlineFor). */
  "storage-write": 120_000,
  functions: 60_000,
  other: 30_000,
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase()
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url
}

export function kindOf(url: string, method: string): DeadlineKind {
  const read = method === "GET" || method === "HEAD"
  if (url.includes("/auth/v1/")) return "auth"
  if (url.includes("/rest/v1/rpc/")) return read ? "read" : "rpc"
  if (url.includes("/rest/v1/")) return read ? "read" : "write"
  if (url.includes("/storage/v1/")) return read ? "storage-read" : "storage-write"
  if (url.includes("/functions/v1/")) return "functions"
  return "other"
}

/** The deadline for one request, or null for none. */
export function deadlineFor(url: string, method: string, browser: boolean = typeof window !== "undefined"): number | null {
  const kind = kindOf(url, method)
  if (browser && kind === "storage-write") return null
  return SUPABASE_DEADLINE_MS[kind]
}

/** Thrown (as the abort reason) when our deadline, not the caller, ended a request. */
export class DeadlineExceeded extends Error {
  readonly ms: number
  constructor(url: string, ms: number) {
    /* The path only: a query string can carry an email or a token. */
    super(`${safePath(url)} took longer than ${Math.round(ms / 1000)}s`)
    this.name = "DeadlineExceeded"
    this.ms = ms
  }
}

/** A URL fit for a log line: host and path, never the query. */
export function safePath(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`
  } catch {
    return String(url).split("?")[0].slice(0, 200)
  }
}

/** One signal from the caller's and ours: whichever ends first ends the request. */
export function merged(caller: AbortSignal | null | undefined, ours: AbortSignal): AbortSignal {
  if (!caller) return ours
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  if (any) return any([caller, ours])
  const ctl = new AbortController()
  const relay = (s: AbortSignal) => () => ctl.abort(s.reason)
  if (caller.aborted) ctl.abort(caller.reason)
  else if (ours.aborted) ctl.abort(ours.reason)
  else {
    caller.addEventListener("abort", relay(caller), { once: true })
    ours.addEventListener("abort", relay(ours), { once: true })
  }
  return ctl.signal
}

function timeoutSignal(ms: number, url: string): AbortSignal {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(new DeadlineExceeded(url, ms)), ms)
  /* Never what keeps a Node process (a script, a test) alive. */
  ;(t as unknown as { unref?: () => void }).unref?.()
  return ctl.signal
}

export const RETRY_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504])
/** PostgREST: its 503 is a schema cache reload, which lib/storage/media-url.ts reads the body of and retries itself. */
export const REST_RETRY_STATUSES: ReadonlySet<number> = new Set([429, 502, 504])
/** Waits before the second and third tries; each gets up to half again as jitter. */
export const READ_RETRY_BASE_MS = 200
export const READ_RETRIES = 2
/** A Retry-After longer than this is not waited for: the answer is handed back. */
const MAX_RETRY_AFTER_MS = 2_000

export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = READ_RETRY_BASE_MS * 2 ** attempt
  return Math.round(base + base * 0.5 * random())
}

function retryAfterMs(res: Response): number | null {
  const v = res.headers.get("retry-after")
  if (!v) return null
  const s = Number(v)
  if (Number.isFinite(s)) return s * 1000
  const at = Date.parse(v)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * fetch with a deadline, and a READ asked again after a transient failure.
 * `base` is the fetch underneath (globalThis.fetch unless a test gives one).
 */
export interface DeadlineOptions {
  /** The fetch underneath: globalThis.fetch unless a test gives one. */
  base?: typeof fetch
  /** Which answers to a read are asked again. PostgREST's 503 is left to media-url's schema cache retry, which reads its body. */
  retryStatuses?: ReadonlySet<number>
  /** false: a deadline and nothing else. */
  retry?: boolean
  /** This request's deadline instead of the one for its kind (tests, a caller that knows better). */
  ms?: number | null
  /** Where retries are paid from: the instance's Supabase budget unless a test gives one. null: no budget. */
  budget?: RetryBudget | null
}

/*
  ===========================================================================
   A REFRESH THAT AUTH COULD NOT ANSWER IS NOT A SIGN OUT
  ===========================================================================
  @supabase/auth-js (2.87.3, lib/fetch.js handleError) treats only a thrown
  fetch or a 502, 503 or 504 as AuthRetryableFetchError. Any other failure of
  POST /auth/v1/token?grant_type=refresh_token, a 500 during an Auth incident
  or a 429 in a refresh storm included, becomes an AuthApiError, and
  GoTrueClient._callRefreshToken then calls _removeSession(): the proxy writes
  the cleared cookies onto the response, the browser and the app's device
  store forget the tokens, and the person is signed out at random. The app's
  three-state auth (lib/auth/current-user.ts) never sees it, because it
  happens inside the library before an answer comes back.

  So a 5xx, a 408 or a 429 from the refresh is handed to the library as a
  503, which it retries with its own backoff and, failing that, returns as a
  retryable error with the session kept. Only the refresh: a sign in, a code
  exchange or a 400 such as refresh_token_not_found ("Already Used") are
  handed back as they are, so a token Auth really refused still signs out.
*/
export const REFRESH_OUTAGE_STATUSES: ReadonlySet<number> = new Set([408, 429, 500, 502, 504])

/*
  Round 50: EVERY 5xx, not four of them. Supabase answers through Cloudflare, and during an incident the
  refresh comes back 520, 522, 524 or 530 as an HTML page. The library read each of those as AuthApiError
  (or AuthUnknownError for the HTML) and removed the session, so the person was signed out by an outage
  that was not theirs. A 408 is the same: nobody answered.
*/
export function isRefreshOutageStatus(status: number): boolean {
  return status >= 500 || REFRESH_OUTAGE_STATUSES.has(status)
}

export function isRefreshTokenRequest(url: string, method: string): boolean {
  if (method !== "POST" || !url.includes("/auth/v1/token")) return false
  try {
    return new URL(url, "http://local").searchParams.get("grant_type") === "refresh_token"
  } catch {
    return /[?&]grant_type=refresh_token(?:&|$)/.test(url)
  }
}

function asRetryable(res: Response, why: string): Response {
  console.warn(`[auth] token refresh answered ${why}; kept the session and passed it on as 503 so it is retried`)
  void res.body?.cancel().catch(() => {})
  const headers = new Headers(res.headers)
  headers.delete("content-length")
  headers.delete("content-encoding")
  headers.set("content-type", "application/json")
  return new Response(JSON.stringify({ message: `Auth answered ${why} to a token refresh` }), { status: 503, statusText: "Service Unavailable", headers })
}

export function refreshOutageAsRetryable(url: string, method: string, res: Response): Response {
  if (res.status === 503 || !isRefreshOutageStatus(res.status) || !isRefreshTokenRequest(url, method)) return res
  return asRetryable(res, String(res.status))
}

/*
  A 4XX THAT IS NOT SUPABASE AUTH'S OWN ANSWER IS NOT A REFUSAL EITHER. Auth refuses a token with JSON that
  names it (refresh_token_not_found, refresh_token_already_used, session_not_found). A 403 page from a
  firewall or a captive portal has no such body; the library read it as AuthUnknownError and signed the
  person out. Only a body that parses as JSON is handed back as a refusal.
*/
export async function refreshAnswer(url: string, method: string, res: Response): Promise<Response> {
  const mapped = refreshOutageAsRetryable(url, method, res)
  if (mapped !== res || res.ok || res.status === 503 || !isRefreshTokenRequest(url, method)) return mapped
  const text = await res.text().catch(() => null)
  let parsed: unknown = null
  try {
    parsed = text === null ? null : JSON.parse(text)
  } catch {
    parsed = null
  }
  if (!parsed || typeof parsed !== "object") return asRetryable(new Response(null), `${res.status} without Auth's own answer`)
  return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers })
}

/*
  ===========================================================================
   ONE RENEWAL PER REFRESH TOKEN, SHARED BY EVERY REQUEST THAT HOLDS IT
  ===========================================================================
  Round 50. An app brought back from the background, a page with its prefetches, a layout and its page:
  each request carries the same expired session, and each one's Supabase client renewed it on its own,
  every one a POST to Supabase Auth with the same refresh token. Auth tolerates that only inside its
  reuse interval; outside it, a token used again that is two renewals behind ends the whole session
  ("Invalid Refresh Token: Already Used").

  So on one server instance, and in one page, a renewal of refresh token T that is already under way is
  waited for rather than sent again, and its answer is handed to every caller that presents T for a few
  seconds after (SHARE_RENEWAL_MS, inside Auth's own reuse interval of 10s). Each caller still saves the
  session itself, onto its own response. Only a successful answer is shared; a failure is each caller's
  own. The key is the exact token, so nobody is handed a session they did not hold the token for, and the
  answer is the one Auth gives that caller anyway inside its reuse interval.
*/
export const SHARE_RENEWAL_MS = 5_000
const SHARED_RENEWALS_MAX = 500
type HeldAnswer = { status: number; statusText: string; headers: [string, string][]; body: string }
type Held = Map<string, { at: number; answer: Promise<HeldAnswer | null> }>
/* One table per fetch underneath: production has one, and a test that hands its own stub shares nothing with the next. */
const ownFetch = {}
let sharedByBase = new WeakMap<object, Held>()
function renewalsFor(base: DeadlineOptions["base"]): Held {
  const key = base ?? ownFetch
  let held = sharedByBase.get(key)
  if (!held) sharedByBase.set(key, (held = new Map()))
  return held
}

/** How many renewals this instance sent to Supabase Auth, and how many it shared (tests, the harness). */
export const renewalCounts = { sent: 0, shared: 0 }

function refreshTokenIn(body: BodyInit | null | undefined): string | null {
  if (typeof body !== "string") return null
  try {
    const t = (JSON.parse(body) as { refresh_token?: unknown }).refresh_token
    return typeof t === "string" && t ? t : null
  } catch {
    return null
  }
}

function heldResponse(a: HeldAnswer): Response {
  return new Response(a.body, { status: a.status, statusText: a.statusText, headers: a.headers })
}

/** Forget every shared renewal (tests). */
export function forgetSharedRenewals(): void {
  sharedByBase = new WeakMap()
  renewalCounts.sent = 0
  renewalCounts.shared = 0
}

function sendRenewal(input: RequestInfo | URL, init: RequestInit | undefined, opts: DeadlineOptions, url: string, method: string): Promise<Response> {
  renewalCounts.sent++
  return fetchWithDeadline(input, init, opts).then((res) => refreshAnswer(url, method, res))
}

function sharedRenewal(input: RequestInfo | URL, init: RequestInit | undefined, opts: DeadlineOptions, url: string, method: string): Promise<Response> {
  const token = refreshTokenIn(init?.body)
  if (!token) return sendRenewal(input, init, opts, url, method)
  const sharedRenewals = renewalsFor(opts.base)
  const now = Date.now()
  for (const [k, v] of sharedRenewals) if (now - v.at >= SHARE_RENEWAL_MS) sharedRenewals.delete(k)
  const held = sharedRenewals.get(token)
  if (held) {
    renewalCounts.shared++
    return held.answer.then((a) => (a ? heldResponse(a) : sendRenewal(input, init, opts, url, method)))
  }
  const sent = sendRenewal(input, init, opts, url, method)
  const answer: Promise<HeldAnswer | null> = sent.then(
    async (res) => {
      if (!res.ok) return null
      const body = await res.clone().text()
      return { status: res.status, statusText: res.statusText, headers: [...res.headers.entries()], body }
    },
    () => null,
  )
  if (sharedRenewals.size >= SHARED_RENEWALS_MAX) {
    const oldest = sharedRenewals.keys().next().value
    if (oldest !== undefined) sharedRenewals.delete(oldest)
  }
  sharedRenewals.set(token, { at: now, answer })
  /* A renewal that failed is not kept: the next caller asks Auth itself. */
  void answer.then((a) => {
    if (!a && sharedRenewals.get(token)?.answer === answer) sharedRenewals.delete(token)
  })
  return sent
}

export function deadlineFetch(input: RequestInfo | URL, init?: RequestInit, opts: DeadlineOptions = {}): Promise<Response> {
  const method = methodOf(input, init)
  const url = urlOf(input)
  if (isRefreshTokenRequest(url, method)) return sharedRenewal(input, init, opts, url, method)
  return fetchWithDeadline(input, init, opts)
}

function fetchWithDeadline(input: RequestInfo | URL, init?: RequestInit, opts: DeadlineOptions = {}): Promise<Response> {
  const url = urlOf(input)
  const method = methodOf(input, init)
  const breaker = authBreaker(url, method)
  if (!breaker) return fetchBounded(input, init, opts, url, method)
  const caller = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined)
  /* Only no answer counts: our deadline or a dropped connection. Any status is an answer; the caller giving up is nobody's failure. */
  return breaker.call(
    () => fetchBounded(input, init, opts, url, method),
    (o) => "error" in o && !caller?.aborted,
  )
}

function fetchBounded(input: RequestInfo | URL, init: RequestInit | undefined, opts: DeadlineOptions, url: string, method: string): Promise<Response> {
  const base = opts.base ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a))
  const ms = opts.ms !== undefined ? opts.ms : deadlineFor(url, method)
  const caller = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined)
  const ours = ms === null ? null : timeoutSignal(ms, url)
  const signal = ours ? merged(caller, ours) : caller
  const started = Date.now()
  const go = (i: RequestInfo | URL) => base(i, signal ? { ...init, signal } : init)
  const read = method === "GET" || method === "HEAD"
  const budget = opts.budget === undefined ? supabaseRetryBudget : opts.budget
  budget?.deposit()
  if (!read || opts.retry === false) return go(input)
  return transientRetry(input, go, { caller, ours, started, ms, statuses: opts.retryStatuses ?? RETRY_STATUSES, budget })
}

async function transientRetry(
  input: RequestInfo | URL,
  go: (i: RequestInfo | URL) => Promise<Response>,
  { caller, ours, started, ms, statuses, budget }: { caller?: AbortSignal | null; ours: AbortSignal | null; started: number; ms: number | null; statuses: ReadonlySet<number>; budget: RetryBudget | null },
): Promise<Response> {
  const isRequest = typeof Request !== "undefined" && input instanceof Request
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= READ_RETRIES
    let res: Response
    try {
      /* A Request's body can be read once: each try is handed its own copy. */
      res = await go(isRequest ? (input as Request).clone() : input)
    } catch (e) {
      /* The caller's own abort, our deadline, or the last try: handed back as it is. */
      if (last || caller?.aborted || ours?.aborted) throw e
      const wait = backoffMs(attempt)
      if (ms !== null && Date.now() - started + wait >= ms) throw e
      /* The budget is spent: an outage, not a blip. The first try's answer stands. */
      if (budget && !budget.spend()) throw e
      await sleep(wait)
      continue
    }
    if (last || !statuses.has(res.status)) return res
    let wait = backoffMs(attempt)
    if (res.status === 429) {
      const asked = retryAfterMs(res)
      if (asked !== null && asked > MAX_RETRY_AFTER_MS) return res
      if (asked !== null) wait = Math.max(wait, asked)
    }
    if (ms !== null && Date.now() - started + wait >= ms) return res
    if (caller?.aborted || ours?.aborted) return res
    if (budget && !budget.spend()) return res
    /* Let the unread body go without waiting on it: a cancel can wait on another reader of the same stream. */
    void res.body?.cancel().catch(() => {})
    await sleep(wait)
  }
}
