"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Session } from "@supabase/supabase-js"
import { isAuthInProgress, setAuthInProgress } from "@/lib/auth/auth-in-progress"

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

  // Safety timeout + poll: if nativeAuthInProgress is stuck, clear after 15 s.
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
    // Shortened from thirty seconds, and it is now a backstop rather than the
    // mechanism. The flag expires on its own after twenty (see
    // lib/auth/auth-in-progress.ts), so the poll above already clears it — this
    // only covers a web view where sessionStorage throws and the poll can never
    // observe the change. Thirty seconds of a spinner was indistinguishable
    // from broken.
    const safety = window.setTimeout(() => {
      setAuthInProgress(false)
      setNativeAuthInProgress(false)
    }, 22_000)
    return () => {
      window.clearInterval(poll)
      window.clearTimeout(safety)
    }
  }, [nativeAuthInProgress])

  // Boot: resolve getSession() once after native callback finishes (or immediately)
  useEffect(() => {
    // While native callback is running, don't boot — let the handler own the flow
    if (nativeAuthInProgress) return

    let cancelled = false
    const supabase = createClient()

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (!cancelled) {
          setSession(s)
          setBooting(false)
        }
      })
      .catch(() => {
        if (!cancelled) setBooting(false)
      })

    // Safety: don't stall the UI forever (8s for slow devices/networks)
    const safety = window.setTimeout(() => {
      if (!cancelled) setBooting(false)
    }, 8_000)

    return () => {
      cancelled = true
      window.clearTimeout(safety)
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
