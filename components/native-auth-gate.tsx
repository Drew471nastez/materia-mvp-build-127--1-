"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { AuthResolvingScreen } from "@/components/auth/auth-resolving-screen"
import { nativeAppReadyForce } from "@/lib/native-bridge"
import { hasStoredSessionToken } from "@/lib/auth/session-read"
import { isSignedOutAnswer } from "@/lib/auth/auth-error"
import { postSessionSync } from "@/lib/auth/session-sync"
import { BACKGROUND_MAX_TRIES, askServerState, backgroundDelayMs, retryQuietly } from "@/lib/auth/recovery-backoff"

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

/**
 * ===========================================================================
 *  RECOVERY IS BOUNDED, OR IT IS A LOOP
 * ===========================================================================
 * requireAuth mode recovers a session the server could not see: read it on
 * the client, write it back through /auth/sync-session, reload. That is the
 * right move once, and it is an infinite reload if the server keeps failing
 * to see it.
 *
 * Which is now reachable on the web too. The layout sends anybody here when
 * Supabase did not answer, rather than throwing them at /login for a blip —
 * and a blip that lasts can otherwise become a page that reloads itself
 * forever while somebody watches.
 *
 * So: at most two goes, counted per tab. After that it stops and says so,
 * with a button. Stopping keeps the session; looping and /login both lose it
 * or look broken.
 */
const RECOVERY_KEY = "storelib_auth_recovery"
const MAX_RECOVERIES = 2
/**
 * How long the trip through /auth/sync-session may take before this screen
 * stops waiting on it. That route asks Supabase too, the same Supabase that
 * was too slow for the page, and while it hangs the browser keeps showing
 * this spinner: the white screen that span for ever on OnePage. Past this
 * it says the connection dropped, with Try again.
 */
export const SYNC_NAVIGATION_MS = 12_000

function recoveryCount(): number {
  try {
    return Number(sessionStorage.getItem(RECOVERY_KEY) || "0") || 0
  } catch {
    return 0
  }
}

function noteRecovery() {
  try {
    sessionStorage.setItem(RECOVERY_KEY, String(recoveryCount() + 1))
  } catch {
    /* a tab with no storage gets no counter, and the timeout still bounds it */
  }
}

/* The tokens go in a form body, never the address (lib/auth/session-sync.ts). */
export { postSessionSync }

/** Why the screen gave up, for the one report it sends (never a token, never an address). */
type StuckWhy = "tries" | "renewal" | "threw" | "slow read" | "sync"

