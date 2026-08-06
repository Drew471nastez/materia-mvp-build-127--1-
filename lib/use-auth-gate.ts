"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Session } from "@supabase/supabase-js"
import { isAuthInProgress, setAuthInProgress } from "@/lib/auth/auth-in-progress"
import { readSessionBounded } from "@/lib/auth/session-read"

/**
 * Shared auth boot guard hook.
 *
 * Prevents "Auth session missing!" flashes and premature /login redirects
 * by waiting for two conditions:
 *
 * 1. **Boot guard** — supabase.auth.getSession() must resolve once.
 *    Until then, Capacitor Preferences / localStorage may not have been
 *    read, so `session` would appear null even though the user is signed in.
 *
 * 2. **Native auth in-progress guard** — if `nativeAuthInProgress` is set
 *    in sessionStorage, native-oauth.ts is actively exchanging a deep-link
 *    code.  All redirects and error UI must be suppressed until it finishes.
 *
 * Usage:
 *   const { loading, session } = useAuthGate()
 *   if (loading) return <Spinner />
 *   if (!session) redirect("/login")
 */
export function useAuthGate() {
  const [booting, setBooting] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  // A stale flag answers false and deletes itself, so an abandoned sign-in from
  // earlier in this web view's life no longer blocks this page at all.
  const [nativeAuthInProgress, setNativeAuthInProgress] = useState(() => isAuthInProgress())

  // Safety timeout + poll: if nativeAuthInProgress is stuck, clear it.
  // Also poll every 300 ms for removal (native-oauth.ts clears it in finally).
  useEffect(() => {
    if (!nativeAuthInProgress) return
    const poll = window.setInterval(() => {
      try {
        if (!isAuthInProgress()) {
          setNativeAuthInProgress(false)
        }
      } catch {
        setNativeAuthInProgress(false)
      }
    }, 300)
    // A backstop, not the mechanism. The flag expires on its own after eight
    // seconds (see lib/auth/auth-in-progress.ts), so the poll above clears it
    // first; this only covers a web view where sessionStorage throws and the
    // poll can therefore never observe the change.
    const safety = window.setTimeout(() => {
      setAuthInProgress(false)
      setNativeAuthInProgress(false)
    }, 9_000)
    return () => {
      window.clearInterval(poll)
      window.clearTimeout(safety)
    }
  }, [nativeAuthInProgress])

  /**
   * The floor under the whole gate — ABSOLUTE, from mount.
   *
   * This used to live inside the boot effect below, which does not run at all
   * while `nativeAuthInProgress` is set. So the two waits STACKED: the flag's
   * timeout had to expire before the boot timeout even started, and the worst
   * case was the sum of them — around thirty seconds of a spinner on /login
   * with no way for the person to do anything about it.
   *
   * Started once, at mount, it is a ceiling on the whole sequence rather than
   * on one step of it. Twelve seconds is deliberately longer than the flag's
   * nine, so in the pathological case the flag clears first, the boot below
   * gets its chance to resolve normally, and this never fires — which is what
   * keeps the login form from flashing up a moment before the redirect.
   */
  useEffect(() => {
    const floor = window.setTimeout(() => setBooting(false), 12_000)
    return () => window.clearTimeout(floor)
  }, [])

  // Boot: resolve getSession() once after native callback finishes (or immediately)
  useEffect(() => {
    // While native callback is running, don't boot — let the handler own the flow
    if (nativeAuthInProgress) return

    let cancelled = false
    const supabase = createClient()

    /**
     * BOUNDED. This is the read /login and /signup put a spinner over, so it is
     * the read that must never be able to hang.
     *
     * It used to be a bare `getSession()`. That call reads storage and, when
     * the access token has expired, goes to the network to refresh — and on
     * native it could block behind a lock a suspended web view never released,
     * in which case it never settles at all and no timeout on the promise
     * itself would ever run. Four seconds is far past a normal read (tens of
     * milliseconds) and short enough that a bad one is a pause rather than the
     * "it just shows the loading thing and never loads" report.
     *
     * A timeout resolves to no session, which shows the sign-in form. That is
     * the right answer HERE and only here: /login is the one screen where
     * being wrong about a session costs nothing — the form is what somebody
     * came for. Everywhere else in the app a timed-out read means "keep them
     * in", which is what lib/auth/session-read.ts is for.
     */
    readSessionBounded(supabase, 4_000).then((r) => {
      if (cancelled) return
      setSession(r.session)
      setBooting(false)
    })

    return () => {
      cancelled = true
    }
  }, [nativeAuthInProgress])

  return {
    /** true until first getSession() resolves */
    booting,
    /** true while native-oauth.ts is handling a deep-link callback */
    nativeAuthInProgress,
    /** true if either booting or nativeAuthInProgress — show only a loader */
    loading: booting || nativeAuthInProgress,
    /** resolved session (null if not authenticated or still loading) */
    session,
  }
}
