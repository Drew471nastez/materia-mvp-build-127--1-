"use client"

import { useState, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { AuthResolvingScreen } from "@/components/auth/auth-resolving-screen"
import { nativeAppReadyForce } from "@/lib/native-bridge"
import { isAuthInProgress } from "@/lib/auth/auth-in-progress"

/**
 * Lightweight client gate for server-rendered layouts.
 *
 * Two modes:
 *
 * 1. Default (requireAuth=false):
 *    Only blocks rendering while native-oauth.ts is actively handling a
 *    deep-link callback (sessionStorage.nativeAuthInProgress === "1").
 *    Does NOT add a boot delay — the server already verified auth via cookies.
 *
 * 2. requireAuth=true (Capacitor full-page reload path):
 *    Used when the server layout skipped the redirect because it's a Capacitor
 *    request (session is in Preferences, not cookies). In this mode the gate
 *    shows a loading screen while the Supabase client restores the session
 *    from Capacitor Preferences, then renders children if a session is found
 *    or redirects to /login if not.
 *
 * Usage in a server layout:
 *   import { NativeAuthGate } from "@/components/native-auth-gate"
 *   return <NativeAuthGate>{children}</NativeAuthGate>           // mode 1
 *   return <NativeAuthGate requireAuth>{children}</NativeAuthGate> // mode 2
 */
export function NativeAuthGate({
  children,
  requireAuth = false,
  loadingFallback,
}: {
  children: ReactNode
  requireAuth?: boolean
  /** Custom loading UI shown while auth resolves (requireAuth mode). Defaults to AuthResolvingScreen. */
  loadingFallback?: ReactNode
}) {
  const router = useRouter()
  // Start as true (blocked) when requireAuth is set — we must verify before rendering.
  // Start as false for the default mode — server already verified auth via cookies.
  const [blocked, setBlocked] = useState(requireAuth)
  const [authChecked, setAuthChecked] = useState(!requireAuth)

  // ── Mode 2: Capacitor full-page reload — restore session from Preferences ──
  useEffect(() => {
    if (!requireAuth) return

    let cancelled = false

    async function checkNativeSession() {
      try {
        // Dynamic import so this only runs on the client in Capacitor
        const { createClient } = await import("@/lib/supabase/client")
        const { readSessionBounded, hasStoredSessionToken } = await import("@/lib/auth/session-read")
        const supabase = createClient()
        const result = await readSessionBounded(supabase, 6_000)

        if (cancelled) return

        const { session } = result

        /**
         * THE RANDOM LOGOUT, as it was actually experienced.
         *
         * This used to be a bare `getSession()` with a 10-second
         * `router.replace("/login")` behind it, and the read is exactly the
         * one that can hang — it goes to Preferences and then, if the access
         * token has expired, to the network. So a slow phone, a bad signal or
         * a suspended web view threw a fully signed-in person onto /login with
         * their session still sitting in Preferences, untouched.
         *
         * Nothing had logged them out. The app gave up asking and assumed the
         * worst — which is why "it logs me out randomly" and "it doesn't
         * really log me out, I click Conectează and it takes forever" are the
         * same sentence about the same bug.
         *
         * A read that did not finish is not an answer. When it does not
         * finish, the stored token is: it is durable, synchronous, and cannot
         * hang. If it is there, carry on into the app. Only a read that
         * SUCCEEDED and found nothing means signed out.
         */
        if (!session && (result.timedOut || result.failed) && hasStoredSessionToken()) {
          // Render the app. If the session really has expired, the first
          // server request says so properly and redirects — which is a correct
          // answer arrived at honestly, rather than a guess.
          setBlocked(false)
          setAuthChecked(true)
          return
        }

        if (session) {
          // Session found in Preferences, but Next.js server components read
          // cookies — not Preferences. Route through sync-session to write the
          // session as Set-Cookie headers so the full server layout (sidebar,
          // user data, etc.) renders correctly on the next request.
          const currentPath = window.location.pathname + window.location.search
          const syncUrl =
            `/auth/sync-session` +
            `?access_token=${encodeURIComponent(session.access_token)}` +
            `&refresh_token=${encodeURIComponent(session.refresh_token)}` +
            `&next=${encodeURIComponent(currentPath)}`
          window.location.assign(syncUrl)
          // Do not unblock — we are navigating away.
          // The destination page's NativeAuthGate (mode 1) will call
          // nativeAppReadyForce() once the full layout is painted.
        } else {
          // No session — redirect to login
          router.replace("/login")
        }
      } catch {
        // Same rule as above: a thrown read is not a signed-out either.
        if (cancelled) return
        const { hasStoredSessionToken } = await import("@/lib/auth/session-read")
        if (hasStoredSessionToken()) {
          setBlocked(false)
          setAuthChecked(true)
        } else {
          router.replace("/login")
        }
      }
    }

    /**
     * The outer floor. `readSessionBounded` already caps the read at six
     * seconds, so this only fires if something outside it stalls — a dynamic
     * import that never resolves, for instance.
     *
     * It no longer sends anybody to /login. That was the bug: this timer was
     * the thing doing the "random logout". It now unblocks the UI, and the
     * stored token decides whether the app or the login screen is the honest
     * place to land.
     */
    const timeout = window.setTimeout(async () => {
      if (cancelled) return
      try {
        const { hasStoredSessionToken } = await import("@/lib/auth/session-read")
        if (hasStoredSessionToken()) {
          setBlocked(false)
          setAuthChecked(true)
          return
        }
      } catch {
        /* fall through */
      }
      if (!cancelled) router.replace("/login")
    }, 9_000)

    checkNativeSession().then(() => window.clearTimeout(timeout))

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [requireAuth, router])

  // ── Mode 1: Block only during active OAuth callback ──
  useEffect(() => {
    if (requireAuth) return
    try {
      if (isAuthInProgress()) {
        setBlocked(true)
      }
    } catch {}
  }, [requireAuth])

  // Signal to the native layer that the first meaningful UI is now visible.
  // Wrapped in requestAnimationFrame so it fires AFTER the browser has
  // painted the content — not just after React scheduled the render.
  // nativeAppReadyForce() bypasses the nativeAuthInProgress guard because
  // at this point the session is confirmed and content is ready to show.
  useEffect(() => {
    if (blocked || !authChecked) return
    requestAnimationFrame(() => {
      nativeAppReadyForce()
    })
  }, [blocked, authChecked])

  // Poll for flag removal + safety timeout (mode 1 only)
  useEffect(() => {
    if (requireAuth || !blocked) return
    const poll = window.setInterval(() => {
      try {
        if (!isAuthInProgress()) {
          setBlocked(false)
        }
      } catch {
        setBlocked(false)
      }
    }, 300)
    const safety = window.setTimeout(() => setBlocked(false), 15_000)
    return () => {
      window.clearInterval(poll)
      window.clearTimeout(safety)
    }
  }, [blocked, requireAuth])

  if (blocked || !authChecked) {
    return <>{loadingFallback ?? <AuthResolvingScreen />}</>
  }

  return <>{children}</>
}
