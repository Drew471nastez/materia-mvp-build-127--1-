"use client"

import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { clearSwitchCookie, switchCookie } from "@/lib/businesses/switch-screen"
import { clearAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { readSessionFromCookies, sessionCookieWrites, storedSessionJson, storedSessionKey } from "@/lib/supabase/session-jar"
import { APPLY_MS, ASK_MS, AUTH_READ_MS, opening, runSwitch, single, tokenUser, within, type BusinessSessionPayload, type SwitchDeps, type SwitchPhase } from "@/lib/businesses/switch-flow"

/**
 * ===========================================================================
 *  SWITCHING BUSINESS, IN THE BROWSER
 * ===========================================================================
 * The server checks the link, makes a session for the other business and
 * puts it in this browser's cookies with its answer (app/api/businesses/
 * switch). This makes sure the cookie jar holds it, brings the app's device
 * store up to date when there is one (lib/supabase/client), and loads the
 * page again from scratch, so nothing drawn for one business is ever shown
 * for the other. Every wait on the way has a limit and an end: see
 * lib/businesses/switch-flow, which runs the steps.
 *
 * The app sends its token as well as its cookie, because the web view's
 * cookie can trail the device store by a request.
 *
 * The account menu shows a screen while this works (components/app/business-
 * switch-screen). `arrival` names the business and its photo for the new
 * /app to carry that screen on with (lib/businesses/switch-screen
 * SWITCH_COOKIE), `business` is who this browser is from now on, and
 * `onOpening` is called once the session is held, just before the new page
 * is asked for. None is needed: without them a switch is what it was.
 *
 * WHY A RELOAD AND NOT A SWITCH IN PLACE. The app keeps things per account
 * outside React's tree, in module memory and in this browser's storage: the
 * Website settings' last domains and backups, the email lists, the globe's
 * last figures, the own AI keys' state, the Supabase client's own session
 * and its realtime channels, the router's prefetched pages. A switch in
 * place would have to find and empty every one of them, today's and every
 * one added later, or show one business's data under the other's name.
 * A new document empties all of them by construction. What the reload used
 * to cost (an empty black band, a flash) is the screen's to hide, and it
 * does: its header draws the business you are going to from the press to
 * the new page's first frame (components/app/shell-header-still).
 */

export type BusinessSession = BusinessSessionPayload

/** The business being opened, as the account menu showed it. */
export interface SwitchedTo {
  userId: string
  name: string
  handle: string | null
  avatarUrl: string | null
  ready: boolean
}

export interface SwitchSteps {
  /** The business's name and photo, when the new /app should open on the switch's screen. */
  arrival?: { name: string; photo?: string | null }
  /** Who this browser is from now on: the public site's header starts from it (lib/auth/auth-snapshot) instead of the business before. */
  business?: SwitchedTo
  /** The session is this browser's now, and the new page is about to be asked for. */
  onOpening?: () => void
}

/** Whatever went wrong on the way, what the person reads when the server said nothing better. */
export const SWITCH_FAILED = "That business could not be opened. Try again."
/** A switch with no answer after this long has failed: the screen never waits forever. */
export const SWITCH_TIMEOUT_MS = ASK_MS

/**
 * THE NEW PAGE NEVER CAME. The browser holds the new business, so the page
 * you were on is not yours to go back to; the screen stays, says this, and
 * offers Try again, which asks for the page once more.
 */
export class SwitchStalled extends Error {
  readonly next: string
  constructor(next: string) {
    super("The page did not open. Check your connection and try again.")
    this.name = "SwitchStalled"
    this.next = next
  }
}

/** A failure, with whether pressing again could help (not for "not yours to open"). */
export class SwitchFailed extends Error {
  readonly retry: boolean
  constructor(message: string, retry: boolean) {
    super(message)
    this.name = "SwitchFailed"
    this.retry = retry
  }
}

/* Onboarding progress is kept on the device; one business's half finished steps must not open in the other. */
const PER_ACCOUNT_KEYS = ["storelib_onboarding_state", "onepage_onboarding_progress"]

const secure = () => location.protocol === "https:"

function readJar(): Promise<string | null> {
  const key = storedSessionKey()
  if (!key) return Promise.resolve(null)
  let cookies = ""
  try {
    cookies = document.cookie
  } catch {
    return Promise.resolve(null)
  }
  return readSessionFromCookies(key, cookies)
}

async function jarToken(): Promise<string | null> {
  const raw = await readJar()
  if (!raw) return null
  try {
    const t = (JSON.parse(raw) as { access_token?: unknown }).access_token
    return typeof t === "string" ? t : null
  } catch {
    return null
  }
}

/** Everything a switch waits on, in this browser. */
function browserDeps(body: Record<string, unknown>, url: string, steps: SwitchSteps, onPhase?: (p: SwitchPhase) => void): SwitchDeps {
  const client = () => createClient()
  return {
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (h) => window.clearTimeout(h as number),
    readToken: async () => (await client().auth.getSession()).data.session?.access_token ?? null,
    jarToken,
    ask: async (headers, signal) => {
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store", credentials: "same-origin", signal })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      return { ok: res.ok, status: res.status, data }
    },
    jarHolds: async (userId) => tokenUser(await jarToken()) === userId,
    writeJar: (session) => {
      const key = storedSessionKey()
      if (!key) return
      for (const line of sessionCookieWrites(key, storedSessionJson(session), document.cookie, secure())) document.cookie = line
    },
    /* The app keeps a second copy on the device; a browser's only copy is the jar, which already holds it. */
    applyToClient: isNativePlatform() ? (session) => client().auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }) : undefined,
    pauseRenewal: () => {
      try {
        void client().auth.stopAutoRefresh()
      } catch {
        /* nothing running */
      }
    },
    resumeRenewal: () => {
      try {
        void client().auth.startAutoRefresh()
      } catch {
        /* it starts again with the next page */
      }
    },
    prepare: () => prepare(steps),
    navigate: (next) => window.location.replace(next),
    onPhase: (p) => {
      if (p === "opening") steps.onOpening?.()
      onPhase?.(p)
    },
    onRestored: (fn) => {
      const on = (e: PageTransitionEvent) => {
        if (e.persisted) fn()
      }
      window.addEventListener("pageshow", on)
      return () => window.removeEventListener("pageshow", on)
    },
  }
}

