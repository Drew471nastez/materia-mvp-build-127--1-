/**
 * ===========================================================================
 *  A REQUEST THAT ENDS
 * ===========================================================================
 * The browser's fetch has no deadline. A request the server never answers,
 * or answers with headers and then a body that stalls (a dropped mobile
 * connection does exactly this), stays pending for as long as the tab is
 * open, and every button waiting on it says "Saving" for ever. That was the
 * shape of "it keeps processing": the shared request helpers under the
 * settings panels, the community screens and checkout had no deadline at all.
 *
 * `requestJson` bounds the whole exchange, headers AND body, and says which
 * of these it was, so a screen can tell a person something true:
 *
 *   offline   the device says it has no connection
 *   timeout   asked, and no answer in time. The server MAY have done it:
 *             a caller that changes something must check before asking again
 *   network   the request never completed (connection reset, DNS, CORS)
 *   auth      401: signed out
 *   refused   another 4xx: an answer, with the server's own words
 *   server    5xx: the server had a problem
 *
 * Browser safe. lib/website-builder/load-guard.ts has the builder's own
 * `fetchWithin`; this is the same idea for everything else, bounding the
 * body too.
 *
 * MEASURED. Every request through here is counted for /admin/performance
 * (lib/perf/mark.ts, under the page's area): its time, and every one that did
 * not end in an answer, with why. Only the code goes, never the address or
 * anything in it.
 */
import { perfFail, perfStep } from "@/lib/perf/mark"
import { SLOW_REQUEST_MS, type StepRoute } from "@/lib/perf/config"
import { classify } from "@/lib/perf/routes"
import { msg } from "@/lib/i18n/text"
import { AUTH_UNAVAILABLE_HEADER } from "@/lib/auth/recovery-backoff"

function netRoute(): StepRoute | null {
  try {
    if (typeof location === "undefined") return null
    const area = classify(location.pathname)?.area
    return area ? (`/step/net/${area}` as StepRoute) : null
  } catch {
    return null
  }
}

/** Counts one request's outcome. Never throws, never in the way. */
export function noteRequest(ms: number, fail?: FailKind | "slow"): void {
  const route = netRoute()
  if (!route) return
  if (fail === "auth" || fail === "refused") fail = undefined
  if (fail) perfFail(route, fail)
  else if (ms > SLOW_REQUEST_MS) perfFail(route, "slow")
  else perfStep(route, ms)
}

export type FailKind = "offline" | "timeout" | "network" | "auth" | "refused" | "server"

/** How long each kind of operation waits before it gives up. */
export const WAIT_MS = {
  /** A read a screen is waiting on. */
  read: 15_000,
  /** A save, a post, a setting. */
  write: 25_000,
  /** Anything that touches a payment: Stripe itself can take this long. */
  pay: 45_000,
} as const

export class RequestTimeout extends Error {
  constructor(url: string, ms: number) {
    super(`${url.split("?")[0]} took longer than ${Math.round(ms / 1000)}s`) // i18n-ignore: for the log
    this.name = "RequestTimeout"
  }
}

export type JsonResult<T> = {
  ok: boolean
  status: number
  data: T & { error?: string }
  /** Set when ok is false. */
  kind?: FailKind
}

/** What a person reads for each kind, when the server gave no words of its own. */
/* Marked with msg(): the dashboard shows them through tt(); checkout and other buyer pages read them as they are. */
export const FAIL_COPY: Record<FailKind, string> = {
  offline: msg("You're offline. Check your connection and try again."),
  /* Round 50: a slow answer is the server's, not the connection's. "Check your connection" is for offline and a request that never got out. */
  timeout: msg("This is taking longer than usual. Try again in a moment."),
  network: msg("The connection dropped. Try again."),
  auth: msg("Sign in again to do that."),
  refused: msg("Something went wrong. Try again."),
  server: msg("Something went wrong on our side. Try again in a moment."),
}