/** Cleared the moment a layout renders normally, which is the success signal. */
function clearRecoveries() {
  try {
    sessionStorage.removeItem(RECOVERY_KEY)
  } catch {}
}

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
  /** Set when recovery has been tried enough times and is not working. */
  const [stuck, setStuck] = useState(false)
  const why = useRef<StuckWhy>("tries")

  // ── Mode 2: Capacitor full-page reload — restore session from Preferences ──
  useEffect(() => {
    if (!requireAuth) return

    /**
     * Already been round twice. Stop, keep the session, and let them choose.
     */
    let cancelled = false

    if (recoveryCount() >= MAX_RECOVERIES) {
      /*
        Asked quietly first (lib/auth/recovery-backoff.ts): three tries over about six seconds behind the loading
        screen. When the server can tell who this is again, the page is put back; only then the screen.
      */
      why.current = "tries"
      void retryQuietly(async () => (await askServerState()) === "authenticated", { stopped: () => cancelled }).then((back) => {
        if (cancelled) return
        if (back) {
          clearRecoveries()
          window.location.reload()
        } else setStuck(true)
      })
      return () => {
        cancelled = true
      }
    }

    async function checkNativeSession() {
      try {
        // Dynamic import so this only runs on the client in Capacitor
        const { createClient } = await import("@/lib/supabase/client")
        const supabase = createClient()
        const read = async () => {
          const { data: { session }, error } = await supabase.auth.getSession()
          return { session, error }
        }
        let { session, error } = await read()

        if (cancelled) return

        /* A renewal that could not reach Supabase: asked again quietly, three times over about six seconds, before any screen. */
        if (!session && !isSignedOutAnswer(false, error)) {
          await retryQuietly(
            async () => {
              ;({ session, error } = await read())
              return !!session || isSignedOutAnswer(false, error)
            },
            { stopped: () => cancelled },
          )
          if (cancelled) return
        }

        /**
         * NO SESSION IS NOT ALWAYS "SIGNED OUT". When the access token has
         * run out, getSession() renews it first, and if that renewal cannot
         * reach Supabase it returns `session: null` with a network error
         * while the session itself is still stored, intact. This used to go
         * straight to /login on any null. Now only an answer that means
         * signed out does (lib/auth/auth-error.ts); a dropped connection
         * gets the "Cannot reach the server" screen and a retry.
         */
        if (!session && !isSignedOutAnswer(false, error)) {
          setStuck(true)
          why.current = "renewal"
          return
        }

        if (session) {
          // Session found in Preferences, but Next.js server components read
          // cookies — not Preferences. Route through sync-session to write the
          // session as Set-Cookie headers so the full server layout (sidebar,
          // user data, etc.) renders correctly on the next request.
          const currentPath = window.location.pathname + window.location.search
          /** Counted BEFORE navigating, or a reload loop never counts itself. */
          noteRecovery()
          postSessionSync(session, currentPath)
          /* A navigation that never commits leaves this page up: it ends in the retry screen, not a spinner. */
          window.setTimeout(() => {
            if (!cancelled) setStuck(true)
            why.current = "sync"
          }, SYNC_NAVIGATION_MS)
          // Do not unblock — we are navigating away.
          // The destination page's NativeAuthGate (mode 1) will call
          // nativeAppReadyForce() once the full layout is painted.
        } else {
          // No session — redirect to login
          router.replace("/login")
        }
      } catch {
        /* A read that threw proves nothing about the session. If one is
           stored, keep it and offer a retry; only an empty device goes to
           the login form. */
        if (cancelled) return
        why.current = "threw"
        if (hasStoredSessionToken()) setStuck(true)
        else router.replace("/login")
      }
    }

    // Give Supabase client up to 16 s to restore from Preferences
    // (slow devices + cold start + large session can take longer than 4s,
    // and a renewal that failed is asked again quietly for about 6s first)
    const timeout = window.setTimeout(() => {
      if (cancelled) return
      why.current = "slow read"
      /**
       * A SLOW READ IS NOT A SIGN-OUT — lib/auth/session-read.ts says exactly
       * this, and this timeout was the pattern it was written against. If the
       * device is plainly holding a session, say so and offer a retry rather
       * than throwing it away because a promise was slow.
       */
      if (hasStoredSessionToken()) setStuck(true)
      else router.replace("/login")
    }, 16_000)

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
      if (sessionStorage.getItem("nativeAuthInProgress") === "1") {
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
    /** Rendering normally is the only proof recovery worked. */
    clearRecoveries()
    requestAnimationFrame(() => {
      nativeAppReadyForce()
    })
  }, [blocked, authChecked])

  // Poll for flag removal + safety timeout (mode 1 only)
  useEffect(() => {
    if (requireAuth || !blocked) return
    const poll = window.setInterval(() => {
      try {
        if (sessionStorage.getItem("nativeAuthInProgress") !== "1") {
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

  /*
    SAID ONCE, SO THE LOGS KNOW WHY THIS SCREEN SHOWS (the owner sees it at /app/settings and nobody could say
    which of five ways it got here). One report per screen, the path only, never a token.
  */
  useEffect(() => {
    if (!stuck) return
    try {
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ message: `[auth-gate] cannot reach the server: ${why.current}; online ${navigator.onLine !== false}`, digest: null, path: window.location.pathname.slice(0, 200), stale: false }),
      }).catch(() => {})
    } catch {
      /* reporting is never what breaks the screen */
    }
  }, [stuck])

  /*
    WHILE THE SCREEN IS UP, IT KEEPS TRYING (lib/auth/recovery-backoff.ts): ten tries, 2s apart and doubling to
    30s, with jitter, and at once when the device comes back online. When the server can tell who this is again
    the page is put back by itself. When it answers "nobody" while the device holds a session (the app keeps it
    in its own storage, not in cookies), the session is written back once, as on the first load. Never a loop:
    the tries end, and the sync is made once per screen.
  */
  useEffect(() => {
    if (!stuck) return
    let gone = false
    let synced = false
    let attempt = 0
    let timer: number | undefined
    const tryOnce = async () => {
      if (gone) return
      const state = await askServerState()
      if (gone) return
      if (state === "authenticated") {
        clearRecoveries()
        window.location.reload()
        return
      }
      if (state === "anonymous" && !synced && hasStoredSessionToken()) {
        synced = true
        try {
          const { createClient } = await import("@/lib/supabase/client")
          const { data } = await createClient().auth.getSession()
          if (!gone && data.session) {
            postSessionSync(data.session, window.location.pathname + window.location.search)
            return
          }
        } catch {
          /* the next try asks again */
        }
      }
      schedule()
    }
    const schedule = () => {
      if (gone || attempt >= BACKGROUND_MAX_TRIES) return
      timer = window.setTimeout(() => void tryOnce(), backgroundDelayMs(attempt++))
    }
    const online = () => {
      window.clearTimeout(timer)
      void tryOnce()
    }
    window.addEventListener("online", online)
    schedule()
    return () => {
      gone = true
      window.clearTimeout(timer)
      window.removeEventListener("online", online)
    }
  }, [stuck])

  /**
   * NOT SIGNED OUT, AND NOT PRETENDING OTHERWISE.
   *
   * The session is still on the device and still valid. What failed is
   * reaching Supabase, so this says that and nothing else. No "session
   * expired", no login form, nothing that suggests they have to start again.
   */
  if (stuck) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-[#f8f9fa] p-6">
        <div className="w-full max-w-sm text-center" data-auth-stuck={why.current}>
          <h1 className="text-[20px] font-bold text-[#1a1a2e]">Cannot reach the server</h1>
          <p className="mt-2 text-[14px] text-[#6b7280]">
            You are still signed in. The connection dropped while loading this page.
          </p>
          <button
            type="button"
            onClick={() => {
              clearRecoveries()
              window.location.reload()
            }}
            className="mt-5 h-11 w-full rounded-full bg-[#1a1a2e] text-[15px] font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (blocked || !authChecked) {
    return <>{loadingFallback ?? <AuthResolvingScreen />}</>
  }

  return <>{children}</>
}
