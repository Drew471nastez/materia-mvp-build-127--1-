/**
 * ===========================================================================
 *  A SWITCH ENDS. EVERY TIME, ON EVERY PHONE.
 * ===========================================================================
 * "On mobile devices, when I'm switching business, and it shows the loading
 * 'Switching to ...', sometimes it gets stuck there. Just ensure this never
 * happens."
 *
 * The screen stays up for as long as the switch is waiting on something, so
 * the switch must never wait on anything without a limit. These are every
 * wait it has, what used to have no limit, and where each one ends now:
 *
 *   THE TOKEN FOR THE HEADER. The request carries this browser's own token
 *   (the app's web view can send a cookie a request late). It was read
 *   through the Supabase client, which first takes the client's lock and
 *   waits for the client to finish starting up. On a phone that has just
 *   come back from the background the client is often renewing its token
 *   right then, over a network that is not there yet, and the lock is held
 *   by that renewal with no limit: the switch never even sent its request.
 *   Now: AUTH_READ_MS, then the token straight from the cookie jar, which
 *   needs no lock. The server reads the cookie first anyway.
 *
 *   THE SERVER'S ANSWER. It had a limit (SWITCH_TIMEOUT_MS), but the limit
 *   was started before the token was read, and an abort only stops a request
 *   that has started, so a hung read meant a request that never started and
 *   an abort that did nothing. The limit now starts with the request.
 *
 *   TAKING THE SESSION IN. `auth.setSession` takes the same lock, waits for
 *   the same start up, asks Supabase who the token belongs to (a network
 *   call with no limit of its own) and then waits for every listener. Any of
 *   those could hold the screen on "Switching to" for ever. The server now
 *   puts the new session in the answer's own cookies (app/api/businesses/
 *   switch), so the browser holds it the moment the answer lands, and the
 *   client is never waited on for it: the cookie jar is checked, written
 *   directly if a web view dropped the answer's cookies, and the device copy
 *   in the app is brought up to date within APPLY_MS or left to catch up
 *   from the cookie on the next page (lib/supabase/client capacitorStorage
 *   reads whichever copy is newer).
 *
 *   THE NEW PAGE. `location.replace` asks for it, and nothing checked that it
 *   came. A web view can drop a navigation (the app was in the background
 *   when it was asked for), and a phone can lose its connection half way.
 *   Now: still here after NAV_RETRY_MS, it is asked for again; after
 *   NAV_GIVE_UP_MS the screen says so in one line, with Try again.
 *
 *   A PAGE BROUGHT BACK. A browser can keep the page you were on and bring
 *   it back as it was (the back and forward cache, or iOS thawing a frozen
 *   tab), screen and all, with the timers that would have moved it on
 *   stopped. A page shown again that had already been told to leave asks
 *   for the new page again at once; one that was still asking the server
 *   keeps its limits, and a limit that ran out while the page was frozen
 *   ends the wait the moment it is shown.
 *
 *   TWO PRESSES. Only one switch runs at a time in a document; a second press
 *   while one is running joins it.
 *
 * Where it ends:
 *   the new business  whenever the server said yes, even if the answer came
 *                     back after the screen had stopped waiting for it: the
 *                     cookie jar is the proof, so a switch that happened is
 *                     never reported as one that did not
 *   where you were    when it did not, with the reason in one line and Try
 *                     again under it (components/app/business-switcher)
 *
 * No React and no DOM here: the browser's parts come in as `SwitchDeps`, so
 * tests/business-switch-flow.test.ts runs every one of these waits against
 * a clock it moves by hand, including the ones that never answer.
 */

/** Reading this browser's own token for the request's header. */
export const AUTH_READ_MS = 1_500
/** The server's answer, from the moment the request is sent. */
export const ASK_MS = 20_000
/** The app's own client taking the session into the device's store. Never needed for the switch to happen. */
export const APPLY_MS = 2_500
/** The new page asked for and not here yet: ask again. */
export const NAV_RETRY_MS = 9_000
/** Still not here: stop waiting and say so. */
export const NAV_GIVE_UP_MS = 20_000