export function kindOfStatus(status: number): FailKind | undefined {
  if (status >= 200 && status < 400) return undefined
  if (status === 401) return "auth"
  if (status >= 500) return "server"
  return "refused"
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

/**
 * A 503 that says Supabase Auth did not answer (lib/auth/route-user
 * authUnavailableResponse). The route refused BEFORE doing anything, so it
 * is safe to ask again, a change included: "We could not check your sign in
 * just now" is shown only after these quiet tries also failed.
 */
export { AUTH_UNAVAILABLE_HEADER }
/** Waits before the second and third tries: about 4s in all, with up to a quarter again as jitter. */
export const AUTH_RETRY_DELAYS_MS = [1_200, 2_800] as const
/**
 * Round 49: a read (GET or HEAD) is asked more times, over about 10s, behind
 * the panel's normal loading state, before its words are shown. A slow minute
 * at Supabase Auth is usually over in seconds, and a read changes nothing.
 */
export const AUTH_READ_RETRY_DELAYS_MS = [800, 2_000, 3_500] as const

/** A read's quiet retry needs this much of its deadline left to be worth sending. */
export const AUTH_RETRY_MIN_LEFT_MS = 6_000

/** The quiet waits for this request's method. */
export function authRetryDelays(method: string | undefined): readonly number[] {
  const m = (method ?? "GET").toUpperCase()
  return m === "GET" || m === "HEAD" ? AUTH_READ_RETRY_DELAYS_MS : AUTH_RETRY_DELAYS_MS
}

function authUnavailable(res: Response): boolean {
  return res.status === 503 && res.headers.get(AUTH_UNAVAILABLE_HEADER) === "unavailable"
}

/*
  ===========================================================================
   ONE QUIET RETRY FOR A READ (round 50)
  ===========================================================================
  A read (GET or HEAD, which changes nothing) that met a gateway in the
  middle of a deploy or a cold start (502, 503, 504) or a connection that
  reset before any answer is asked once more, after a short pause with
  jitter, inside the same deadline, before a screen says anything. Only
  while the device is online and only with at least half the deadline left.
  A write is never repeated here: it may have happened.
*/
/*
  Round 53: and a 500. A route whose database read failed answers 500
  (a statement timeout, a pool that had no connection), and the panels that
  read through here showed their error, or nothing, on the first one
  (scripts/check-app-resilience-r53.mjs). A read changes nothing, so it is
  asked again once like a 503.
*/
export const READ_RETRY_STATUSES: ReadonlySet<number> = new Set([500, 502, 503, 504])
export const READ_RETRY_PAUSE_MS = 400

/** A body that can be sent twice (a string, a form, bytes); a stream cannot. */
function resendable(body: BodyInit | null | undefined): boolean {
  return body == null || typeof body === "string" || (typeof FormData !== "undefined" && body instanceof FormData) || (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) || (typeof Blob !== "undefined" && body instanceof Blob) || body instanceof ArrayBuffer || ArrayBuffer.isView(body)
}

/**
 * fetch, bounded end to end. Resolves with the response's JSON (or `{}`),
 * never hangs, and never throws for a server's answer; it throws only when
 * the caller's own signal aborts (an AbortError, as fetch does).
 */
export async function requestJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit & { timeoutMs?: number; json?: unknown } = {},
): Promise<JsonResult<T>> {
  const { json, ...given } = init
  /* A body means a write: fetch refuses a GET with one. */
  const rest: RequestInit & { timeoutMs?: number } = json !== undefined && !given.method ? { ...given, method: "POST" } : given
  const { timeoutMs = rest.method && rest.method !== "GET" ? WAIT_MS.write : WAIT_MS.read } = rest
  delete rest.timeoutMs
  const ctl = new AbortController()
  const outer = rest.signal
  const relay = () => ctl.abort(outer?.reason)
  if (outer) {
    if (outer.aborted) ctl.abort(outer.reason)
    else outer.addEventListener("abort", relay, { once: true })
  }
  let timedOut = false
  const started = now()
  const timer = setTimeout(() => {
    timedOut = true
    ctl.abort(new RequestTimeout(url, timeoutMs))
  }, timeoutMs)

  try {
    const send = () =>
      fetch(url, {
        ...rest,
        ...(json !== undefined
          ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...(rest.headers as Record<string, string> | undefined) } }
          : {}),
        signal: ctl.signal,
      })
    /* Supabase Auth did not answer and nothing was done: asked again quietly, within this request's own deadline. */
    const isRead = json === undefined && /^(GET|HEAD)$/i.test(rest.method ?? "GET")
    const pause = () => Math.round(READ_RETRY_PAUSE_MS + READ_RETRY_PAUSE_MS * Math.random())
    let quietRetryLeft = isRead
    const mayRetryRead = (wait: number) => quietRetryLeft && !isOffline() && now() - started + wait < timeoutMs / 2
    let res: Response
    try {
      res = await send()
    } catch (e) {
      /* No answer at all (a reset, a deploy's dropped socket): a read is asked once more. Our deadline or the caller's abort is not. */
      const wait = pause()
      if (timedOut || outer?.aborted || !mayRetryRead(wait)) throw e
      quietRetryLeft = false
      await new Promise((r) => setTimeout(r, wait))
      res = await send()
    }
    for (const wait of json !== undefined || resendable(rest.body) ? authRetryDelays(rest.method) : []) {
      if (!authUnavailable(res)) break
      const ms = Math.round(wait + wait * 0.25 * Math.random())
      /* Round 49: a read is asked again only with time left for an answer; otherwise its own words now, not "took too long" later. */
      if (now() - started + ms + (isRead ? AUTH_RETRY_MIN_LEFT_MS : 0) >= timeoutMs) break
      void res.body?.cancel().catch(() => {})
      await new Promise((r) => setTimeout(r, ms))
      res = await send()
    }
    if (READ_RETRY_STATUSES.has(res.status) && !authUnavailable(res)) {
      const wait = pause()
      if (mayRetryRead(wait)) {
        quietRetryLeft = false
        void res.body?.cancel().catch(() => {})
        await new Promise((r) => setTimeout(r, wait))
        res = await send()
      }
    }
    let data = {} as T & { error?: string }
    try {
      /* Still under the same deadline: the body is where a dropped connection stalls. */
      data = (await res.json()) as T & { error?: string }
    } catch (e) {
      if (timedOut) throw e
      /* An empty or HTML answer is an answer with no words of its own. */
    }
    const kind = kindOfStatus(res.status)
    noteRequest(now() - started, kind)
    return { ok: res.ok, status: res.status, data, kind }
  } catch (e) {
    if (outer?.aborted && !timedOut) throw e
    /* Offline first: a device with no connection is told so, whatever the request did. */
    const kind: FailKind = isOffline() ? "offline" : timedOut ? "timeout" : "network"
    noteRequest(now() - started, kind)
    return { ok: false, status: 0, data: {} as T & { error?: string }, kind }
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener("abort", relay)
  }
}

