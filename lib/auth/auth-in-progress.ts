"use client"

/**
 * "A native sign-in is running, do not redirect or dismiss anything yet."
 *
 * ---------------------------------------------------------------------------
 * THE 30-SECOND SPINNER ON /login AND /signup
 * ---------------------------------------------------------------------------
 * This flag is what those pages wait on. `useAuthGate` refuses to resolve while
 * it is set, and both pages render the resolving screen — so a flag that is set
 * and never cleared is a login page that shows a spinner and nothing else.
 *
 * It was set in five places (lib/native-oauth.ts four times, and
 * app/native-start/page.tsx on entry) and cleared in two. Every way of not
 * finishing an OAuth round trip therefore left it behind:
 *
 *   · the Chrome Custom Tab or Safari sheet is dismissed rather than completed
 *   · the app is killed while the sheet is open
 *   · the deep link never arrives
 *   · anything at all throws between setting it and the one `finally` that
 *     removes it
 *
 * `sessionStorage` survives for the life of the web view, which in a Capacitor
 * app is until the process is killed. So one abandoned sign-in poisoned every
 * subsequent visit to /login for the rest of that session, and the only thing
 * that eventually released it was a 30-second safety timeout in useAuthGate —
 * thirty seconds of a spinner, which is indistinguishable from broken.
 *
 * ---------------------------------------------------------------------------
 * A flag that cannot be left behind
 * ---------------------------------------------------------------------------
 * The value is now the moment it was set, and reading it is asking whether that
 * moment is recent. A code exchange takes a second or two; anything older than
 * MAX_AGE_MS is not a sign-in in progress, it is the wreckage of one.
 *
 * That makes every abandonment self-healing without anybody remembering to
 * clear it — which is the point, because the list above is a list of paths that
 * by definition do not run cleanup code. A stale flag is also DELETED on the
 * first read that notices it, so the storage does not accumulate.
 *
 * The name and key are unchanged so nothing else has to move, and the value is
 * still truthy, so a reader this refactor missed degrades to the old behaviour
 * rather than to a broken one.
 */

const KEY = "nativeAuthInProgress"

/**
 * How long a sign-in may plausibly be "in progress".
 *
 * A PKCE exchange is ONE HTTP request. Three seconds is roughly fifteen times a
 * typical one and still the longest anybody waits, because it is only ever paid
 * by somebody genuinely mid-flow — everybody else's flag is stale and answers
 * instantly.
 *
 * It was twenty, then eight. Twenty stacked with useAuthGate's own boot timeout
 * to make a worst case near thirty seconds of spinner on /login. The waits no
 * longer stack (the gate's safety is absolute from mount rather than starting
 * after this clears), and this is now the shortest of the three ceilings on
 * that screen: one second for the session read, three here, five absolute.
 */
const MAX_AGE_MS = 3_000

export function setAuthInProgress(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(KEY, String(Date.now()))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* private mode, or storage disabled — the guard simply does not apply */
  }
}

export function isAuthInProgress(): boolean {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return false

    // "1" is what the previous version wrote. A web view carrying one from
    // before this deploy has no timestamp to judge, and the safe reading is
    // that it is stale: it can only have been written by a session that
    // predates the update, which is by definition not in progress now.
    const at = Number(raw)
    if (!Number.isFinite(at) || at <= 1) {
      sessionStorage.removeItem(KEY)
      return false
    }

    if (Date.now() - at > MAX_AGE_MS) {
      // Self-healing. The paths that leave this behind are the paths that do
      // not run cleanup, so the cleanup has to happen on the way in.
      sessionStorage.removeItem(KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}