export type SwitchPhase = "asking" | "opening" | "stalled" | "failed"

export interface BusinessSessionPayload {
  access_token: string
  refresh_token: string
  expires_at?: number | null
  expires_in?: number | null
  token_type?: string | null
  user?: unknown
}

export interface AskAnswer {
  ok: boolean
  status: number
  data: Record<string, unknown>
}

export interface SwitchDeps {
  /** Start a timer; the handle goes back to clearTimer. */
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  /** This browser's token for the Authorization header, through the client. May never answer. */
  readToken(): Promise<string | null>
  /** The same token straight from the cookie jar: no lock, no network. */
  jarToken(): Promise<string | null>
  /** The request. `signal` aborts it. */
  ask(headers: Record<string, string>, signal: AbortSignal): Promise<AskAnswer>
  /** Whether the cookie jar now holds a session for `userId`. */
  jarHolds(userId: string): Promise<boolean>
  /** Write the session to the cookie jar, synchronously, the way the server does. */
  writeJar(session: BusinessSessionPayload): void
  /** The client's own copy of the session (the app's device store). May never answer. Optional. */
  applyToClient?(session: BusinessSessionPayload): Promise<unknown>
  /** Stop and restart the client renewing the old session in the background while the jar changes hands. */
  pauseRenewal(): void
  resumeRenewal(): void
  /** Everything kept per account, and the new page's screen cookie. Synchronous. */
  prepare(): void
  /** Ask the browser for the new page. */
  navigate(url: string): void
  /** Called with each phase as it starts. */
  onPhase?(phase: SwitchPhase): void
  /**
   * `fn` runs whenever this page is shown again from the back and forward
   * cache (pageshow with persisted). Returns the unsubscribe.
   */
  onRestored?(fn: () => void): () => void
}

export type SwitchOutcome =
  /** The browser holds the new business and has been asked for its page. The page is leaving. */
  | { kind: "left" }
  /** Nothing changed: the reason, in a sentence. */
  | { kind: "failed"; message: string; retry: boolean }
  /** The browser holds the new business, but its page never came. */
  | { kind: "stalled" }

/** The account a Supabase access token belongs to, or null. */
export function tokenUser(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null
  const part = token.split(".")[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const json = typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("binary")
    const sub = (JSON.parse(json) as { sub?: unknown }).sub
    return typeof sub === "string" && sub ? sub : null
  } catch {
    return null
  }
}

/** A promise with a limit: its value, or `timedOut` once `ms` has gone by. A rejection counts as an answer. */
export interface Within<T> {
  /** No answer in time: `value` and `error` are both unset. */
  timedOut: boolean
  value?: T
  error?: unknown
}

export function within<T>(deps: Pick<SwitchDeps, "setTimer" | "clearTimer">, p: Promise<T>, ms: number): Promise<Within<T>> {
  return new Promise((resolve) => {
    let done = false
    const t = deps.setTimer(() => {
      if (done) return
      done = true
      resolve({ timedOut: true })
    }, ms)
    p.then(
      (value) => {
        if (done) return
        done = true
        deps.clearTimer(t)
        resolve({ timedOut: false, value })
      },
      (error) => {
        if (done) return
        done = true
        deps.clearTimer(t)
        resolve({ timedOut: false, error })
      },
    )
  })
}

/**
 * The server's message when it gave one, else `fallback`. `retry` is whether
 * pressing again could help: not for a business that is not yours, nor for
 * too many switches in a minute (that one says when).
 */
export function failureOf(answer: AskAnswer | null, fallback: string): { message: string; retry: boolean } {
  const said = answer && typeof answer.data?.error === "string" && answer.data.error ? (answer.data.error as string) : null
  if (!said) return { message: fallback, retry: true }
  const retry = !(answer && (answer.status === 401 || answer.status === 403 || answer.status === 429 || answer.status === 400))
  return { message: said, retry }
}

