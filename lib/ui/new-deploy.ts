/**
 * ===========================================================================
 *  KNOWING A DEPLOY HAPPENED BEFORE A CHUNK FAILS
 * ===========================================================================
 * A tab opened before a deploy keeps the old deploy's code. Vercel's skew
 * protection serves that code for a while, then stops, and from then on the
 * next lazy import asks for a file that is gone ("Failed to load chunk ...").
 * The app shell inside the iOS and Android apps keeps one tab alive for days,
 * so it meets this more than any browser does.
 *
 * lib/ui/stale-code.ts and the error boundaries recover AFTER a chunk failed.
 * This is the cheap part that comes first:
 *
 *   WHICH DEPLOY THIS TAB IS. Next writes the build's deployment id into the
 *   client code as process.env.NEXT_DEPLOYMENT_ID (it is the `dpl` on every
 *   chunk URL). Empty in development and wherever skew protection is off, and
 *   then nothing here does anything.
 *
 *   WHICH DEPLOY IS LIVE. GET /api/version answers with the id of the deploy
 *   that served it. A plain fetch carries no deployment header, so it is
 *   answered by the current deploy, not pinned to the tab's.
 *
 *   WHEN TO ASK. When the tab comes back into view or gets focus, which is
 *   when a tab that sat in the background for hours is about to be used. At
 *   most once every CHECK_EVERY_MS. No timer, no loop.
 *
 *   WHAT CHANGES. The next press forward to another page is a full page load
 *   instead of a client side one, so the person lands on the new code at a
 *   moment they chose to leave the page anyway. Never a Back, a replace or a
 *   close (fullLoadFor). Not on a page that holds
 *   unsaved work (lib/ui/leave-guard), not out of the website builder, whose
 *   editor saves on a timer and asks its own question on the way out, and not
 *   out of checkout.
 *
 *   SAFARI'S "Load failed". It is the whole message for any fetch that did
 *   not finish, a dropped connection as much as a missing chunk, so on its
 *   own it says nothing. It counts as stale code only once a newer deploy is
 *   known (lib/client-errors isStaleCodeError), and a boundary that catches
 *   one asks first (`confirmNewDeploy`).
 *
 * State lives on the window, not in module variables, because
 * instrumentation-client.ts is bundled on its own (lib/ui/router-starts).
 * The decisions are pure and take what they read as arguments, so
 * tests/new-deploy.test.ts drives them.
 */

import { leaveGuard } from "@/lib/ui/leave-guard"

/** How often a tab coming back into view may ask. */
export const CHECK_EVERY_MS = 5 * 60_000
/** How long an answer counts for when an error asks. */
export const ANSWER_FRESH_MS = 30_000
/** A check that has not answered by then is no answer. */
export const CHECK_TIMEOUT_MS = 2_500
/** How long a tab's own deployment is surely still served by Vercel's skew protection (its window is longer). */
export const SKEW_SAFE_MS = 6 * 60 * 60_000

/** The deploy this code was built for, or "" where there is none. */
export function thisDeployment(): string {
  const id = process.env.NEXT_DEPLOYMENT_ID as unknown
  return typeof id === "string" ? id : ""
}

/** Whether `served` names a different deploy than `mine`. Unknown on either side is no. */
export function isOtherDeploy(mine: string, served: unknown): boolean {
  return !!mine && typeof served === "string" && served.length > 0 && served !== mine
}

/** Whether a check may run now. */
export function checkDue(lastCheckedAt: number, now: number, every: number = CHECK_EVERY_MS): boolean {
  return !(lastCheckedAt > 0) || now - lastCheckedAt >= every
}

/** Pages that are never left by a full load from here. */
const KEEP_SOFT = /^\/(website-builder|checkout)(\/|$)/

export type NavigationType = "push" | "replace" | "traverse"

/*
  A BACK IS NEVER WHERE THE NEW CODE IS PICKED UP (round 23, the owner: "sometimes when I go back ... the whole page
  randomly refreshes"). Several ways back are a push or a replace, not a traversal: a back with nothing of ours behind it
  (lib/navigation/go-back pushBackOnce), the fallback of a Back that went nowhere (backThen), a sheet's close. Each marks
  the window when it starts, and a navigation within BACK_MARK_MS of that mark stays a client one. Read from the window
  because this file runs in instrumentation-client.ts, bundled apart from the app (see the top of the file).
*/
export const BACK_MARK = "__storelibBackAt"
export const BACK_MARK_MS = 3_000

/** Marked by every way back as it starts (lib/navigation/go-back). */
export function markBackStarted(now: number = Date.now()) {
  if (typeof window === "undefined") return
  ;(window as unknown as Record<string, number>)[BACK_MARK] = now
}

function backJustStarted(now: number = Date.now()): boolean {
  if (typeof window === "undefined") return false
  const at = (window as unknown as Record<string, number | undefined>)[BACK_MARK]
  return typeof at === "number" && now - at >= 0 && now - at < BACK_MARK_MS
}

/** Settings opened over a page (app/app/@sheet): a full load there would take the page under it away. */
const SHEET_PATH = "/app/settings"

/**
 * Whether the navigation the router just started should be a full page load.
 * Only ever a press forward to another page, the one moment somebody has
 * chosen to leave the page anyway: `assign`, which adds the entry the push
 * would have. Never a replace (a tab, a filter, a close, a fallback: the
 * page did that, not the person), never Back or Forward (by the time the
 * router hears of them the address is already the destination, and its cache
 * of that page is fine), never a push that is a way back (`inBack`, above),
 * and never into Settings over a page.
 */
