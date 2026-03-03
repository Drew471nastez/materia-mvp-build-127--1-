"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { clearNativeAuthInProgress, isNativeAuthInProgress } from "@/lib/native-bridge"
import type { Session } from "@supabase/supabase-js"

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
  const [nativeAuthInProgress, setNativeAuthInProgress] = useState(() => {
    try {
      return isNativeAuthInProgress()
    } catch {
      return false
    }
  })

  // Safety timeout + poll: if nativeAuthInProgress is stuck, clear after 15 s.
  // Also poll every 300 ms for removal (native-oauth.ts clears it in finally).
  useEffect(() => {
    if (!nativeAuthInProgress) return
    const poll = window.setInterval(() => {
      try {
        if (!isNativeAuthInProgress()) {
          setNativeAuthInProgress(false)
        }
      } catch {
        setNativeAuthInProgress(false)
      }
    }, 300)
    const safety = window.setTimeout(() => {
      try {
        clearNativeAuthInProgress()
      } catch {}
      setNativeAuthInProgress(false)
    }, 15_000)
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

    // Safety: don't stall the UI forever
    const safety = window.setTimeout(() => {
      if (!cancelled) setBooting(false)
    }, 3_000)

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