/** What is kept per account on this device, emptied, and the screen's cookie for the new page, just before it is asked for. */
function prepare(steps: SwitchSteps) {
  try {
    for (const key of PER_ACCOUNT_KEYS) localStorage.removeItem(key)
  } catch {
    /* private mode: nothing kept anyway */
  }
  /*
    The public site's header opens on a snapshot of who was signed in
    (lib/auth/auth-snapshot) and the photo beside it. Left alone they would
    say the business before until that header had asked again: now they say
    the one being opened, or, when the menu did not say who that is, nothing
    at all, so the header asks before it draws anybody. Clearing first also
    drops the saved listings and follows kept on the device for the account
    before (the same as signing out does), which are that account's, not
    this one's.
  */
  try {
    clearAuthSnapshot()
    const b = steps.business
    if (b) {
      writeAuthSnapshot({ signedIn: true, userId: b.userId, avatarUrl: b.avatarUrl, displayName: b.name, username: b.handle, isSeller: b.ready })
      if (b.avatarUrl) localStorage.setItem("_sl_avatar", b.avatarUrl)
    }
  } catch {
    /* storage refused: that header corrects itself once it has asked */
  }
  /* The server set it with its answer; written here too, for a web view that dropped the answer's cookies. */
  if (steps.arrival) {
    try {
      document.cookie = switchCookie(steps.arrival.name, { secure: secure(), photo: steps.arrival.photo ?? null })
    } catch {
      /* cookies refused: the new page arrives without the screen, as it used to */
    }
  }
}

function forget(steps: SwitchSteps) {
  if (!steps.arrival) return
  try {
    document.cookie = clearSwitchCookie({ secure: secure() })
  } catch {
    /* it lasts half a minute on its own */
  }
}

/**
 * Put a session this browser was handed into the jar and open `next` with
 * it. Used after a business is deleted (components/app/settings-form-new)
 * and after one is made (createBusiness). Resolves only if the page never
 * came (SwitchStalled is thrown); on success the page goes.
 */
export async function applyBusinessSession(session: BusinessSession, next: string, steps: SwitchSteps = {}): Promise<void> {
  const to = tokenUser(session.access_token)
  if (!to) throw new SwitchFailed(SWITCH_FAILED, true)
  const deps = browserDeps({}, "", steps)
  deps.pauseRenewal()
  if (!(await deps.jarHolds(to))) {
    try {
      deps.writeJar(session)
    } catch {
      /* the device's copy below */
    }
  }
  if (deps.applyToClient) await within(deps, deps.applyToClient(session), APPLY_MS)
  /* Nowhere this browser sends it: opening the page would open the account you are in. */
  if (!(await deps.jarHolds(to))) {
    deps.resumeRenewal()
    throw new SwitchFailed(SWITCH_FAILED, true)
  }
  const outcome = await opening(deps, next)
  if (outcome.kind === "stalled") throw new SwitchStalled(next)
}

