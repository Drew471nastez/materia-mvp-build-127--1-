"use client"

import { createClient } from "@/lib/supabase/client"
import { switchCookie } from "@/lib/businesses/switch-screen"
import { clearAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"

/**
 * ===========================================================================
 *  SWITCHING BUSINESS, IN THE BROWSER
 * ===========================================================================
 * The server checks the link and makes a session for the other business
 * (app/api/businesses/switch). This puts that session where this browser
 * keeps its own, through the same client that signed in: cookies on the web,
 * the device store and its cookie mirror in the app (lib/supabase/client).
 * Then the page is loaded again from scratch, so nothing drawn for one
 * business is ever shown for the other.
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

export interface BusinessSession {
  access_token: string
  refresh_token: string
}

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
export const SWITCH_TIMEOUT_MS = 20_000

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await createClient().auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

/* Onboarding progress is kept on the device; one business's half finished steps must not open in the other. */
const PER_ACCOUNT_KEYS = ["storelib_onboarding_state", "onepage_onboarding_progress"]

export async function applyBusinessSession(session: BusinessSession, next: string, steps: SwitchSteps = {}): Promise<void> {
  let failed = false
  try {
    failed = !!(await createClient().auth.setSession(session)).error
  } catch {
    failed = true
  }
  if (failed) throw new Error(SWITCH_FAILED)
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
  if (steps.arrival) {
    try {
      document.cookie = switchCookie(steps.arrival.name, { secure: location.protocol === "https:", photo: steps.arrival.photo ?? null })
    } catch {
      /* cookies refused: the new page arrives without the screen, as it used to */
    }
  }
  steps.onOpening?.()
  window.location.replace(next)
}

async function post(url: string, body: unknown, timeoutMs?: number): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const abort = timeoutMs ? new AbortController() : null
  const timer = abort ? window.setTimeout(() => abort.abort(), timeoutMs) : undefined
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
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
 * Open the other business. Resolves only if it fails; on success the page
 * reloads. Every failure is a plain sentence: the server's own when it gave
 * one (not yours to open, too many switches), otherwise SWITCH_FAILED, never
 * a browser's "Failed to fetch". No answer in SWITCH_TIMEOUT_MS is a failure.
 */
export async function switchBusiness(to: string, next = "/app", steps: SwitchSteps = {}): Promise<void> {
  let answer: Awaited<ReturnType<typeof post>>
  try {
    answer = await post("/api/businesses/switch", { to }, SWITCH_TIMEOUT_MS)
  } catch {
    throw new Error(SWITCH_FAILED)
  }
  const { ok, data } = answer
  if (!ok || !data.session) throw new Error(typeof data.error === "string" && data.error ? data.error : SWITCH_FAILED)
  await applyBusinessSession(data.session as BusinessSession, next, steps)
}

/** Whatever went wrong making a business, when the server said nothing better. */
export const CREATE_FAILED = "The business could not be created. Try again."
/** Making one is an account, a link and a session: longer than a switch, never forever. */
export const CREATE_TIMEOUT_MS = 30_000
export const CREATE_NO_ANSWER = "No answer in time. Reload the page to see if your new business is here."

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