/** The words for a failed result: the server's own when it gave some, else the kind's. */
export function failMessage(r: Pick<JsonResult<unknown>, "data" | "kind">, fallback?: string): string {
  const own = typeof r.data?.error === "string" && r.data.error.trim() && !/^[a-z_]+$/.test(r.data.error) ? r.data.error : ""
  if (own && (r.kind === "refused" || r.kind === "auth" || r.kind === "server")) return own
  return (r.kind && r.kind !== "refused" ? FAIL_COPY[r.kind] : fallback) ?? fallback ?? FAIL_COPY.refused
}

/**
 * A plain fetch whose response, body included, is given up on after `ms`.
 * For a caller that wants the Response itself. The timer is left to run: an
 * abort after the body has been read does nothing.
 */
export function fetchWithDeadline(url: string, init: RequestInit = {}, ms: number = WAIT_MS.read): Promise<Response> {
  const ctl = new AbortController()
  const outer = init.signal
  if (outer) {
    if (outer.aborted) ctl.abort(outer.reason)
    else outer.addEventListener("abort", () => ctl.abort(outer.reason), { once: true })
  }
  let timedOut = false
  setTimeout(() => {
    timedOut = true
    ctl.abort(new RequestTimeout(url, ms))
  }, ms)
  const started = now()
  return fetch(url, { ...init, signal: ctl.signal }).then(
    (res) => {
      noteRequest(now() - started, kindOfStatus(res.status))
      return res
    },
    (e) => {
      if (!(outer?.aborted && !timedOut)) noteRequest(now() - started, timedOut ? "timeout" : isOffline() ? "offline" : "network")
      throw e
    },
  )
}

/**
 * `p`, or `fallback` after `ms`, whichever comes first; never rejects. For
 * something a page would like but must not wait for (server or browser).
 */
export function settleWithin<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

/** How long an upload may go without sending a byte before it is called stalled. */
export const UPLOAD_STALL_MS = 45_000

/**
 * Gives up on an XMLHttpRequest upload that has stopped moving: no progress
 * for `ms`. A big file on a slow line is allowed all the time it needs; a
 * dead connection, which leaves the request pending with no error at all, is
 * not allowed to sit at its last percentage for ever. Returns a function to
 * call once the request has ended. `onStall` runs before the abort.
 */
export function watchUploadStall(xhr: XMLHttpRequest, onStall: () => void, ms: number = UPLOAD_STALL_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      onStall()
      xhr.abort()
    }, ms)
  }
  xhr.upload.addEventListener("progress", arm)
  /* Bytes all sent, the server still thinking: the same allowance again for its answer. */
  xhr.upload.addEventListener("load", arm)
  arm()
  return () => clearTimeout(timer)
}