export function fullLoadFor(input: {
  href: string
  type: NavigationType
  /** The address of the page being left. */
  from: string
  newDeploy: boolean
  /** The page holds unsaved work it declared. */
  holdsWork: boolean
  /** How long ago this tab's code was loaded. Left out, the tab counts as old. */
  tabAgeMs?: number
  /** A way back started a moment ago (BACK_MARK): this push is its fallback, not a press forward. */
  inBack?: boolean
}): "assign" | null {
  if (!input.newDeploy || input.holdsWork || input.type !== "push" || input.inBack) return null
  /*
    NOT WHILE SKEW PROTECTION STILL SERVES THIS TAB (round 15, the owner's "I leave the phone for a minute, tap Home, and it
    goes white"). Every chunk and router request of this tab carries its deployment (?dpl=, x-deployment-id), so Vercel
    answers it from the deployment it was built with for hours after a newer one goes live: nothing is missing, and a whole
    page load (a white screen in the app's web view, for as long as the load takes) bought nothing. Main is deployed many
    times a day (20 production deploys in eleven hours on 10 October), so a tab asked /api/version after five minutes away
    almost always learned of a newer one and then threw itself away on the next tap. A tab older than SKEW_SAFE_MS is past
    any window and still loads fully at a route change, as before; a chunk that fails is healed by lib/ui/stale-code.ts.
  */
  if (typeof input.tabAgeMs === "number" && input.tabAgeMs >= 0 && input.tabAgeMs < SKEW_SAFE_MS) return null
  let from: URL
  let to: URL
  try {
    from = new URL(input.from)
    to = new URL(input.href, from)
  } catch {
    return null
  }
  if (KEEP_SOFT.test(from.pathname) || to.origin !== from.origin) return null
  /* The same page with a different query or hash is not a route change. */
  if (to.pathname === from.pathname) return null
  if (to.pathname === SHEET_PATH) return null
  return "assign"
}

// ─── In the browser ──────────────────────────────────────────────────────────

const STATE = "__storelibDeploy"

type DeployState = {
  checkedAt: number
  newer: boolean
  pending: Promise<boolean> | null
  watching: boolean
}

function state(): DeployState | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { [STATE]?: DeployState }
  return (w[STATE] ??= { checkedAt: 0, newer: false, pending: null, watching: false })
}

/** Whether this tab already knows it is behind the live deploy. */
export function newDeployKnown(): boolean {
  return state()?.newer ?? false
}

/** Ask /api/version once, sharing a check already on its way. */
function ask(s: DeployState): Promise<boolean> {
  if (s.pending) return s.pending
  const mine = thisDeployment()
  if (!mine) return Promise.resolve(false)
  s.checkedAt = Date.now()
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CHECK_TIMEOUT_MS))
  /* No cookies: nothing here needs a session, and a skew cookie would pin the answer to this tab's own deploy. */
  const read = fetch("/api/version", { cache: "no-store", credentials: "omit" })
    .then((res) => (res.ok ? (res.json() as Promise<{ deploymentId?: unknown }>) : null))
    .catch(() => null)
  s.pending = Promise.race([read, timeout])
    .then((body) => {
      if (isOtherDeploy(mine, body?.deploymentId)) s.newer = true
      return s.newer
    })
    .finally(() => {
      s.pending = null
    })
  return s.pending
}

/**
 * For an error that might be a missing chunk ("Load failed"): is there a newer
 * deploy? Answers from a check in the last ANSWER_FRESH_MS when there is one.
 */
export function confirmNewDeploy(): Promise<boolean> {
  const s = state()
  if (!s) return Promise.resolve(false)
  if (s.newer) return Promise.resolve(true)
  if (!checkDue(s.checkedAt, Date.now(), ANSWER_FRESH_MS)) return s.pending ?? Promise.resolve(false)
  return ask(s)
}

/** Installed once by instrumentation-client.ts. */
export function watchDeploys() {
  const s = state()
  if (!s || s.watching || !thisDeployment()) return
  s.watching = true
  /* The page just loaded, so it is current: the first check is due one interval from now. */
  s.checkedAt = Date.now()
  const maybe = () => {
    if (document.visibilityState !== "visible" || s.newer) return
    if (checkDue(s.checkedAt, Date.now())) void ask(s)
  }
  document.addEventListener("visibilitychange", maybe)
  window.addEventListener("focus", maybe)
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted) maybe()
  })
}

/**
 * Called from onRouterTransitionStart, synchronously as the router starts a
 * navigation. Turns it into a full page load when this tab is behind.
 */
export function loadFullyIfBehind(href: string, type: NavigationType) {
  if (typeof window === "undefined") return
  const how = fullLoadFor({
    href,
    type,
    from: window.location.href,
    newDeploy: newDeployKnown(),
    holdsWork: !!leaveGuard(),
    /* Wall clock since the page loaded: a suspended web view's performance.now() can stand still while the phone sleeps. */
    tabAgeMs: typeof performance !== "undefined" && performance.timeOrigin ? Date.now() - performance.timeOrigin : undefined,
    inBack: backJustStarted(),
  })
  if (how !== "assign") return
  /*
    NOT ON A TAP IN THE APP (round 27 review). The phone keeps the app's web view for days, so the first tap after coming
    back turned white for a whole page load. In the app the newer code is taken while nobody is looking instead
    (takeNewDeployWhileAway, below); this tap moves in place, and a chunk that fails is still healed by stale-code.ts.
  */
  if (document.documentElement.classList.contains("capacitor")) {
    takeNewDeployWhileAway()
    return
  }
  window.location.assign(href)
}

let awayArmed = false
/** In the app: the next time it goes to the background, the page reloads there, so it comes back already new. */
function takeNewDeployWhileAway() {
  if (awayArmed || typeof document === "undefined") return
  awayArmed = true
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && !leaveGuard()) window.location.reload()
  })
}