const runOnce = single(async (to: string, next: string, steps: SwitchSteps, onPhase?: (p: SwitchPhase) => void) => {
  const body: Record<string, unknown> = { to }
  if (steps.arrival) body.arrival = { name: steps.arrival.name, photo: steps.arrival.photo ?? null }
  const outcome = await runSwitch(browserDeps(body, "/api/businesses/switch", steps, onPhase), to, next, SWITCH_FAILED)
  if (outcome.kind === "failed") {
    forget(steps)
    throw new SwitchFailed(outcome.message, outcome.retry)
  }
  if (outcome.kind === "stalled") throw new SwitchStalled(next)
})

/**
 * Open the other business. Resolves only if it fails; on success the page
 * reloads. Every failure is a plain sentence: the server's own when it gave
 * one (not yours to open, too many switches), otherwise SWITCH_FAILED, never
 * a browser's "Failed to fetch". No answer in SWITCH_TIMEOUT_MS is a failure
 * (lib/businesses/switch-flow ASK_MS), unless the server switched anyway,
 * and a page that never comes is SwitchStalled. A second call while one is
 * running joins it.
 */
export function switchBusiness(to: string, next = "/app", steps: SwitchSteps = {}, onPhase?: (p: SwitchPhase) => void): Promise<void> {
  return runOnce(to, next, steps, onPhase)
}

/** Ask for the new page again, after a SwitchStalled: the browser already holds the business. */
export function openAgain(next: string, steps: SwitchSteps = {}): Promise<void> {
  const deps = browserDeps({}, "", steps)
  return opening(deps, next).then((o) => {
    if (o.kind === "stalled") throw new SwitchStalled(next)
  })
}

/** Whatever went wrong making a business, when the server said nothing better. */
export const CREATE_FAILED = "The business could not be created. Try again."
/** Making one is an account, a link and a session: longer than a switch, never forever. */
export const CREATE_TIMEOUT_MS = 30_000
export const CREATE_NO_ANSWER = "No answer in time. Reload the page to see if your new business is here."

async function authHeaders(): Promise<Record<string, string>> {
  const deps = browserDeps({}, "", {})
  const read = await within(deps, deps.readToken(), AUTH_READ_MS)
  const token = (!read.timedOut && typeof read.value === "string" ? read.value : null) ?? (await jarToken().catch(() => null))
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function post(url: string, body: unknown, timeoutMs?: number): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  /* The token first, with its own limit, then the request with the whole of `timeoutMs`: an abort can only stop a request that has started. */
  const headers = { "Content-Type": "application/json", ...(await authHeaders()) }
  const abort = timeoutMs ? new AbortController() : null
  const timer = abort ? window.setTimeout(() => abort.abort(), timeoutMs) : undefined
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: abort?.signal,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, data }
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Make another business and open its onboarding. Resolves only if it fails;
 * on success the page loads the setup. `onOpening` as for a switch: the
 * session is held and the setup is about to be asked for. No answer in
 * CREATE_TIMEOUT_MS is a failure, so the screen over the menu never waits
 * forever; every failure is a sentence (the server's own when it gave one,
 * such as the limit), never a browser's "Failed to fetch".
 */
export async function createBusiness(steps: Pick<SwitchSteps, "onOpening"> = {}): Promise<void> {
  let answer: Awaited<ReturnType<typeof post>>
  try {
    answer = await post("/api/businesses", {}, CREATE_TIMEOUT_MS)
  } catch (e) {
    /* No answer in time: the server may still have made it, so the words say where to look rather than to press again. */
    throw new Error(e instanceof DOMException && e.name === "AbortError" ? CREATE_NO_ANSWER : CREATE_FAILED)
  }
  const { ok, status, data } = answer
  if (status === 202) {
    /* Made, but no session came with it: it is in the account menu of the business you are in. */
    window.location.replace("/app")
    return
  }
  if (!ok || !data.session) throw new Error(typeof data.error === "string" && data.error ? data.error : CREATE_FAILED)
  await applyBusinessSession(data.session as BusinessSession, "/signup/success?action=become-creator&business=new", steps)
}