/**
 * The switch, from the press to the new page being asked for, and after it
 * until the page is gone or the wait gives up. `to` is the account being
 * opened, `next` the page to open it on.
 */
export async function runSwitch(deps: SwitchDeps, to: string, next: string, fallback: string): Promise<SwitchOutcome> {
  deps.onPhase?.("asking")
  deps.pauseRenewal()

  /* The header's token: through the client if it answers soon, else from the jar. */
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const read = await within(deps, deps.readToken(), AUTH_READ_MS)
  let token = !read.timedOut && typeof read.value === "string" ? read.value : null
  if (!token) token = await deps.jarToken().catch(() => null)
  if (token) headers.Authorization = `Bearer ${token}`

  /* The request, with its limit starting now. */
  const abort = new AbortController()
  const asked = await within(deps, deps.ask(headers, abort.signal), ASK_MS)
  if (asked.timedOut) abort.abort()
  const answer = !asked.timedOut && !asked.error ? (asked.value ?? null) : null
  const session = answer?.ok && answer.data?.session && typeof answer.data.session === "object" ? (answer.data.session as BusinessSessionPayload) : null

  if (!session || typeof session.access_token !== "string" || typeof session.refresh_token !== "string") {
    /* No session in hand. If the server did switch and only its answer was
       lost, its cookies say so: that is a switch that happened. */
    if (await deps.jarHolds(to).catch(() => false)) return opening(deps, next)
    deps.resumeRenewal()
    deps.onPhase?.("failed")
    return { kind: "failed", ...failureOf(answer, fallback) }
  }

  /* The answer's cookies are the session. A web view that dropped them gets them written here. */
  if (!(await deps.jarHolds(to).catch(() => false))) {
    try {
      deps.writeJar(session)
    } catch {
      /* no cookie jar at all: the device's copy below is all there is */
    }
  }
  if (deps.applyToClient) await within(deps, deps.applyToClient(session), APPLY_MS)
  if (!(await deps.jarHolds(to).catch(() => false))) {
    /* The session is nowhere this browser will send it: opening the page
       would open the business you are in, under the other's name. */
    deps.resumeRenewal()
    deps.onPhase?.("failed")
    return { kind: "failed", message: fallback, retry: true }
  }
  return opening(deps, next)
}

/**
 * The browser holds the new business: ask for its page, and keep asking
 * until it comes or the wait gives up. Resolves `stalled` only; a page that
 * leaves never resolves (there is nothing left to resolve to).
 */
export function opening(deps: SwitchDeps, next: string): Promise<SwitchOutcome> {
  try {
    deps.prepare()
  } catch {
    /* storage refused: the page still opens */
  }
  deps.onPhase?.("opening")
  return new Promise((resolve) => {
    let retry: unknown = null
    let giveUp: unknown = null
    let off: (() => void) | null = null
    const arm = () => {
      if (retry !== null) deps.clearTimer(retry)
      if (giveUp !== null) deps.clearTimer(giveUp)
      retry = deps.setTimer(() => deps.navigate(next), NAV_RETRY_MS)
      giveUp = deps.setTimer(() => {
        off?.()
        if (retry !== null) deps.clearTimer(retry)
        deps.onPhase?.("stalled")
        resolve({ kind: "stalled" })
      }, NAV_GIVE_UP_MS)
    }
    /* Shown again from the cache: the timers were frozen with the page, so ask again now and start them over. */
    off = deps.onRestored?.(() => {
      deps.navigate(next)
      arm()
    }) ?? null
    arm()
    deps.navigate(next)
  })
}

/**
 * ONE SWITCH AT A TIME. The two menus (the dropdown and the phone's sheet)
 * are both mounted; a press in either while one is running joins the one
 * running instead of starting a second request and a second session.
 */
export function single<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  let running: Promise<R> | null = null
  return (...args: A) => {
    if (running) return running
    const p = fn(...args)
    running = p
    const clear = () => {
      if (running === p) running = null
    }
    p.then(clear, clear)
    return p
  }
}
