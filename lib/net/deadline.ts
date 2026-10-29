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
 * Browser safe, no imports. Used by lib/storage/media-url.ts mediaFetch,
 * which every Supabase client in the app fetches through, and by proxy.ts.
 */

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
}

export function deadlineFetch(input: RequestInfo | URL, init?: RequestInit, opts: DeadlineOptions = {}): Promise<Response> {
  const base = opts.base ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a))
  const url = urlOf(input)
  const method = methodOf(input, init)
  const ms = opts.ms !== undefined ? opts.ms : deadlineFor(url, method)
  const caller = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined)
  const ours = ms === null ? null : timeoutSignal(ms, url)
  const signal = ours ? merged(caller, ours) : caller
  const started = Date.now()
  const go = (i: RequestInfo | URL) => base(i, signal ? { ...init, signal } : init)
  const read = method === "GET" || method === "HEAD"
  if (!read || opts.retry === false) return go(input)
  return transientRetry(input, go, { caller, ours, started, ms, statuses: opts.retryStatuses ?? RETRY_STATUSES })
}

async function transientRetry(
  input: RequestInfo | URL,
  go: (i: RequestInfo | URL) => Promise<Response>,
  { caller, ours, started, ms, statuses }: { caller?: AbortSignal | null; ours: AbortSignal | null; started: number; ms: number | null; statuses: ReadonlySet<number> },
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
    /* Let the unread body go without waiting on it: a cancel can wait on another reader of the same stream. */
    void res.body?.cancel().catch(() => {})
    await sleep(wait)
  }
}
